const Packer = require('./Packer');
const Parser = require('./Parser');
const { ProtocolConstants, FuncCode } = require('./ProtocolConstants');
const { calculateCRC16, verifyCRC16 } = require('./CRC16');
const ChecksumStrategy = require('./ChecksumStrategy');
const ModbusCRC16Strategy = require('./ModbusCRC16Strategy');
const GardenPacker = require('./GardenPacker');
const GardenParser = require('./GardenParser');
const { GardenProtocolConstants, DeviceAddress, DeviceAddressName } = require('./GardenProtocolConstants');

module.exports = {
  // 原有协议
  Packer,
  Parser,
  ProtocolConstants,
  FuncCode,
  calculateCRC16,
  verifyCRC16,

  // 校验算法策略
  ChecksumStrategy,
  ModbusCRC16Strategy,

  // 花园协议
  GardenPacker,
  GardenParser,
  GardenProtocolConstants,
  DeviceAddress,
  DeviceAddressName,
};
