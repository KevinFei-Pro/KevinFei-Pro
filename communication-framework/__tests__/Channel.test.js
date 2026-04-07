const { Channel, ChannelState } = require('../src/channel');
const EventEmitter = require('../src/utils/EventEmitter');
const { LinkState, LinkType } = require('../src/link/LinkConstants');
const Packer = require('../src/protocol/Packer');

/**
 * Mock LinkAdapter for testing
 */
class MockLinkAdapter extends EventEmitter {
  constructor() {
    super();
    this.type = LinkType.BLE;
    this.state = LinkState.DISCONNECTED;
    this.sentData = [];
    this._connectOptions = null;
  }

  async connect(options) {
    this._connectOptions = options;
    this.state = LinkState.CONNECTED;
    this.emit('stateChange', LinkState.CONNECTED, LinkState.DISCONNECTED);
  }

  async disconnect() {
    this.state = LinkState.DISCONNECTED;
    this.emit('stateChange', LinkState.DISCONNECTED, LinkState.CONNECTED);
  }

  async send(data) {
    this.sentData.push(data);
  }

  isConnected() {
    return this.state === LinkState.CONNECTED;
  }

  getMTU() {
    return 20;
  }

  dispose() {
    this.removeAllListeners();
  }

  // Helper: simulate receiving data
  simulateReceive(data) {
    this.emit('data', data);
  }
}

describe('Channel', () => {
  let channel;
  let mockLink;

  beforeEach(() => {
    mockLink = new MockLinkAdapter();
    channel = new Channel({ linkAdapter: mockLink });
  });

  afterEach(() => {
    channel.dispose();
  });

  test('should start in IDLE state', () => {
    expect(channel.state).toBe(ChannelState.IDLE);
  });

  test('should transition to READY after connect', async () => {
    await channel.connect({ deviceId: 'test' });
    expect(channel.state).toBe(ChannelState.READY);
    expect(channel.isReady()).toBe(true);
  });

  test('should transition to IDLE after disconnect', async () => {
    await channel.connect({ deviceId: 'test' });
    await channel.disconnect();
    expect(channel.state).toBe(ChannelState.IDLE);
  });

  test('should emit connected/disconnected events', async () => {
    const onConnected = jest.fn();
    const onDisconnected = jest.fn();
    channel.on('connected', onConnected);
    channel.on('disconnected', onDisconnected);

    await channel.connect({});
    expect(onConnected).toHaveBeenCalled();

    await channel.disconnect();
    expect(onDisconnected).toHaveBeenCalled();
  });

  test('should throw when sending on non-ready channel', async () => {
    await expect(channel.sendRequest(0x03)).rejects.toThrow('not ready');
  });

  test('should send packed data through link adapter', async () => {
    await channel.connect({});

    // Don't wait for response (sendOnly)
    await channel.sendOnly(0x03, [0x01, 0x02]);

    expect(mockLink.sentData.length).toBe(1);
    const sent = mockLink.sentData[0];
    // Verify frame header
    expect(sent[0]).toBe(0xAA);
    expect(sent[1]).toBe(0x55);
    // Verify funcCode
    expect(sent[3]).toBe(0x03);
  });

  test('should receive and parse response', async () => {
    await channel.connect({});

    const packer = new Packer();

    // Start a request
    const requestPromise = channel.sendRequest(0x03, [0x01], { timeout: 2000 });

    // Wait a tick for the queue to process
    await new Promise((r) => setTimeout(r, 50));

    // Get the seqNo that was sent
    const sentFrame = mockLink.sentData[0];
    const sentSeqNo = sentFrame[2];

    // Simulate device response with matching seqNo
    const responseFrame = packer.pack({
      funcCode: 0x03,
      data: new Uint8Array([0xDE, 0xAD]),
      seqNo: sentSeqNo,
    });
    mockLink.simulateReceive(responseFrame);

    const response = await requestPromise;
    expect(response.funcCode).toBe(0x03);
    expect(response.data[0]).toBe(0xDE);
    expect(response.data[1]).toBe(0xAD);
  });

  test('should emit notification for unsolicited frames', async () => {
    await channel.connect({});

    const onNotification = jest.fn();
    channel.on('notification', onNotification);

    const packer = new Packer();
    // Simulate device notification (seqNo that nobody is waiting for)
    const notifFrame = packer.pack({
      funcCode: 0x80,
      data: new Uint8Array([0x01]),
      seqNo: 200,
    });
    mockLink.simulateReceive(notifFrame);

    expect(onNotification).toHaveBeenCalledWith(
      expect.objectContaining({ funcCode: 0x80, seqNo: 200 })
    );
  });

  test('should handle split receive (拆包)', async () => {
    await channel.connect({});

    const onNotification = jest.fn();
    channel.on('notification', onNotification);

    const packer = new Packer();
    const frame = packer.pack({
      funcCode: 0x80,
      data: new Uint8Array([0x01, 0x02, 0x03]),
      seqNo: 100,
    });

    // Feed in two parts
    const mid = Math.floor(frame.length / 2);
    mockLink.simulateReceive(frame.slice(0, mid));

    // Should not have parsed yet
    expect(onNotification).not.toHaveBeenCalled();

    mockLink.simulateReceive(frame.slice(mid));

    // Now should have parsed
    expect(onNotification).toHaveBeenCalledTimes(1);
  });

  test('should clean up on dispose', () => {
    channel.dispose();
    expect(channel.state).toBe(ChannelState.CLOSED);
  });
});
