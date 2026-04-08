const EventEmitter = require('../utils/EventEmitter');
const { Logger } = require('../utils/Logger');
const { ProgramState, OTADefaults } = require('./ProgramConstants');

/**
 * DeviceProgram - 设备 OTA 编程抽象基类
 *
 * 定义设备 OTA 升级的通用流程和接口。
 * 子类需要实现具体的协议打包/解析和命令交互逻辑。
 *
 * OTA 流程:
 *   1. startProgram()       → 初始化 OTA（发送 OTA_START）
 *   2. _transferFirmware()  → 分包传输固件数据（循环发送 OTA_DATA）
 *   3. _verifyFirmware()    → 校验固件（发送 OTA_VERIFY）
 *   4. _completeFirmware()  → 完成 OTA（发送 OTA_END）
 *
 * Events:
 *   - 'stateChange': (newState, oldState) => void
 *   - 'progress': ({ sent, total, percentage }) => void
 *   - 'error': (Error) => void
 *   - 'complete': () => void
 *
 * 协议封装采用小端模式 (Little-Endian)。
 */
class DeviceProgram extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} [options.name='DeviceProgram'] - 编程器名称（用于日志）
   * @param {number} [options.chunkSize] - 分包大小（字节）
   * @param {number} [options.responseTimeout] - 响应超时（毫秒）
   * @param {number} [options.maxRetries] - 最大重试次数
   * @param {number} [options.retryDelay] - 重试间隔（毫秒）
   */
  constructor(options = {}) {
    super();

    this._name = options.name || 'DeviceProgram';
    this._chunkSize = options.chunkSize || OTADefaults.CHUNK_SIZE;
    this._responseTimeout = options.responseTimeout || OTADefaults.RESPONSE_TIMEOUT;
    this._maxRetries = options.maxRetries || OTADefaults.MAX_RETRIES;
    this._retryDelay = options.retryDelay || OTADefaults.RETRY_DELAY;

    this._state = ProgramState.IDLE;
    this._firmware = null;
    this._sentBytes = 0;
    this._totalBytes = 0;
    this._aborted = false;

    this.logger = new Logger(`Program:${this._name}`);
  }

  /**
   * 获取当前状态
   * @returns {string}
   */
  get state() {
    return this._state;
  }

  /**
   * 获取传输进度
   * @returns {{ sent: number, total: number, percentage: number }}
   */
  get progress() {
    const percentage = this._totalBytes > 0
      ? Math.round((this._sentBytes / this._totalBytes) * 100)
      : 0;
    return {
      sent: this._sentBytes,
      total: this._totalBytes,
      percentage,
    };
  }

  /**
   * 开始 OTA 编程
   * @param {Uint8Array} firmware - 固件二进制数据
   * @param {Object} [options] - 额外选项（传给子类）
   * @returns {Promise<void>}
   */
  async startProgram(firmware, options = {}) {
    if (this._state !== ProgramState.IDLE && this._state !== ProgramState.ERROR &&
        this._state !== ProgramState.COMPLETE && this._state !== ProgramState.ABORTED) {
      throw new Error(`Cannot start OTA in state: ${this._state}`);
    }

    if (!firmware || firmware.length === 0) {
      throw new Error('Firmware data is required');
    }

    this._firmware = firmware;
    this._totalBytes = firmware.length;
    this._sentBytes = 0;
    this._aborted = false;

    this.logger.info(`Starting OTA, firmware size: ${this._totalBytes} bytes`);

    try {
      // 阶段 1: 初始化
      this._setState(ProgramState.INITIALIZING);
      await this._sendInitCommand(firmware, options);

      // 检查是否已中止
      if (this._aborted) return;

      // 阶段 2: 传输固件数据
      this._setState(ProgramState.TRANSFERRING);
      await this._transferFirmware(firmware, options);

      if (this._aborted) return;

      // 阶段 3: 校验
      this._setState(ProgramState.VERIFYING);
      await this._sendVerifyCommand(firmware, options);

      if (this._aborted) return;

      // 阶段 4: 完成
      this._setState(ProgramState.COMPLETING);
      await this._sendCompleteCommand(options);

      this._setState(ProgramState.COMPLETE);
      this.emit('complete');
      this.logger.info('OTA completed successfully');
    } catch (error) {
      if (this._aborted) return;
      this._setState(ProgramState.ERROR);
      this.emit('error', error);
      this.logger.error('OTA failed:', error.message);
      throw error;
    }
  }

  /**
   * 中止 OTA
   * @returns {Promise<void>}
   */
  async abort() {
    if (this._state === ProgramState.IDLE ||
        this._state === ProgramState.COMPLETE ||
        this._state === ProgramState.ABORTED) {
      return;
    }

    this.logger.info('Aborting OTA...');
    this._aborted = true;

    try {
      await this._sendAbortCommand();
    } catch (error) {
      this.logger.warn('Abort command failed:', error.message);
    }

    this._setState(ProgramState.ABORTED);
  }

  /**
   * 重置状态（回到 IDLE）
   */
  reset() {
    this._state = ProgramState.IDLE;
    this._firmware = null;
    this._sentBytes = 0;
    this._totalBytes = 0;
    this._aborted = false;
    this.logger.info('OTA state reset');
  }

  /**
   * 分包传输固件数据
   * @param {Uint8Array} firmware
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async _transferFirmware(firmware, options) {
    const chunkSize = options.chunkSize || this._chunkSize;
    let offset = 0;

    while (offset < firmware.length) {
      if (this._aborted) return;

      const end = Math.min(offset + chunkSize, firmware.length);
      const chunk = firmware.slice(offset, end);
      const chunkIndex = Math.floor(offset / chunkSize);

      await this._sendDataChunk(chunk, offset, chunkIndex, options);

      offset = end;
      this._sentBytes = offset;

      // 触发进度事件
      this.emit('progress', this.progress);
      this.logger.debug(
        `Progress: ${this.progress.percentage}% (${this._sentBytes}/${this._totalBytes})`
      );
    }
  }

  // ============================
  // 以下方法必须由子类实现
  // ============================

  /**
   * 发送 OTA 初始化命令 (子类实现)
   * @param {Uint8Array} firmware - 完整固件数据
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async _sendInitCommand(_firmware, _options) {
    throw new Error('_sendInitCommand() must be implemented by subclass');
  }

  /**
   * 发送固件数据块 (子类实现)
   * @param {Uint8Array} chunk - 数据块
   * @param {number} offset - 数据在固件中的偏移
   * @param {number} chunkIndex - 块索引
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async _sendDataChunk(_chunk, _offset, _chunkIndex, _options) {
    throw new Error('_sendDataChunk() must be implemented by subclass');
  }

  /**
   * 发送固件校验命令 (子类实现)
   * @param {Uint8Array} firmware - 完整固件数据
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async _sendVerifyCommand(_firmware, _options) {
    throw new Error('_sendVerifyCommand() must be implemented by subclass');
  }

  /**
   * 发送 OTA 完成命令 (子类实现)
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async _sendCompleteCommand(_options) {
    throw new Error('_sendCompleteCommand() must be implemented by subclass');
  }

  /**
   * 发送 OTA 中止命令 (子类实现)
   * @returns {Promise<void>}
   */
  async _sendAbortCommand() {
    throw new Error('_sendAbortCommand() must be implemented by subclass');
  }

  /**
   * 更新状态
   * @param {string} newState
   */
  _setState(newState) {
    const oldState = this._state;
    if (oldState === newState) return;
    this._state = newState;
    this.logger.info(`State: ${oldState} -> ${newState}`);
    this.emit('stateChange', newState, oldState);
  }

  /**
   * 释放资源
   */
  dispose() {
    this.reset();
    this.removeAllListeners();
  }
}

module.exports = DeviceProgram;
