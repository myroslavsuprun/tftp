import { describe, it, expect, vi, beforeEach } from "vitest";
import { workWithWRQ, saveFile, getAckPacket, getDataChunkData } from "./wrq";
import { OP_CODES, ERR_CODES, ACK_PACKET_SIZE, TFTP_MTU } from "./const";
import * as util from "./util";

const fakeLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
};

function createFakeClient() {
  const events = {};
  return {
    connect: vi.fn((port, address, cb) => {
      cb();
    }),
    send: vi.fn((data, cb) => {
      if (cb) cb(null, data.length);
    }),
    on: vi.fn((event, cb) => {
      events[event] = cb;
    }),
    trigger: (event, ...args) => {
      if (events[event]) {
        events[event](...args);
      }
    },
  };
}

function createFakeStorage(stream, shouldReject = false) {
  return {
    saveFile: vi.fn(() => stream),
  };
}

function createFakeStream(writeImpl, closeImpl) {
  return {
    write: vi.fn(writeImpl),
    close: vi.fn(closeImpl),
  };
}

const dummyRinfo = { port: 1234, address: "127.0.0.1", size: TFTP_MTU };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAckPacket", () => {
  it("creates an ACK packet with the given block number", () => {
    const block = 3;
    const packet = getAckPacket(block);
    expect(packet.length).toBe(ACK_PACKET_SIZE);
    expect(packet.readUint16BE(0)).toBe(OP_CODES.ACK);
    expect(packet.readUInt16BE(2)).toBe(block);
  });
});

describe("getDataChunkData", () => {
  it("returns the data portion of the chunk starting from offset 4", () => {
    const payload = Buffer.from("test data");
    const chunk = Buffer.concat([Buffer.alloc(4, 0), payload]);
    const data = getDataChunkData(chunk);
    expect(data.equals(payload)).toBe(true);
  });
});

describe("saveFile", () => {
  let fakeClient, fakeStream;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeClient = createFakeClient();
    fakeStream = createFakeStream(
      (data, cb) => cb(null),
      () => {},
    );
  });

  it("sends initial ACK packet and processes a valid DATA packet", () => {
    saveFile(fakeLogger, fakeClient, fakeStream);
    expect(fakeClient.send).toHaveBeenCalledTimes(1);
    const initPacket = fakeClient.send.mock.calls[0][0];
    expect(initPacket.readUint16BE(0)).toBe(OP_CODES.ACK);
    expect(initPacket.readUInt16BE(2)).toBe(0);

    const block = 1;
    const payload = Buffer.from("file chunk");
    const dataPacket = Buffer.alloc(4 + payload.length);
    dataPacket.writeUint16BE(OP_CODES.DATA, 0);
    dataPacket.writeUint16BE(block, 2);
    payload.copy(dataPacket, 4);

    const rinfo = { size: TFTP_MTU - 1 };
    fakeClient.trigger("message", dataPacket, rinfo);

    expect(fakeStream.write).toHaveBeenCalledWith(
      payload,
      expect.any(Function),
    );
    expect(fakeClient.send).toHaveBeenCalledTimes(2);
    const ackPacket = fakeClient.send.mock.calls[1][0];
    expect(ackPacket.readUint16BE(0)).toBe(OP_CODES.ACK);
    expect(ackPacket.readUInt16BE(2)).toBe(block);
    expect(fakeStream.close).toHaveBeenCalled();
  });

  it("sends an error if stream.write fails", () => {
    const errorMessage = "write error";
    fakeStream = createFakeStream(
      (data, cb) => cb(new Error(errorMessage)),
      () => {},
    );
    saveFile(fakeLogger, fakeClient, fakeStream);

    const block = 1;
    const payload = Buffer.from("chunk error");
    const dataPacket = Buffer.alloc(4 + payload.length);
    dataPacket.writeUint16BE(OP_CODES.DATA, 0);
    dataPacket.writeUint16BE(block, 2);
    payload.copy(dataPacket, 4);

    const rinfo = { size: TFTP_MTU - 1 };
    fakeClient.trigger("message", dataPacket, rinfo);

    const errPacket =
      fakeClient.send.mock.calls[fakeClient.send.mock.calls.length - 1][0];
    expect(errPacket.readUint16BE(0)).toBe(OP_CODES.ERR);
    expect(errPacket.readUint16BE(2)).toBe(ERR_CODES.UNKNOWN);
  });

  it("sends an error if the block number is invalid", () => {
    saveFile(fakeLogger, fakeClient, fakeStream);

    const block = 0;
    const payload = Buffer.from("invalid block");
    const dataPacket = Buffer.alloc(4 + payload.length);
    dataPacket.writeUint16BE(OP_CODES.DATA, 0);
    dataPacket.writeUInt16BE(block, 2);
    payload.copy(dataPacket, 4);

    fakeClient.trigger("message", dataPacket, { size: TFTP_MTU });

    const errPacket =
      fakeClient.send.mock.calls[fakeClient.send.mock.calls.length - 1][0];
    expect(errPacket.readUint16BE(0)).toBe(OP_CODES.ERR);
    expect(errPacket.readUint16BE(2)).toBe(ERR_CODES.UNKNOWN);
  });

  it("sends an error for unsupported op codes", () => {
    saveFile(fakeLogger, fakeClient, fakeStream);

    const illegalPacket = Buffer.alloc(2);
    illegalPacket.writeUint16BE(OP_CODES.WRQ, 0);
    fakeClient.trigger("message", illegalPacket, { size: TFTP_MTU });

    const errPacket =
      fakeClient.send.mock.calls[fakeClient.send.mock.calls.length - 1][0];
    expect(errPacket.readUint16BE(0)).toBe(OP_CODES.ERR);
    expect(errPacket.readUint16BE(2)).toBe(ERR_CODES.ILLEGAL_OP);
  });
});

describe("workWithWRQ", () => {
  let fakeClient, fakeStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(util, "parseWRQHeader").mockImplementation((chunk) => ({
      filename: "dummy.txt",
    }));
    fakeClient = createFakeClient();
    const fakeStream = createFakeStream(
      (data, cb) => cb(null),
      () => {},
    );
    fakeStorage = createFakeStorage(fakeStream);
  });

  it("logs WRQ received, calls storage.saveFile, and sets up file saving", () => {
    const clientFactory = vi.fn(() => fakeClient);
    const dummyChunk = Buffer.from([
      0x00,
      0x01,
      ...Buffer.from("dummy.txt"),
      0x00,
      ...Buffer.from("octet"),
      0x00,
    ]);

    workWithWRQ(fakeLogger, fakeStorage, dummyRinfo, dummyChunk, clientFactory);
    expect(fakeLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "dummy.txt" }),
      "WRQ received",
    );
    expect(clientFactory).toHaveBeenCalled();
    expect(fakeClient.connect).toHaveBeenCalledWith(
      dummyRinfo.port,
      dummyRinfo.address,
      expect.any(Function),
    );
    expect(fakeStorage.saveFile).toHaveBeenCalledWith(fakeLogger, "dummy.txt");
    expect(fakeClient.on).toHaveBeenCalledWith("message", expect.any(Function));
  });
});
