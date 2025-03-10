const { createWriteStream, WriteStream } = require("fs");
const { readFile } = require("fs/promises");
const path = require("path");

const DIR = "/files";

/**
 * @callback GetFile
 *
 * @param {import("../logger").Logger} log
 * @param {String} filename
 * @returns {Promise<Buffer>} file
 * */

/**
 * @callback SaveFile
 *
 * @param {import("../logger").Logger} log
 * @param {String} filename
 *
 * @returns {WriteStream} stream
 * */

/**
 * @typedef {Object} Storage
 * @property {GetFile} getFile
 * @property {SaveFile} saveFile
 * */

/**
 * @returns {Storage}
 * */
function createStorage() {
  const workingDir = process.cwd();
  return {
    async getFile(log, filename) {
      log.debug({ filename }, "getting a file");
      const file = await readFile(path.join(workingDir, DIR, filename));

      return file;
    },
    saveFile(log, filename) {
      log.debug({ filename }, "saving a file");

      const stream = createWriteStream(
        path.join(workingDir, DIR, filename),
        "ascii",
      );

      stream.on("close", () => {
        log.debug("file save stream closed");
      });

      stream.on("error", (err) => {
        log.info(err, "stream error while saving a file");
      });

      return stream;
    },
  };
}

module.exports = {
  createStorage,
};
