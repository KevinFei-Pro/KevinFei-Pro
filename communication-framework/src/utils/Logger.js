/**
 * 日志工具
 * 支持不同级别的日志输出，方便调试
 */

const LogLevel = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
};

class Logger {
  constructor(tag = 'CommFramework') {
    this.tag = tag;
    this.level = LogLevel.INFO;
  }

  setLevel(level) {
    this.level = level;
  }

  debug(...args) {
    if (this.level >= LogLevel.DEBUG) {
      console.log(`[${this.tag}][DEBUG]`, ...args);
    }
  }

  info(...args) {
    if (this.level >= LogLevel.INFO) {
      console.log(`[${this.tag}][INFO]`, ...args);
    }
  }

  warn(...args) {
    if (this.level >= LogLevel.WARN) {
      console.warn(`[${this.tag}][WARN]`, ...args);
    }
  }

  error(...args) {
    if (this.level >= LogLevel.ERROR) {
      console.error(`[${this.tag}][ERROR]`, ...args);
    }
  }

  /**
   * 将 ArrayBuffer / Uint8Array 格式化为十六进制字符串
   * @param {ArrayBuffer|Uint8Array} buffer
   * @returns {string}
   */
  static hexDump(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
  }
}

module.exports = { Logger, LogLevel };
