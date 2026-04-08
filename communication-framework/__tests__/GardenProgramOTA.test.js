const DeviceProgram = require('../src/program/DeviceProgram');
const GardenProgram = require('../src/program/GardenProgram');
const GardenPacker = require('../src/protocol/GardenPacker');
const GardenParser = require('../src/protocol/GardenParser');
const { DeviceAddress } = require('../src/protocol/GardenProtocolConstants');
const {
  ProgramState,
  OTACommand,
  OTAStatus,
  GardenToolType,
  GardenToolTypeName,
  OTASrcAddress,
  SerialConfig,
  OTADefaults,
} = require('../src/program/ProgramConstants');

// ============================================================
// ProgramConstants 常量测试
// ============================================================
describe('ProgramConstants', () => {
  test('ProgramState should have all expected states', () => {
    expect(ProgramState.IDLE).toBe('idle');
    expect(ProgramState.INITIALIZING).toBe('initializing');
    expect(ProgramState.TRANSFERRING).toBe('transferring');
    expect(ProgramState.VERIFYING).toBe('verifying');
    expect(ProgramState.COMPLETING).toBe('completing');
    expect(ProgramState.COMPLETE).toBe('complete');
    expect(ProgramState.ERROR).toBe('error');
    expect(ProgramState.ABORTED).toBe('aborted');
  });

  test('OTACommand should have correct values', () => {
    expect(OTACommand.OTA_START).toBe(0xF0);
    expect(OTACommand.OTA_DATA).toBe(0xF1);
    expect(OTACommand.OTA_VERIFY).toBe(0xF2);
    expect(OTACommand.OTA_END).toBe(0xF3);
    expect(OTACommand.OTA_ABORT).toBe(0xF4);
    expect(OTACommand.OTA_ACK).toBe(0xF5);
    expect(OTACommand.OTA_NACK).toBe(0xF6);
  });

  test('OTAStatus should have correct values', () => {
    expect(OTAStatus.SUCCESS).toBe(0x00);
    expect(OTAStatus.ERROR_UNKNOWN).toBe(0x01);
    expect(OTAStatus.ERROR_CRC_MISMATCH).toBe(0x04);
  });

  test('GardenToolType should have correct values', () => {
    expect(GardenToolType.LAWN_MOWER).toBe(0x01);
    expect(GardenToolType.BLOWER).toBe(0x02);
    expect(GardenToolType.CHAINSAW).toBe(0x03);
    expect(GardenToolType.HEDGE_TRIMMER).toBe(0x04);
  });

  test('GardenToolTypeName should map all tool types', () => {
    expect(GardenToolTypeName[GardenToolType.LAWN_MOWER]).toContain('Lawn Mower');
    expect(GardenToolTypeName[GardenToolType.BLOWER]).toContain('Blower');
    expect(GardenToolTypeName[GardenToolType.CHAINSAW]).toContain('Chainsaw');
    expect(GardenToolTypeName[GardenToolType.HEDGE_TRIMMER]).toContain('Hedge Trimmer');
  });

  test('OTASrcAddress should define IOT and UI', () => {
    expect(OTASrcAddress.IOT).toBe(0x00);
    expect(OTASrcAddress.UI).toBe(0x08);
  });

  test('SerialConfig should have correct defaults', () => {
    expect(SerialConfig.BAUD_RATE).toBe(115200);
    expect(SerialConfig.DATA_BITS).toBe(8);
    expect(SerialConfig.STOP_BITS).toBe(1);
    expect(SerialConfig.PARITY).toBe('none');
    expect(SerialConfig.FLOW_CONTROL).toBe('none');
  });

  test('OTADefaults should have correct values', () => {
    expect(OTADefaults.CHUNK_SIZE).toBe(128);
    expect(OTADefaults.RESPONSE_TIMEOUT).toBe(5000);
    expect(OTADefaults.MAX_RETRIES).toBe(3);
    expect(OTADefaults.RETRY_DELAY).toBe(500);
  });
});

