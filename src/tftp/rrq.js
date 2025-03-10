const dgram = require("dgram");
const {
  OP_CODES,
  ERR_CODES,
  ERR_OP_MIN_SIZE,
  DATA_OP_MIN_SIZE,
  MAX_DATA_OP_DATA_SIZE,
} = require("./const");
const { getMsgOpCode, parseWRQHeader } = require("./util");

/**
 * @param {import("../logger").Logger} log
 * @param {import("../storage").Storage} storage
 * @param {import("dgram").RemoteInfo} rinfo
 * @param {Buffer} chunk
 * */
function workWithRRQ(log, storage, rinfo, chunk) {
  const h = parseWRQHeader(chunk);

  log.info(h, "RRQ received");

  const client = dgram.createSocket("udp4");

  client.connect(rinfo.port, rinfo.address, () => {
    storage.getFile(log, h.filename).then(
      (f) => {
        sendFile(log, client, f);
      },
      (err) => {
        log.info(err, "failed to send a file");

        sendClientErr(log, client, ERR_CODES.NOT_FOUND, "file not found");
      },
    );
  });
}

/**
 * @param {import("../logger").Logger} log
 * @param {dgram.Socket} client
 * @param {Buffer} file
 * */
function sendFile(log, client, file) {
  let block = 1;

  const totalBlocks = Math.ceil(file.length / MAX_DATA_OP_DATA_SIZE);

  const initalPacket = getReadPacketWithHeader(
    getChunkSubarray(file, block),
    block,
  );

  client.send(initalPacket, (err, bytes) => {
    getClientSendCb(log)(err, bytes);

    block++;
  });

  client.on("message", (chunk, rinfo) => {
    const opCode = getMsgOpCode(chunk);

    log.info({ size: rinfo.size, opCode }, "client packet received");

    log.debug({ packet: chunk.toString("hex") }, "client packet");

    switch (opCode) {
      case OP_CODES.ACK:
        if (block <= totalBlocks) {
          const packet = getReadPacketWithHeader(
            getChunkSubarray(file, block),
            block,
          );
          client.send(packet, getClientSendCb(log));

          block++;
        }
        break;
      case OP_CODES.ERR:
        const packet = getReadPacketWithHeader(
          getChunkSubarray(file, block),
          block,
        );
        client.send(packet, getClientSendCb(log));
        break;

      case OP_CODES.DATA:
      case OP_CODES.RRQ:
      case OP_CODES.WRQ:
      default:
        sendClientErr(log, client, ERR_CODES.ILLEGAL_OP, "illegal op");
        break;
    }
  });
}

/**
 * @param {Buffer} buf
 * @param {Number} block
 *
 * @returns {Buffer}
 * */
function getChunkSubarray(buf, block) {
  return buf.subarray(
    (block - 1) * MAX_DATA_OP_DATA_SIZE,
    block * MAX_DATA_OP_DATA_SIZE,
  );
}

/**
 * @param {import("../logger").Logger} log
 * @param {dgram.Socket} client
 * @param {Number} errCode
 * @param {String} msg
 * */
function sendClientErr(log, client, errCode, msg) {
  const msgBuffer = Buffer.from(msg, "ascii");

  const b = Buffer.alloc(ERR_OP_MIN_SIZE + msgBuffer.length);

  b.writeUint16BE(OP_CODES.ERR, 0);
  b.writeUint16BE(errCode, 2);
  b.fill(msgBuffer, 4);
  // Add null byte at the end
  b.writeUintBE(0, 4 + msgBuffer.length, 1);

  client.send(b, getClientSendCb(log));
}

/**
 * @param {import("../logger").Logger} log
 * */
function getClientSendCb(log) {
  /**
   * @param {Error | null} err
   * @param {Number} bytes
   * */
  return function clientSendCb(err, bytes) {
    if (err) {
      log.error(err, "reply error");
      return;
    }

    log.debug("replied with bytes: %s", bytes);
  };
}

/**
 * @param {Buffer} data
 * @param {Number} block
 *
 * @returns {Buffer}
 * */
function getReadPacketWithHeader(data, block) {
  const size = DATA_OP_MIN_SIZE + data.length;
  const b = Buffer.alloc(size);
  b.writeUint16BE(OP_CODES.DATA, 0);
  b.writeUInt16BE(block, 2);
  b.fill(data, DATA_OP_MIN_SIZE);

  return b;
}

module.exports = {
  workWithRRQ,
};
