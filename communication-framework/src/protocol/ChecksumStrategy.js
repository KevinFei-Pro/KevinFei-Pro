/**
 * ChecksumStrategy - 校验算法策略接口
 *
 * 定义校验算法的统一接口，支持自定义校验算法。
 * 所有校验算法实现都必须遵循此接口。
 */
class ChecksumStrategy {
  /**
   * 计算校验值
   * @param {Uint8Array} data - 要校验的数据
   * @param {number} [offset=0] - 起始偏移
   * @param {number} [length] - 数据长度
   * @returns {number} 校验值
   */
  calculate(_data, _offset, _length) {
    throw new Error('calculate() must be implemented by subclass');
  }

  /**
   * 验证校验值
   * @param {Uint8Array} data - 包含校验值的完整帧
   * @param {number} crcOffset - 校验字段的偏移位置
   * @returns {boolean} 校验是否正确
   */
  verify(_data, _crcOffset) {
    throw new Error('verify() must be implemented by subclass');
  }

  /**
   * 获取校验值的字节长度
   * @returns {number}
   */
  get checksumLength() {
    return 2;
  }
}

module.exports = ChecksumStrategy;
