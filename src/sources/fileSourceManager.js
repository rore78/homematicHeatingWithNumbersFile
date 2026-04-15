import fs from "fs";
import path from "path";
import logger from "../utils/logger.js";
import SpreadsheetParser from "../parser/spreadsheetParser.js";
import { encodeCredential } from "./fritzboxFileSource.js";

const SOURCES_FILE = path.join(process.cwd(), "sources.json");

const DEFAULT_CONFIG = {
  usb: {
    enabled: false,
    mountPoint: "",
    subFolder: "",
    lastChecked: null,
    files: {},
  },
  fritzbox: {
    enabled: false,
    host: "",
    port: 21,
    username: "",
    password: "",
    path: "",
    secure: true,
    lastChecked: null,
    files: {},
  },
  icloud: {
    enabled: false,
    appleId: "",
    password: "",
    path: "",
    lastChecked: null,
    files: {},
  },
};

/**
 * FileSourceManager
 * Orchestriert alle registrierten Dateiquellen und verwaltet die Persistenz.
 */
export class FileSourceManager {
  constructor(sourcesFilePath = SOURCES_FILE) {
    this.sourcesFilePath = sourcesFilePath;
    this.sources = new Map();
    this.config = this.loadConfig();
    this.lastScanResults = new Map();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.sourcesFilePath)) {
        const data = fs.readFileSync(this.sourcesFilePath, "utf8");
        return {
          ...JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
          ...JSON.parse(data),
        };
      }
    } catch (error) {
      logger.warn(
        `Fehler beim Laden der Quellen-Konfiguration: ${error.message}`,
      );
    }
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  saveConfig() {
    fs.writeFileSync(
      this.sourcesFilePath,
      JSON.stringify(this.config, null, 2),
      "utf8",
    );
  }

  registerSource(fileSource) {
    const type = fileSource.getType();
    this.sources.set(type, fileSource);

    // Gespeicherte Konfiguration auf die Instanz anwenden (nur nicht-leere Werte)
    const saved = this.config[type];
    if (saved && fileSource.updateConfig) {
      const updates = {};
      for (const [key, value] of Object.entries(saved)) {
        if (key === "enabled" || key === "lastChecked" || key === "files")
          continue;
        if (value !== "" && value !== null && value !== undefined) {
          updates[key] = value;
        }
      }
      if (Object.keys(updates).length > 0) {
        fileSource.updateConfig(updates);
      }
    }
  }

  getSource(type) {
    return this.sources.get(type) || null;
  }

  async getAllSources() {
    const result = {};
    for (const [type, source] of this.sources) {
      const config = this.config[type] || {};
      let available = false;
      try {
        available = await source.isAvailable();
      } catch {
        // nicht verfuegbar
      }
      const entry = {
        enabled: config.enabled || false,
        ...source.getConfig(),
        lastChecked: config.lastChecked || null,
        available,
      };

      // Passwort maskieren
      if (type === "fritzbox" || type === "icloud") {
        entry.password = config.password ? "********" : "";
      }

      // iCloud authState hinzufuegen
      if (type === "icloud" && typeof source.getAuthState === "function") {
        entry.authState = source.getAuthState();
      }

      result[type] = entry;
    }
    return result;
  }

  async updateSourceConfig(type, newConfig) {
    const source = this.sources.get(type);
    if (!source) {
      throw new Error(`Unbekannter Quellentyp: ${type}`);
    }

    if (!this.config[type]) {
      this.config[type] = JSON.parse(
        JSON.stringify(DEFAULT_CONFIG[type] || DEFAULT_CONFIG.usb),
      );
    }

    // Passwort-Handling fuer FRITZ!Box und iCloud
    if (
      (type === "fritzbox" || type === "icloud") &&
      newConfig.password !== undefined
    ) {
      if (newConfig.password === "********") {
        // Bestehendes Passwort beibehalten
        delete newConfig.password;
      } else if (newConfig.password !== "") {
        // Neues Passwort Base64-kodieren
        newConfig.password = encodeCredential(newConfig.password);
      }
    }

    // Konfiguration zusammenfuehren
    Object.assign(this.config[type], newConfig);

    // Instanz aktualisieren
    if (source.updateConfig) {
      source.updateConfig(this.config[type]);
    }

    this.saveConfig();
  }

  async testSource(type) {
    const source = this.sources.get(type);
    if (!source) {
      throw new Error(`Unbekannter Quellentyp: ${type}`);
    }

    if (typeof source.testConnection !== "function") {
      throw new Error(
        `Dateiquelle '${type}' unterstuetzt keinen Verbindungstest.`,
      );
    }

    return source.testConnection();
  }

  async scanSource(type) {
    const source = this.sources.get(type);
    if (!source) {
      throw new Error(`Unbekannter Quellentyp: ${type}`);
    }

    const config = this.config[type];
    if (!config || !config.enabled) {
      throw new Error(`Dateiquelle '${type}' ist nicht aktiviert.`);
    }

    const available = await source.isAvailable();
    if (!available) {
      const cfg = source.getConfig();
      const target = cfg.mountPoint || cfg.host || type;
      throw new Error(`Dateiquelle '${type}' nicht verfuegbar (${target}).`);
    }

    const files = await source.listFiles();
    const checkedAt = new Date().toISOString();

    // Checksums berechnen
    const fileHashes = {};
    for (const file of files) {
      try {
        fileHashes[file.name] = await source.getChecksum(file.path);
      } catch {
        // Datei nicht lesbar -- ueberspringen
      }
    }

    // Konfiguration aktualisieren
    this.config[type].lastChecked = checkedAt;
    this.config[type].files = fileHashes;
    this.saveConfig();

    // Scan-Ergebnis cachen
    this.lastScanResults.set(type, { files, checkedAt });

    return { files, checkedAt };
  }

  getLastScanResult(type) {
    return this.lastScanResults.get(type) || { files: [], checkedAt: null };
  }

  async importFile(type, fileName, scheduleManager) {
    const source = this.sources.get(type);
    if (!source) {
      throw new Error(`Unbekannter Quellentyp: ${type}`);
    }

    // Datei finden
    const scanResult = this.lastScanResults.get(type);
    if (!scanResult || !scanResult.files) {
      throw new Error("Bitte zuerst einen Scan durchfuehren.");
    }

    const fileInfo = scanResult.files.find((f) => f.name === fileName);
    if (!fileInfo) {
      throw new Error(`Datei '${fileName}' nicht gefunden.`);
    }

    // Datei lesen und temporaer speichern
    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const tmpPath = path.join(uploadsDir, `source-${Date.now()}-${fileName}`);

    try {
      const buffer = await source.readFile(fileInfo.path);
      fs.writeFileSync(tmpPath, buffer);

      // Parsen
      const parser = new SpreadsheetParser();
      const data = parser.parse(tmpPath);

      // Checksum berechnen
      const checksum = await source.getChecksum(fileInfo.path);

      // Source-Objekt
      const sourceObj = {
        type,
        fileName,
        lastChecksum: checksum,
        importedAt: new Date().toISOString(),
      };

      // Zeitplan-Name (ohne Dateiendung)
      const scheduleName = path.basename(fileName, path.extname(fileName));

      // Pruefen ob bereits ein Zeitplan von dieser Quelle existiert
      const existing = scheduleManager.findScheduleBySource(type, fileName);

      let schedule;
      let action;

      if (existing) {
        schedule = scheduleManager.updateSchedule(existing.id, data, sourceObj);
        action = "updated";
      } else {
        schedule = scheduleManager.createSchedule(
          scheduleName,
          data,
          sourceObj,
        );
        action = "created";
      }

      logger.info(
        `Datei '${fileName}' von ${type} importiert (${action}): ${data.length} Eintraege`,
      );

      return {
        scheduleId: schedule.id,
        action,
        entries: data.length,
      };
    } finally {
      // Temporaere Datei aufraeumen
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    }
  }
}

export default FileSourceManager;
