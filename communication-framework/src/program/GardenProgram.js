const DeviceProgram = require('./DeviceProgram');
const GardenPacker = require('../protocol/GardenPacker');
const GardenParser = require('../protocol/GardenParser');
const { GardenProtocolConstants, DeviceAddress } = require('../protocol/GardenProtocolConstants');
const { calculateCRC16 } = require('../protocol/CRC16');
const {
  ProgramState,
  OTACommand,
  OTAStatus,
  OTASrcAddress,
  SerialConfig,
  GardenToolType,
  GardenToolTypeName,
} = require('./ProgramConstants');

/**
 * GardenProgram - 花园工具 OTA 编程器
 *
 * 使用花园协议 (Garden Protocol) 实现设备 OTA 升级。
 * 支持花园工具类设备：割草机、吹风机、链锯、修枝机等。
 *
 * 协议格式（小端模式）:
 * [0xC5][0x5C][Dest][Src][Length][TypeID][...Data][CRC16_Lo][CRC16_Hi]
 *
 * 源地址 (Src / 第四字节):
 *   - 0x00: IOT（蓝牙通信板）
 *   - 0x08: UI（显示屏/调试软件）
 *
 * 蓝牙串口配置:
 *   - 波特率: 115200
 *   - 数据位: 8
 *   - 停止位: 1
 *   - 校验位: 无
 *   - 硬件控制流: 无
 *
 * OTA 流程:
 *   1. OTA_START  (0xF0) → 发送固件信息（大小、工具类型、CRC）
 *   2. OTA_DATA   (0xF1) → 分包传输固件数据
 *   3. OTA_VERIFY (0xF2) → 发送校验信息
 *   4. OTA_END    (0xF3) → 完成 OTA
 *
 * @example
 * const program = new GardenProgram({
 *   sendFn: async (frame) => await bleAdapter.sendOTA(frame),
 *   srcAddress: OTASrcAddress.IOT,         // 0x00 IOT
 *   destAddress: DeviceAddress.TOOL,       // 目标设备
 *   toolType: GardenToolType.LAWN_MOWER,   // 割草机
 * });
 *
 * // 监听进度
 * program.on('progress', ({ percentage }) => {
 *   console.log(`OTA progress: ${percentage}%`);
 * });
 *
 * // 开始 OTA
 * await program.startProgram(firmwareData);
 */
class GardenProgram extends DeviceProgram {
  /**
   * @param {Object} options
   * @param {Function} options.sendFn - 发送函数 async (Uint8Array) => void
   * @param {number} [options.srcAddress=0x00] - 源地址 (0x00=IOT, 0x08=UI)
   * @param {number} [options.destAddress=0x02] - 目标设备地址（默认 TOOL）
   * @param {number} [options.toolType] - 花园工具类型（GardenToolType 枚举值）
   * @param {import('../protocol/ChecksumStrategy')} [options.checksumStrategy] - 自定义校验算法
   * @param {number} [options.chunkSize=128] - 分包大小
   * @param {number} [options.responseTimeout=5000] - 响应超时
   * @param {number} [options.maxRetries=3] - 最大重试次数
   */
  constructor(options = {}) {
    super({
      name: 'GardenProgram',
      chunkSize: options.chunkSize,
      responseTimeout: options.responseTimeout,
      maxRetries: options.maxRetries,
      retryDelay: options.retryDelay,
    });

    if (!options.sendFn) {
      throw new Error('sendFn is required for GardenProgram');
    }

    this._sendFn = options.sendFn;
    this._srcAddress = options.srcAddress !== undefined ? options.srcAddress : OTASrcAddress.IOT;
    this._destAddress = options.destAddress !== undefined ? options.destAddress : DeviceAddress.TOOL;
    this._toolType = options.toolType || GardenToolType.LAWN_MOWER;

    // 协议组件
    this._packer = new GardenPacker({
      checksumStrategy: options.checksumStrategy,
    });
    this._parser = new GardenParser({
      checksumStrategy: options.checksumStrategy,
    });

    // 响应处理
    this._pendingResolve = null;
    this._pendingReject = null;
    this._responseTimer = null;

    // 监听解析器帧事件
    this._parser.on('frame', (frame) => this._onFrameReceived(frame));
    this._parser.on('error', (error) => {
      this.logger.warn('Parse error:', error.message);
    });

    this.logger.info(
      `GardenProgram created: src=0x${this._srcAddress.toString(16)}, ` +
      `dest=0x${this._destAddress.toString(16)}, ` +
      `tool=${GardenToolTypeName[this._toolType] || 'unknown'}`
    );
  }

