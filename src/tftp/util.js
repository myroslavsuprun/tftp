/**
 * @param {Buffer} chunk
 *
 * @returns {number}
 * */
function getMsgOpCode(chunk) {
  return parseInt(chunk.subarray(0, 2).toString("hex"), 16);
}

module.exports = {
  getMsgOpCode,
};
