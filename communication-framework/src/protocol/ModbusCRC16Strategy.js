const ChecksumStrategy = require('./ChecksumStrategy');
const { calculateCRC16, verifyCRC16 } = require('./CRC16');

/**
 * ModbusCRC16Strategy - Modbus CRC16 校验策略
 *
 * 使用 Modbus CRC16 算法（多项式 0xA001，初始值 0xFFFF）。
 * 这是框架的默认校验算法。
 */
class ModbusCRC16Strategy extends ChecksumStrategy {
  /**
   * 计算 Modbus CRC16
   * @param {Uint8Array} data
   * @param {number} [offset=0]
   * @param {number} [length]
   * @returns {number}
   */
  calculate(data, offset = 0, length) {
    return calculateCRC16(data, offset, length);
  }

  /**
   * 验证 Modbus CRC16（小端序）
   * @param {Uint8Array} data
   * @param {number} crcOffset
   * @returns {boolean}
   */
  verify(data, crcOffset) {
    return verifyCRC16(data, crcOffset);
  }

  /** @override */
  get checksumLength() {
    return 2;
  }
}

module.exports = ModbusCRC16Strategy;
