/**
 * MessageQueue - 消息队列
 *
 * 管理发送消息的队列，支持优先级、重试、超时。
 * 确保消息按顺序发送，避免并发冲突。
 */
class MessageQueue {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxSize=100] - 队列最大容量
   * @param {number} [options.defaultTimeout=5000] - 默认超时（毫秒）
   * @param {number} [options.maxRetries=2] - 最大重试次数
   * @param {number} [options.retryDelay=1000] - 重试间隔（毫秒）
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100;
    this.defaultTimeout = options.defaultTimeout || 5000;
    this.maxRetries = options.maxRetries || 2;
    this.retryDelay = options.retryDelay || 1000;

    this._queue = [];       // 待发送队列
    this._processing = false;
    this._sendFn = null;    // 实际发送函数
    this._disposed = false;
    this._currentTimer = null;
  }

  /**
   * 设置发送函数
   * @param {Function} fn - async (Uint8Array) => void
   */
  setSendFunction(fn) {
    this._sendFn = fn;
  }

  /**
   * 入队一个消息
   * @param {Uint8Array} data - 要发送的二进制数据
   * @param {Object} [options]
   * @param {number} [options.priority=0] - 优先级，数值越大越优先
   * @param {number} [options.timeout] - 超时时间（毫秒）
   * @param {number} [options.maxRetries] - 最大重试次数
   * @param {Function} [options.onSuccess] - 发送成功回调
   * @param {Function} [options.onError] - 发送失败回调
   * @returns {boolean} 是否入队成功
   */
  enqueue(data, options = {}) {
    if (this._disposed) return false;

    if (this._queue.length >= this.maxSize) {
      if (options.onError) {
        options.onError(new Error('Message queue is full'));
      }
      return false;
    }

    const item = {
      data,
      priority: options.priority || 0,
      timeout: options.timeout || this.defaultTimeout,
      maxRetries: options.maxRetries !== undefined ? options.maxRetries : this.maxRetries,
      retryCount: 0,
      onSuccess: options.onSuccess || null,
      onError: options.onError || null,
      timestamp: Date.now(),
    };

    // 按优先级插入
    if (item.priority > 0 && this._queue.length > 0) {
      let inserted = false;
      for (let i = 0; i < this._queue.length; i++) {
        if (this._queue[i].priority < item.priority) {
          this._queue.splice(i, 0, item);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        this._queue.push(item);
      }
    } else {
      this._queue.push(item);
    }

    // 如果没在处理中，启动处理
    this._processNext();

    return true;
  }

  /**
   * 处理队列中的下一个消息
   */
  async _processNext() {
    if (this._processing || this._queue.length === 0 || this._disposed) {
      return;
    }

    this._processing = true;

    while (this._queue.length > 0 && !this._disposed) {
      const item = this._queue.shift();

      try {
        if (!this._sendFn) {
          throw new Error('Send function not set');
        }

        await this._sendWithTimeout(item.data, item.timeout);

        if (item.onSuccess) {
          item.onSuccess();
        }
      } catch (error) {
        if (item.retryCount < item.maxRetries && !this._disposed) {
          item.retryCount++;
          // 放回队首重试
          this._queue.unshift(item);
          // 等待重试间隔
          await this._delay(this.retryDelay);
        } else {
          if (item.onError) {
            item.onError(error);
          }
        }
      }
    }

    this._processing = false;
  }

  /**
   * 带超时的发送
   * @param {Uint8Array} data
   * @param {number} timeout
   * @returns {Promise<void>}
   */
  _sendWithTimeout(data, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Send timeout'));
      }, timeout);

      this._currentTimer = timer;

      this._sendFn(data)
        .then(() => {
          clearTimeout(timer);
          this._currentTimer = null;
          resolve();
        })
        .catch((err) => {
          clearTimeout(timer);
          this._currentTimer = null;
          reject(err);
        });
    });
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
   * 获取队列长度
   * @returns {number}
   */
  get size() {
    return this._queue.length;
  }

  /**
   * 是否正在处理中
   * @returns {boolean}
   */
  get isProcessing() {
    return this._processing;
  }

  /**
   * 清空队列
   */
  clear() {
    for (const item of this._queue) {
      if (item.onError) {
        item.onError(new Error('Queue cleared'));
      }
    }
    this._queue = [];
  }

  /**
   * 释放资源
   */
  dispose() {
    this._disposed = true;
    if (this._currentTimer) {
      clearTimeout(this._currentTimer);
      this._currentTimer = null;
    }
    this.clear();
  }
}

module.exports = MessageQueue;
