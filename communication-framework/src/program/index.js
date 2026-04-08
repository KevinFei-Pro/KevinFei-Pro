const DeviceProgram = require('./DeviceProgram');
const GardenProgram = require('./GardenProgram');
const {
  ProgramState,
  OTACommand,
  OTAStatus,
  GardenToolType,
  GardenToolTypeName,
  OTASrcAddress,
  SerialConfig,
  OTADefaults,
} = require('./ProgramConstants');

module.exports = {
  // OTA 编程器
  DeviceProgram,
  GardenProgram,

  // 常量
  ProgramState,
  OTACommand,
  OTAStatus,
  GardenToolType,
  GardenToolTypeName,
  OTASrcAddress,
  SerialConfig,
  OTADefaults,
};
