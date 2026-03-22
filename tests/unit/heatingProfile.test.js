import { describe, it, expect, beforeEach } from "vitest";
import HeatingProfile from "../../src/scheduler/heatingProfile.js";

describe("HeatingProfile", () => {
  let profile;

  beforeEach(() => {
    profile = new HeatingProfile();
  });

  it("getAllProfiles gibt 4 vordefinierte Profile", () => {
    const all = profile.getAllProfiles();
    expect(all).toHaveLength(4);
    const names = all.map((p) => p.name);
    expect(names).toContain("Komfort");
    expect(names).toContain("Nacht");
    expect(names).toContain("Abwesenheit");
    expect(names).toContain("Reduziert");
  });

  it("getProfile gibt korrektes Profil zurueck", () => {
    const komfort = profile.getProfile("Komfort");
    expect(komfort).not.toBeNull();
    expect(komfort.name).toBe("Komfort");
    expect(komfort.temperature).toBe(21.0);
    expect(komfort.description).toBeDefined();
  });

  it("getProfile gibt null fuer unbekanntes Profil", () => {
    expect(profile.getProfile("Unbekannt")).toBeNull();
  });

  it("getTemperature gibt korrekte Temperatur", () => {
    expect(profile.getTemperature("Komfort")).toBe(21.0);
    expect(profile.getTemperature("Nacht")).toBe(17.0);
    expect(profile.getTemperature("Abwesenheit")).toBe(16.0);
    expect(profile.getTemperature("Reduziert")).toBe(19.0);
  });

  it("getTemperature gibt Fallback-Temperatur bei unbekanntem Profil", () => {
    expect(profile.getTemperature("Unbekannt", 19.0)).toBe(19.0);
  });

  it("getTemperature wirft Fehler ohne Fallback bei unbekanntem Profil", () => {
    expect(() => profile.getTemperature("Unbekannt")).toThrow(
      "Profil 'Unbekannt' nicht gefunden",
    );
  });

  it("createProfile erstellt neues Profil mit custom: true", () => {
    const created = profile.createProfile("Spar", 18.0, "Sparmodus");
    expect(created.name).toBe("Spar");
    expect(created.temperature).toBe(18.0);
    expect(created.custom).toBe(true);
    expect(profile.getProfile("Spar")).not.toBeNull();
  });

  it("createProfile wirft Fehler bei Temperatur ueber 30", () => {
    expect(() => profile.createProfile("Hot", 31)).toThrow("0 und 30");
  });

  it("createProfile wirft Fehler bei Temperatur unter 0", () => {
    expect(() => profile.createProfile("Cold", -1)).toThrow("0 und 30");
  });

  it("deleteProfile gibt false fuer vordefinierte Profile", () => {
    expect(profile.deleteProfile("Komfort")).toBe(false);
  });

  it("deleteProfile loescht benutzerdefiniertes Profil", () => {
    profile.createProfile("Custom", 20);
    expect(profile.deleteProfile("Custom")).toBe(true);
    expect(profile.getProfile("Custom")).toBeNull();
  });

  it("hasProfile gibt boolean zurueck", () => {
    expect(profile.hasProfile("Komfort")).toBe(true);
    expect(profile.hasProfile("Unbekannt")).toBe(false);
  });
});
