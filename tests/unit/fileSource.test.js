import { describe, it, expect } from "vitest";
import FileSource from "../../src/sources/fileSource.js";

describe("FileSource", () => {
  it("listFiles wirft 'Nicht implementiert'", async () => {
    const source = new FileSource();
    await expect(source.listFiles()).rejects.toThrow("Nicht implementiert");
  });

  it("readFile wirft 'Nicht implementiert'", async () => {
    const source = new FileSource();
    await expect(source.readFile("/any")).rejects.toThrow("Nicht implementiert");
  });

  it("getChecksum wirft 'Nicht implementiert'", async () => {
    const source = new FileSource();
    await expect(source.getChecksum("/any")).rejects.toThrow(
      "Nicht implementiert",
    );
  });

  it("isAvailable wirft 'Nicht implementiert'", async () => {
    const source = new FileSource();
    await expect(source.isAvailable()).rejects.toThrow("Nicht implementiert");
  });

  it("getType wirft 'Nicht implementiert'", () => {
    const source = new FileSource();
    expect(() => source.getType()).toThrow("Nicht implementiert");
  });

  it("getConfig wirft 'Nicht implementiert'", () => {
    const source = new FileSource();
    expect(() => source.getConfig()).toThrow("Nicht implementiert");
  });
});
