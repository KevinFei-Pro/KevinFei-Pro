const { Channel, ChannelState } = require('./channel');
const { BLELinkAdapter, WebSocketLinkAdapter, WiFiLinkAdapter, LinkType } = require('./link');
const { Logger, LogLevel } = require('./utils/Logger');

/**
 * CommunicationManager - 通讯管理器
 *
 * 顶层 API，简化通道的创建和管理。
 * 提供工厂方法快速创建不同链路类型的通道。
 *
 * @example
 * // 创建 BLE 通道
 * const manager = new CommunicationManager();
 * const channel = manager.createBLEChannel({
 *   bleManager: bleManagerInstance,
 *   serviceUUID: '0000fff0-...',
 *   writeCharUUID: '0000fff1-...',
 *   notifyCharUUID: '0000fff2-...',
 * });
 *
 * await channel.connect({ deviceId: 'XX:XX:XX:XX:XX:XX' });
 * const response = await channel.sendRequest(0x03, [0x00, 0x01]);
 * console.log('Response:', response.data);
 *
 * // 监听设备主动通知
 * channel.on('notification', (frame) => {
 *   console.log('Notification:', frame);
 * });
 */
class CommunicationManager {
  constructor() {
    /** @type {Map<string, Channel>} */
    this._channels = new Map();
    this.logger = new Logger('CommManager');
  }

  /**
   * 创建 BLE 通道
   * @param {Object} options
   * @param {Object} options.bleManager - BLE Manager 实例
   * @param {string} options.serviceUUID - 服务 UUID
   * @param {string} options.writeCharUUID - 写特征 UUID
   * @param {string} options.notifyCharUUID - 通知特征 UUID
   * @param {number} [options.mtu=20] - MTU
   * @param {Object} [options.queue] - 队列配置
   * @param {Object} [options.request] - 请求配置
   * @param {string} [options.name='ble-default'] - 通道名称
   * @returns {Channel}
   */
  createBLEChannel(options = {}) {
    const name = options.name || 'ble-default';
    const linkAdapter = new BLELinkAdapter(options);
    return this._createChannel(name, linkAdapter, options);
  }

  /**
   * 创建 WebSocket 通道
   * @param {Object} [options]
   * @param {Object} [options.queue] - 队列配置
   * @param {Object} [options.request] - 请求配置
   * @param {string} [options.name='ws-default'] - 通道名称
   * @returns {Channel}
   */
  createWebSocketChannel(options = {}) {
    const name = options.name || 'ws-default';
    const linkAdapter = new WebSocketLinkAdapter();
    return this._createChannel(name, linkAdapter, options);
  }

  /**
   * 创建 Wi-Fi TCP 通道
   * @param {Object} options
   * @param {Object} options.tcpSocketModule - TCP Socket 模块
   * @param {Object} [options.queue] - 队列配置
   * @param {Object} [options.request] - 请求配置
   * @param {string} [options.name='wifi-default'] - 通道名称
   * @returns {Channel}
   */
  createWiFiChannel(options = {}) {
    const name = options.name || 'wifi-default';
    const linkAdapter = new WiFiLinkAdapter(options);
    return this._createChannel(name, linkAdapter, options);
  }

  /**
   * 创建通道内部方法
   * @param {string} name
   * @param {import('./link/LinkAdapter')} linkAdapter
   * @param {Object} options
   * @returns {Channel}
   */
  _createChannel(name, linkAdapter, options) {
    // 如果已经存在同名通道，先释放
    if (this._channels.has(name)) {
      this.logger.warn(`Channel "${name}" already exists, disposing old one`);
      this._channels.get(name).dispose();
    }

    const channel = new Channel({
      linkAdapter,
      queue: options.queue,
      request: options.request,
      protocol: options.protocol,
    });

    this._channels.set(name, channel);
    this.logger.info(`Channel "${name}" created (${linkAdapter.type})`);

    return channel;
  }

  /**
   * 获取通道
   * @param {string} name - 通道名称
   * @returns {Channel|undefined}
   */
  getChannel(name) {
    return this._channels.get(name);
  }

  /**
   * 断开并释放指定通道
   * @param {string} name - 通道名称
   * @returns {Promise<void>}
   */
  async disposeChannel(name) {
    const channel = this._channels.get(name);
    if (channel) {
      await channel.disconnect();
      channel.dispose();
      this._channels.delete(name);
      this.logger.info(`Channel "${name}" disposed`);
    }
  }

  /**
   * 断开并释放所有通道
   * @returns {Promise<void>}
   */
  async disposeAll() {
    const promises = [];
    for (const [name, channel] of this._channels) {
      promises.push(
        channel.disconnect().catch(() => {}).then(() => {
          channel.dispose();
          this.logger.info(`Channel "${name}" disposed`);
        })
      );
    }
    await Promise.all(promises);
    this._channels.clear();
  }

  /**
   * 设置全局日志级别
   * @param {number} level - LogLevel 枚举值
   */
  static setLogLevel(level) {
    // 这个方法只是个示例，实际需要全局 Logger 注册表
    Logger.globalLevel = level;
  }
}

module.exports = CommunicationManager;
