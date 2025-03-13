const dgram = require("dgram");
const {
  OP_CODES,
  ERR_CODES,
  ERR_OP_MIN_SIZE,
  ACK_PACKET_SIZE,
  TFTP_MTU,
} = require("./const");
const { getMsgOpCode, parseWRQHeader } = require("./util");
const { WriteStream } = require("fs");

/**
 * @param {import("../logger").Logger} log
 * @param {import("../storage").Storage} storage
 * @param {import("dgram").RemoteInfo} rinfo
 * @param {Buffer} chunk
 * @param {() => dgram.Socket} [clientFactory=() => dgram.createSocket("udp4")]
 * */
function workWithWRQ(
  log,
  storage,
  rinfo,
  chunk,
  clientFactory = () => dgram.createSocket("udp4"),
) {
  const h = parseWRQHeader(chunk);

  log.info(h, "WRQ received");

  const client = clientFactory();

  client.connect(rinfo.port, rinfo.address, () => {
    const stream = storage.saveFile(log, h.filename);

    saveFile(log, client, stream);
  });
}

/**
 * @param {import("../logger").Logger} log
 * @param {dgram.Socket} client
 * @param {WriteStream} stream
 * */
function saveFile(log, client, stream) {
  const initalPacket = getAckPacket(0);

  client.send(initalPacket, getClientSendCb(log));

  let isClosed = false;

  client.on("message", (chunk, rinfo) => {
    const opCode = getMsgOpCode(chunk);

    log.info({ size: rinfo.size, opCode }, "client packet received");

    switch (opCode) {
      case OP_CODES.DATA: {
        if (isClosed) {
          sendClientErr(
            log,
            client,
            ERR_CODES.UNKNOWN,
            "file is already saved",
          );

          break;
        }

        const block = getDataChunkBlock(chunk);

        if (!block) {
          sendClientErr(log, client, ERR_CODES.UNKNOWN, "invalid block number");

          break;
        }

        const data = getDataChunkData(chunk);

        stream.write(data, (err) => {
          if (err) {
            const msg = err.message || "failed to save";

            sendClientErr(log, client, ERR_CODES.UNKNOWN, msg);

            return;
          }

          const packet = getAckPacket(block);
          log.debug(
            {
              packet,
              block,
            },
            "sendind an ack",
          );
          client.send(packet, getClientSendCb(log));
        });

        if (rinfo.size < TFTP_MTU) {
          isClosed = true;
          stream.close();
        }

        break;
      }

      case OP_CODES.ERR: {
        // TODO: add
        break;
      }

      case OP_CODES.ACK:
      case OP_CODES.RRQ:
      case OP_CODES.WRQ:
      default: {
        sendClientErr(log, client, ERR_CODES.ILLEGAL_OP, "illegal op");
        break;
      }
    }
  });
}

/**
 * @param {Buffer} chunk
 *
 * @returns {Number}
 * */
function getDataChunkBlock(chunk) {
  return parseInt(chunk.subarray(2, 4).toString("hex"), 16);
}

/**
 * @param {Buffer} chunk
 *
 * @returns {Buffer}
 * */
function getDataChunkData(chunk) {
  return chunk.subarray(4);
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
 * @param {Number} block
 *
 * @returns {Buffer}
 * */
function getAckPacket(block) {
  const b = Buffer.alloc(ACK_PACKET_SIZE);
  b.writeUint16BE(OP_CODES.ACK, 0);
  b.writeUInt16BE(block, 2);

  return b;
}

module.exports = {
  workWithWRQ,
};
