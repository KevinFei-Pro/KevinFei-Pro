/**
 * 花园协议常量定义 (Garden Protocol)
 *
 * 帧格式:
 * +--------+--------+--------+--------+--------+--------+--------+--------+
 * | Header | Header |  Dest  |  Src   | Length | TypeID | Data.. | CRC16  |
 * | 0xC5   | 0x5C   | 1 byte | 1 byte | 1 byte | 1 byte | N bytes| 2 bytes|
 * +--------+--------+--------+--------+--------+--------+--------+--------+
 *
 * Header:      帧头 (0xC5 0x5C) 固定值
 * Dest:        目标地址 (0x00~0xFF)
 * Src:         源地址 (0x00~0xFF)
 * Length:      数据段长度 (0x00~0xFF)
 * TypeID:      类型/命令 ID (0x00~0xFF)
 * Data:        数据载荷 (0~N 字节)
 * CRC16:       校验码 (2 字节, 低字节在前 L8-H8)
 */

const GardenProtocolConstants = {
  // 帧头
  HEADER_BYTE_1: 0xC5,
  HEADER_BYTE_2: 0x5C,

  // 固定字段长度
  HEADER_LENGTH: 2,       // 帧头 2 字节
  DEST_LENGTH: 1,         // 目标地址 1 字节
  SRC_LENGTH: 1,          // 源地址 1 字节
  DATA_LENGTH_FIELD: 1,   // 长度字段 1 字节
  TYPE_ID_LENGTH: 1,      // 类型 ID 1 字节
  CRC_LENGTH: 2,          // CRC 2 字节

  // 最小帧长度 = 帧头(2) + 目标(1) + 源(1) + 长度(1) + 类型(1) + CRC(2) = 8
  MIN_FRAME_LENGTH: 8,

  // 数据偏移 = 帧头(2) + 目标(1) + 源(1) + 长度(1) + 类型(1) = 6
  DATA_OFFSET: 6,

  // 最大数据载荷长度 (长度字段为 1 字节，最大 0xFF = 255)
  MAX_DATA_LENGTH: 255,
};

/**
 * 设备地址定义
 * 用于花园协议中目标地址和源地址字段
 */
const DeviceAddress = {
  IOT: 0x00,          // IOT（蓝牙通信板）
  BMS: 0x01,          // BMS（电池包）
  TOOL: 0x02,         // TOOL（工具）
  CHG: 0x03,          // CHG（充电器）
  APP: 0x04,          // APP（手机APP）
  WHEEL: 0x05,        // WHEEL（轮毂控制板）
  MOTOR: 0x06,        // MOTOR（切割电机）
  LCD_LED: 0x07,      // LCD/LED（蓝牙通信板）
  UI: 0x08,           // UI（调试软件）
  FIXTURE: 0x09,      // 工装
};

/**
 * 设备地址名称映射（用于日志和调试）
 */
const DeviceAddressName = {
  [DeviceAddress.IOT]: 'IOT',
  [DeviceAddress.BMS]: 'BMS',
  [DeviceAddress.TOOL]: 'TOOL',
  [DeviceAddress.CHG]: 'CHG',
  [DeviceAddress.APP]: 'APP',
  [DeviceAddress.WHEEL]: 'WHEEL',
  [DeviceAddress.MOTOR]: 'MOTOR',
  [DeviceAddress.LCD_LED]: 'LCD/LED',
  [DeviceAddress.UI]: 'UI',
  [DeviceAddress.FIXTURE]: 'FIXTURE',
};

module.exports = { GardenProtocolConstants, DeviceAddress, DeviceAddressName };
