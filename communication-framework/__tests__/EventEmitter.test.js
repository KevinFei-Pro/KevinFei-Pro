const EventEmitter = require('../src/utils/EventEmitter');

describe('EventEmitter', () => {
  let emitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  test('should register and emit events', () => {
    const fn = jest.fn();
    emitter.on('test', fn);
    emitter.emit('test', 'arg1', 'arg2');
    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  test('should unsubscribe with returned function', () => {
    const fn = jest.fn();
    const unsub = emitter.on('test', fn);
    unsub();
    emitter.emit('test');
    expect(fn).not.toHaveBeenCalled();
  });

  test('should handle once listeners', () => {
    const fn = jest.fn();
    emitter.once('test', fn);
    emitter.emit('test', 'a');
    emitter.emit('test', 'b');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  test('should remove specific listener with off', () => {
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    emitter.on('test', fn1);
    emitter.on('test', fn2);
    emitter.off('test', fn1);
    emitter.emit('test');
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
  });

  test('should remove all listeners for an event', () => {
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    emitter.on('test', fn1);
    emitter.on('test', fn2);
    emitter.removeAllListeners('test');
    emitter.emit('test');
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
  });

  test('should remove all listeners', () => {
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    emitter.on('a', fn1);
    emitter.on('b', fn2);
    emitter.removeAllListeners();
    emitter.emit('a');
    emitter.emit('b');
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
  });

  test('should not throw when emitting with no listeners', () => {
    expect(() => emitter.emit('nonexistent')).not.toThrow();
  });

  test('should catch errors in listeners', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    emitter.on('test', () => { throw new Error('boom'); });
    expect(() => emitter.emit('test')).not.toThrow();
    consoleSpy.mockRestore();
  });
});
