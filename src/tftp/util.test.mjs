import { expect, it, describe } from "vitest";
import { getMsgOpCode, parseWRQHeader } from "./util";

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
