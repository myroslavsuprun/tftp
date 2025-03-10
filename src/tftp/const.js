const DATAGRAM_SIZE = 516;
const BLOCK_SIZE = DATAGRAM_SIZE - 4;

const OP_CODES = {
  RRQ: 1,
  WRQ: 2,
  DATA: 3,
  ACK: 4,
  ERR: 5,
};

const ERR_CODES = {
  UNKNOWN: 0,
  NOT_FOUND: 1,
  ACCESS_VIOLATION: 2,
  DISK_FULL: 3,
  ILLEGAL_OP: 4,
  UNKNOWN_ID: 5,
  FILE_EXISTS: 6,
  NO_USER: 7,
};

const MTU = 516;

const DATA_OP_MIN_SIZE = 4;

const MAX_DATA_OP_DATA_SIZE = MTU - DATA_OP_MIN_SIZE;

// OpCode (2 bytes) + Error code(2 bytes) + Null byte(1 byte)
const ERR_OP_MIN_SIZE = 5;

const MAX_ERR_OP_MSG_SIZE = MTU - ERR_OP_MIN_SIZE;

module.exports = {
  DATAGRAM_SIZE,
  BLOCK_SIZE,
  OP_CODES,
  ERR_CODES,
  DATA_OP_MIN_SIZE,
  MAX_DATA_OP_DATA_SIZE,
  MAX_ERR_OP_MSG_SIZE,
  ERR_OP_MIN_SIZE,
};
