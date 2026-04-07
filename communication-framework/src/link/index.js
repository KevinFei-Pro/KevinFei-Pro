const LinkAdapter = require('./LinkAdapter');
const BLELinkAdapter = require('./BLELinkAdapter');
const WebSocketLinkAdapter = require('./WebSocketLinkAdapter');
const WiFiLinkAdapter = require('./WiFiLinkAdapter');
const { LinkState, LinkType } = require('./LinkConstants');

module.exports = {
  LinkAdapter,
  BLELinkAdapter,
  WebSocketLinkAdapter,
  WiFiLinkAdapter,
  LinkState,
  LinkType,
};
