const Packer = require('../src/protocol/Packer');
const Parser = require('../src/protocol/Parser');
const { ProtocolConstants } = require('../src/protocol/ProtocolConstants');

describe('Packer', () => {
  let packer;

  beforeEach(() => {
    packer = new Packer();
  });

  test('should pack a frame with correct header', () => {
    const frame = packer.pack({ funcCode: 0x03, data: new Uint8Array([0x01, 0x02]) });
    expect(frame[0]).toBe(0xAA);
    expect(frame[1]).toBe(0x55);
  });

  test('should pack funcCode correctly', () => {
    const frame = packer.pack({ funcCode: 0x10, data: new Uint8Array(0) });
    expect(frame[3]).toBe(0x10);
  });

  test('should pack data length in big-endian', () => {
    const data = new Uint8Array(300);
    const frame = packer.pack({ funcCode: 0x03, data });
    expect(frame[4]).toBe(0x01); // 300 >> 8 = 1
    expect(frame[5]).toBe(0x2C); // 300 & 0xFF = 44
  });

  test('should include data payload', () => {
    const data = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
    const frame = packer.pack({ funcCode: 0x03, data });
    expect(frame[6]).toBe(0xDE);
    expect(frame[7]).toBe(0xAD);
    expect(frame[8]).toBe(0xBE);
    expect(frame[9]).toBe(0xEF);
  });

  test('should have correct total frame length', () => {
    const data = new Uint8Array(5);
    const frame = packer.pack({ funcCode: 0x03, data });
    expect(frame.length).toBe(ProtocolConstants.MIN_FRAME_LENGTH + 5);
  });

  test('should auto-increment sequence number', () => {
    const frame1 = packer.pack({ funcCode: 0x03 });
    const frame2 = packer.pack({ funcCode: 0x03 });
    expect(frame2[2]).toBe(frame1[2] + 1);
  });

  test('should wrap sequence number at 255', () => {
    packer._seqNo = 255;
    const frame1 = packer.pack({ funcCode: 0x03 });
    expect(frame1[2]).toBe(255);
    const frame2 = packer.pack({ funcCode: 0x03 });
    expect(frame2[2]).toBe(0);
  });

  test('should allow manual sequence number', () => {
    const frame = packer.pack({ funcCode: 0x03, seqNo: 42 });
    expect(frame[2]).toBe(42);
  });

  test('should throw for data exceeding max length', () => {
    const data = new Uint8Array(ProtocolConstants.MAX_DATA_LENGTH + 1);
    expect(() => packer.pack({ funcCode: 0x03, data })).toThrow('exceeds maximum');
  });

  test('buildRequest should return frame and seqNo', () => {
    const result = packer.buildRequest(0x03, [0x01, 0x02]);
    expect(result.frame).toBeInstanceOf(Uint8Array);
    expect(typeof result.seqNo).toBe('number');
  });
});

describe('Parser', () => {
  let parser;
  let packer;

  beforeEach(() => {
    parser = new Parser();
    packer = new Packer();
  });

  test('should parse a complete frame', (done) => {
    const data = new Uint8Array([0x01, 0x02, 0x03]);
    const frame = packer.pack({ funcCode: 0x03, data, seqNo: 10 });

    parser.on('frame', (parsed) => {
      expect(parsed.seqNo).toBe(10);
      expect(parsed.funcCode).toBe(0x03);
      expect(parsed.data).toEqual(data);
      done();
    });

    parser.feed(frame);
  });

  test('should parse frame with no data payload', (done) => {
    const frame = packer.pack({ funcCode: 0x00, seqNo: 0 });

    parser.on('frame', (parsed) => {
      expect(parsed.seqNo).toBe(0);
      expect(parsed.funcCode).toBe(0x00);
      expect(parsed.data.length).toBe(0);
      done();
    });

    parser.feed(frame);
  });

  test('should handle split packets (拆包)', (done) => {
    const data = new Uint8Array([0xAA, 0xBB, 0xCC]);
    const frame = packer.pack({ funcCode: 0x06, data, seqNo: 5 });

    parser.on('frame', (parsed) => {
      expect(parsed.seqNo).toBe(5);
      expect(parsed.funcCode).toBe(0x06);
      expect(parsed.data).toEqual(data);
      done();
    });

    // 分两次喂入
    const mid = Math.floor(frame.length / 2);
    parser.feed(frame.slice(0, mid));
    parser.feed(frame.slice(mid));
  });

  test('should handle concatenated packets (粘包)', () => {
    const frames = [];
    const frame1 = packer.pack({ funcCode: 0x03, data: new Uint8Array([0x01]), seqNo: 1 });
    const frame2 = packer.pack({ funcCode: 0x06, data: new Uint8Array([0x02]), seqNo: 2 });

    parser.on('frame', (parsed) => {
      frames.push(parsed);
    });

    // 合并两帧一起喂入
    const combined = new Uint8Array(frame1.length + frame2.length);
    combined.set(frame1, 0);
    combined.set(frame2, frame1.length);
    parser.feed(combined);

    expect(frames.length).toBe(2);
    expect(frames[0].seqNo).toBe(1);
    expect(frames[1].seqNo).toBe(2);
  });

  test('should skip garbage data before valid frame', (done) => {
    const frame = packer.pack({ funcCode: 0x03, seqNo: 7 });

    parser.on('frame', (parsed) => {
      expect(parsed.seqNo).toBe(7);
      done();
    });

    // Prepend garbage
    const garbage = new Uint8Array([0x00, 0xFF, 0x12, 0x34]);
    const combined = new Uint8Array(garbage.length + frame.length);
    combined.set(garbage, 0);
    combined.set(frame, garbage.length);
    parser.feed(combined);
  });

  test('should emit error on CRC failure', (done) => {
    const frame = packer.pack({ funcCode: 0x03, seqNo: 1 });
    // Corrupt the CRC
    frame[frame.length - 1] ^= 0xFF;

    parser.on('error', (err) => {
      expect(err.message).toContain('CRC');
      done();
    });

    parser.feed(frame);
  });

  test('should report pending bytes', () => {
    parser.feed(new Uint8Array([0xAA, 0x55]));
    expect(parser.pendingBytes).toBe(2);
  });

  test('should reset buffer', () => {
    parser.feed(new Uint8Array([0xAA, 0x55, 0x01]));
    parser.reset();
    expect(parser.pendingBytes).toBe(0);
  });
});
