const dgram = require("dgram");
const { OP_CODES } = require("./const");
const { workWithRRQ } = require("./rrq");
const { getMsgOpCode } = require("./util");

module.exports = {
  /**
   * @param {import("../logger").Logger} log
   * */
  launchTFTP(log) {
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
      log.info(rinfo, "request received");
      log.debug({ packet: chunk.toString("hex") }, "request packet");

      const opCode = getMsgOpCode(chunk);

      switch (opCode) {
        case OP_CODES.RRQ:
          log.debug("read request");

          workWithRRQ(rinfo, log, chunk);

          break;
        case OP_CODES.WRQ:
          log.debug("write request");
          break;
        case OP_CODES.DATA:
          log.debug("data request");
          break;
        case OP_CODES.ACK:
          log.debug("ack request");
          break;
        case OP_CODES.ERR:
          log.debug("err request");
          break;
        default:
      }
    });
  },
};
