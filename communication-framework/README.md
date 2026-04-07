# RN Communication Framework

适用于 React Native 的分层通讯框架，支持 **BLE（低功耗蓝牙）**、**Wi-Fi（TCP Socket）**、**WebSocket** 三种链路，采用类 Modbus 的二进制协议格式。

## 架构总览

```
┌──────────────────────────────────────────────────────┐
│                   业务层 (Your App)                    │
├──────────────────────────────────────────────────────┤
│              CommunicationManager (管理器)             │
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
