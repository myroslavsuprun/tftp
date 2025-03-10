/**
 * @typedef {Object} WRQHeader
 * @prop {string} filename
 * @prop {string} mode
 * */

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

module.exports = {
  getMsgOpCode,
  parseWRQHeader,
};