// ============================================================
// DeviceProgram 抽象基类测试
// ============================================================
describe('DeviceProgram', () => {
  let program;

  beforeEach(() => {
    program = new DeviceProgram({ name: 'TestProgram' });
  });

  afterEach(() => {
    program.dispose();
  });

  test('should start in IDLE state', () => {
    expect(program.state).toBe(ProgramState.IDLE);
  });

  test('should report initial progress as 0', () => {
    const progress = program.progress;
    expect(progress.sent).toBe(0);
    expect(progress.total).toBe(0);
    expect(progress.percentage).toBe(0);
  });

  test('should throw when startProgram called without firmware', async () => {
    await expect(program.startProgram(null)).rejects.toThrow('Firmware data is required');
    await expect(program.startProgram(new Uint8Array(0))).rejects.toThrow('Firmware data is required');
  });

  test('should throw when abstract methods are called', async () => {
    await expect(program._sendInitCommand()).rejects.toThrow('must be implemented');
    await expect(program._sendDataChunk()).rejects.toThrow('must be implemented');
    await expect(program._sendVerifyCommand()).rejects.toThrow('must be implemented');
    await expect(program._sendCompleteCommand()).rejects.toThrow('must be implemented');
    await expect(program._sendAbortCommand()).rejects.toThrow('must be implemented');
  });

  test('should reset state correctly', () => {
    // Manually set some state
    program._state = ProgramState.ERROR;
    program._sentBytes = 100;
    program._totalBytes = 200;
    program.reset();

    expect(program.state).toBe(ProgramState.IDLE);
    expect(program.progress.sent).toBe(0);
    expect(program.progress.total).toBe(0);
  });

  test('should emit stateChange events', () => {
    const states = [];
    program.on('stateChange', (newState, oldState) => {
      states.push({ newState, oldState });
    });

    program._setState(ProgramState.INITIALIZING);
    program._setState(ProgramState.TRANSFERRING);

    expect(states.length).toBe(2);
    expect(states[0]).toEqual({
      newState: ProgramState.INITIALIZING,
      oldState: ProgramState.IDLE,
    });
    expect(states[1]).toEqual({
      newState: ProgramState.TRANSFERRING,
      oldState: ProgramState.INITIALIZING,
    });
  });

  test('should not emit stateChange for same state', () => {
    const states = [];
    program.on('stateChange', (newState) => states.push(newState));

    program._setState(ProgramState.IDLE); // same as initial
    expect(states.length).toBe(0);
  });

  test('should not allow starting in TRANSFERRING state', async () => {
    program._state = ProgramState.TRANSFERRING;
    await expect(
      program.startProgram(new Uint8Array([0x01]))
    ).rejects.toThrow('Cannot start OTA in state');
  });

  test('should allow starting from ERROR state', () => {
    program._state = ProgramState.ERROR;
    // Should not throw synchronously (will fail on abstract method call later)
    expect(() => {
      program.startProgram(new Uint8Array([0x01])).catch(() => {});
    }).not.toThrow();
  });

  test('should clean up on dispose', () => {
    program.on('stateChange', () => {});
    program.on('progress', () => {});
    program.dispose();
    expect(program.state).toBe(ProgramState.IDLE);
  });
});

