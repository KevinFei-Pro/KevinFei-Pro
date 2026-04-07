const EventEmitter = require('../utils/EventEmitter');
const { Logger } = require('../utils/Logger');
const { LinkState } = require('../link/LinkConstants');
const { Packer, Parser, FuncCode } = require('../protocol');
const { MessageQueue, RequestManager } = require('../queue');

/**
 * ChannelState - 通道状态
 */
const ChannelState = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  READY: 'ready',
  ERROR: 'error',
  CLOSED: 'closed',
};

/**
 * Channel - 通讯通道
 *
 * 整合链路层、协议层和队列管理，提供面向业务的通讯接口。
 * 这是通讯框架的核心类，封装了完整的数据收发流程。
 *
 * 数据流:
 *   发送: 业务数据 -> Packer(打包) -> MessageQueue(排队) -> LinkAdapter(发送)
 *   接收: LinkAdapter(接收) -> Parser(解析) -> RequestManager(匹配) -> 回调/事件
 *
 * Events:
 *   - 'stateChange': (newState, oldState) => void
 *   - 'notification': (frame) => void    - 设备主动上报的数据
 *   - 'error': (Error) => void
 *   - 'connected': () => void
 *   - 'disconnected': () => void
 */
class Channel extends EventEmitter {
  /**
   * @param {Object} options
   * @param {import('../link/LinkAdapter')} options.linkAdapter - 链路适配器实例
   * @param {Object} [options.queue] - 消息队列配置
   * @param {Object} [options.request] - 请求管理器配置
   * @param {Object} [options.protocol] - 协议配置
   */
  constructor(options = {}) {
    super();
    const { linkAdapter } = options;

    if (!linkAdapter) {
      throw new Error('linkAdapter is required');
    }

    this.linkAdapter = linkAdapter;
    this.state = ChannelState.IDLE;
    this.logger = new Logger(`Channel:${linkAdapter.type}`);

    // 协议层
    this.packer = new Packer();
    this.parser = new Parser(options.protocol);

    // 队列层
    this.messageQueue = new MessageQueue(options.queue);
    this.requestManager = new RequestManager(options.request);

    // 绑定发送函数到队列
    this.messageQueue.setSendFunction((data) => this.linkAdapter.send(data));

    // 设置事件监听
    this._setupListeners();
  }

  /**
   * 设置内部事件监听
   */
  _setupListeners() {
    // 链路层 -> 数据接收
    this.linkAdapter.on('data', (data) => {
      this.parser.feed(data);
    });

    // 链路层 -> 状态变化
    this.linkAdapter.on('stateChange', (newState, oldState) => {
      this._onLinkStateChange(newState, oldState);
    });

    // 链路层 -> 错误
    this.linkAdapter.on('error', (error) => {
      this.logger.error('Link error:', error.message);
      this.emit('error', error);
    });

    // 协议层 -> 帧解析完成
    this.parser.on('frame', (frame) => {
      this._onFrameParsed(frame);
    });

    // 协议层 -> 解析错误
    this.parser.on('error', (error) => {
      this.logger.warn('Parse error:', error.message);
      this.emit('error', error);
    });
  }

  /**
   * 处理链路状态变化
   * @param {string} newState
   * @param {string} oldState
   */
  _onLinkStateChange(newState, oldState) {
    switch (newState) {
      case LinkState.CONNECTED:
        this._setState(ChannelState.READY);
        this.emit('connected');
        break;
      case LinkState.DISCONNECTED:
        this._setState(ChannelState.IDLE);
        this.requestManager.cancelAll('Connection lost');
        this.messageQueue.clear();
        this.parser.reset();
        this.emit('disconnected');
        break;
      case LinkState.CONNECTING:
        this._setState(ChannelState.CONNECTING);
        break;
      default:
        break;
    }
  }

  /**
   * 处理解析到的帧
   * @param {Object} frame
   */
  _onFrameParsed(frame) {
    this.logger.debug(
      `Frame received: seq=${frame.seqNo}, func=0x${frame.funcCode.toString(16)}`
    );

    // 先尝试匹配为响应
    const matched = this.requestManager.handleResponse(frame);

    if (!matched) {
      // 未匹配到请求，视为设备主动通知
      this.logger.debug('Unmatched frame, treating as notification');
      this.emit('notification', frame);
    }
  }

