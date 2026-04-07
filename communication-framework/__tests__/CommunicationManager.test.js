const CommunicationManager = require('../src/CommunicationManager');
const { ChannelState } = require('../src/channel');

describe('CommunicationManager', () => {
  let manager;

  beforeEach(() => {
    manager = new CommunicationManager();
  });

  afterEach(async () => {
    await manager.disposeAll();
  });

  test('should create WebSocket channel', () => {
    const channel = manager.createWebSocketChannel({ name: 'ws-test' });
    expect(channel).toBeDefined();
    expect(channel.state).toBe(ChannelState.IDLE);
  });

  test('should get channel by name', () => {
    const channel = manager.createWebSocketChannel({ name: 'ws-1' });
    expect(manager.getChannel('ws-1')).toBe(channel);
  });

  test('should return undefined for non-existent channel', () => {
    expect(manager.getChannel('non-existent')).toBeUndefined();
  });

  test('should replace existing channel with same name', () => {
    const ch1 = manager.createWebSocketChannel({ name: 'ws' });
    const ch2 = manager.createWebSocketChannel({ name: 'ws' });
    expect(manager.getChannel('ws')).toBe(ch2);
    expect(ch1.state).toBe(ChannelState.CLOSED); // Old channel disposed
  });

  test('should dispose specific channel', async () => {
    manager.createWebSocketChannel({ name: 'ws-to-dispose' });
    await manager.disposeChannel('ws-to-dispose');
    expect(manager.getChannel('ws-to-dispose')).toBeUndefined();
  });

  test('should dispose all channels', async () => {
    manager.createWebSocketChannel({ name: 'ws-1' });
    manager.createWebSocketChannel({ name: 'ws-2' });
    await manager.disposeAll();
    expect(manager.getChannel('ws-1')).toBeUndefined();
    expect(manager.getChannel('ws-2')).toBeUndefined();
  });
});
