const EventEmitter = require('../utils/EventEmitter');
const { Logger } = require('../utils/Logger');
const { LinkState } = require('./LinkConstants');

/**
 * LinkAdapter - 链路层抽象基类
 *
 * 所有链路适配器（BLE、Wi-Fi、WebSocket）必须继承此类并实现抽象方法。
 * 提供统一的连接/断开/发送接口和状态管理。
 *
 * Events:
 *   - 'stateChange': (newState, oldState) => void
 *   - 'data': (Uint8Array) => void
 *   - 'error': (Error) => void
 */
class LinkAdapter extends EventEmitter {
  constructor(type) {
    super();
    this.type = type;
    this.state = LinkState.DISCONNECTED;
    this.logger = new Logger(`Link:${type}`);
  }

  /**
   * 更新连接状态并触发事件
   * @param {string} newState
   */
  _setState(newState) {
    const oldState = this.state;
    if (oldState === newState) return;
    this.state = newState;
    this.logger.info(`State: ${oldState} -> ${newState}`);
    this.emit('stateChange', newState, oldState);
  }

  /**
   * 当收到原始数据时调用（子类内部使用）
   * @param {Uint8Array} data
   */
  _onDataReceived(data) {
    this.logger.debug(`Received ${data.length} bytes`);
    this.emit('data', data);
  }

  /**
   * 当发生错误时调用（子类内部使用）
   * @param {Error} error
   */
  _onError(error) {
    this.logger.error('Link error:', error.message);
    this.emit('error', error);
  }

  /**
   * 连接设备 (子类必须实现)
   * @param {Object} options - 连接参数
   * @returns {Promise<void>}
   */
  async connect(_options) {
    throw new Error('connect() must be implemented by subclass');
  }

  /**
   * 断开连接 (子类必须实现)
   * @returns {Promise<void>}
   */
  async disconnect() {
    throw new Error('disconnect() must be implemented by subclass');
  }

  /**
   * 发送原始二进制数据 (子类必须实现)
   * @param {Uint8Array} data
   * @returns {Promise<void>}
   */
  async send(_data) {
    throw new Error('send() must be implemented by subclass');
  }

  /**
   * 获取最大传输单元 (MTU)
   * @returns {number}
   */
  getMTU() {
    return 20; // BLE 默认 MTU
  }

  /**
   * 是否已连接
   * @returns {boolean}
   */
  isConnected() {
    return this.state === LinkState.CONNECTED;
  }

  /**
   * 释放资源
   */
  dispose() {
    this.removeAllListeners();
  }
}

module.exports = LinkAdapter;
