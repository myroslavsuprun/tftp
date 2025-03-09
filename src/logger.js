const { default: pino } = require("pino");

/**
 * @typedef {import("pino").Logger} Logger
 * */

module.exports = {
  /**
   * @returns {Logger}
   * */
  createLogger() {
    const log = pino({
      transport: {
        target: "pino-pretty",
      },
      level: "debug",
    });

    return log;
  },
};
