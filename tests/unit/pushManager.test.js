import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import PushManager from "../../src/sources/pushManager.js";

describe("PushManager", () => {
  let tmpDir;
  let configFile;
  let manager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "push-test-"));
    configFile = path.join(tmpDir, "push-config.json");
    manager = new PushManager(configFile);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loadConfig erstellt Defaults bei fehlender Datei", () => {
    expect(manager.config.enabled).toBe(false);
    expect(manager.config.apiKey).toBe("");
  });

  it("loadConfig laedt bestehende Datei", () => {
    fs.writeFileSync(
      configFile,
      JSON.stringify({ enabled: true, apiKey: "test-key" }),
    );
    const m = new PushManager(configFile);
    expect(m.config.enabled).toBe(true);
    expect(m.config.apiKey).toBe("test-key");
  });

  it("saveConfig schreibt Datei", () => {
    manager.config.enabled = true;
    manager.saveConfig();
    const data = JSON.parse(fs.readFileSync(configFile, "utf8"));
    expect(data.enabled).toBe(true);
  });

  it("generateApiKey erzeugt 64-Zeichen hex-String", () => {
    const key = manager.generateApiKey();
    expect(key).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(key)).toBe(true);
  });

  it("enable generiert API-Key und aktiviert", () => {
    manager.enable();
    expect(manager.config.enabled).toBe(true);
    expect(manager.config.apiKey).toHaveLength(64);
  });

  it("enable behaelt bestehenden Key", () => {
    manager.config.apiKey = "existing-key";
    manager.enable();
    expect(manager.config.apiKey).toBe("existing-key");
  });

  it("disable deaktiviert", () => {
    manager.config.enabled = true;
    manager.disable();
    expect(manager.config.enabled).toBe(false);
  });

  it("regenerateKey erzeugt neuen Key", () => {
    manager.config.apiKey = "old-key";
    const newKey = manager.regenerateKey();
    expect(newKey).not.toBe("old-key");
    expect(newKey).toHaveLength(64);
  });

  it("validateApiKey akzeptiert gueltigen Key", () => {
    manager.config.enabled = true;
    manager.config.apiKey = "my-key";
    expect(manager.validateApiKey("my-key")).toBe(true);
  });

  it("validateApiKey lehnt ungueltigen Key ab", () => {
    manager.config.enabled = true;
    manager.config.apiKey = "my-key";
    expect(manager.validateApiKey("wrong-key")).toBe(false);
  });

  it("validateApiKey lehnt ab wenn deaktiviert", () => {
    manager.config.enabled = false;
    manager.config.apiKey = "my-key";
    expect(manager.validateApiKey("my-key")).toBe(false);
  });

  it("getConfig gibt Konfiguration zurueck", () => {
    manager.config.enabled = true;
    manager.config.apiKey = "test-key";
    const config = manager.getConfig();
    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBe("test-key");
    expect(config.endpoint).toBe("/api/push/upload");
  });
});
