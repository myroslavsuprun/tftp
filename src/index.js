const { createLogger } = require("./logger");
const { launchTFTP } = require("./tftp");

function main() {
  const log = createLogger();

  launchTFTP(log);
}

main();
