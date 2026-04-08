/**
 * 设备 OTA 编程常量定义 (Device OTA Programming Constants)
 *
 * 包含:
 *   - ProgramState:    OTA 编程状态枚举
 *   - OTACommand:      OTA 命令/TypeID 定义
 *   - GardenToolType:  花园工具类型枚举
 *   - SerialConfig:    蓝牙串口默认配置
 *   - OTASrcAddress:   OTA 源地址定义
 */

/**
 * OTA 编程状态
 */
const ProgramState = {
  IDLE: 'idle',                   // 空闲
  INITIALIZING: 'initializing',   // 初始化中
  TRANSFERRING: 'transferring',   // 传输中
  VERIFYING: 'verifying',         // 校验中
  COMPLETING: 'completing',       // 完成中
  COMPLETE: 'complete',           // 已完成
  ERROR: 'error',                 // 错误
  ABORTED: 'aborted',            // 已中止
};

/**
 * OTA 命令 TypeID 定义
 * 用于花园协议 OTA 通信的 typeId 字段
 */
const OTACommand = {
  OTA_START: 0xF0,       // OTA 开始 / 初始化
  OTA_DATA: 0xF1,        // OTA 数据传输
  OTA_VERIFY: 0xF2,      // OTA 校验
  OTA_END: 0xF3,         // OTA 结束
  OTA_ABORT: 0xF4,       // OTA 中止

  // 设备响应
  OTA_ACK: 0xF5,         // OTA 确认
  OTA_NACK: 0xF6,        // OTA 否认 / 错误
};

/**
 * OTA 响应状态码
 */
const OTAStatus = {
  SUCCESS: 0x00,                 // 成功
  ERROR_UNKNOWN: 0x01,           // 未知错误
  ERROR_INVALID_PARAM: 0x02,     // 参数错误
  ERROR_FLASH_WRITE: 0x03,       // Flash 写入错误
  ERROR_CRC_MISMATCH: 0x04,     // CRC 校验失败
  ERROR_SIZE_MISMATCH: 0x05,    // 大小不匹配
  ERROR_NOT_READY: 0x06,        // 设备未就绪
  ERROR_ABORT: 0x07,            // 已中止
};

/**
 * 花园工具类型定义
 */
const GardenToolType = {
  LAWN_MOWER: 0x01,     // 割草机
  BLOWER: 0x02,         // 吹风机
  CHAINSAW: 0x03,       // 链锯
  HEDGE_TRIMMER: 0x04,  // 修枝机
};

/**
 * 花园工具类型名称映射（用于日志和调试）
 */
const GardenToolTypeName = {
  [GardenToolType.LAWN_MOWER]: '割草机 (Lawn Mower)',
  [GardenToolType.BLOWER]: '吹风机 (Blower)',
  [GardenToolType.CHAINSAW]: '链锯 (Chainsaw)',
  [GardenToolType.HEDGE_TRIMMER]: '修枝机 (Hedge Trimmer)',
};

/**
 * OTA 源地址定义
 * 协议第四个字节（源地址）的特殊值
 */
const OTASrcAddress = {
  IOT: 0x00,     // IOT（蓝牙通信板）
  UI: 0x08,      // UI（显示屏/调试软件）
};

/**
 * 蓝牙串口默认配置
 * 用于花园工具 OTA 的蓝牙串口参数
 */
const SerialConfig = {
  BAUD_RATE: 115200,        // 波特率
  DATA_BITS: 8,             // 数据位
  STOP_BITS: 1,             // 停止位
  PARITY: 'none',           // 校验位: 无
  FLOW_CONTROL: 'none',     // 硬件控制流: 无
};

/**
 * OTA 传输默认配置
 */
const OTADefaults = {
  CHUNK_SIZE: 128,                 // 默认分包大小（字节）
  RESPONSE_TIMEOUT: 5000,         // 等待设备响应超时（毫秒）
  MAX_RETRIES: 3,                 // 最大重试次数
  RETRY_DELAY: 500,               // 重试间隔（毫秒）
};

module.exports = {
  ProgramState,
  OTACommand,
  OTAStatus,
  GardenToolType,
  GardenToolTypeName,
  OTASrcAddress,
  SerialConfig,
  OTADefaults,
};
