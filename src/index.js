const { createLogger } = require("./logger");
const { createStorage } = require("./storage");
const { launchTFTP } = require("./tftp");

function main() {
  const log = createLogger();
  const storage = createStorage();

  launchTFTP(log, storage);
}

main();
