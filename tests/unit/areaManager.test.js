import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

let tmpDir;
let originalCwd;
let AreaManager;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "areamgr-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);

  vi.resetModules();
  const mod = await import("../../src/areas/areaManager.js");
  AreaManager = mod.default;
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("AreaManager", () => {
  let manager;

  beforeEach(() => {
    manager = new AreaManager();
  });

  it("createArea speichert Bereich mit deviceIds und Zeitstempeln", () => {
    const area = manager.createArea("Wohnzimmer", ["DEV001", "DEV002"]);
    expect(area.name).toBe("Wohnzimmer");
    expect(area.deviceIds).toEqual(["DEV001", "DEV002"]);
    expect(area.createdAt).toBeDefined();
    expect(area.updatedAt).toBeDefined();

    // Persisted to file
    expect(fs.existsSync(path.join(tmpDir, "areas.json"))).toBe(true);
  });

  it("getArea gibt vorhandenen Bereich zurueck", () => {
    manager.createArea("Kueche", ["DEV003"]);
    const area = manager.getArea("Kueche");
    expect(area).not.toBeNull();
    expect(area.name).toBe("Kueche");
  });

  it("getArea gibt null fuer unbekannten Bereich", () => {
    expect(manager.getArea("Unbekannt")).toBeNull();
  });

  it("getAllAreas gibt Liste aller Bereiche", () => {
    manager.createArea("A", ["D1"]);
    manager.createArea("B", ["D2"]);
    expect(manager.getAllAreas()).toHaveLength(2);
  });

  it("updateArea aktualisiert deviceIds und updatedAt", () => {
    manager.createArea("Wohnzimmer", ["DEV001"]);
    const original = manager.getArea("Wohnzimmer");

    manager.updateArea("Wohnzimmer", ["DEV001", "DEV002", "DEV003"]);
    const updated = manager.getArea("Wohnzimmer");

    expect(updated.deviceIds).toEqual(["DEV001", "DEV002", "DEV003"]);
    expect(updated.createdAt).toBe(original.createdAt);
  });

  it("updateArea wirft Fehler fuer unbekannten Bereich", () => {
    expect(() => manager.updateArea("Unbekannt", ["D1"])).toThrow(
      "nicht gefunden",
    );
  });

  it("deleteArea entfernt Bereich und speichert", () => {
    manager.createArea("Test", ["D1"]);
    expect(manager.deleteArea("Test")).toBe(true);
    expect(manager.getArea("Test")).toBeNull();
  });

  it("deleteArea gibt false fuer unbekannten Bereich", () => {
    expect(manager.deleteArea("Unbekannt")).toBe(false);
  });

  it("resolveDevices mit vorhandenem Bereich gibt deviceIds", () => {
    manager.createArea("Wohnzimmer", ["DEV001", "DEV002"]);
    expect(manager.resolveDevices("Wohnzimmer")).toEqual(["DEV001", "DEV002"]);
  });

  it("resolveDevices mit Komma-getrennten IDs", () => {
    expect(manager.resolveDevices("DEV001,DEV002")).toEqual([
      "DEV001",
      "DEV002",
    ]);
  });

  it("resolveDevices mit einzelner ID", () => {
    expect(manager.resolveDevices("DEV001")).toEqual(["DEV001"]);
  });

  it("hasArea gibt boolean zurueck", () => {
    manager.createArea("Test", ["D1"]);
    expect(manager.hasArea("Test")).toBe(true);
    expect(manager.hasArea("Nope")).toBe(false);
  });
});
