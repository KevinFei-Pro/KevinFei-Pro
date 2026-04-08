# RN Communication Framework

适用于 React Native 的分层通讯框架，支持 **BLE（低功耗蓝牙）**、**Wi-Fi（TCP Socket）**、**WebSocket** 三种链路，采用类 Modbus 的二进制协议格式。同时提供 **设备 OTA 编程** 能力，支持花园工具类设备的固件升级。

## 架构总览

```
┌──────────────────────────────────────────────────────┐
│                   业务层 (Your App)                    │
├──────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │ CommunicationMgr │  │  OTA 编程层 (Program)     │  │
│  │ (通讯管理器)      │  │  ┌─────────────────────┐ │  │
│  └──────────────────┘  │  │   DeviceProgram      │ │  │
│                        │  │   (抽象基类)          │ │  │
│                        │  ├─────────────────────┤ │  │
│                        │  │   GardenProgram      │ │  │
│                        │  │   (花园工具 OTA)      │ │  │
│                        │  └─────────────────────┘ │  │
│                        └──────────────────────────┘  │
├──────────────────────────────────────────────────────┤
│  通讯层 (Channel)                                     │
│  ┌────────────────┐  ┌───────────────────────────┐   │
│  │  MessageQueue   │  │     RequestManager        │   │
│  │  (发送队列)      │  │  (请求-响应匹配/超时管理)  │   │
│  └────────────────┘  └───────────────────────────┘   │
├──────────────────────────────────────────────────────┤
│  协议层 (Protocol)                                    │
│  ┌────────────────┐  ┌───────────────────────────┐   │
│  │    Packer       │  │       Parser              │   │
│  │  (帧打包/编码)   │  │  (帧解析/解码/粘包拆包)    │   │
│  └────────────────┘  └───────────────────────────┘   │
├──────────────────────────────────────────────────────┤
│  链路层 (Link)                                        │
│  ┌──────────┐  ┌───────────────┐  ┌──────────────┐  │
│  │   BLE    │  │    Wi-Fi      │  │  WebSocket   │  │
│  │ Adapter  │  │   Adapter     │  │   Adapter    │  │
│  └──────────┘  └───────────────┘  └──────────────┘  │
└──────────────────────────────────────────────────────┘
```

## 协议帧格式

```
+--------+--------+--------+----------+-----------+---------+--------+--------+
| Header | Header | SeqNo  | FuncCode | LengthHi  | LengthLo| Data.. | CRC16  |
| 0xAA   | 0x55   | 1 byte | 1 byte   | 1 byte    | 1 byte  | N bytes| 2 bytes|
+--------+--------+--------+----------+-----------+---------+--------+--------+
```

| 字段 | 长度 | 说明 |
|------|------|------|
| Header | 2 字节 | 帧头固定为 `0xAA 0x55` |
| SeqNo | 1 字节 | 序列号 (0~255)，用于请求-响应匹配 |
| FuncCode | 1 字节 | 功能码，标识命令类型 |
| Length | 2 字节 | 数据载荷长度（大端序） |
| Data | 0~1024 字节 | 数据载荷 |
| CRC16 | 2 字节 | Modbus CRC16 校验（小端序） |

## 快速开始

### 安装

将 `communication-framework` 目录复制到你的 RN 项目中，然后引入：

```javascript
const {
  CommunicationManager,
  FuncCode,
} = require('./communication-framework/src');
```

### BLE 连接示例

```javascript
import BleManager from 'react-native-ble-plx';

const manager = new CommunicationManager();

// 创建 BLE 通道
const channel = manager.createBLEChannel({
  bleManager: new BleManager(),
  serviceUUID: '0000fff0-0000-1000-8000-00805f9b34fb',
  writeCharUUID: '0000fff1-0000-1000-8000-00805f9b34fb',
  notifyCharUUID: '0000fff2-0000-1000-8000-00805f9b34fb',
  mtu: 200,
});

// 连接设备
await channel.connect({ deviceId: 'XX:XX:XX:XX:XX:XX' });

// 发送请求并等待响应
const response = await channel.sendRequest(
  FuncCode.READ_REGISTER,
  [0x00, 0x01, 0x00, 0x0A],  // 读取寄存器地址 0x0001, 数量 10
  { timeout: 5000 }
);
console.log('Response data:', response.data);

// 仅发送（不等待响应）
await channel.sendOnly(FuncCode.WRITE_SINGLE, [0x00, 0x01, 0x00, 0xFF]);

// 监听设备主动通知
channel.on('notification', (frame) => {
  console.log('Device notification:', frame.funcCode, frame.data);
});

// 监听连接状态
channel.on('stateChange', (newState, oldState) => {
  console.log(`Channel state: ${oldState} -> ${newState}`);
});

// 断开连接
await channel.disconnect();

// 释放资源
await manager.disposeAll();
```

