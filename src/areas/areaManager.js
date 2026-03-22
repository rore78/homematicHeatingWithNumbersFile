import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AREAS_FILE = path.join(process.cwd(), "areas.json");

/**
 * Bereichs-Manager
 * Verwaltet Bereiche (Areas) die aus einem oder mehreren Geräten bestehen
 */
export class AreaManager {
  constructor() {
    this.areas = this.loadAreas();
  }

  /**
   * Lädt Bereiche aus der JSON-Datei
   * @returns {object} - Bereiche als Objekt
   */
  loadAreas() {
    try {
      if (fs.existsSync(AREAS_FILE)) {
        const data = fs.readFileSync(AREAS_FILE, "utf8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn(`Fehler beim Laden der Bereiche: ${error.message}`);
    }
    return {};
  }

  /**
   * Speichert Bereiche in die JSON-Datei
   */
  saveAreas() {
    try {
      fs.writeFileSync(AREAS_FILE, JSON.stringify(this.areas, null, 2), "utf8");
    } catch (error) {
      throw new Error(`Fehler beim Speichern der Bereiche: ${error.message}`);
    }
  }

  /**
   * Erstellt oder aktualisiert einen Bereich
   * @param {string} name - Bereichsname
   * @param {Array<string>} deviceIds - Liste von Geräte-IDs
   * @returns {object} - Erstellter/aktualisierter Bereich
   */
  createArea(name, deviceIds) {
    if (!name || typeof name !== "string") {
      throw new Error("Bereichsname muss ein String sein");
    }
    if (!Array.isArray(deviceIds)) {
      throw new Error("deviceIds muss ein Array sein");
    }

    this.areas[name] = {
      name,
      deviceIds: [...deviceIds],
      createdAt: this.areas[name]?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.saveAreas();
    return this.areas[name];
  }

  /**
   * Ruft einen Bereich ab
   * @param {string} name - Bereichsname
   * @returns {object|null} - Bereich oder null wenn nicht gefunden
   */
  getArea(name) {
    return this.areas[name] || null;
  }

  /**
   * Ruft alle Bereiche ab
   * @returns {Array<object>} - Liste aller Bereiche
   */
  getAllAreas() {
    return Object.values(this.areas);
  }

  /**
   * Aktualisiert einen Bereich
   * @param {string} name - Bereichsname
   * @param {Array<string>} deviceIds - Neue Liste von Geräte-IDs
   * @returns {object} - Aktualisierter Bereich
   */
  updateArea(name, deviceIds) {
    if (!this.areas[name]) {
      throw new Error(`Bereich '${name}' nicht gefunden`);
    }
    return this.createArea(name, deviceIds);
  }

  /**
   * Löscht einen Bereich
   * @param {string} name - Bereichsname
   * @returns {boolean} - true wenn gelöscht, false wenn nicht gefunden
   */
  deleteArea(name) {
    if (this.areas[name]) {
      delete this.areas[name];
      this.saveAreas();
      return true;
    }
    return false;
  }

  /**
   * Prüft ob ein Bereich existiert
   * @param {string} name - Bereichsname
   * @returns {boolean}
   */
  hasArea(name) {
    return !!this.areas[name];
  }

  /**
   * Auflösung eines Bereichsnamens oder einer kommagetrennten Geräte-ID-Liste
   * @param {string} areaOrDevices - Bereichsname oder kommagetrennte Geräte-IDs
   * @returns {Array<string>} - Liste von Geräte-IDs
   */
  resolveDevices(areaOrDevices) {
    // Wenn es ein Bereich ist, gib die Geräte zurück
    if (this.areas[areaOrDevices]) {
      return this.areas[areaOrDevices].deviceIds;
    }

    // Wenn es kommagetrennte Geräte-IDs sind, parse sie
    if (areaOrDevices.includes(",")) {
      return areaOrDevices
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id);
    }

    // Sonst ist es eine einzelne Geräte-ID
    return [areaOrDevices.trim()];
  }
}

export default AreaManager;
