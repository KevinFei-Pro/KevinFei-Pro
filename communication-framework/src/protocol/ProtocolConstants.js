/**
 * 协议常量定义
 *
 * 帧格式 (Modbus-like binary protocol):
 * +--------+--------+--------+--------+-----------+--------+--------+
 * | Header | Header | SeqNo  | FuncCode| Length(2) | Data.. | CRC16  |
 * | 0xAA   | 0x55   | 1 byte | 1 byte | 2 bytes   | N bytes| 2 bytes|
 * +--------+--------+--------+--------+-----------+--------+--------+
 *
 * Header:      帧头 (0xAA 0x55)
 * SeqNo:       序列号 (0x00~0xFF)，用于请求-响应匹配
 * FuncCode:    功能码，标识命令类型
 * Length:       数据段长度 (大端序, 2 字节)
 * Data:        数据载荷 (0~N 字节)
 * CRC16:       校验码 (Modbus CRC16, 2 字节, 小端序)
 */

const ProtocolConstants = {
  // 帧头
  HEADER_BYTE_1: 0xAA,
  HEADER_BYTE_2: 0x55,

  // 固定字段长度
  HEADER_LENGTH: 2,     // 帧头 2 字节
  SEQ_LENGTH: 1,        // 序列号 1 字节
  FUNC_CODE_LENGTH: 1,  // 功能码 1 字节
  DATA_LENGTH_FIELD: 2, // 长度字段 2 字节
  CRC_LENGTH: 2,        // CRC 2 字节

  // 最小帧长度 = 帧头(2) + 序列号(1) + 功能码(1) + 长度(2) + CRC(2) = 8
  MIN_FRAME_LENGTH: 8,

  // 帧头 + 序列号 + 功能码 + 长度 = 数据偏移
  DATA_OFFSET: 6,

  // 最大数据载荷长度
  MAX_DATA_LENGTH: 1024,
};

/**
 * 常见功能码定义 (可根据实际协议扩展)
 */
const FuncCode = {
  // 读取类
  READ_REGISTER: 0x03,
  READ_INPUT: 0x04,

  // 写入类
  WRITE_SINGLE: 0x06,
  WRITE_MULTIPLE: 0x10,

  // 设备控制类
  HEARTBEAT: 0x00,
  DEVICE_INFO: 0x01,
  DEVICE_CONTROL: 0x02,

  // 通知类 (设备主动上报)
  NOTIFY: 0x80,
  ALARM: 0x81,

  // 错误响应标记 (功能码最高位置1)
  ERROR_MASK: 0x80,
};

module.exports = { ProtocolConstants, FuncCode };
