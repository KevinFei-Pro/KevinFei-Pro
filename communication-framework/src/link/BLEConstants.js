/**
 * BLE 常量定义
 *
 * 花园协议蓝牙服务和特征值 UUID 定义
 */

const BLEConstants = {
  // 蓝牙服务 UUID
  SERVICE_UUID: 'FE00',

  // 特征值 UUID
  CHAR_WRITE: '2A07',         // Write, App → 设备（命令下发）
  CHAR_NOTIFY: '2A08',        // Read/Notify, 设备 → App（数据上报）
  CHAR_OTA_WRITE: '2A09',     // Write, 下发 OTA 数据（蓝牙 OTA）
  CHAR_OTA_NOTIFY: '2A0A',    // Read/Notify, 回复 OTA 数据（蓝牙 OTA）
};

module.exports = { BLEConstants };
