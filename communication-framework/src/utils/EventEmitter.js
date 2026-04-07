/**
 * 轻量级事件发射器
 * 用于框架内部的事件通知机制
 */
class EventEmitter {
  constructor() {
    this._listeners = new Map();
  }

  /**
   * 注册事件监听器
   * @param {string} event - 事件名称
   * @param {Function} listener - 回调函数
   * @returns {Function} 取消订阅函数
   */
  on(event, listener) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(listener);
    return () => this.off(event, listener);
  }

  /**
   * 注册一次性事件监听器
   * @param {string} event - 事件名称
   * @param {Function} listener - 回调函数
   */
  once(event, listener) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      listener(...args);
    };
    wrapper._original = listener;
    this.on(event, wrapper);
  }

  /**
   * 移除事件监听器
   * @param {string} event - 事件名称
   * @param {Function} listener - 回调函数
   */
  off(event, listener) {
    const listeners = this._listeners.get(event);
    if (listeners) {
      listeners.delete(listener);
      // Also check for once wrappers
      for (const l of listeners) {
        if (l._original === listener) {
          listeners.delete(l);
          break;
        }
      }
      if (listeners.size === 0) {
        this._listeners.delete(event);
      }
    }
  }

  /**
   * 触发事件
   * @param {string} event - 事件名称
   * @param {...*} args - 事件参数
   */
  emit(event, ...args) {
    const listeners = this._listeners.get(event);
    if (listeners) {
      for (const listener of [...listeners]) {
        try {
          listener(...args);
        } catch (err) {
          console.error(`[EventEmitter] Error in listener for event "${event}":`, err);
        }
      }
    }
  }

  /**
   * 移除所有监听器
   * @param {string} [event] - 可选的事件名称，不传则移除全部
   */
  removeAllListeners(event) {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }
}

module.exports = EventEmitter;
