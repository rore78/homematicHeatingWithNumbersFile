import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// SCHEDULES_DIR is resolved at module load time using process.cwd().
// We chdir to a tmpDir BEFORE importing so it resolves correctly.
let tmpDir;
let originalCwd;
let ScheduleManager;

beforeEach(async () => {
  vi.useFakeTimers();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "schedmgr-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);

  // Reset module cache so SCHEDULES_DIR picks up the new cwd
  vi.resetModules();
  const mod = await import("../../src/scheduler/scheduleManager.js");
  ScheduleManager = mod.default;
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.useRealTimers();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const sampleData = [
  {
    area: "Wohnzimmer",
    startDateTime: "2025-01-15T08:00:00.000Z",
    endDateTime: "2025-01-15T22:00:00.000Z",
    temperature: 21,
    profile: "Komfort",
    notes: null,
  },
];

describe("ScheduleManager", () => {
  let manager;

  beforeEach(() => {
    manager = new ScheduleManager(null);
  });

  afterEach(() => {
    manager.stopScheduler();
  });

  // --- CRUD ---

  describe("CRUD", () => {
    it("createSchedule erzeugt Schedule mit UUID und speichert JSON", () => {
      const schedule = manager.createSchedule("Test-Plan", sampleData);

      expect(schedule.id).toBeDefined();
      expect(schedule.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(schedule.name).toBe("Test-Plan");
      expect(schedule.active).toBe(false);
      expect(schedule.areas).toHaveLength(1);
      expect(schedule.areas[0].areaName).toBe("Wohnzimmer");

      // JSON file exists in tmpDir/schedules/
      const filePath = path.join(tmpDir, "schedules", `${schedule.id}.json`);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("getSchedule gibt vorhandenen Schedule zurueck", () => {
      const created = manager.createSchedule("Test", sampleData);
      const fetched = manager.getSchedule(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe("Test");
    });

    it("getSchedule gibt null fuer unbekannte ID", () => {
      expect(manager.getSchedule("nonexistent-id")).toBeNull();
    });

    it("getAllSchedules gibt Liste aller Schedules", () => {
      manager.createSchedule("Plan 1", sampleData);
      manager.createSchedule("Plan 2", sampleData);
      const all = manager.getAllSchedules();
      expect(all).toHaveLength(2);
    });

    it("deleteSchedule entfernt Schedule und JSON-Datei", () => {
      const schedule = manager.createSchedule("Test", sampleData);
      const filePath = path.join(tmpDir, "schedules", `${schedule.id}.json`);

      expect(manager.deleteSchedule(schedule.id)).toBe(true);
      expect(manager.getSchedule(schedule.id)).toBeNull();
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it("deleteSchedule gibt false fuer unbekannte ID", () => {
      expect(manager.deleteSchedule("nonexistent-id")).toBe(false);
    });
  });

  // --- Activation ---

  describe("Aktivierung", () => {
    it("activateSchedule setzt active: true", () => {
      const schedule = manager.createSchedule("Test", sampleData);
      expect(manager.activateSchedule(schedule.id)).toBe(true);

      const fetched = manager.getSchedule(schedule.id);
      expect(fetched.active).toBe(true);
    });

    it("deactivateSchedule setzt active: false", () => {
      const schedule = manager.createSchedule("Test", sampleData);
      manager.activateSchedule(schedule.id);
      expect(manager.deactivateSchedule(schedule.id)).toBe(true);

      const fetched = manager.getSchedule(schedule.id);
      expect(fetched.active).toBe(false);
    });

    it("activateSchedule ruft checkAndExecute sofort auf", () => {
      const mockController = {
        setTemperature: vi.fn().mockResolvedValue(true),
      };
      manager.setDeviceController(mockController);

      vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));

      const schedule = manager.createSchedule("Test", sampleData);
      manager.activateSchedule(schedule.id);

      expect(mockController.setTemperature).toHaveBeenCalled();
    });
  });

  // --- checkAndExecute ---

  describe("checkAndExecute", () => {
    it("setzt Temperatur wenn Zeitfenster aktiv", async () => {
      const mockController = {
        setTemperature: vi.fn().mockResolvedValue(true),
      };
      manager.setDeviceController(mockController);

      vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));

      const schedule = manager.createSchedule("Test", sampleData);
      schedule.active = true;
      manager.activeSchedules.add(schedule.id);

      await manager.checkAndExecute();

      expect(mockController.setTemperature).toHaveBeenCalledWith(
        "Wohnzimmer",
        21,
      );
    });

    it("setzt keine Temperatur wenn Zeitfenster nicht aktiv", async () => {
      const mockController = {
        setTemperature: vi.fn().mockResolvedValue(true),
      };
      manager.setDeviceController(mockController);

      vi.setSystemTime(new Date("2025-01-15T06:00:00.000Z"));

      const schedule = manager.createSchedule("Test", sampleData);
      schedule.active = true;
      manager.activeSchedules.add(schedule.id);

      await manager.checkAndExecute();

      expect(mockController.setTemperature).not.toHaveBeenCalled();
    });

    it("behandelt mehrere Bereiche korrekt", async () => {
      const mockController = {
        setTemperature: vi.fn().mockResolvedValue(true),
      };
      manager.setDeviceController(mockController);

      vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));

      const multiData = [
        {
          area: "Wohnzimmer",
          startDateTime: "2025-01-15T08:00:00.000Z",
          endDateTime: "2025-01-15T22:00:00.000Z",
          temperature: 21,
        },
        {
          area: "Schlafzimmer",
          startDateTime: "2025-01-16T08:00:00.000Z",
          endDateTime: "2025-01-16T22:00:00.000Z",
          temperature: 17,
        },
      ];

      const schedule = manager.createSchedule("Multi", multiData);
      schedule.active = true;
      manager.activeSchedules.add(schedule.id);

      await manager.checkAndExecute();

      expect(mockController.setTemperature).toHaveBeenCalledTimes(1);
      expect(mockController.setTemperature).toHaveBeenCalledWith(
        "Wohnzimmer",
        21,
      );
    });

    it("kehrt still zurueck ohne DeviceController", async () => {
      manager.setDeviceController(null);
      vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));

      const schedule = manager.createSchedule("Test", sampleData);
      schedule.active = true;
      manager.activeSchedules.add(schedule.id);

      await expect(manager.checkAndExecute()).resolves.toBeUndefined();
    });

    it("bedient andere Geraete trotz Fehler bei einem", async () => {
      const mockController = {
        setTemperature: vi
          .fn()
          .mockRejectedValueOnce(new Error("Device offline"))
          .mockResolvedValueOnce(true),
      };
      manager.setDeviceController(mockController);

      vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));

      const data = [
        {
          area: "DEV001,DEV002",
          startDateTime: "2025-01-15T08:00:00.000Z",
          endDateTime: "2025-01-15T22:00:00.000Z",
          temperature: 21,
        },
      ];

      const schedule = manager.createSchedule("Multi-Device", data);
      schedule.active = true;
      manager.activeSchedules.add(schedule.id);

      await manager.checkAndExecute();

      expect(mockController.setTemperature).toHaveBeenCalledTimes(2);
    });
  });

  // --- Persistence ---

  describe("Persistenz", () => {
    it("loadAllSchedules laedt gespeicherte Schedules", () => {
      const schedule = manager.createSchedule("Persistent", sampleData);
      const id = schedule.id;
      manager.stopScheduler();

      const manager2 = new ScheduleManager(null);
      const loaded = manager2.getSchedule(id);

      expect(loaded).not.toBeNull();
      expect(loaded.name).toBe("Persistent");

      manager2.stopScheduler();
    });

    it("stellt aktive Schedules nach Laden wieder her", () => {
      const schedule = manager.createSchedule("Active-Test", sampleData);
      manager.activateSchedule(schedule.id);
      manager.stopScheduler();

      const manager2 = new ScheduleManager(null);
      expect(manager2.activeSchedules.has(schedule.id)).toBe(true);

      manager2.stopScheduler();
    });
  });

  // --- Timer ---

  describe("Timer", () => {
    it("startScheduler startet 60s-Intervall", () => {
      const spy = vi.spyOn(manager, "checkAndExecute");
      spy.mockClear();

      vi.advanceTimersByTime(60000);

      expect(spy).toHaveBeenCalled();
    });

    it("stopScheduler stoppt Intervall", () => {
      const spy = vi.spyOn(manager, "checkAndExecute");
      spy.mockClear();

      manager.stopScheduler();
      vi.advanceTimersByTime(120000);

      expect(spy).not.toHaveBeenCalled();
    });
  });
});
