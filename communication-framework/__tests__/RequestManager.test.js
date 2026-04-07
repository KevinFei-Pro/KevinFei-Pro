const RequestManager = require('../src/queue/RequestManager');

describe('RequestManager', () => {
  let manager;

  beforeEach(() => {
    manager = new RequestManager({ defaultTimeout: 500 });
  });

  afterEach(() => {
    // Safely dispose - cancelAll may reject pending promises
    try {
      manager.dispose();
    } catch (_) {
      // ignore
    }
  });

  test('should match response to pending request', async () => {
    const promise = manager.waitForResponse(1, 0x03);

    // Simulate response
    const matched = manager.handleResponse({
      seqNo: 1,
      funcCode: 0x03,
      data: new Uint8Array([0xAA]),
    });

    expect(matched).toBe(true);
    const result = await promise;
    expect(result.data[0]).toBe(0xAA);
  });

  test('should timeout on no response', async () => {
    await expect(
      manager.waitForResponse(1, 0x03, 100)
    ).rejects.toThrow('timeout');
  });

  test('should return false for unmatched response', () => {
    const matched = manager.handleResponse({
      seqNo: 99,
      funcCode: 0x03,
      data: new Uint8Array(0),
    });
    expect(matched).toBe(false);
  });

  test('should reject on error response (funcCode with 0x80)', async () => {
    const promise = manager.waitForResponse(5, 0x03);

    manager.handleResponse({
      seqNo: 5,
      funcCode: 0x83, // 0x03 | 0x80
      data: new Uint8Array([0x01]),
    });

    await expect(promise).rejects.toThrow('Device error');
  });

  test('should track pending count', async () => {
    const p1 = manager.waitForResponse(1, 0x03);
    const p2 = manager.waitForResponse(2, 0x06);
    expect(manager.pendingCount).toBe(2);

    manager.handleResponse({ seqNo: 1, funcCode: 0x03, data: new Uint8Array(0) });
    expect(manager.pendingCount).toBe(1);

    // Clean up remaining promise
    manager.handleResponse({ seqNo: 2, funcCode: 0x06, data: new Uint8Array(0) });
    await p1;
    await p2;
  });

  test('should cancel all pending requests', async () => {
    const p1 = manager.waitForResponse(1, 0x03);
    const p2 = manager.waitForResponse(2, 0x06);

    manager.cancelAll('test cancel');

    await expect(p1).rejects.toThrow('test cancel');
    await expect(p2).rejects.toThrow('test cancel');
    expect(manager.pendingCount).toBe(0);
  });
});