  /**
   * 获取源地址
   * @returns {number}
   */
  get srcAddress() {
    return this._srcAddress;
  }

  /**
   * 获取目标地址
   * @returns {number}
   */
  get destAddress() {
    return this._destAddress;
  }

  /**
   * 获取工具类型
   * @returns {number}
   */
  get toolType() {
    return this._toolType;
  }

  /**
   * 获取蓝牙串口配置
   * @returns {Object}
   */
  static get serialConfig() {
    return { ...SerialConfig };
  }

  /**
   * 输入从设备收到的原始数据（用于解析响应）
   * @param {Uint8Array} data
   */
  feedResponse(data) {
    this._parser.feed(data);
  }

  /**
   * 发送 OTA 初始化命令
   * 数据载荷（小端模式）:
   *   [FirmwareSize_Lo][FirmwareSize_Mid1][FirmwareSize_Mid2][FirmwareSize_Hi]
   *   [ToolType]
   *   [CRC_Lo][CRC_Hi]
   *
   * @param {Uint8Array} firmware
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async _sendInitCommand(firmware, options) {
    const size = firmware.length;
    const crc = calculateCRC16(firmware, 0, firmware.length);
    const toolType = options.toolType || this._toolType;

    // 构建数据载荷（小端模式）
    const data = new Uint8Array(7);
    // 固件大小 (4字节, 小端)
    data[0] = size & 0xFF;
    data[1] = (size >> 8) & 0xFF;
    data[2] = (size >> 16) & 0xFF;
    data[3] = (size >> 24) & 0xFF;
    // 工具类型 (1字节)
    data[4] = toolType & 0xFF;
    // 固件 CRC (2字节, 小端)
    data[5] = crc & 0xFF;
    data[6] = (crc >> 8) & 0xFF;

    this.logger.info(
      `OTA_START: size=${size}, tool=0x${toolType.toString(16)}, crc=0x${crc.toString(16)}`
    );

    await this._sendAndWaitAck(OTACommand.OTA_START, data);
  }

  /**
   * 发送固件数据块
   * 数据载荷（小端模式）:
   *   [Offset_Lo][Offset_Hi][ChunkIndex_Lo][ChunkIndex_Hi][...ChunkData]
   *
   * @param {Uint8Array} chunk
   * @param {number} offset
   * @param {number} chunkIndex
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async _sendDataChunk(chunk, offset, chunkIndex, _options) {
    // 构建数据载荷（小端模式）
    const headerSize = 4;
    const data = new Uint8Array(headerSize + chunk.length);
    // 偏移量 (2字节, 小端)
    data[0] = offset & 0xFF;
    data[1] = (offset >> 8) & 0xFF;
    // 块索引 (2字节, 小端)
    data[2] = chunkIndex & 0xFF;
    data[3] = (chunkIndex >> 8) & 0xFF;
    // 数据内容
    data.set(chunk, headerSize);

    await this._sendAndWaitAck(OTACommand.OTA_DATA, data);
  }

  /**
   * 发送校验命令
   * 数据载荷（小端模式）:
   *   [FirmwareSize_Lo][FirmwareSize_Mid1][FirmwareSize_Mid2][FirmwareSize_Hi]
   *   [CRC_Lo][CRC_Hi]
   *
   * @param {Uint8Array} firmware
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async _sendVerifyCommand(firmware, _options) {
    const size = firmware.length;
    const crc = calculateCRC16(firmware, 0, firmware.length);

    const data = new Uint8Array(6);
    // 固件大小 (4字节, 小端)
    data[0] = size & 0xFF;
    data[1] = (size >> 8) & 0xFF;
    data[2] = (size >> 16) & 0xFF;
    data[3] = (size >> 24) & 0xFF;
    // 固件 CRC (2字节, 小端)
    data[4] = crc & 0xFF;
    data[5] = (crc >> 8) & 0xFF;

    this.logger.info(`OTA_VERIFY: size=${size}, crc=0x${crc.toString(16)}`);

    await this._sendAndWaitAck(OTACommand.OTA_VERIFY, data);
  }

  /**
   * 发送 OTA 完成命令
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async _sendCompleteCommand(_options) {
    this.logger.info('OTA_END: completing');
    await this._sendAndWaitAck(OTACommand.OTA_END, new Uint8Array(0));
  }

  /**
   * 发送 OTA 中止命令
   * @returns {Promise<void>}
   */
  async _sendAbortCommand() {
    this.logger.info('OTA_ABORT: aborting');
    const frame = this._packer.pack({
      destAddress: this._destAddress,
      srcAddress: this._srcAddress,
      typeId: OTACommand.OTA_ABORT,
    });
    await this._sendFn(frame);
  }

