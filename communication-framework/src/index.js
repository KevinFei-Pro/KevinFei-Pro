/**
 * RN Communication Framework
 *
 * 分层通讯框架，适用于 React Native 场景。
 * 支持 BLE（低功耗蓝牙）、Wi-Fi（TCP Socket）、WebSocket 三种链路。
 *
 * 架构分层:
 *   链路层 (Link Layer)    - 物理传输通道抽象
 *   协议层 (Protocol Layer) - 二进制帧的编解码
 *   队列层 (Queue Layer)    - 消息队列与请求响应管理
 *   通讯层 (Channel Layer)  - 面向业务的通讯接口
 */

// 顶层 API
const CommunicationManager = require('./CommunicationManager');

// 通讯层
const { Channel, ChannelState } = require('./channel');

// 链路层
const {
  LinkAdapter,
  BLELinkAdapter,
  WebSocketLinkAdapter,
  WiFiLinkAdapter,
  LinkState,
  LinkType,
  BLEConstants,
} = require('./link');

// 协议层
const {
  Packer,
  Parser,
  ProtocolConstants,
  FuncCode,
  calculateCRC16,
  verifyCRC16,
  ChecksumStrategy,
  ModbusCRC16Strategy,
  GardenPacker,
  GardenParser,
  GardenProtocolConstants,
  DeviceAddress,
  DeviceAddressName,
} = require('./protocol');

// 队列层
const { MessageQueue, RequestManager } = require('./queue');

// 工具
const EventEmitter = require('./utils/EventEmitter');
const { Logger, LogLevel } = require('./utils/Logger');

module.exports = {
  // 顶层入口
  CommunicationManager,

  // 通讯层
  Channel,
  ChannelState,

  // 链路层
  LinkAdapter,
  BLELinkAdapter,
  WebSocketLinkAdapter,
  WiFiLinkAdapter,
  LinkState,
  LinkType,
  BLEConstants,

  // 协议层 - 原有协议
  Packer,
  Parser,
  ProtocolConstants,
  FuncCode,
  calculateCRC16,
  verifyCRC16,

  // 协议层 - 校验算法策略
  ChecksumStrategy,
  ModbusCRC16Strategy,

  // 协议层 - 花园协议
  GardenPacker,
  GardenParser,
  GardenProtocolConstants,
  DeviceAddress,
  DeviceAddressName,

  // 队列层
  MessageQueue,
  RequestManager,

  // 工具
  EventEmitter,
  Logger,
  LogLevel,
};
