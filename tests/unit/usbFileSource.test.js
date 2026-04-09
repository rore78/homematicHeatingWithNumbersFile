import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import UsbFileSource from "../../src/sources/usbFileSource.js";

describe("UsbFileSource", () => {
  let tmpDir;
  let source;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "usb-test-"));
    source = new UsbFileSource({ mountPoint: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("getType gibt 'usb' zurueck", () => {
    expect(source.getType()).toBe("usb");
  });

  it("getConfig gibt mountPoint und subFolder zurueck", () => {
    const config = source.getConfig();
    expect(config.mountPoint).toBe(tmpDir);
    expect(config.subFolder).toBe("");
  });

  it("isAvailable gibt true wenn Mount-Punkt existiert", async () => {
    expect(await source.isAvailable()).toBe(true);
  });

  it("isAvailable gibt false wenn Mount-Punkt nicht existiert", async () => {
    source.updateConfig({ mountPoint: "/nonexistent/path" });
    expect(await source.isAvailable()).toBe(false);
  });

  describe("listFiles", () => {
    it("findet .xlsx und .numbers Dateien", async () => {
      fs.writeFileSync(path.join(tmpDir, "test.xlsx"), "xlsx content");
      fs.writeFileSync(path.join(tmpDir, "test.numbers"), "numbers content");
      fs.writeFileSync(path.join(tmpDir, "ignore.txt"), "text content");

      const files = await source.listFiles();
      expect(files).toHaveLength(2);
      expect(files.map((f) => f.name).sort()).toEqual([
        "test.numbers",
        "test.xlsx",
      ]);
    });

    it("gibt leeres Array fuer leeres Verzeichnis zurueck", async () => {
      const files = await source.listFiles();
      expect(files).toHaveLength(0);
    });

    it("gibt Datei-Metadaten zurueck", async () => {
      fs.writeFileSync(path.join(tmpDir, "test.xlsx"), "content");
      const files = await source.listFiles();
      expect(files[0]).toHaveProperty("name", "test.xlsx");
      expect(files[0]).toHaveProperty("path");
      expect(files[0]).toHaveProperty("size");
      expect(files[0]).toHaveProperty("modified");
    });

    it("wirft Fehler wenn Pfad nicht existiert", async () => {
      source.updateConfig({ mountPoint: "/nonexistent" });
      await expect(source.listFiles()).rejects.toThrow("nicht gefunden");
    });

    it("beruecksichtigt subFolder", async () => {
      const sub = path.join(tmpDir, "Heizung");
      fs.mkdirSync(sub);
      fs.writeFileSync(path.join(sub, "plan.xlsx"), "content");
      fs.writeFileSync(path.join(tmpDir, "root.xlsx"), "content");

      source.updateConfig({ subFolder: "Heizung" });
      const files = await source.listFiles();
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe("plan.xlsx");
    });
  });

  describe("readFile", () => {
    it("liest Dateiinhalt als Buffer", async () => {
      const filePath = path.join(tmpDir, "test.xlsx");
      fs.writeFileSync(filePath, "test content");
      const buffer = await source.readFile(filePath);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.toString()).toBe("test content");
    });

    it("wirft Fehler wenn Datei nicht existiert", async () => {
      await expect(source.readFile("/nonexistent")).rejects.toThrow(
        "nicht mehr verfuegbar",
      );
    });
  });

  describe("getChecksum", () => {
    it("berechnet MD5-Hash", async () => {
      const filePath = path.join(tmpDir, "test.xlsx");
      fs.writeFileSync(filePath, "test content");
      const hash = await source.getChecksum(filePath);
      expect(typeof hash).toBe("string");
      expect(hash).toHaveLength(32); // MD5 hex length
    });

    it("gleiche Datei ergibt gleichen Hash", async () => {
      const f1 = path.join(tmpDir, "a.xlsx");
      const f2 = path.join(tmpDir, "b.xlsx");
      fs.writeFileSync(f1, "same content");
      fs.writeFileSync(f2, "same content");
      const h1 = await source.getChecksum(f1);
      const h2 = await source.getChecksum(f2);
      expect(h1).toBe(h2);
    });

    it("unterschiedliche Dateien ergeben unterschiedliche Hashes", async () => {
      const f1 = path.join(tmpDir, "a.xlsx");
      const f2 = path.join(tmpDir, "b.xlsx");
      fs.writeFileSync(f1, "content a");
      fs.writeFileSync(f2, "content b");
      const h1 = await source.getChecksum(f1);
      const h2 = await source.getChecksum(f2);
      expect(h1).not.toBe(h2);
    });
  });
});
