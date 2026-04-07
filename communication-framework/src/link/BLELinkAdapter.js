const LinkAdapter = require('./LinkAdapter');
const { LinkState, LinkType } = require('./LinkConstants');
const { Logger } = require('../utils/Logger');

/**
 * BLELinkAdapter - 低功耗蓝牙链路适配器
 *
 * 封装 react-native-ble-plx 或 react-native-ble-manager 的底层 API。
 * 使用者需要在构造时注入 BLE Manager 实例。
 *
 * @example
 * const bleAdapter = new BLELinkAdapter({
 *   bleManager: bleManagerInstance,    // 来自 react-native-ble-plx
 *   serviceUUID: '0000fff0-...',
 *   writeCharUUID: '0000fff1-...',
 *   notifyCharUUID: '0000fff2-...',
 * });
 */
class BLELinkAdapter extends LinkAdapter {
  /**
   * @param {Object} options
   * @param {Object} options.bleManager - BLE Manager 实例（react-native-ble-plx BleManager）
   * @param {string} options.serviceUUID - 服务 UUID
   * @param {string} options.writeCharUUID - 写特征 UUID
   * @param {string} options.notifyCharUUID - 通知特征 UUID
   * @param {number} [options.mtu=20] - MTU 大小
   */
  constructor(options = {}) {
    super(LinkType.BLE);
    this.bleManager = options.bleManager || null;
    this.serviceUUID = options.serviceUUID || '';
    this.writeCharUUID = options.writeCharUUID || '';
    this.notifyCharUUID = options.notifyCharUUID || '';
    this.mtu = options.mtu || 20;

    this._device = null;
    this._subscription = null;
    this.logger = new Logger('Link:BLE');
  }

  /**
   * 连接 BLE 设备
   * @param {Object} options
   * @param {string} options.deviceId - 设备 ID / MAC 地址
   * @param {number} [options.timeout=10000] - 连接超时（毫秒）
   * @returns {Promise<void>}
   */
  async connect(options = {}) {
    const { deviceId, timeout = 10000 } = options;

    if (!this.bleManager) {
      throw new Error('BLE Manager is not provided');
    }
    if (!deviceId) {
      throw new Error('deviceId is required');
    }

    this._setState(LinkState.CONNECTING);

    try {
      // 连接设备
      this._device = await Promise.race([
        this.bleManager.connectToDevice(deviceId),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('BLE connect timeout')), timeout)
        ),
      ]);

      // 发现服务和特征
      await this._device.discoverAllServicesAndCharacteristics();

      // 协商 MTU（如果支持）
      if (typeof this._device.requestMTU === 'function') {
        try {
          const negotiated = await this._device.requestMTU(this.mtu + 3); // ATT header = 3
          this.mtu = negotiated.mtu - 3;
          this.logger.info(`Negotiated MTU: ${this.mtu}`);
        } catch (e) {
          this.logger.warn('MTU negotiation failed, using default:', this.mtu);
        }
      }

      // 监听通知特征
      this._subscription = this._device.monitorCharacteristicForService(
        this.serviceUUID,
        this.notifyCharUUID,
        (error, characteristic) => {
          if (error) {
            this._onError(error);
            return;
          }
          if (characteristic && characteristic.value) {
            // characteristic.value 是 Base64 编码的字符串，需要解码
            const data = this._base64ToUint8Array(characteristic.value);
            this._onDataReceived(data);
          }
        }
      );

      // 监听断开事件
      this.bleManager.onDeviceDisconnected(deviceId, (error) => {
        if (error) {
          this._onError(error);
        }
        this._setState(LinkState.DISCONNECTED);
        this._cleanup();
      });

      this._setState(LinkState.CONNECTED);
    } catch (error) {
      this._setState(LinkState.DISCONNECTED);
      this._cleanup();
      throw error;
    }
  }

  /**
   * 断开 BLE 连接
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.state === LinkState.DISCONNECTED) return;

    this._setState(LinkState.DISCONNECTING);

    try {
      if (this._device) {
        await this.bleManager.cancelDeviceConnection(this._device.id);
      }
    } catch (error) {
      this.logger.warn('Disconnect error:', error.message);
    } finally {
      this._setState(LinkState.DISCONNECTED);
      this._cleanup();
    }
  }

  /**
   * 发送数据到 BLE 设备
   * 如果数据大于 MTU，自动分包发送
   * @param {Uint8Array} data
   * @returns {Promise<void>}
   */
  async send(data) {
    if (!this.isConnected() || !this._device) {
      throw new Error('BLE is not connected');
    }

    const chunks = this._splitByMTU(data);

    for (const chunk of chunks) {
      const base64Data = this._uint8ArrayToBase64(chunk);
      await this._device.writeCharacteristicWithResponseForService(
        this.serviceUUID,
        this.writeCharUUID,
        base64Data
      );
    }
  }

  /** @override */
  getMTU() {
    return this.mtu;
  }

  /**
   * 按 MTU 分包
   * @param {Uint8Array} data
   * @returns {Uint8Array[]}
   */
  _splitByMTU(data) {
    const mtu = this.mtu;
    if (data.length <= mtu) return [data];

    const chunks = [];
    for (let i = 0; i < data.length; i += mtu) {
      chunks.push(data.slice(i, i + mtu));
    }
    return chunks;
  }

  /**
   * Base64 -> Uint8Array (for RN BLE libraries)
   * @param {string} base64
   * @returns {Uint8Array}
   */
  _base64ToUint8Array(base64) {
    // 在 React Native 中可以使用 atob 或 Buffer
    const binaryString = typeof atob === 'function'
      ? atob(base64)
      : Buffer.from(base64, 'base64').toString('binary');
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Uint8Array -> Base64 (for RN BLE libraries)
   * @param {Uint8Array} bytes
   * @returns {string}
   */
  _uint8ArrayToBase64(bytes) {
    const binaryString = String.fromCharCode(...bytes);
    if (typeof btoa === 'function') {
      return btoa(binaryString);
    }
    return Buffer.from(bytes).toString('base64');
  }

  /**
   * 清理内部资源
   */
  _cleanup() {
    if (this._subscription) {
      this._subscription.remove();
      this._subscription = null;
    }
    this._device = null;
  }

  /** @override */
  dispose() {
    this._cleanup();
    super.dispose();
  }
}

module.exports = BLELinkAdapter;
