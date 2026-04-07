const { ProtocolConstants } = require('./ProtocolConstants');
const { verifyCRC16 } = require('./CRC16');
const EventEmitter = require('../utils/EventEmitter');
const { Logger } = require('../utils/Logger');

/**
 * ParsedFrame - 解析后的帧结构
 * @typedef {Object} ParsedFrame
 * @property {number} seqNo - 序列号
 * @property {number} funcCode - 功能码
 * @property {Uint8Array} data - 数据载荷
 * @property {number} crc - CRC16 校验值
 */

/**
 * Parser - 协议解析器
 *
 * 从二进制流中解析出完整的协议帧。
 * 支持粘包、拆包处理，使用环形缓冲区缓存数据。
 *
 * Events:
 *   - 'frame': (ParsedFrame) => void  - 解析到完整帧
 *   - 'error': (Error) => void - 解析错误（CRC 校验失败等）
 */
class Parser extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {number} [options.bufferSize=4096] - 内部缓冲区大小
   */
  constructor(options = {}) {
    super();
    this._bufferSize = options.bufferSize || 4096;
    this._buffer = new Uint8Array(this._bufferSize);
    this._writePos = 0;
    this.logger = new Logger('Protocol:Parser');
  }

  /**
   * 输入原始数据（来自链路层）
   * 会自动处理粘包、拆包
   * @param {Uint8Array} data
   */
  feed(data) {
    // 追加数据到缓冲区
    if (this._writePos + data.length > this._bufferSize) {
      // 扩容或压缩
      this._compactOrResize(data.length);
    }

    this._buffer.set(data, this._writePos);
    this._writePos += data.length;

    // 尝试解析帧
    this._tryParse();
  }

  /**
   * 尝试从缓冲区中解析帧
   */
  _tryParse() {
    while (this._writePos >= ProtocolConstants.MIN_FRAME_LENGTH) {
      // 查找帧头
      const headerIndex = this._findHeader();
      if (headerIndex < 0) {
        // 没找到帧头，丢弃所有数据
        this._writePos = 0;
        return;
      }

      // 如果帧头不在缓冲区开头，丢弃帧头之前的数据
      if (headerIndex > 0) {
        this.logger.debug(`Discarding ${headerIndex} bytes before header`);
        this._shiftBuffer(headerIndex);
      }

      // 检查是否有足够的数据读取长度字段
      if (this._writePos < ProtocolConstants.DATA_OFFSET) {
        return; // 等待更多数据
      }

      // 读取数据长度 (大端序)
      const dataLength =
        (this._buffer[4] << 8) | this._buffer[5];

      // 验证数据长度
      if (dataLength > ProtocolConstants.MAX_DATA_LENGTH) {
        this.logger.warn(`Invalid data length: ${dataLength}, discarding header`);
        this.emit('error', new Error(`Invalid data length: ${dataLength}`));
        this._shiftBuffer(ProtocolConstants.HEADER_LENGTH);
        continue;
      }

      // 计算完整帧长度
      const frameLength = ProtocolConstants.MIN_FRAME_LENGTH + dataLength;

      // 检查是否收到完整帧
      if (this._writePos < frameLength) {
        return; // 等待更多数据
      }

      // 提取完整帧
      const frame = this._buffer.slice(0, frameLength);

      // CRC 校验
      const crcOffset = frameLength - ProtocolConstants.CRC_LENGTH;
      if (!verifyCRC16(frame, crcOffset)) {
        this.logger.warn('CRC verification failed');
        this.emit('error', new Error('CRC verification failed'));
        // 丢弃帧头，继续查找下一个帧
        this._shiftBuffer(ProtocolConstants.HEADER_LENGTH);
        continue;
      }

      // 解析帧字段
      const parsedFrame = {
        seqNo: frame[2],
        funcCode: frame[3],
        data: dataLength > 0
          ? frame.slice(ProtocolConstants.DATA_OFFSET, ProtocolConstants.DATA_OFFSET + dataLength)
          : new Uint8Array(0),
        crc: frame[crcOffset] | (frame[crcOffset + 1] << 8),
      };

      this.logger.debug(
        `Parsed frame: seq=${parsedFrame.seqNo}, func=0x${parsedFrame.funcCode.toString(16)}, dataLen=${parsedFrame.data.length}`
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
        this._buffer[i] === ProtocolConstants.HEADER_BYTE_1 &&
        this._buffer[i + 1] === ProtocolConstants.HEADER_BYTE_2
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
      return; // 当前缓冲区足够
    }

    // 扩容为当前大小的两倍或所需大小，取较大值
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

module.exports = Parser;
