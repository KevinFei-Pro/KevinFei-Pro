const MessageQueue = require('../src/queue/MessageQueue');

describe('MessageQueue', () => {
  let queue;

  beforeEach(() => {
    queue = new MessageQueue({ maxSize: 10, defaultTimeout: 1000 });
  });

  afterEach(() => {
    queue.dispose();
  });

  test('should enqueue and process messages', (done) => {
    const data = new Uint8Array([0x01, 0x02]);
    const sendFn = jest.fn().mockResolvedValue(undefined);
    queue.setSendFunction(sendFn);

    queue.enqueue(data, {
      onSuccess: () => {
        expect(sendFn).toHaveBeenCalledWith(data);
        done();
      },
    });
  });

  test('should reject when queue is full', () => {
    queue = new MessageQueue({ maxSize: 2 });
    // Don't set send function so items stay in queue
    queue._processing = true; // Prevent processing

    queue.enqueue(new Uint8Array([0x01]));
    queue.enqueue(new Uint8Array([0x02]));

    const onError = jest.fn();
    const result = queue.enqueue(new Uint8Array([0x03]), { onError });
    expect(result).toBe(false);
    expect(onError).toHaveBeenCalled();
  });

  test('should respect priority ordering', () => {
    queue._processing = true; // Prevent auto-processing

    queue.enqueue(new Uint8Array([0x01]), { priority: 0 });
    queue.enqueue(new Uint8Array([0x02]), { priority: 10 });
    queue.enqueue(new Uint8Array([0x03]), { priority: 5 });

    // Priority 10 should be first, then priority 5, then priority 0
    expect(queue._queue[0].data[0]).toBe(0x02); // priority 10
    expect(queue._queue[1].data[0]).toBe(0x03); // priority 5
    expect(queue._queue[2].data[0]).toBe(0x01); // priority 0
  });

  test('should report size correctly', () => {
    queue._processing = true;
    queue.enqueue(new Uint8Array([0x01]));
    queue.enqueue(new Uint8Array([0x02]));
    expect(queue.size).toBe(2);
  });

  test('should clear queue and notify errors', () => {
    queue._processing = true;

    const onError = jest.fn();
    queue.enqueue(new Uint8Array([0x01]), { onError });
    queue.enqueue(new Uint8Array([0x02]), { onError });
    queue.clear();

    expect(queue.size).toBe(0);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  test('should not enqueue after dispose', () => {
    queue.dispose();
    const result = queue.enqueue(new Uint8Array([0x01]));
    expect(result).toBe(false);
  });

  test('should retry on send failure', (done) => {
    let attempts = 0;
    const sendFn = jest.fn().mockImplementation(() => {
      attempts++;
      if (attempts <= 1) {
        return Promise.reject(new Error('fail'));
      }
      return Promise.resolve();
    });

    queue = new MessageQueue({ maxRetries: 2, retryDelay: 50 });
    queue.setSendFunction(sendFn);

    queue.enqueue(new Uint8Array([0x01]), {
      onSuccess: () => {
        expect(attempts).toBe(2);
        done();
      },
    });
  });
});
