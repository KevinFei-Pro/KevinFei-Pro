const { ProtocolConstants } = require('./ProtocolConstants');
const { calculateCRC16 } = require('./CRC16');

/**
 * Packer - 协议打包器
 *
 * 将业务数据打包成符合协议格式的二进制帧。
 *
 * 帧格式:
 * [0xAA][0x55][SeqNo][FuncCode][LengthHi][LengthLo][...Data][CRC_Lo][CRC_Hi]
 */
class Packer {
  constructor() {
    this._seqNo = 0;
  }

  /**
   * 获取下一个序列号 (0~255 循环)
   * @returns {number}
   */
  nextSeqNo() {
    const seq = this._seqNo;
    this._seqNo = (this._seqNo + 1) & 0xFF;
    return seq;
  }

  /**
   * 打包一个完整的协议帧
   * @param {Object} message
   * @param {number} message.funcCode - 功能码
   * @param {Uint8Array} [message.data] - 数据载荷 (可选)
   * @param {number} [message.seqNo] - 序列号 (可选, 不传则自动分配)
   * @returns {Uint8Array} 完整的二进制帧
   */
  pack(message) {
    const { funcCode, data = new Uint8Array(0) } = message;
    const seqNo = message.seqNo !== undefined ? message.seqNo : this.nextSeqNo();

    if (data.length > ProtocolConstants.MAX_DATA_LENGTH) {
      throw new Error(
        `Data length ${data.length} exceeds maximum ${ProtocolConstants.MAX_DATA_LENGTH}`
      );
    }

    const frameLength = ProtocolConstants.MIN_FRAME_LENGTH + data.length;
    const frame = new Uint8Array(frameLength);

    // 帧头
    frame[0] = ProtocolConstants.HEADER_BYTE_1;
    frame[1] = ProtocolConstants.HEADER_BYTE_2;

    // 序列号
    frame[2] = seqNo & 0xFF;

    // 功能码
    frame[3] = funcCode & 0xFF;

    // 数据长度 (大端序)
    frame[4] = (data.length >> 8) & 0xFF;
    frame[5] = data.length & 0xFF;

    // 数据载荷
    if (data.length > 0) {
      frame.set(data, ProtocolConstants.DATA_OFFSET);
    }

    // CRC16 (小端序) - 计算帧头到数据的 CRC
    const crcOffset = ProtocolConstants.DATA_OFFSET + data.length;
    const crc = calculateCRC16(frame, 0, crcOffset);
    frame[crcOffset] = crc & 0xFF;         // CRC 低字节
    frame[crcOffset + 1] = (crc >> 8) & 0xFF; // CRC 高字节

    return frame;
  }

  /**
   * 构建请求帧的快捷方法
   * @param {number} funcCode - 功能码
   * @param {number[]} [dataArray] - 数据数组
   * @returns {{ frame: Uint8Array, seqNo: number }}
   */
  buildRequest(funcCode, dataArray = []) {
    const seqNo = this.nextSeqNo();
    const data = new Uint8Array(dataArray);
    const frame = this.pack({ funcCode, data, seqNo });
    return { frame, seqNo };
  }

  /**
   * 重置序列号
   */
  resetSeqNo() {
    this._seqNo = 0;
  }
}

module.exports = Packer;
