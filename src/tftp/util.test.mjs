import { expect, it, describe, vi } from "vitest";
import {
  getClientErrPacket,
  getMsgOpCode,
  parseWRQHeader,
  sendClientErr,
} from "./util";
import { ERR_CODES, OP_CODES } from "./const";

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

describe("getMsgOpCode", async () => {
  it("should return the correct op code", () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    const buf2 = Buffer.from([0x01, 0x01, 0x02, 0x03]);
    const buf3 = Buffer.from([0x02, 0x01, 0x02, 0x03]);

    expect(getMsgOpCode(buf)).toEqual(1);
    expect(getMsgOpCode(buf2)).toEqual(257);
    expect(getMsgOpCode(buf3)).toEqual(513);
  });
});

describe("parseWRQHeader", async () => {
  it("should get correct filename", () => {
    const filename = "file.txt";
    const packet = Buffer.from([
      0x00,
      0x01,
      ...Buffer.from(filename),
      0x00,
      ...Buffer.from("octet"),
      0x00,
    ]);

    const header = parseWRQHeader(packet);
    expect(header.filename).toEqual(filename);
  });

  it("should get correct mode", () => {
    const mode = "octet";
    const packet = Buffer.from([
      0x00,
      0x01,
      ...Buffer.from("file.txt"),
      0x00,
      ...Buffer.from(mode),
      0x00,
    ]);

    const header = parseWRQHeader(packet);
    expect(header.mode).toEqual(mode);
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
