const GardenPacker = require('../src/protocol/GardenPacker');
const GardenParser = require('../src/protocol/GardenParser');
const { GardenProtocolConstants, DeviceAddress, DeviceAddressName } = require('../src/protocol/GardenProtocolConstants');
const ChecksumStrategy = require('../src/protocol/ChecksumStrategy');

describe('GardenProtocolConstants', () => {
  test('should have correct header bytes', () => {
    expect(GardenProtocolConstants.HEADER_BYTE_1).toBe(0xC5);
    expect(GardenProtocolConstants.HEADER_BYTE_2).toBe(0x5C);
  });

  test('should have correct min frame length', () => {
    // 帧头(2) + 目标(1) + 源(1) + 长度(1) + 类型(1) + CRC(2) = 8
    expect(GardenProtocolConstants.MIN_FRAME_LENGTH).toBe(8);
  });

  test('should have correct data offset', () => {
    // 帧头(2) + 目标(1) + 源(1) + 长度(1) + 类型(1) = 6
    expect(GardenProtocolConstants.DATA_OFFSET).toBe(6);
  });

  test('should have max data length of 255', () => {
    expect(GardenProtocolConstants.MAX_DATA_LENGTH).toBe(255);
  });
});

describe('DeviceAddress', () => {
  test('should have correct address values', () => {
    expect(DeviceAddress.IOT).toBe(0x00);
    expect(DeviceAddress.BMS).toBe(0x01);
    expect(DeviceAddress.TOOL).toBe(0x02);
    expect(DeviceAddress.CHG).toBe(0x03);
    expect(DeviceAddress.APP).toBe(0x04);
    expect(DeviceAddress.WHEEL).toBe(0x05);
    expect(DeviceAddress.MOTOR).toBe(0x06);
    expect(DeviceAddress.LCD_LED).toBe(0x07);
    expect(DeviceAddress.UI).toBe(0x08);
    expect(DeviceAddress.FIXTURE).toBe(0x09);
  });

  test('should have name mapping for all addresses', () => {
    expect(DeviceAddressName[DeviceAddress.IOT]).toBe('IOT');
    expect(DeviceAddressName[DeviceAddress.BMS]).toBe('BMS');
    expect(DeviceAddressName[DeviceAddress.TOOL]).toBe('TOOL');
    expect(DeviceAddressName[DeviceAddress.CHG]).toBe('CHG');
    expect(DeviceAddressName[DeviceAddress.APP]).toBe('APP');
    expect(DeviceAddressName[DeviceAddress.WHEEL]).toBe('WHEEL');
    expect(DeviceAddressName[DeviceAddress.MOTOR]).toBe('MOTOR');
    expect(DeviceAddressName[DeviceAddress.LCD_LED]).toBe('LCD/LED');
    expect(DeviceAddressName[DeviceAddress.UI]).toBe('UI');
    expect(DeviceAddressName[DeviceAddress.FIXTURE]).toBe('FIXTURE');
  });
});

