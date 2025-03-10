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
 * @typedef {Object} Storage
 * @property {GetFile} getFile
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
  };
}

module.exports = {
  createStorage,
};
