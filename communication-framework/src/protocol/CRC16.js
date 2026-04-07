/**
 * CRC16 - Modbus CRC16 校验计算
 *
 * 多项式: 0xA001 (即 x^16 + x^15 + x^2 + 1 的反转)
 * 初始值: 0xFFFF
 */

/**
 * CRC16 查找表 (预计算，提高性能)
 */
const CRC_TABLE = new Uint16Array(256);

(function initCRCTable() {
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xA001;
      } else {
        crc = crc >>> 1;
      }
    }
    CRC_TABLE[i] = crc;
  }
})();

/**
 * 计算 Modbus CRC16
 * @param {Uint8Array} data - 要校验的数据
 * @param {number} [offset=0] - 起始偏移
 * @param {number} [length] - 数据长度，默认从 offset 到结尾
 * @returns {number} CRC16 值 (16-bit unsigned)
 */
function calculateCRC16(data, offset = 0, length) {
  const end = length !== undefined ? offset + length : data.length;
  let crc = 0xFFFF;

  for (let i = offset; i < end; i++) {
    const index = (crc ^ data[i]) & 0xFF;
    crc = (crc >>> 8) ^ CRC_TABLE[index];
  }

  return crc & 0xFFFF;
}

/**
 * 验证 CRC16
 * @param {Uint8Array} data - 包含 CRC 的完整帧
 * @param {number} crcOffset - CRC 字段的偏移位置
 * @returns {boolean} CRC 是否正确
 */
function verifyCRC16(data, crcOffset) {
  const calculated = calculateCRC16(data, 0, crcOffset);
  const received = data[crcOffset] | (data[crcOffset + 1] << 8); // 小端序
  return calculated === received;
}

module.exports = { calculateCRC16, verifyCRC16, CRC_TABLE };
