const LinkAdapter = require('./LinkAdapter');
const { LinkState, LinkType } = require('./LinkConstants');
const { Logger } = require('../utils/Logger');

/**
 * WebSocketLinkAdapter - WebSocket 链路适配器
 *
 * 使用原生 WebSocket API（React Native 内置支持）。
 *
 * @example
 * const wsAdapter = new WebSocketLinkAdapter();
 * await wsAdapter.connect({ url: 'ws://192.168.1.100:8080' });
 */
class WebSocketLinkAdapter extends LinkAdapter {
  constructor() {
    super(LinkType.WEBSOCKET);
    this._ws = null;
    this._url = '';
    this.logger = new Logger('Link:WebSocket');
  }

  /**
   * 连接 WebSocket
   * @param {Object} options
   * @param {string} options.url - WebSocket 服务地址
   * @param {number} [options.timeout=10000] - 连接超时（毫秒）
   * @param {string[]} [options.protocols] - 子协议
   * @returns {Promise<void>}
   */
  async connect(options = {}) {
    const { url, timeout = 10000, protocols } = options;

    if (!url) {
      throw new Error('WebSocket URL is required');
    }

    this._url = url;
    this._setState(LinkState.CONNECTING);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._cleanup();
        this._setState(LinkState.DISCONNECTED);
        reject(new Error('WebSocket connect timeout'));
      }, timeout);

      try {
        this._ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url);
        this._ws.binaryType = 'arraybuffer';
      } catch (err) {
        clearTimeout(timer);
        this._setState(LinkState.DISCONNECTED);
        reject(err);
        return;
      }

      this._ws.onopen = () => {
        clearTimeout(timer);
        this._setState(LinkState.CONNECTED);
        resolve();
      };

      this._ws.onclose = () => {
        clearTimeout(timer);
        this._setState(LinkState.DISCONNECTED);
        this._cleanup();
      };

      this._ws.onerror = (event) => {
        clearTimeout(timer);
        const error = new Error(event.message || 'WebSocket error');
        this._onError(error);
        if (this.state === LinkState.CONNECTING) {
          this._setState(LinkState.DISCONNECTED);
          reject(error);
        }
      };

      this._ws.onmessage = (event) => {
        let data;
        if (event.data instanceof ArrayBuffer) {
          data = new Uint8Array(event.data);
        } else if (typeof event.data === 'string') {
          // 将字符串转为 Uint8Array
          const encoder = new TextEncoder();
          data = encoder.encode(event.data);
        } else {
          return;
        }
        this._onDataReceived(data);
      };
    });
  }

  /**
   * 断开 WebSocket
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.state === LinkState.DISCONNECTED) return;

    this._setState(LinkState.DISCONNECTING);

    return new Promise((resolve) => {
      if (!this._ws) {
        this._setState(LinkState.DISCONNECTED);
        resolve();
        return;
      }

      const onClose = () => {
        this._setState(LinkState.DISCONNECTED);
        this._cleanup();
        resolve();
      };

      this._ws.onclose = onClose;

      try {
        this._ws.close();
      } catch (err) {
        this.logger.warn('WebSocket close error:', err.message);
        onClose();
      }

      // 兜底超时
      setTimeout(onClose, 3000);
    });
  }

  /**
   * 发送数据
   * @param {Uint8Array} data
   * @returns {Promise<void>}
   */
  async send(data) {
    if (!this.isConnected() || !this._ws) {
      throw new Error('WebSocket is not connected');
    }
    this._ws.send(data.buffer);
  }

  /** @override */
  getMTU() {
    return 65536; // WebSocket 没有 MTU 限制
  }

  _cleanup() {
    if (this._ws) {
      this._ws.onopen = null;
      this._ws.onclose = null;
      this._ws.onerror = null;
      this._ws.onmessage = null;
      this._ws = null;
    }
  }

  /** @override */
  dispose() {
    this._cleanup();
    super.dispose();
  }
}

module.exports = WebSocketLinkAdapter;