  /**
   * 发送命令并等待设备 ACK
   * @param {number} typeId - 命令类型
   * @param {Uint8Array} data - 数据载荷
   * @returns {Promise<Object>} 设备响应帧
   */
  async _sendAndWaitAck(typeId, data) {
    let lastError = null;

    for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
      if (this._aborted) {
        throw new Error('OTA aborted');
      }

      try {
        const frame = this._packer.pack({
          destAddress: this._destAddress,
          srcAddress: this._srcAddress,
          typeId,
          data,
        });

        // 发送数据
        await this._sendFn(frame);

        // 等待 ACK
        const response = await this._waitForResponse(typeId);
        return response;
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Command 0x${typeId.toString(16)} attempt ${attempt + 1} failed: ${error.message}`
        );

        if (attempt < this._maxRetries && !this._aborted) {
          await this._delay(this._retryDelay);
        }
      }
    }

    throw lastError || new Error(`Command 0x${typeId.toString(16)} failed after retries`);
  }

  /**
   * 等待设备响应
   * @param {number} expectedTypeId - 期望的命令类型（对应 ACK）
   * @returns {Promise<Object>}
   */
  _waitForResponse(expectedTypeId) {
    return new Promise((resolve, reject) => {
      this._pendingResolve = resolve;
      this._pendingReject = reject;
      this._pendingTypeId = expectedTypeId;

      this._responseTimer = setTimeout(() => {
        this._pendingResolve = null;
        this._pendingReject = null;
        this._pendingTypeId = null;
        reject(new Error(
          `Response timeout for command 0x${expectedTypeId.toString(16)}`
        ));
      }, this._responseTimeout);
    });
  }

  /**
   * 处理接收到的帧
   * @param {Object} frame - 解析后的帧
   */
  _onFrameReceived(frame) {
    this.logger.debug(
      `Response: typeId=0x${frame.typeId.toString(16)}, ` +
      `src=0x${frame.srcAddress.toString(16)}, ` +
      `data=[${Array.from(frame.data).map(b => '0x' + b.toString(16)).join(', ')}]`
    );

    // 触发通用帧事件
    this.emit('frame', frame);

    // 处理等待中的响应
    if (this._pendingResolve) {
      if (this._responseTimer) {
        clearTimeout(this._responseTimer);
        this._responseTimer = null;
      }

      if (frame.typeId === OTACommand.OTA_ACK) {
        const resolve = this._pendingResolve;
        this._pendingResolve = null;
        this._pendingReject = null;
        this._pendingTypeId = null;
        resolve(frame);
      } else if (frame.typeId === OTACommand.OTA_NACK) {
        const reject = this._pendingReject;
        this._pendingResolve = null;
        this._pendingReject = null;
        this._pendingTypeId = null;
        const statusCode = frame.data.length > 0 ? frame.data[0] : OTAStatus.ERROR_UNKNOWN;
        reject(new Error(`Device NACK: status=0x${statusCode.toString(16)}`));
      }
      // 其他类型的帧不做处理，继续等待
    }
  }

  /**
   * 延迟
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 释放资源
   */
  dispose() {
    if (this._responseTimer) {
      clearTimeout(this._responseTimer);
      this._responseTimer = null;
    }
    this._pendingResolve = null;
    this._pendingReject = null;
    this._parser.reset();
    this._parser.removeAllListeners();
    super.dispose();
  }
}

module.exports = GardenProgram;
