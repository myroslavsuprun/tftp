/**
 * @typedef {Object} WRQHeader
 * @prop {string} filename
 * @prop {string} mode
 * */

const { ERR_OP_MIN_SIZE, OP_CODES } = require("./const");

/**
 * @param {Buffer} chunk
 *
 * @returns {number}
 * */
function getMsgOpCode(chunk) {
  return parseInt(chunk.subarray(0, 2).toString("hex"), 16);
}

/**
 * @param {Buffer} buf
 *
 * @returns {WRQHeader}
 * */
function parseWRQHeader(buf) {
  const packet = buf.subarray(2, buf.length - 1);

  const nullByteIdx = packet.indexOf(0x00);
  const filename = packet.subarray(0, nullByteIdx).toString("ascii");
  const mode = packet
    .subarray(nullByteIdx + 1, packet.length)
    .toString("ascii");

  /**
   * @type {WRQHeader}
   * */
  const h = {
    mode,
    filename,
  };

  return h;
}

/**
 * @param {import("../logger").Logger} log
 * @param {dgram.Socket} client
 * @param {Number} errCode
 * @param {String} msg
 * */
function sendClientErr(log, client, errCode, msg) {
  const msgBuffer = Buffer.from(msg, "ascii");

  const packet = getClientErrPacket(errCode, msgBuffer);

  client.send(packet, function clientErrSendCb(err) {
    if (err) {
      log.error({ err }, "error sending client err");
    }

    log.debug("sent client err, err code: %s", errCode);
  });
}

/**
 * @param {Number} errCode
 * @param {Buffer} msgBuffer
 *
 * @returns {Buffer} packet
 * */
function getClientErrPacket(errCode, msgBuffer) {
  const b = Buffer.alloc(ERR_OP_MIN_SIZE + msgBuffer.length);

  b.writeUint16BE(OP_CODES.ERR, 0);
  b.writeUint16BE(errCode, 2);
  msgBuffer.copy(b, 4, 0);

  return b;
}

module.exports = {
  getMsgOpCode,
  parseWRQHeader,

  sendClientErr,
  getClientErrPacket,
};