### WebSocket 连接示例

```javascript
const manager = new CommunicationManager();
const channel = manager.createWebSocketChannel();

await channel.connect({ url: 'ws://192.168.1.100:8080' });

const response = await channel.sendRequest(0x01, [0x00]);
console.log('Device info:', response.data);
```

### Wi-Fi TCP 连接示例

```javascript
import TcpSocket from 'react-native-tcp-socket';

const manager = new CommunicationManager();
const channel = manager.createWiFiChannel({
  tcpSocketModule: TcpSocket,
});

await channel.connect({ host: '192.168.1.100', port: 8080 });

const response = await channel.sendRequest(0x03, [0x00, 0x01]);
console.log('Register value:', response.data);
```

## API 参考

### CommunicationManager

| 方法 | 说明 |
|------|------|
| `createBLEChannel(options)` | 创建 BLE 通道 |
| `createWebSocketChannel(options)` | 创建 WebSocket 通道 |
| `createWiFiChannel(options)` | 创建 Wi-Fi TCP 通道 |
| `getChannel(name)` | 获取已创建的通道 |
| `disposeChannel(name)` | 释放指定通道 |
| `disposeAll()` | 释放所有通道 |

### Channel

| 方法 | 说明 |
|------|------|
| `connect(options)` | 连接设备 |
| `disconnect()` | 断开连接 |
| `sendRequest(funcCode, data?, options?)` | 发送请求并等待响应 |
| `sendOnly(funcCode, data?, options?)` | 仅发送不等待响应 |
| `sendHeartbeat()` | 发送心跳 |
| `isReady()` | 是否已就绪 |
| `dispose()` | 释放资源 |

| 事件 | 说明 |
|------|------|
| `connected` | 连接成功 |
| `disconnected` | 连接断开 |
| `notification` | 设备主动上报数据 |
| `stateChange` | 通道状态变化 |
| `error` | 错误事件 |

### FuncCode (预定义功能码)

| 功能码 | 值 | 说明 |
|--------|-----|------|
| `HEARTBEAT` | 0x00 | 心跳 |
| `DEVICE_INFO` | 0x01 | 设备信息 |
| `DEVICE_CONTROL` | 0x02 | 设备控制 |
| `READ_REGISTER` | 0x03 | 读寄存器 |
| `READ_INPUT` | 0x04 | 读输入 |
| `WRITE_SINGLE` | 0x06 | 写单个寄存器 |
| `WRITE_MULTIPLE` | 0x10 | 写多个寄存器 |
| `NOTIFY` | 0x80 | 通知 |
| `ALARM` | 0x81 | 告警 |

## 队列与重试配置

```javascript
const channel = manager.createBLEChannel({
  // ... BLE 配置
  queue: {
    maxSize: 50,           // 队列最大容量
    defaultTimeout: 5000,  // 发送超时
    maxRetries: 3,         // 最大重试次数
    retryDelay: 1000,      // 重试间隔
  },
  request: {
    defaultTimeout: 5000,  // 响应等待超时
  },
});
```

## 自定义协议

如果你的设备使用不同的协议格式，可以继承 `Packer` 和 `Parser` 进行自定义：

```javascript
const { Packer, Parser } = require('./communication-framework/src');

class MyPacker extends Packer {
  pack(message) {
    // 自定义打包逻辑
  }
}

class MyParser extends Parser {
  _tryParse() {
    // 自定义解析逻辑
  }
}
```

## 自定义链路

如果需要支持新的链路类型，继承 `LinkAdapter`：

```javascript
const { LinkAdapter, LinkState } = require('./communication-framework/src');

class SerialLinkAdapter extends LinkAdapter {
  constructor() {
    super('serial');
  }

  async connect(options) { /* ... */ }
  async disconnect() { /* ... */ }
  async send(data) { /* ... */ }
}
```

## 测试