describe('GardenPacker', () => {
  let packer;

  beforeEach(() => {
    packer = new GardenPacker();
  });

  test('should pack a frame with correct header', () => {
    const frame = packer.pack({
      destAddress: DeviceAddress.BMS,
      srcAddress: DeviceAddress.APP,
      typeId: 0x01,
      data: new Uint8Array([0x01, 0x02]),
    });
    expect(frame[0]).toBe(0xC5);
    expect(frame[1]).toBe(0x5C);
  });

  test('should pack destination and source address correctly', () => {
    const frame = packer.pack({
      destAddress: DeviceAddress.BMS,
      srcAddress: DeviceAddress.APP,
      typeId: 0x01,
    });
    expect(frame[2]).toBe(0x01); // BMS
    expect(frame[3]).toBe(0x04); // APP
  });

  test('should pack data length correctly', () => {
    const data = new Uint8Array([0xAA, 0xBB, 0xCC]);
    const frame = packer.pack({
      destAddress: 0x00,
      srcAddress: 0x04,
      typeId: 0x01,
      data,
    });
    expect(frame[4]).toBe(3); // data length
  });

  test('should pack typeId correctly', () => {
    const frame = packer.pack({
      destAddress: 0x00,
      srcAddress: 0x04,
      typeId: 0x42,
    });
    expect(frame[5]).toBe(0x42);
  });

  test('should include data payload', () => {
    const data = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
    const frame = packer.pack({
      destAddress: 0x00,
      srcAddress: 0x04,
      typeId: 0x01,
      data,
    });
    expect(frame[6]).toBe(0xDE);
    expect(frame[7]).toBe(0xAD);
    expect(frame[8]).toBe(0xBE);
    expect(frame[9]).toBe(0xEF);
  });

  test('should have correct total frame length', () => {
    const data = new Uint8Array(5);
    const frame = packer.pack({
      destAddress: 0x00,
      srcAddress: 0x04,
      typeId: 0x01,
      data,
    });
    expect(frame.length).toBe(GardenProtocolConstants.MIN_FRAME_LENGTH + 5);
  });

  test('should pack frame with no data', () => {
    const frame = packer.pack({
      destAddress: 0x00,
      srcAddress: 0x04,
      typeId: 0x01,
    });
    expect(frame.length).toBe(GardenProtocolConstants.MIN_FRAME_LENGTH);
    expect(frame[4]).toBe(0); // data length = 0
  });

  test('should throw for data exceeding max length', () => {
    const data = new Uint8Array(GardenProtocolConstants.MAX_DATA_LENGTH + 1);
    expect(() => packer.pack({
      destAddress: 0x00,
      srcAddress: 0x04,
      typeId: 0x01,
      data,
    })).toThrow('exceeds maximum');
  });

  test('buildRequest should return a valid frame', () => {
    const frame = packer.buildRequest(
      DeviceAddress.BMS,
      DeviceAddress.APP,
      0x01,
      [0x01, 0x02]
    );
    expect(frame).toBeInstanceOf(Uint8Array);
    expect(frame[0]).toBe(0xC5);
    expect(frame[1]).toBe(0x5C);
    expect(frame[2]).toBe(DeviceAddress.BMS);
    expect(frame[3]).toBe(DeviceAddress.APP);
  });

  test('should support custom checksum strategy', () => {
    // Create a simple custom checksum that always returns 0x1234
    class CustomChecksum extends ChecksumStrategy {
      calculate() { return 0x1234; }
      verify(data, offset) {
        const received = data[offset] | (data[offset + 1] << 8);
        return received === 0x1234;
      }
    }

    const customPacker = new GardenPacker({ checksumStrategy: new CustomChecksum() });
    const frame = customPacker.pack({
      destAddress: 0x00,
      srcAddress: 0x04,
      typeId: 0x01,
    });

    // CRC bytes should be 0x34 (low), 0x12 (high)
    const crcOffset = frame.length - 2;
    expect(frame[crcOffset]).toBe(0x34);
    expect(frame[crcOffset + 1]).toBe(0x12);
  });
});

