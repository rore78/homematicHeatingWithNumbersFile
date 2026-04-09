import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import * as XLSX from "xlsx";
import FileSourceManager from "../../src/sources/fileSourceManager.js";
import UsbFileSource from "../../src/sources/usbFileSource.js";

describe("FileSourceManager", () => {
  let tmpDir;
  let sourcesFile;
  let manager;
  let usbDir;
  let originalCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsm-test-"));
    sourcesFile = path.join(tmpDir, "sources.json");
    usbDir = path.join(tmpDir, "usb");
    fs.mkdirSync(usbDir);
    fs.mkdirSync(path.join(tmpDir, "schedules"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "uploads"), { recursive: true });

    originalCwd = process.cwd();
    process.chdir(tmpDir);

    manager = new FileSourceManager(sourcesFile);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loadConfig erstellt Default-Config wenn Datei fehlt", () => {
    expect(manager.config.usb).toBeDefined();
    expect(manager.config.usb.enabled).toBe(false);
  });

  it("loadConfig laedt sources.json korrekt", () => {
    fs.writeFileSync(
      sourcesFile,
      JSON.stringify({ usb: { enabled: true, mountPoint: "/media/usb0" } }),
    );
    const m = new FileSourceManager(sourcesFile);
    expect(m.config.usb.enabled).toBe(true);
    expect(m.config.usb.mountPoint).toBe("/media/usb0");
  });

  it("saveConfig schreibt sources.json", () => {
    manager.config.usb.enabled = true;
    manager.saveConfig();
    const data = JSON.parse(fs.readFileSync(sourcesFile, "utf8"));
    expect(data.usb.enabled).toBe(true);
  });

  it("registerSource registriert eine FileSource-Instanz", () => {
    const usb = new UsbFileSource({ mountPoint: usbDir });
    manager.registerSource(usb);
    expect(manager.getSource("usb")).toBe(usb);
  });

  it("getSource gibt null fuer unbekannten Typ zurueck", () => {
    expect(manager.getSource("fritzbox")).toBeNull();
  });

  it("getAllSources listet alle registrierten Quellen", async () => {
    const usb = new UsbFileSource({ mountPoint: usbDir });
    manager.registerSource(usb);
    const all = await manager.getAllSources();
    expect(all.usb).toBeDefined();
    expect(all.usb.available).toBe(true);
  });

  it("updateSourceConfig aktualisiert und speichert Konfiguration", async () => {
    const usb = new UsbFileSource({ mountPoint: usbDir });
    manager.registerSource(usb);
    await manager.updateSourceConfig("usb", {
      enabled: true,
      mountPoint: usbDir,
    });
    expect(manager.config.usb.enabled).toBe(true);
    const saved = JSON.parse(fs.readFileSync(sourcesFile, "utf8"));
    expect(saved.usb.enabled).toBe(true);
  });

  it("scanSource ruft listFiles auf", async () => {
    const usb = new UsbFileSource({ mountPoint: usbDir });
    manager.registerSource(usb);
    await manager.updateSourceConfig("usb", {
      enabled: true,
      mountPoint: usbDir,
    });
    fs.writeFileSync(path.join(usbDir, "test.xlsx"), "content");

    const result = await manager.scanSource("usb");
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("test.xlsx");
    expect(result.checkedAt).toBeDefined();
  });

  it("scanSource wirft Fehler wenn Quelle nicht aktiviert", async () => {
    const usb = new UsbFileSource({ mountPoint: usbDir });
    manager.registerSource(usb);
    // enabled is false by default
    await expect(manager.scanSource("usb")).rejects.toThrow("nicht aktiviert");
  });

  it("scanSource wirft Fehler wenn Quelle nicht verfuegbar", async () => {
    const usb = new UsbFileSource({ mountPoint: "/nonexistent" });
    manager.registerSource(usb);
    await manager.updateSourceConfig("usb", {
      enabled: true,
      mountPoint: "/nonexistent",
    });
    await expect(manager.scanSource("usb")).rejects.toThrow("nicht verfuegbar");
  });

  describe("importFile", () => {
    function createTestXlsx(filePath, rows) {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      XLSX.writeFile(wb, filePath);
    }

    function createMockScheduleManager() {
      const schedules = {};
      return {
        createSchedule(name, data, source) {
          const id = "test-id-" + Date.now();
          const schedule = { id, name, areas: [], source };
          schedules[id] = schedule;
          return schedule;
        },
        updateSchedule(id, data, source) {
          const existing = schedules[id];
          if (!existing) return null;
          existing.source = source;
          existing.updatedAt = new Date().toISOString();
          return existing;
        },
        findScheduleBySource(type, fileName) {
          return (
            Object.values(schedules).find(
              (s) =>
                s.source &&
                s.source.type === type &&
                s.source.fileName === fileName,
            ) || null
          );
        },
      };
    }

    it("erstellt neuen Zeitplan bei erstem Import", async () => {
      const usb = new UsbFileSource({ mountPoint: usbDir });
      manager.registerSource(usb);
      await manager.updateSourceConfig("usb", {
        enabled: true,
        mountPoint: usbDir,
      });

      const xlsxPath = path.join(usbDir, "Heizplan.xlsx");
      createTestXlsx(xlsxPath, [
        {
          Bereich: "Saal",
          Startdatum: "2025-12-24 08:00",
          Enddatum: "2025-12-24 22:00",
          Temperatur: 21,
        },
      ]);

      await manager.scanSource("usb");

      const scheduleMgr = createMockScheduleManager();
      const result = await manager.importFile(
        "usb",
        "Heizplan.xlsx",
        scheduleMgr,
      );

      expect(result.action).toBe("created");
      expect(result.entries).toBe(1);
      expect(result.scheduleId).toBeDefined();
    });

    it("aktualisiert bestehenden Zeitplan bei Re-Import", async () => {
      const usb = new UsbFileSource({ mountPoint: usbDir });
      manager.registerSource(usb);
      await manager.updateSourceConfig("usb", {
        enabled: true,
        mountPoint: usbDir,
      });

      const xlsxPath = path.join(usbDir, "Heizplan.xlsx");
      createTestXlsx(xlsxPath, [
        {
          Bereich: "Saal",
          Startdatum: "2025-12-24 08:00",
          Enddatum: "2025-12-24 22:00",
          Temperatur: 21,
        },
      ]);

      await manager.scanSource("usb");
      const scheduleMgr = createMockScheduleManager();

      await manager.importFile("usb", "Heizplan.xlsx", scheduleMgr);
      const result = await manager.importFile(
        "usb",
        "Heizplan.xlsx",
        scheduleMgr,
      );
      expect(result.action).toBe("updated");
    });

    it("wirft Fehler wenn kein Scan durchgefuehrt", async () => {
      const usb = new UsbFileSource({ mountPoint: usbDir });
      manager.registerSource(usb);
      const scheduleMgr = createMockScheduleManager();
      await expect(
        manager.importFile("usb", "test.xlsx", scheduleMgr),
      ).rejects.toThrow("Scan");
    });
  });
});
