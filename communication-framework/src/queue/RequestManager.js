const EventEmitter = require('../utils/EventEmitter');

/**
 * RequestManager - 请求响应管理器
 *
 * 维护一个等待响应的请求映射表。
 * 当发送一个请求帧后，通过序列号追踪其响应。
 * 支持超时自动清理。
 */
class RequestManager extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {number} [options.defaultTimeout=5000] - 默认响应等待超时（毫秒）
   */
  constructor(options = {}) {
    super();
    this.defaultTimeout = options.defaultTimeout || 5000;
    /** @type {Map<number, { resolve: Function, reject: Function, timer: number, funcCode: number }>} */
    this._pendingRequests = new Map();
  }

  /**
   * 注册一个等待响应的请求
   * @param {number} seqNo - 请求的序列号
   * @param {number} funcCode - 功能码
   * @param {number} [timeout] - 超时时间（毫秒）
   * @returns {Promise<Object>} 解析后的响应帧
   */
  waitForResponse(seqNo, funcCode, timeout) {
    const timeoutMs = timeout || this.defaultTimeout;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingRequests.delete(seqNo);
        reject(new Error(`Request timeout: seq=${seqNo}, func=0x${funcCode.toString(16)}`));
      }, timeoutMs);

      this._pendingRequests.set(seqNo, {
        resolve,
        reject,
        timer,
        funcCode,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * 处理收到的响应帧
   * @param {Object} frame - 解析后的帧
   * @param {number} frame.seqNo - 序列号
   * @param {number} frame.funcCode - 功能码
   * @param {Uint8Array} frame.data - 数据载荷
   * @returns {boolean} 是否匹配到等待中的请求
   */
  handleResponse(frame) {
    const pending = this._pendingRequests.get(frame.seqNo);
    if (!pending) {
      return false; // 未匹配到请求，可能是设备主动上报
    }

    clearTimeout(pending.timer);
    this._pendingRequests.delete(frame.seqNo);

    // 检查是否为错误响应
    if (frame.funcCode & 0x80) {
      pending.reject(
        new Error(
          `Device error: func=0x${frame.funcCode.toString(16)}, data=${Array.from(frame.data).map((b) => b.toString(16)).join(' ')}`
        )
      );
    } else {
      pending.resolve(frame);
    }

    return true;
  }

  /**
   * 获取等待中的请求数
   * @returns {number}
   */
  get pendingCount() {
    return this._pendingRequests.size;
  }

  /**
   * 取消所有等待中的请求
   * @param {string} [reason='All requests cancelled']
   */
  cancelAll(reason = 'All requests cancelled') {
    for (const [seqNo, pending] of this._pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this._pendingRequests.clear();
  }

  /**
   * 释放资源
   */
  dispose() {
    this.cancelAll('RequestManager disposed');
    this.removeAllListeners();
  }
}

module.exports = RequestManager;