```bash
cd communication-framework
npm install
npm test
```

## 设备 OTA 编程 (Device OTA Programming)

框架提供了抽象的设备 OTA 编程能力，采用分层设计以便后续扩展支持更多类型设备的 OTA 升级。

### OTA 架构

```
┌────────────────────────┐
│     DeviceProgram      │  ← 抽象基类，定义 OTA 通用流程
│  (状态管理/进度/事件)    │
├────────────────────────┤
│     GardenProgram      │  ← 花园工具 OTA 实现
│  (割草机/吹风机/链锯等)  │
├────────────────────────┤
│    GardenPacker /      │  ← 花园协议编解码
│    GardenParser        │
└────────────────────────┘
```

### 支持的设备类型

| 设备类型 | 枚举值 | 说明 |
|---------|--------|------|
| `LAWN_MOWER` | 0x01 | 割草机 |
| `BLOWER` | 0x02 | 吹风机 |
| `CHAINSAW` | 0x03 | 链锯 |
| `HEDGE_TRIMMER` | 0x04 | 修枝机 |

### OTA 协议格式

GardenProgram 使用花园协议进行 OTA 通信，协议封装采用 **小端模式 (Little-Endian)**：

```
+--------+--------+--------+--------+--------+--------+--------+--------+
| Header | Header |  Dest  |  Src   | Length | TypeID | Data.. | CRC16  |
| 0xC5   | 0x5C   | 1 byte | 1 byte | 1 byte | 1 byte | N bytes| 2 bytes|
+--------+--------+--------+--------+--------+--------+--------+--------+
```

**源地址 (Src / 第四字节)**:

| 地址 | 值 | 说明 |
|------|-----|------|
| `IOT` | 0x00 | IOT（蓝牙通信板） |
| `UI` | 0x08 | UI（显示屏/调试软件） |

**OTA TypeID 命令**:

| 命令 | TypeID | 说明 |
|------|--------|------|
| `OTA_START` | 0xF0 | OTA 开始/初始化 |
| `OTA_DATA` | 0xF1 | OTA 数据传输 |
| `OTA_VERIFY` | 0xF2 | OTA 校验 |
| `OTA_END` | 0xF3 | OTA 结束 |
| `OTA_ABORT` | 0xF4 | OTA 中止 |
| `OTA_ACK` | 0xF5 | 设备确认 |
| `OTA_NACK` | 0xF6 | 设备否认/错误 |

### 蓝牙串口配置

| 参数 | 值 |
|------|-----|
| 波特率 (Baud Rate) | 115200 |
| 数据位 (Data Bits) | 8 |
| 停止位 (Stop Bits) | 1 |
| 校验位 (Parity) | 无 (none) |
| 硬件控制流 (Flow Control) | 无 (none) |

### OTA 流程

```
1. OTA_START  (0xF0) → 发送固件信息（大小、工具类型、CRC）
2. OTA_DATA   (0xF1) → 分包传输固件数据（自动分块 + 重试）
3. OTA_VERIFY (0xF2) → 发送校验信息
4. OTA_END    (0xF3) → 完成 OTA
```

### OTA 使用示例

```javascript
const {
  GardenProgram,
  OTASrcAddress,
  GardenToolType,
  DeviceAddress,
} = require('./communication-framework/src');

// 创建花园工具 OTA 编程器
const program = new GardenProgram({
  // 发送函数（通过 BLE 链路发送 OTA 数据）
  sendFn: async (frame) => await bleAdapter.sendOTA(frame),
  srcAddress: OTASrcAddress.IOT,         // 0x00 IOT（蓝牙通信板）
  destAddress: DeviceAddress.TOOL,       // 目标设备: 工具
  toolType: GardenToolType.LAWN_MOWER,   // 工具类型: 割草机
  chunkSize: 128,                        // 分包大小
  responseTimeout: 5000,                 // 响应超时
  maxRetries: 3,                         // 最大重试次数
});

// 监听进度
program.on('progress', ({ sent, total, percentage }) => {
  console.log(`OTA 进度: ${percentage}% (${sent}/${total})`);
});

// 监听状态变化
program.on('stateChange', (newState, oldState) => {
  console.log(`OTA 状态: ${oldState} -> ${newState}`);
});

// 监听完成
program.on('complete', () => {
  console.log('OTA 升级完成！');
});

// 监听错误
program.on('error', (err) => {
  console.error('OTA 错误:', err.message);
});

// 将设备返回的数据传给解析器
bleAdapter.on('otaData', (data) => {
  program.feedResponse(data);
});

// 开始 OTA 升级
const firmwareData = new Uint8Array(/* 固件二进制数据 */);
await program.startProgram(firmwareData);

// 中止 OTA（如果需要）
// await program.abort();

// 释放资源
program.dispose();
```

