const { GardenProtocolConstants } = require('./GardenProtocolConstants');
const ModbusCRC16Strategy = require('./ModbusCRC16Strategy');
const EventEmitter = require('../utils/EventEmitter');
const { Logger } = require('../utils/Logger');

/**
 * GardenParsedFrame - 花园协议解析后的帧结构
 * @typedef {Object} GardenParsedFrame
 * @property {number} destAddress - 目标地址
 * @property {number} srcAddress - 源地址
 * @property {number} typeId - 类型/命令 ID
 * @property {Uint8Array} data - 数据载荷
 * @property {number} crc - CRC16 校验值
 */

/**
 * GardenParser - 花园协议解析器
 *
 * 从二进制流中解析出完整的花园协议帧。
 * 支持粘包、拆包处理，使用缓冲区缓存数据。
 *
 * Events:
 *   - 'frame': (GardenParsedFrame) => void  - 解析到完整帧
 *   - 'error': (Error) => void - 解析错误（CRC 校验失败等）
 */
class GardenParser extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {number} [options.bufferSize=4096] - 内部缓冲区大小
   * @param {import('./ChecksumStrategy')} [options.checksumStrategy] - 自定义校验算法
   */
  constructor(options = {}) {
    super();
    this._bufferSize = options.bufferSize || 4096;
    this._buffer = new Uint8Array(this._bufferSize);
    this._writePos = 0;
    this._checksumStrategy = options.checksumStrategy || new ModbusCRC16Strategy();
    this.logger = new Logger('GardenProtocol:Parser');
  }

  /**
   * 设置校验算法策略
   * @param {import('./ChecksumStrategy')} strategy
   */
  setChecksumStrategy(strategy) {
    this._checksumStrategy = strategy;
  }

  /**
   * 输入原始数据（来自链路层）
   * 会自动处理粘包、拆包
   * @param {Uint8Array} data
   */
  feed(data) {
    if (this._writePos + data.length > this._bufferSize) {
      this._compactOrResize(data.length);
    }

    this._buffer.set(data, this._writePos);
    this._writePos += data.length;

    this._tryParse();
  }

  /**
   * 尝试从缓冲区中解析帧
   */
  _tryParse() {
    while (this._writePos >= GardenProtocolConstants.MIN_FRAME_LENGTH) {
      // 查找帧头
      const headerIndex = this._findHeader();
      if (headerIndex < 0) {
        this._writePos = 0;
        return;
      }

      // 丢弃帧头之前的数据
      if (headerIndex > 0) {
        this.logger.debug(`Discarding ${headerIndex} bytes before header`);
        this._shiftBuffer(headerIndex);
      }

      // 检查是否有足够的数据读取长度字段
      if (this._writePos < GardenProtocolConstants.DATA_OFFSET) {
        return;
      }

      // 读取数据长度 (1 字节)
      const dataLength = this._buffer[4];

      // 验证数据长度
      if (dataLength > GardenProtocolConstants.MAX_DATA_LENGTH) {
        this.logger.warn(`Invalid data length: ${dataLength}, discarding header`);
        this.emit('error', new Error(`Invalid data length: ${dataLength}`));
        this._shiftBuffer(GardenProtocolConstants.HEADER_LENGTH);
        continue;
      }

      // 计算完整帧长度
      const frameLength = GardenProtocolConstants.MIN_FRAME_LENGTH + dataLength;

      // 检查是否收到完整帧
      if (this._writePos < frameLength) {
        return;
      }

      // 提取完整帧
      const frame = this._buffer.slice(0, frameLength);

      // CRC 校验
      const crcOffset = frameLength - GardenProtocolConstants.CRC_LENGTH;
      if (!this._checksumStrategy.verify(frame, crcOffset)) {
        this.logger.warn('CRC verification failed');
        this.emit('error', new Error('CRC verification failed'));
        this._shiftBuffer(GardenProtocolConstants.HEADER_LENGTH);
        continue;
      }

      // 解析帧字段
      const parsedFrame = {
        destAddress: frame[2],
        srcAddress: frame[3],
        typeId: frame[5],
        data: dataLength > 0
          ? frame.slice(GardenProtocolConstants.DATA_OFFSET, GardenProtocolConstants.DATA_OFFSET + dataLength)
          : new Uint8Array(0),
        crc: frame[crcOffset] | (frame[crcOffset + 1] << 8),
      };

      this.logger.debug(
        `Parsed frame: dest=0x${parsedFrame.destAddress.toString(16)}, src=0x${parsedFrame.srcAddress.toString(16)}, type=0x${parsedFrame.typeId.toString(16)}, dataLen=${parsedFrame.data.length}`
      );

      // 移除已解析的帧数据
      this._shiftBuffer(frameLength);

      // 触发事件
      this.emit('frame', parsedFrame);
    }
  }

  /**
   * 在缓冲区中查找帧头位置
   * @returns {number} 帧头的索引，-1 表示未找到
   */
  _findHeader() {
    for (let i = 0; i < this._writePos - 1; i++) {
      if (
        this._buffer[i] === GardenProtocolConstants.HEADER_BYTE_1 &&
        this._buffer[i + 1] === GardenProtocolConstants.HEADER_BYTE_2
      ) {
        return i;
      }
    }
    return -1;
  }

  /**
   * 将缓冲区数据前移
   * @param {number} count - 要移除的字节数
   */
  _shiftBuffer(count) {
    if (count >= this._writePos) {
      this._writePos = 0;
      return;
    }
    this._buffer.copyWithin(0, count, this._writePos);
    this._writePos -= count;
  }

  /**
   * 压缩或扩展缓冲区
   * @param {number} additionalBytes - 需要额外容纳的字节数
   */
  _compactOrResize(additionalBytes) {
    const needed = this._writePos + additionalBytes;
    if (needed <= this._bufferSize) {
      return;
    }

    const newSize = Math.max(this._bufferSize * 2, needed);
    const newBuffer = new Uint8Array(newSize);
    newBuffer.set(this._buffer.subarray(0, this._writePos));
    this._buffer = newBuffer;
    this._bufferSize = newSize;
    this.logger.debug(`Buffer resized to ${newSize}`);
  }

  /**
   * 清空缓冲区
   */
  reset() {
    this._writePos = 0;
  }

  /**
   * 获取缓冲区中待解析的字节数
   * @returns {number}
   */
  get pendingBytes() {
    return this._writePos;
  }
}

module.exports = GardenParser;
