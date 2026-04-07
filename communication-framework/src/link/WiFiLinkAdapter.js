const LinkAdapter = require('./LinkAdapter');
const { LinkState, LinkType } = require('./LinkConstants');
const { Logger } = require('../utils/Logger');

/**
 * WiFiLinkAdapter - Wi-Fi TCP Socket 链路适配器
 *
 * 封装 react-native-tcp-socket 用于 TCP 通信。
 * 使用者需要在构造时注入 TcpSocket 模块。
 *
 * @example
 * import TcpSocket from 'react-native-tcp-socket';
 * const wifiAdapter = new WiFiLinkAdapter({ tcpSocketModule: TcpSocket });
 * await wifiAdapter.connect({ host: '192.168.1.100', port: 8080 });
 */
class WiFiLinkAdapter extends LinkAdapter {
  /**
   * @param {Object} options
   * @param {Object} options.tcpSocketModule - TCP Socket 模块 (react-native-tcp-socket)
   */
  constructor(options = {}) {
    super(LinkType.WIFI);
    this.tcpSocketModule = options.tcpSocketModule || null;
    this._socket = null;
    this.logger = new Logger('Link:WiFi');
  }

  /**
   * 连接 TCP 设备
   * @param {Object} options
   * @param {string} options.host - IP 地址
   * @param {number} options.port - 端口号
   * @param {number} [options.timeout=10000] - 连接超时（毫秒）
   * @returns {Promise<void>}
   */
  async connect(options = {}) {
    const { host, port, timeout = 10000 } = options;

    if (!this.tcpSocketModule) {
      throw new Error('TCP Socket module is not provided');
    }
    if (!host || !port) {
      throw new Error('host and port are required');
    }

    this._setState(LinkState.CONNECTING);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._cleanup();
        this._setState(LinkState.DISCONNECTED);
        reject(new Error('TCP connect timeout'));
      }, timeout);

      try {
        this._socket = this.tcpSocketModule.createConnection(
          { host, port },
          () => {
            clearTimeout(timer);
            this._setState(LinkState.CONNECTED);
            resolve();
          }
        );
      } catch (err) {
        clearTimeout(timer);
        this._setState(LinkState.DISCONNECTED);
        reject(err);
        return;
      }

      this._socket.on('data', (data) => {
        // data 可能是 Buffer 或 Uint8Array
        const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
        this._onDataReceived(uint8);
      });

      this._socket.on('error', (error) => {
        clearTimeout(timer);
        this._onError(error);
        if (this.state === LinkState.CONNECTING) {
          this._setState(LinkState.DISCONNECTED);
          reject(error);
        }
      });

      this._socket.on('close', () => {
        clearTimeout(timer);
        this._setState(LinkState.DISCONNECTED);
        this._cleanup();
      });
    });
  }

  /**
   * 断开连接
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.state === LinkState.DISCONNECTED) return;

    this._setState(LinkState.DISCONNECTING);

    return new Promise((resolve) => {
      if (!this._socket) {
        this._setState(LinkState.DISCONNECTED);
        resolve();
        return;
      }

      this._socket.on('close', () => {
        this._setState(LinkState.DISCONNECTED);
        this._cleanup();
        resolve();
      });

      try {
        this._socket.destroy();
      } catch (err) {
        this.logger.warn('TCP disconnect error:', err.message);
        this._setState(LinkState.DISCONNECTED);
        this._cleanup();
        resolve();
      }

      setTimeout(() => {
        this._setState(LinkState.DISCONNECTED);
        this._cleanup();
        resolve();
      }, 3000);
    });
  }

  /**
   * 发送数据
   * @param {Uint8Array} data
   * @returns {Promise<void>}
   */
  async send(data) {
    if (!this.isConnected() || !this._socket) {
      throw new Error('TCP is not connected');
    }

    return new Promise((resolve, reject) => {
      this._socket.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** @override */
  getMTU() {
    return 1460; // TCP MSS typical
  }

  _cleanup() {
    if (this._socket) {
      this._socket.removeAllListeners();
      this._socket = null;
    }
  }

  /** @override */
  dispose() {
    this._cleanup();
    super.dispose();
  }
}

module.exports = WiFiLinkAdapter;