### 使用 UI 源地址

```javascript
// 如果从 UI（显示屏）发起 OTA
const program = new GardenProgram({
  sendFn: async (frame) => await bleAdapter.sendOTA(frame),
  srcAddress: OTASrcAddress.UI,     // 0x08 UI（显示屏）
  destAddress: DeviceAddress.TOOL,
  toolType: GardenToolType.CHAINSAW,
});
```

### 自定义设备 OTA

如果需要支持其他类型设备的 OTA，继承 `DeviceProgram` 基类：

```javascript
const { DeviceProgram } = require('./communication-framework/src');

class MyDeviceProgram extends DeviceProgram {
  constructor(options) {
    super({ name: 'MyDevice', ...options });
    // 自定义初始化
  }

  async _sendInitCommand(firmware, options) {
    // 实现 OTA 初始化命令
  }

  async _sendDataChunk(chunk, offset, chunkIndex, options) {
    // 实现固件数据块传输
  }

  async _sendVerifyCommand(firmware, options) {
    // 实现固件校验命令
  }

  async _sendCompleteCommand(options) {
    // 实现 OTA 完成命令
  }

  async _sendAbortCommand() {
    // 实现 OTA 中止命令
  }
}
```

### OTA API 参考

#### GardenProgram

| 属性/方法 | 说明 |
|-----------|------|
| `srcAddress` | 源地址 (0x00=IOT, 0x08=UI) |
| `destAddress` | 目标设备地址 |
| `toolType` | 花园工具类型 |
| `state` | 当前 OTA 状态 |
| `progress` | 传输进度 `{ sent, total, percentage }` |
| `startProgram(firmware, options?)` | 开始 OTA 升级 |
| `abort()` | 中止 OTA |
| `reset()` | 重置状态 |
| `feedResponse(data)` | 输入设备返回的原始数据 |
| `dispose()` | 释放资源 |
| `GardenProgram.serialConfig` | 蓝牙串口配置（静态属性） |

| 事件 | 说明 |
|------|------|
| `stateChange` | OTA 状态变化 `(newState, oldState)` |
| `progress` | 传输进度更新 `({ sent, total, percentage })` |
| `complete` | OTA 完成 |
| `error` | OTA 错误 |
| `frame` | 收到设备帧（用于调试） |

#### ProgramState (OTA 状态)

| 状态 | 说明 |
|------|------|
| `IDLE` | 空闲 |
| `INITIALIZING` | 初始化中 |
| `TRANSFERRING` | 传输中 |
| `VERIFYING` | 校验中 |
| `COMPLETING` | 完成中 |
| `COMPLETE` | 已完成 |
| `ERROR` | 错误 |
| `ABORTED` | 已中止 |

## 数据流示意

### 发送流程
```
App 调用 sendRequest(funcCode, data)
  → Packer.pack() 编码为二进制帧
  → MessageQueue 排队（支持优先级）
  → LinkAdapter.send() 通过物理链路发送
  → RequestManager 注册等待响应
```

### 接收流程
```
LinkAdapter 收到原始字节
  → Parser.feed() 缓存 + 粘包拆包处理
  → Parser 触发 'frame' 事件
  → RequestManager 匹配序列号
    → 匹配成功：resolve 对应的 Promise
    → 未匹配：触发 'notification' 事件（设备主动上报）
```

### OTA 升级流程
```
App 调用 program.startProgram(firmware)
  → GardenPacker.pack() 打包 OTA_START 命令帧（小端模式）
  → sendFn() 通过 BLE OTA 特征值发送
  → 等待设备 OTA_ACK 响应
  → 循环发送 OTA_DATA 数据块
    → 每块发送后等待 ACK
    → 失败自动重试
    → 触发 progress 事件
  → GardenPacker.pack() 打包 OTA_VERIFY 校验帧
  → 等待设备 ACK
  → GardenPacker.pack() 打包 OTA_END 完成帧
  → 触发 complete 事件
```
