const { GardenProtocolConstants } = require('./GardenProtocolConstants');
const { calculateCRC16 } = require('./CRC16');
const ModbusCRC16Strategy = require('./ModbusCRC16Strategy');

/**
 * GardenPacker - 花园协议打包器
 *
 * 将业务数据打包成符合花园协议格式的二进制帧。
 *
 * 帧格式:
 * [0xC5][0x5C][Dest][Src][Length][TypeID][...Data][CRC16_Lo][CRC16_Hi]
 */
class GardenPacker {
  /**
   * @param {Object} [options]
   * @param {import('./ChecksumStrategy')} [options.checksumStrategy] - 自定义校验算法
   */
  constructor(options = {}) {
    this._checksumStrategy = options.checksumStrategy || new ModbusCRC16Strategy();
  }

  /**
   * 设置校验算法策略
   * @param {import('./ChecksumStrategy')} strategy
   */
  setChecksumStrategy(strategy) {
    this._checksumStrategy = strategy;
  }

  /**
   * 打包一个完整的花园协议帧
   * @param {Object} message
   * @param {number} message.destAddress - 目标地址
   * @param {number} message.srcAddress - 源地址
   * @param {number} message.typeId - 类型/命令 ID
   * @param {Uint8Array} [message.data] - 数据载荷 (可选)
   * @returns {Uint8Array} 完整的二进制帧
   */
  pack(message) {
    const {
      destAddress,
      srcAddress,
      typeId,
      data = new Uint8Array(0),
    } = message;

    if (data.length > GardenProtocolConstants.MAX_DATA_LENGTH) {
      throw new Error(
        `Data length ${data.length} exceeds maximum ${GardenProtocolConstants.MAX_DATA_LENGTH}`
      );
    }

    const frameLength = GardenProtocolConstants.MIN_FRAME_LENGTH + data.length;
    const frame = new Uint8Array(frameLength);

    // 帧头
    frame[0] = GardenProtocolConstants.HEADER_BYTE_1;
    frame[1] = GardenProtocolConstants.HEADER_BYTE_2;

    // 目标地址
    frame[2] = destAddress & 0xFF;

    // 源地址
    frame[3] = srcAddress & 0xFF;

    // 数据长度
    frame[4] = data.length & 0xFF;

    // 类型 ID
    frame[5] = typeId & 0xFF;

    // 数据载荷
    if (data.length > 0) {
      frame.set(data, GardenProtocolConstants.DATA_OFFSET);
    }

    // CRC16 (低字节在前 L8-H8)
    const crcOffset = GardenProtocolConstants.DATA_OFFSET + data.length;
    const crc = this._checksumStrategy.calculate(frame, 0, crcOffset);
    frame[crcOffset] = crc & 0xFF;             // CRC 低字节
    frame[crcOffset + 1] = (crc >> 8) & 0xFF;  // CRC 高字节

    return frame;
  }

  /**
   * 构建请求帧的快捷方法
   * @param {number} destAddress - 目标地址
   * @param {number} srcAddress - 源地址
   * @param {number} typeId - 类型 ID
   * @param {number[]} [dataArray] - 数据数组
   * @returns {Uint8Array} 完整的二进制帧
   */
  buildRequest(destAddress, srcAddress, typeId, dataArray = []) {
    const data = new Uint8Array(dataArray);
    return this.pack({ destAddress, srcAddress, typeId, data });
  }
}

module.exports = GardenPacker;
