const dgram = require("dgram");
const { OP_CODES } = require("./const");
const { workWithRRQ } = require("./rrq");
const { getMsgOpCode } = require("./util");

module.exports = {
  /**
   * @param {import("../logger").Logger} log
   * @param {import("../storage").Storage} storage
   * */
  launchTFTP(log, storage) {
    const server = dgram.createSocket({
      type: "udp4",
    });

    server.bind(3001);

    server.on("error", (err) => {
      log.error(err, "TFTP server failed");
    });

    server.on("listening", () => {
      const address = server.address();

      log.info(
        `TFTP server is listening at address: ${address.address}:${address.port}`,
      );
    });

    server.on("message", (chunk, rinfo) => {
      const cLog = log.child({
        port: rinfo.port,
        address: rinfo.address,
      });
      cLog.debug({ packet: chunk.toString("hex") }, "initial request packet");

      const opCode = getMsgOpCode(chunk);

      switch (opCode) {
        case OP_CODES.RRQ:
          workWithRRQ(cLog.child({ opCode }), storage, rinfo, chunk);
          break;
        case OP_CODES.WRQ:
          cLog.debug("write request");
          break;
        case OP_CODES.DATA:
          cLog.debug("data request");
          break;
        case OP_CODES.ACK:
          cLog.debug("ack request");
          break;
        case OP_CODES.ERR:
          cLog.debug("err request");
          break;
        default:
      }
    });
  },
};