  /**
   * 更新通道状态
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
   * 连接设备
   * @param {Object} options - 连接参数 (传递给链路适配器)
   * @returns {Promise<void>}
   */
  async connect(options = {}) {
    if (this.state === ChannelState.READY) {
      this.logger.info('Already connected');
      return;
    }

    this._setState(ChannelState.CONNECTING);
    this.packer.resetSeqNo();
    this.parser.reset();

    try {
      await this.linkAdapter.connect(options);
    } catch (error) {
      this._setState(ChannelState.ERROR);
      throw error;
    }
  }

  /**
   * 断开连接
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.state === ChannelState.IDLE || this.state === ChannelState.CLOSED) {
      return;
    }

    this.requestManager.cancelAll('Disconnecting');
    this.messageQueue.clear();

    try {
      await this.linkAdapter.disconnect();
    } catch (error) {
      this.logger.error('Disconnect error:', error.message);
    }

    this._setState(ChannelState.IDLE);
  }

  /**
   * 发送请求并等待响应
   * @param {number} funcCode - 功能码
   * @param {Uint8Array|number[]} [data=[]] - 数据载荷
   * @param {Object} [options]
   * @param {number} [options.timeout=5000] - 响应超时（毫秒）
   * @param {number} [options.priority=0] - 发送优先级
   * @returns {Promise<Object>} 响应帧 { seqNo, funcCode, data }
   */
  async sendRequest(funcCode, data = [], options = {}) {
    if (this.state !== ChannelState.READY) {
      throw new Error(`Channel is not ready (state: ${this.state})`);
    }

    const { timeout, priority } = options;

    // 打包
    const payload = data instanceof Uint8Array ? data : new Uint8Array(data);
    const { frame, seqNo } = this.packer.buildRequest(funcCode, Array.from(payload));

    // 注册响应等待
    const responsePromise = this.requestManager.waitForResponse(seqNo, funcCode, timeout);

    // 入队发送
    return new Promise((resolve, reject) => {
      const enqueued = this.messageQueue.enqueue(frame, {
        priority,
        timeout: timeout || this.messageQueue.defaultTimeout,
        onSuccess: () => {
          // 发送成功，等待响应
          responsePromise.then(resolve).catch(reject);
        },
        onError: (err) => {
          // 发送失败，取消等待
          this.requestManager.handleResponse({
            seqNo,
            funcCode: funcCode | 0x80,
            data: new Uint8Array(0),
          });
          reject(err);
        },
      });

      if (!enqueued) {
        reject(new Error('Failed to enqueue message'));
      }
    });
  }

  /**
   * 发送数据（不等待响应）
   * @param {number} funcCode - 功能码
   * @param {Uint8Array|number[]} [data=[]] - 数据载荷
   * @param {Object} [options]
   * @param {number} [options.priority=0] - 发送优先级
   * @returns {Promise<void>}
   */
  async sendOnly(funcCode, data = [], options = {}) {
    if (this.state !== ChannelState.READY) {
      throw new Error(`Channel is not ready (state: ${this.state})`);
    }

    const payload = data instanceof Uint8Array ? data : new Uint8Array(data);
    const frame = this.packer.pack({ funcCode, data: payload });

    return new Promise((resolve, reject) => {
      const enqueued = this.messageQueue.enqueue(frame, {
        priority: options.priority,
        onSuccess: resolve,
        onError: reject,
      });

      if (!enqueued) {
        reject(new Error('Failed to enqueue message'));
      }
    });
  }

  /**
   * 发送心跳
   * @returns {Promise<Object>} 响应帧
   */
  async sendHeartbeat() {
    return this.sendRequest(FuncCode.HEARTBEAT, [], { timeout: 3000 });
  }

  /**
   * 是否已就绪
   * @returns {boolean}
   */
  isReady() {
    return this.state === ChannelState.READY;
  }

  /**
   * 释放资源
   */
  dispose() {
    this.requestManager.dispose();
    this.messageQueue.dispose();
    this.linkAdapter.dispose();
    this.parser.reset();
    this._setState(ChannelState.CLOSED);
    this.removeAllListeners();
  }
}

module.exports = { Channel, ChannelState };
