import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  workWithRRQ,
  sendFile,
  getChunkSubarray,
  getReadPacketWithHeader,
  sendClientErr,
  getClientErrPacket,
} from "./rrq";
import {
  OP_CODES,
  ERR_CODES,
  DATA_OP_MIN_SIZE,
  MAX_DATA_OP_DATA_SIZE,
} from "./const";
import * as util from "./util";

/**
 * @type {import("../logger").Logger}
 * */
const fakeLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
};

function createFakeClient() {
  const events = {};
  return {
    connect: (port, address, cb) => cb(),
    send: vi.fn((data, cb) => {
      if (cb) cb(null, data.length);
    }),
    on: (event, cb) => {
      events[event] = cb;
    },
    trigger: (event, ...args) => {
      if (events[event]) {
        events[event](...args);
      }
    },
  };
}

function createFakeStorage(fileBuffer, shouldReject = false) {
  return {
    getFile: vi.fn(() => {
      return shouldReject
        ? Promise.reject(new Error("file not found"))
        : Promise.resolve(fileBuffer);
    }),
  };
}

const dummyRinfo = { port: 1234, address: "127.0.0.1", size: 10 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getChunkSubarray", () => {
  it("returns the correct slice of a buffer", () => {
    const totalSize = MAX_DATA_OP_DATA_SIZE * 3;
    const buf = Buffer.alloc(totalSize);
    for (let i = 0; i < totalSize; i++) {
      buf[i] = i;
    }
    const block = 2;
    const sub = getChunkSubarray(buf, block);
    expect(sub.length).toBe(MAX_DATA_OP_DATA_SIZE);
    expect(sub[0]).toBe(buf[MAX_DATA_OP_DATA_SIZE]);
  });
});

describe("getReadPacketWithHeader", () => {
  it("creates a packet with proper header and data", () => {
    const testData = Buffer.from("test");
    const block = 1;
    const packet = getReadPacketWithHeader(testData, block);

    expect(packet.length).toBe(DATA_OP_MIN_SIZE + testData.length);

    expect(packet.readUint16BE(0)).toBe(OP_CODES.DATA);
    expect(packet.readUInt16BE(2)).toBe(block);

    const dataInPacket = packet.subarray(DATA_OP_MIN_SIZE);
    expect(dataInPacket.equals(testData)).toBe(true);
  });
});

describe("getClientErrPacket", () => {
  it("constructs an error packet correctly", () => {
    const errCode = ERR_CODES.NOT_FOUND;
    const errMsg = "file not found";

    const msgBuffer = Buffer.from(errMsg, "ascii");
    const packet = getClientErrPacket(errCode, msgBuffer);

    expect(packet.readUint16BE(0)).toBe(OP_CODES.ERR);
    expect(packet.readUint16BE(2)).toBe(errCode);

    const msgInPacket = packet.subarray(4, 4 + msgBuffer.length);
    expect(msgInPacket.equals(msgBuffer)).toBe(true);

    expect(packet.readUint8(4 + msgBuffer.length)).toBe(0);
  });
});

describe("sendClientErr", () => {
  it("constructs and sends an error packet correctly", () => {
    const fakeClient = createFakeClient();
    const errCode = ERR_CODES.NOT_FOUND;
    const errMsg = "file not found";

    sendClientErr(fakeLogger, fakeClient, errCode, errMsg);

    expect(fakeClient.send).toHaveBeenCalledTimes(1);
    const sentBuffer = fakeClient.send.mock.calls[0][0];

    expect(sentBuffer.readUint16BE(0)).toBe(OP_CODES.ERR);
    expect(sentBuffer.readUint16BE(2)).toBe(errCode);

    const msgBuffer = Buffer.from(errMsg, "ascii");
    const msgInBuffer = sentBuffer.subarray(4, 4 + msgBuffer.length);
    expect(msgInBuffer.equals(msgBuffer)).toBe(true);

    expect(sentBuffer.readUint8(4 + msgBuffer.length)).toBe(0);
  });
});

