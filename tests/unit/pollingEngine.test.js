import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import PollingEngine from "../../src/polling/pollingEngine.js";

function createMockFileSourceManager() {
  const sources = new Map();
  const config = {
    usb: { enabled: true, files: {} },
  };

  return {
    sources,
    config,
    getSource: vi.fn((type) => sources.get(type) || null),
    getAllSources: vi.fn(async () => ({})),
    scanSource: vi.fn(async () => ({ files: [], checkedAt: new Date().toISOString() })),
    importFile: vi.fn(async () => ({
      scheduleId: "test-id",
      action: "created",
      entries: 1,
    })),
    updateSourceConfig: vi.fn(async () => {}),
  };
}

function createMockScheduleManager() {
  return {
    findScheduleBySource: vi.fn(() => null),
    saveSchedule: vi.fn(),
  };
}

describe("PollingEngine", () => {
  let tmpDir;
  let statusFile;
  let engine;
  let fsm;
  let sm;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "polling-test-"));
    statusFile = path.join(tmpDir, "polling-status.json");
    fsm = createMockFileSourceManager();
    sm = createMockScheduleManager();
    engine = new PollingEngine(fsm, sm, statusFile);
  });

  afterEach(() => {
    engine.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("constructor initialisiert mit Defaults", () => {
    expect(engine.status.enabled).toBe(true);
    expect(engine.status.intervalMinutes).toBe(60);
    expect(engine.isRunning).toBe(false);
    expect(engine.timer).toBeNull();
  });

  it("loadStatus laedt bestehende Datei", () => {
    fs.writeFileSync(
      statusFile,
      JSON.stringify({ enabled: false, intervalMinutes: 30 }),
    );
    const e = new PollingEngine(fsm, sm, statusFile);
    expect(e.status.enabled).toBe(false);
    expect(e.status.intervalMinutes).toBe(30);
  });

  it("loadStatus wendet Defaults bei fehlender Datei an", () => {
    expect(engine.status.enabled).toBe(true);
    expect(engine.status.intervalMinutes).toBe(60);
    expect(engine.status.sources).toEqual({});
    expect(engine.status.log).toEqual([]);
  });

  it("saveStatus schreibt Datei", () => {
    engine.status.enabled = false;
    engine.saveStatus();
    const data = JSON.parse(fs.readFileSync(statusFile, "utf8"));
    expect(data.enabled).toBe(false);
  });

  it("start startet Timer wenn enabled und Quellen aktiv", () => {
    const mockSource = { getType: () => "usb" };
    fsm.sources.set("usb", mockSource);
    engine.start();
    expect(engine.timer).not.toBeNull();
    expect(engine.startedAt).toBeInstanceOf(Date);
  });

  it("start startet NICHT wenn enabled=false", () => {
    engine.status.enabled = false;
    engine.start();
    expect(engine.timer).toBeNull();
  });

  it("start startet NICHT wenn keine Quelle aktiviert", () => {
    fsm.config.usb.enabled = false;
    fsm.sources.set("usb", { getType: () => "usb" });
    engine.start();
    expect(engine.timer).toBeNull();
  });

  it("stop stoppt Timer", () => {
    const mockSource = { getType: () => "usb" };
    fsm.sources.set("usb", mockSource);
    engine.start();
    expect(engine.timer).not.toBeNull();
    engine.stop();
    expect(engine.timer).toBeNull();
    expect(engine.startedAt).toBeNull();
  });

  it("pollCycle verhindert ueberlappende Zyklen", async () => {
    engine.isRunning = true;
    await engine.pollCycle();
    // sollte nichts tun -- keine scanSource Aufrufe
    expect(fsm.scanSource).not.toHaveBeenCalled();
  });

  it("pollCycle ruft pollSource fuer aktivierte Quellen auf", async () => {
    const mockSource = {
      getType: () => "usb",
      getChecksum: vi.fn(async () => "abc123"),
    };
    fsm.sources.set("usb", mockSource);
    fsm.scanSource.mockResolvedValue({
      files: [],
      checkedAt: new Date().toISOString(),
    });

    await engine.pollCycle();
    expect(fsm.scanSource).toHaveBeenCalledWith("usb");
  });

  it("pollSource zaehlt consecutiveErrors bei Fehler", async () => {
    fsm.sources.set("usb", { getType: () => "usb" });
    fsm.scanSource.mockRejectedValue(new Error("USB nicht gefunden"));

    await engine.pollSource("usb");
    expect(engine.status.sources.usb.consecutiveErrors).toBe(1);
    expect(engine.status.sources.usb.lastError).toBe("USB nicht gefunden");
  });

  it("pollSource setzt consecutiveErrors bei Erfolg zurueck", async () => {
    fsm.sources.set("usb", {
      getType: () => "usb",
      getChecksum: vi.fn(async () => "abc"),
    });
    engine.status.sources.usb = { consecutiveErrors: 3, lastError: "test" };
    fsm.scanSource.mockResolvedValue({
      files: [],
      checkedAt: new Date().toISOString(),
    });

    await engine.pollSource("usb");
    expect(engine.status.sources.usb.consecutiveErrors).toBe(0);
    expect(engine.status.sources.usb.lastError).toBeNull();
  });

  it("pollSource deaktiviert Quelle nach 5 Fehlern", async () => {
    fsm.sources.set("usb", { getType: () => "usb" });
    fsm.scanSource.mockRejectedValue(new Error("Fehler"));
    engine.status.sources.usb = { consecutiveErrors: 4 };

    await engine.pollSource("usb");
    expect(fsm.updateSourceConfig).toHaveBeenCalledWith("usb", {
      enabled: false,
    });
    expect(engine.status.log[0].type).toBe("disabled");
  });

  it("pollSource erkennt geaenderte Datei und importiert", async () => {
    const mockSource = {
      getType: () => "usb",
      getChecksum: vi.fn(async () => "new-hash"),
    };
    fsm.sources.set("usb", mockSource);
    fsm.config.usb.files = { "test.xlsx": "old-hash" };
    fsm.scanSource.mockResolvedValue({
      files: [{ name: "test.xlsx", path: "/usb/test.xlsx", size: 100 }],
      checkedAt: new Date().toISOString(),
    });

    const changes = await engine.pollSource("usb");
    expect(fsm.importFile).toHaveBeenCalledWith("usb", "test.xlsx", sm);
    expect(changes).toHaveLength(1);
    expect(changes[0].action).toBe("created");
  });

  it("pollSource ignoriert unveraenderte Dateien", async () => {
    const mockSource = {
      getType: () => "usb",
      getChecksum: vi.fn(async () => "same-hash"),
    };
    fsm.sources.set("usb", mockSource);
    fsm.config.usb.files = { "test.xlsx": "same-hash" };
    fsm.scanSource.mockResolvedValue({
      files: [{ name: "test.xlsx", path: "/usb/test.xlsx", size: 100 }],
      checkedAt: new Date().toISOString(),
    });

    const changes = await engine.pollSource("usb");
    expect(fsm.importFile).not.toHaveBeenCalled();
    expect(changes).toHaveLength(0);
  });

  it("pollSource markiert Zeitplan unavailable wenn Datei fehlt", async () => {
    const mockSchedule = {
      id: "s1",
      source: { type: "usb", fileName: "deleted.xlsx" },
    };
    sm.findScheduleBySource.mockReturnValue(mockSchedule);
    const mockSource = {
      getType: () => "usb",
      getChecksum: vi.fn(async () => "abc"),
    };
    fsm.sources.set("usb", mockSource);
    fsm.config.usb.files = { "deleted.xlsx": "old-hash" };
    fsm.scanSource.mockResolvedValue({
      files: [],
      checkedAt: new Date().toISOString(),
    });

    await engine.pollSource("usb");
    expect(mockSchedule.source.unavailable).toBe(true);
    expect(sm.saveSchedule).toHaveBeenCalled();
  });

  it("updateConfig validiert Intervall", () => {
    expect(() => engine.updateConfig({ intervalMinutes: 99 })).toThrow(
      "Ungueltiges Intervall",
    );
  });

  it("updateConfig aktualisiert und speichert", () => {
    engine.updateConfig({ intervalMinutes: 30, enabled: false });
    expect(engine.status.intervalMinutes).toBe(30);
    expect(engine.status.enabled).toBe(false);
    const saved = JSON.parse(fs.readFileSync(statusFile, "utf8"));
    expect(saved.intervalMinutes).toBe(30);
  });

  it("getStatus gibt korrekten Status zurueck", () => {
    const status = engine.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.intervalMinutes).toBe(60);
    expect(status.running).toBe(false);
    expect(status.sources).toEqual({});
  });

  it("getLog gibt neueste Eintraege zuerst zurueck", () => {
    engine.addLogEntry({ type: "error", source: "usb", message: "Erste" });
    engine.addLogEntry({ type: "change", source: "usb", message: "Zweite" });
    const log = engine.getLog();
    expect(log[0].message).toBe("Zweite");
    expect(log[1].message).toBe("Erste");
  });

  it("addLogEntry begrenzt auf 50 Eintraege", () => {
    for (let i = 0; i < 60; i++) {
      engine.addLogEntry({
        type: "error",
        source: "usb",
        message: `Eintrag ${i}`,
      });
    }
    expect(engine.status.log).toHaveLength(50);
    expect(engine.status.log[0].message).toBe("Eintrag 59");
  });

  it("getLog begrenzt mit limit Parameter", () => {
    for (let i = 0; i < 10; i++) {
      engine.addLogEntry({
        type: "error",
        source: "usb",
        message: `E${i}`,
      });
    }
    const log = engine.getLog(3);
    expect(log).toHaveLength(3);
  });
});