// ============================================================
// GardenProgram 测试
// ============================================================
describe('GardenProgram', () => {
  let sentFrames;
  let mockSendFn;
  let program;
  let ackPacker;

  beforeEach(() => {
    sentFrames = [];
    mockSendFn = jest.fn(async (frame) => {
      sentFrames.push(new Uint8Array(frame));
    });

    program = new GardenProgram({
      sendFn: mockSendFn,
      srcAddress: OTASrcAddress.IOT,
      destAddress: DeviceAddress.TOOL,
      toolType: GardenToolType.LAWN_MOWER,
      responseTimeout: 200,
      maxRetries: 0,
    });

    // 用于构造模拟设备响应
    ackPacker = new GardenPacker();
  });

  afterEach(() => {
    program.dispose();
  });

  test('should require sendFn', () => {
    expect(() => new GardenProgram({})).toThrow('sendFn is required');
  });

  test('should use default srcAddress (IOT) when not specified', () => {
    const p = new GardenProgram({ sendFn: mockSendFn });
    expect(p.srcAddress).toBe(OTASrcAddress.IOT);
    p.dispose();
  });

  test('should allow UI srcAddress (0x08)', () => {
    const p = new GardenProgram({
      sendFn: mockSendFn,
      srcAddress: OTASrcAddress.UI,
    });
    expect(p.srcAddress).toBe(0x08);
    p.dispose();
  });

  test('should expose correct properties', () => {
    expect(program.srcAddress).toBe(OTASrcAddress.IOT);
    expect(program.destAddress).toBe(DeviceAddress.TOOL);
    expect(program.toolType).toBe(GardenToolType.LAWN_MOWER);
    expect(program.state).toBe(ProgramState.IDLE);
  });

  test('should return correct serial config', () => {
    const config = GardenProgram.serialConfig;
    expect(config.BAUD_RATE).toBe(115200);
    expect(config.DATA_BITS).toBe(8);
    expect(config.STOP_BITS).toBe(1);
    expect(config.PARITY).toBe('none');
    expect(config.FLOW_CONTROL).toBe('none');
  });

  test('should pack OTA_START frame correctly with garden protocol', (done) => {
    const firmware = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const parser = new GardenParser();

    // 当发送函数被调用时，验证帧格式
    mockSendFn.mockImplementation(async (frame) => {
      sentFrames.push(new Uint8Array(frame));

      // 解析发送的帧
      parser.on('frame', (parsed) => {
        // 验证帧字段
        expect(parsed.destAddress).toBe(DeviceAddress.TOOL);
        expect(parsed.srcAddress).toBe(OTASrcAddress.IOT);
        expect(parsed.typeId).toBe(OTACommand.OTA_START);

        // 验证数据载荷 (小端模式)
        const data = parsed.data;
        expect(data.length).toBe(7);

        // 固件大小 (4字节, 小端) = 4
        expect(data[0]).toBe(0x04);
        expect(data[1]).toBe(0x00);
        expect(data[2]).toBe(0x00);
        expect(data[3]).toBe(0x00);

        // 工具类型
        expect(data[4]).toBe(GardenToolType.LAWN_MOWER);

        done();
      });

      parser.feed(frame);
    });

    // Start will call _sendInitCommand, then timeout waiting for ACK
    program.startProgram(firmware).catch(() => {});
  });

  test('should handle OTA_ACK response correctly', async () => {
    const firmware = new Uint8Array(10);

    // 模拟: 每次发送后自动返回 ACK
    mockSendFn.mockImplementation(async (frame) => {
      sentFrames.push(new Uint8Array(frame));

      // 构造 ACK 帧 (设备 → APP)
      const ackFrame = ackPacker.pack({
        destAddress: OTASrcAddress.IOT,
        srcAddress: DeviceAddress.TOOL,
        typeId: OTACommand.OTA_ACK,
        data: new Uint8Array([OTAStatus.SUCCESS]),
      });

      // 模拟设备响应
      setTimeout(() => program.feedResponse(ackFrame), 10);
    });

    await program.startProgram(firmware);

    expect(program.state).toBe(ProgramState.COMPLETE);
    // At least 4 calls: INIT + DATA chunk(s) + VERIFY + END
    expect(mockSendFn).toHaveBeenCalledTimes(4);
  });

  test('should handle OTA_NACK response', async () => {
    const firmware = new Uint8Array(10);

    mockSendFn.mockImplementation(async (frame) => {
      sentFrames.push(new Uint8Array(frame));

      // 返回 NACK
      const nackFrame = ackPacker.pack({
        destAddress: OTASrcAddress.IOT,
        srcAddress: DeviceAddress.TOOL,
        typeId: OTACommand.OTA_NACK,
        data: new Uint8Array([OTAStatus.ERROR_NOT_READY]),
      });

      setTimeout(() => program.feedResponse(nackFrame), 10);
    });

    await expect(program.startProgram(firmware)).rejects.toThrow('Device NACK');
    expect(program.state).toBe(ProgramState.ERROR);
  });

  test('should handle response timeout', async () => {
    const firmware = new Uint8Array(10);

    // sendFn succeeds but no ACK ever arrives
    mockSendFn.mockImplementation(async () => {});

    await expect(program.startProgram(firmware)).rejects.toThrow('Response timeout');
    expect(program.state).toBe(ProgramState.ERROR);
  });

  test('should emit progress events during transfer', async () => {
    // Create firmware larger than chunk size to get multiple chunks
    const firmware = new Uint8Array(200);
    firmware.fill(0xAB);

    const progressEvents = [];
    program.on('progress', (p) => progressEvents.push(p));

    mockSendFn.mockImplementation(async (frame) => {
      sentFrames.push(new Uint8Array(frame));
      const ackFrame = ackPacker.pack({
        destAddress: OTASrcAddress.IOT,
        srcAddress: DeviceAddress.TOOL,
        typeId: OTACommand.OTA_ACK,
        data: new Uint8Array([OTAStatus.SUCCESS]),
      });
      setTimeout(() => program.feedResponse(ackFrame), 5);
    });

    await program.startProgram(firmware);

    // Should have progress events for each chunk
    expect(progressEvents.length).toBeGreaterThan(0);
    // Last progress should be 100%
    expect(progressEvents[progressEvents.length - 1].percentage).toBe(100);
    expect(progressEvents[progressEvents.length - 1].sent).toBe(200);
    expect(progressEvents[progressEvents.length - 1].total).toBe(200);
  });

  test('should emit complete event on success', async () => {
    const firmware = new Uint8Array(10);
    let completed = false;
    program.on('complete', () => { completed = true; });

    mockSendFn.mockImplementation(async (frame) => {
      sentFrames.push(new Uint8Array(frame));
      const ackFrame = ackPacker.pack({
        destAddress: OTASrcAddress.IOT,
        srcAddress: DeviceAddress.TOOL,
        typeId: OTACommand.OTA_ACK,
        data: new Uint8Array([OTAStatus.SUCCESS]),
      });
      setTimeout(() => program.feedResponse(ackFrame), 5);
    });

    await program.startProgram(firmware);
    expect(completed).toBe(true);
  });

  test('should abort OTA', async () => {
    program._state = ProgramState.TRANSFERRING;
    await program.abort();
    expect(program.state).toBe(ProgramState.ABORTED);
    expect(mockSendFn).toHaveBeenCalledTimes(1); // abort command sent
  });

  test('should not abort when IDLE', async () => {
    await program.abort();
    expect(program.state).toBe(ProgramState.IDLE);
    expect(mockSendFn).not.toHaveBeenCalled();
  });

  test('should use garden protocol frame format', () => {
    // Verify that outgoing frames use the garden protocol format
    const packer = new GardenPacker();
    const frame = packer.pack({
      destAddress: DeviceAddress.TOOL,
      srcAddress: OTASrcAddress.IOT,
      typeId: OTACommand.OTA_START,
      data: new Uint8Array([0x01]),
    });

    // Header should be 0xC5 0x5C
    expect(frame[0]).toBe(0xC5);
    expect(frame[1]).toBe(0x5C);
    // Dest address
    expect(frame[2]).toBe(DeviceAddress.TOOL);
    // Src address (IOT = 0x00)
    expect(frame[3]).toBe(0x00);
    // TypeID
    expect(frame[5]).toBe(OTACommand.OTA_START);
  });

  test('should use UI source address when configured', () => {
    const uiProgram = new GardenProgram({
      sendFn: mockSendFn,
      srcAddress: OTASrcAddress.UI,
      destAddress: DeviceAddress.TOOL,
    });

    expect(uiProgram.srcAddress).toBe(0x08);

    // Verify frame format with UI source
    const packer = new GardenPacker();
    const frame = packer.pack({
      destAddress: DeviceAddress.TOOL,
      srcAddress: OTASrcAddress.UI,
      typeId: OTACommand.OTA_START,
    });

    // Src address (UI = 0x08)
    expect(frame[3]).toBe(0x08);

    uiProgram.dispose();
  });

  test('should pack data in little-endian format', async () => {
    const firmware = new Uint8Array(0x1234); // 4660 bytes
    firmware.fill(0xFF);

    const parser = new GardenParser();
    let initData = null;

    mockSendFn.mockImplementationOnce(async (frame) => {
      sentFrames.push(new Uint8Array(frame));

      parser.on('frame', (parsed) => {
        if (parsed.typeId === OTACommand.OTA_START) {
          initData = parsed.data;
        }
      });
      parser.feed(frame);
    });

    // Will timeout after init, that's OK for this test
    program.startProgram(firmware).catch(() => {});

    // Wait a bit for async operations
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(initData).not.toBeNull();
    // Firmware size in little-endian: 0x1234 = [0x34, 0x12, 0x00, 0x00]
    expect(initData[0]).toBe(0x34);
    expect(initData[1]).toBe(0x12);
    expect(initData[2]).toBe(0x00);
    expect(initData[3]).toBe(0x00);
  });

  test('should support all garden tool types', () => {
    const toolTypes = [
      GardenToolType.LAWN_MOWER,
      GardenToolType.BLOWER,
      GardenToolType.CHAINSAW,
      GardenToolType.HEDGE_TRIMMER,
    ];

    for (const toolType of toolTypes) {
      const p = new GardenProgram({
        sendFn: mockSendFn,
        toolType,
      });
      expect(p.toolType).toBe(toolType);
      expect(GardenToolTypeName[toolType]).toBeDefined();
      p.dispose();
    }
  });

  test('should handle retry on timeout', async () => {
    const retryProgram = new GardenProgram({
      sendFn: mockSendFn,
      responseTimeout: 50,
      maxRetries: 2,
      retryDelay: 10,
    });

    const firmware = new Uint8Array(10);
    let callCount = 0;

    mockSendFn.mockImplementation(async (frame) => {
      callCount++;
      // Only ACK on the 3rd attempt
      if (callCount === 3) {
        // Send ACK for remaining stages too
        const ackFrame = ackPacker.pack({
          destAddress: OTASrcAddress.IOT,
          srcAddress: DeviceAddress.TOOL,
          typeId: OTACommand.OTA_ACK,
          data: new Uint8Array([OTAStatus.SUCCESS]),
        });
        setTimeout(() => retryProgram.feedResponse(ackFrame), 5);
      }
    });

    // Will fail because only the init succeeds on 3rd attempt,
    // but then data transfer also needs ACKs
    // This test just verifies retries happen
    try {
      await retryProgram.startProgram(firmware);
    } catch (e) {
      // Expected
    }

    // Should have been called more than once due to retries
    expect(callCount).toBeGreaterThan(1);
    retryProgram.dispose();
  });
});

// ============================================================
// Module exports 测试
// ============================================================
describe('Module exports', () => {
  test('should export all OTA components from main index', () => {
    const framework = require('../src/index');

    expect(framework.DeviceProgram).toBeDefined();
    expect(framework.GardenProgram).toBeDefined();
    expect(framework.ProgramState).toBeDefined();
    expect(framework.OTACommand).toBeDefined();
    expect(framework.OTAStatus).toBeDefined();
    expect(framework.GardenToolType).toBeDefined();
    expect(framework.GardenToolTypeName).toBeDefined();
    expect(framework.OTASrcAddress).toBeDefined();
    expect(framework.SerialConfig).toBeDefined();
    expect(framework.OTADefaults).toBeDefined();
  });
});