describe('GardenParser', () => {
  let parser;
  let packer;

  beforeEach(() => {
    parser = new GardenParser();
    packer = new GardenPacker();
  });

  test('should parse a complete frame', (done) => {
    const data = new Uint8Array([0x01, 0x02, 0x03]);
    const frame = packer.pack({
      destAddress: DeviceAddress.BMS,
      srcAddress: DeviceAddress.APP,
      typeId: 0x10,
      data,
    });

    parser.on('frame', (parsed) => {
      expect(parsed.destAddress).toBe(DeviceAddress.BMS);
      expect(parsed.srcAddress).toBe(DeviceAddress.APP);
      expect(parsed.typeId).toBe(0x10);
      expect(parsed.data).toEqual(data);
      done();
    });

    parser.feed(frame);
  });

  test('should parse frame with no data payload', (done) => {
    const frame = packer.pack({
      destAddress: DeviceAddress.IOT,
      srcAddress: DeviceAddress.APP,
      typeId: 0x00,
    });

    parser.on('frame', (parsed) => {
      expect(parsed.destAddress).toBe(DeviceAddress.IOT);
      expect(parsed.srcAddress).toBe(DeviceAddress.APP);
      expect(parsed.typeId).toBe(0x00);
      expect(parsed.data.length).toBe(0);
      done();
    });

    parser.feed(frame);
  });

  test('should handle split packets (拆包)', (done) => {
    const data = new Uint8Array([0xAA, 0xBB, 0xCC]);
    const frame = packer.pack({
      destAddress: DeviceAddress.MOTOR,
      srcAddress: DeviceAddress.APP,
      typeId: 0x06,
      data,
    });

    parser.on('frame', (parsed) => {
      expect(parsed.destAddress).toBe(DeviceAddress.MOTOR);
      expect(parsed.typeId).toBe(0x06);
      expect(parsed.data).toEqual(data);
      done();
    });

    const mid = Math.floor(frame.length / 2);
    parser.feed(frame.slice(0, mid));
    parser.feed(frame.slice(mid));
  });

  test('should handle concatenated packets (粘包)', () => {
    const frames = [];
    const frame1 = packer.pack({
      destAddress: DeviceAddress.BMS,
      srcAddress: DeviceAddress.APP,
      typeId: 0x01,
      data: new Uint8Array([0x01]),
    });
    const frame2 = packer.pack({
      destAddress: DeviceAddress.WHEEL,
      srcAddress: DeviceAddress.APP,
      typeId: 0x02,
      data: new Uint8Array([0x02]),
    });

    parser.on('frame', (parsed) => {
      frames.push(parsed);
    });

    const combined = new Uint8Array(frame1.length + frame2.length);
    combined.set(frame1, 0);
    combined.set(frame2, frame1.length);
    parser.feed(combined);

    expect(frames.length).toBe(2);
    expect(frames[0].destAddress).toBe(DeviceAddress.BMS);
    expect(frames[1].destAddress).toBe(DeviceAddress.WHEEL);
  });

  test('should skip garbage data before valid frame', (done) => {
    const frame = packer.pack({
      destAddress: DeviceAddress.IOT,
      srcAddress: DeviceAddress.APP,
      typeId: 0x03,
    });

    parser.on('frame', (parsed) => {
      expect(parsed.typeId).toBe(0x03);
      done();
    });

    const garbage = new Uint8Array([0x00, 0xFF, 0x12, 0x34]);
    const combined = new Uint8Array(garbage.length + frame.length);
    combined.set(garbage, 0);
    combined.set(frame, garbage.length);
    parser.feed(combined);
  });

  test('should emit error on CRC failure', (done) => {
    const frame = packer.pack({
      destAddress: DeviceAddress.IOT,
      srcAddress: DeviceAddress.APP,
      typeId: 0x01,
    });
    // Corrupt the CRC
    frame[frame.length - 1] ^= 0xFF;

    parser.on('error', (err) => {
      expect(err.message).toContain('CRC');
      done();
    });

    parser.feed(frame);
  });

  test('should report pending bytes', () => {
    parser.feed(new Uint8Array([0xC5, 0x5C]));
    expect(parser.pendingBytes).toBe(2);
  });

  test('should reset buffer', () => {
    parser.feed(new Uint8Array([0xC5, 0x5C, 0x01]));
    parser.reset();
    expect(parser.pendingBytes).toBe(0);
  });

  test('should support custom checksum strategy', (done) => {
    class CustomChecksum extends ChecksumStrategy {
      calculate() { return 0xABCD; }
      verify(data, offset) {
        const received = data[offset] | (data[offset + 1] << 8);
        return received === 0xABCD;
      }
    }

    const customStrategy = new CustomChecksum();
    const customPacker = new GardenPacker({ checksumStrategy: customStrategy });
    const customParser = new GardenParser({ checksumStrategy: customStrategy });

    const frame = customPacker.pack({
      destAddress: DeviceAddress.BMS,
      srcAddress: DeviceAddress.APP,
      typeId: 0x01,
      data: new Uint8Array([0x55]),
    });

    customParser.on('frame', (parsed) => {
      expect(parsed.destAddress).toBe(DeviceAddress.BMS);
      expect(parsed.typeId).toBe(0x01);
      expect(parsed.data[0]).toBe(0x55);
      done();
    });

    customParser.feed(frame);
  });

  test('should allow changing checksum strategy at runtime', (done) => {
    class AlwaysPassChecksum extends ChecksumStrategy {
      calculate() { return 0x0000; }
      verify() { return true; }
    }

    packer.setChecksumStrategy(new AlwaysPassChecksum());
    parser.setChecksumStrategy(new AlwaysPassChecksum());

    const frame = packer.pack({
      destAddress: DeviceAddress.IOT,
      srcAddress: DeviceAddress.APP,
      typeId: 0x05,
    });

    parser.on('frame', (parsed) => {
      expect(parsed.typeId).toBe(0x05);
      done();
    });

    parser.feed(frame);
  });
});
