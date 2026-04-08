const { BLEConstants } = require('../src/link/BLEConstants');

describe('BLEConstants', () => {
  test('should have correct service UUID', () => {
    expect(BLEConstants.SERVICE_UUID).toBe('FE00');
  });

  test('should have correct write characteristic UUID', () => {
    expect(BLEConstants.CHAR_WRITE).toBe('2A07');
  });

  test('should have correct notify characteristic UUID', () => {
    expect(BLEConstants.CHAR_NOTIFY).toBe('2A08');
  });

  test('should have correct OTA write characteristic UUID', () => {
    expect(BLEConstants.CHAR_OTA_WRITE).toBe('2A09');
  });

  test('should have correct OTA notify characteristic UUID', () => {
    expect(BLEConstants.CHAR_OTA_NOTIFY).toBe('2A0A');
  });
});

describe('BLELinkAdapter defaults', () => {
  // We can't test the full BLELinkAdapter without a BLE manager,
  // but we can verify the default UUIDs
  const BLELinkAdapter = require('../src/link/BLELinkAdapter');

  test('should use default FE00 service UUID', () => {
    const adapter = new BLELinkAdapter({});
    expect(adapter.serviceUUID).toBe('FE00');
  });

  test('should use default 2A07 write characteristic UUID', () => {
    const adapter = new BLELinkAdapter({});
    expect(adapter.writeCharUUID).toBe('2A07');
  });

  test('should use default 2A08 notify characteristic UUID', () => {
    const adapter = new BLELinkAdapter({});
    expect(adapter.notifyCharUUID).toBe('2A08');
  });

  test('should use default 2A09 OTA write characteristic UUID', () => {
    const adapter = new BLELinkAdapter({});
    expect(adapter.otaWriteCharUUID).toBe('2A09');
  });

  test('should use default 2A0A OTA notify characteristic UUID', () => {
    const adapter = new BLELinkAdapter({});
    expect(adapter.otaNotifyCharUUID).toBe('2A0A');
  });

  test('should allow overriding all UUIDs', () => {
    const adapter = new BLELinkAdapter({
      serviceUUID: 'CUSTOM_SERVICE',
      writeCharUUID: 'CUSTOM_WRITE',
      notifyCharUUID: 'CUSTOM_NOTIFY',
      otaWriteCharUUID: 'CUSTOM_OTA_W',
      otaNotifyCharUUID: 'CUSTOM_OTA_N',
    });
    expect(adapter.serviceUUID).toBe('CUSTOM_SERVICE');
    expect(adapter.writeCharUUID).toBe('CUSTOM_WRITE');
    expect(adapter.notifyCharUUID).toBe('CUSTOM_NOTIFY');
    expect(adapter.otaWriteCharUUID).toBe('CUSTOM_OTA_W');
    expect(adapter.otaNotifyCharUUID).toBe('CUSTOM_OTA_N');
  });
});

describe('ChecksumStrategy', () => {
  const ChecksumStrategy = require('../src/protocol/ChecksumStrategy');
  const ModbusCRC16Strategy = require('../src/protocol/ModbusCRC16Strategy');

  test('ChecksumStrategy base class should throw on calculate', () => {
    const strategy = new ChecksumStrategy();
    expect(() => strategy.calculate(new Uint8Array(0))).toThrow('must be implemented');
  });

  test('ChecksumStrategy base class should throw on verify', () => {
    const strategy = new ChecksumStrategy();
    expect(() => strategy.verify(new Uint8Array(0), 0)).toThrow('must be implemented');
  });

  test('ChecksumStrategy should have checksumLength of 2', () => {
    const strategy = new ChecksumStrategy();
    expect(strategy.checksumLength).toBe(2);
  });

  test('ModbusCRC16Strategy should calculate CRC16', () => {
    const strategy = new ModbusCRC16Strategy();
    const data = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x01]);
    const crc = strategy.calculate(data);
    expect(crc).toBe(0x0A84);
  });

  test('ModbusCRC16Strategy should verify CRC16', () => {
    const strategy = new ModbusCRC16Strategy();
    const data = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x01, 0x84, 0x0A]);
    expect(strategy.verify(data, 6)).toBe(true);
  });

  test('ModbusCRC16Strategy should have checksumLength of 2', () => {
    const strategy = new ModbusCRC16Strategy();
    expect(strategy.checksumLength).toBe(2);
  });
});