describe("workWithRRQ", () => {
  beforeEach(() => {
    vi.spyOn(util, "parseWRQHeader").mockImplementation((chunk) => {
      return { filename: "dummy.txt" };
    });
  });

  it("calls storage.getFile and sends the file on success", async () => {
    const fileBuffer = Buffer.from("dummy file content");
    const fakeStorage = createFakeStorage(fileBuffer, false);
    const fakeClient = createFakeClient();
    const clientFactory = vi.fn(() => fakeClient);

    const dummyChunk = Buffer.from([
      0x00,
      0x01,
      ...Buffer.from("dummy.txt"),
      0x00,
      ...Buffer.from("octet"),
      0x00,
    ]);

    workWithRRQ(fakeLogger, fakeStorage, dummyRinfo, dummyChunk, clientFactory);

    expect(fakeLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "dummy.txt" }),
      "RRQ received",
    );

    expect(clientFactory).toHaveBeenCalled();

    await fakeStorage.getFile();

    expect(fakeStorage.getFile).toHaveBeenCalledWith(fakeLogger, "dummy.txt");
  });

  it("handles storage.getFile failure and sends an error", async () => {
    const fakeStorage = createFakeStorage(null, true);
    const fakeClient = createFakeClient();
    const clientFactory = vi.fn(() => fakeClient);

    const dummyChunk = Buffer.from("dummy chunk");

    workWithRRQ(fakeLogger, fakeStorage, dummyRinfo, dummyChunk, clientFactory);

    try {
      await fakeStorage.getFile();
    } catch (e) {
      expect(e.message).toBe("file not found");
    }

    expect(fakeLogger.info).toHaveBeenCalledWith(
      expect.any(Error),
      "failed to send a file",
    );

    expect(fakeClient.send).toHaveBeenCalledTimes(1);
    const sentBuffer = fakeClient.send.mock.calls[0][0];
    expect(sentBuffer.readUint16BE(0)).toBe(OP_CODES.ERR);
  });
});

describe("sendFile", () => {
  it("sends the initial packet and reacts to an ACK message", () => {
    // Create a file buffer that requires at least 2 blocks.
    const fileContent = Buffer.alloc(MAX_DATA_OP_DATA_SIZE * 2, 0xab);
    // Use a fake client with event triggering.
    const fakeClient = createFakeClient();

    // Call sendFile.
    sendFile(fakeLogger, fakeClient, fileContent);

    // Check that the initial send call was made for block 1.
    expect(fakeClient.send).toHaveBeenCalledTimes(1);
    const initialPacket = fakeClient.send.mock.calls[0][0];
    // Verify the block number is 1.
    expect(initialPacket.readUInt16BE(2)).toBe(1);

    // Simulate an ACK message from the client.
    // Create a buffer representing an ACK op code.
    const ackBuffer = Buffer.alloc(2);
    ackBuffer.writeUint16BE(OP_CODES.ACK, 0);
    // Trigger the "message" event.
    fakeClient.trigger("message", ackBuffer, { size: 5 });

    // Now, send should have been called a second time for block 2.
    expect(fakeClient.send).toHaveBeenCalledTimes(2);
    const secondPacket = fakeClient.send.mock.calls[1][0];
    expect(secondPacket.readUInt16BE(2)).toBe(2);
  });

  it("sends an error for illegal op codes", () => {
    // Create a file buffer with one block.
    const fileContent = Buffer.alloc(MAX_DATA_OP_DATA_SIZE, 0xcd);
    const fakeClient = createFakeClient();

    sendFile(fakeLogger, fakeClient, fileContent);

    // Simulate an illegal op code message.
    const illegalBuffer = Buffer.alloc(2);
    // Use a value that is not handled (for example, OP_CODES.RRQ).
    illegalBuffer.writeUint16BE(OP_CODES.RRQ, 0);
    fakeClient.trigger("message", illegalBuffer, { size: 5 });

    // In the default case, sendClientErr should be called.
    // Thus, client.send should have been called twice:
    // - one for the initial packet,
    // - one for the error response.
    expect(fakeClient.send).toHaveBeenCalledTimes(2);
    const errorPacket = fakeClient.send.mock.calls[1][0];
    expect(errorPacket.readUint16BE(0)).toBe(OP_CODES.ERR);
    // And the error code should be ERR_CODES.ILLEGAL_OP.
    expect(errorPacket.readUint16BE(2)).toBe(ERR_CODES.ILLEGAL_OP);
  });
});
