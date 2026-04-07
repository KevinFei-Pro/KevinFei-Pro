/**
 * LinkState - 链路层连接状态枚举
 */
const LinkState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTING: 'disconnecting',
};

/**
 * LinkType - 链路类型枚举
 */
const LinkType = {
  BLE: 'ble',
  WIFI: 'wifi',
  WEBSOCKET: 'websocket',
};

module.exports = { LinkState, LinkType };
