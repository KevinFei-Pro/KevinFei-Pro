const { calculateCRC16, verifyCRC16 } = require('../src/protocol/CRC16');

describe('CRC16', () => {
  test('should calculate CRC16 for known data', () => {
    // Modbus CRC16 for [0x01, 0x03, 0x00, 0x00, 0x00, 0x01] = 0x0A84
    const data = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x01]);
    const crc = calculateCRC16(data);
    expect(crc).toBe(0x0A84);
  });

  test('should calculate CRC16 with offset and length', () => {
    const data = new Uint8Array([0xFF, 0x01, 0x03, 0x00, 0xFF]);
    const crc = calculateCRC16(data, 1, 3); // Calculate for [0x01, 0x03, 0x00]
    const expected = calculateCRC16(new Uint8Array([0x01, 0x03, 0x00]));
    expect(crc).toBe(expected);
  });

  test('should verify CRC16 correctly', () => {
    // CRC16 of [0x01, 0x03, 0x00, 0x00, 0x00, 0x01] = 0x0A84
    // Little-endian in frame: Lo=0x84, Hi=0x0A
    const data = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x01, 0x84, 0x0A]);
    expect(verifyCRC16(data, 6)).toBe(true);
  });

  test('should fail verification for corrupted data', () => {
    const data = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00]);
    expect(verifyCRC16(data, 6)).toBe(false);
  });

  test('should handle empty data', () => {
    const crc = calculateCRC16(new Uint8Array(0));
    expect(crc).toBe(0xFFFF); // Initial value when no data
  });
});
