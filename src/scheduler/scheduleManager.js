import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import HeatingProfile from "./heatingProfile.js";
import AreaManager from "../areas/areaManager.js";
import logger from "../utils/logger.js";

function describeAction(scheduleItem) {
  if (!scheduleItem) return null;
  const controlMode = scheduleItem.controlMode || "temperature";
  if (controlMode === "deviceProfile") {
    return { kind: "profile", value: scheduleItem.deviceProfile };
  }
  return { kind: "temperature", value: scheduleItem.temperature };
}

function sameAction(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.value === b.value;
}

/**
 * Zeitplan-Manager
 * Verwaltet Heizungszeitplaene mit Datum/Zeit-basierten Zeitraeumen.
 * Speicherort standardmaessig DATA_DIR/schedules/ (oder process.cwd()/schedules).
 */
export class ScheduleManager {
  constructor(deviceController = null, options = {}) {
    this.deviceController = deviceController;
    this.schedulesDir =
      options.schedulesDir ||
      path.join(process.env.DATA_DIR || process.cwd(), "schedules");
    this.heatingProfile = options.heatingProfile || new HeatingProfile();
    this.areaManager = options.areaManager || new AreaManager();
    this.schedules = {};
    this.activeSchedules = new Set();
    this.checkInterval = null;
    this.lastCheckTime = new Date();
    // Letzte angewendete Aktion je (scheduleId|areaIdx|deviceId).
    // Wir schreiben nur bei tatsaechlicher Aenderung an die HCU, damit
    // parallel laufende Heizungs-Plugins (z.B. Heizungsautomatic) nicht
    // alle 60 Sekunden ueberschrieben werden.
    this.lastApplied = new Map();

    // Erstelle schedules Verzeichnis falls nicht vorhanden
    if (!fs.existsSync(this.schedulesDir)) {
      fs.mkdirSync(this.schedulesDir, { recursive: true });
    }

    this.loadAllSchedules();
    this.startScheduler();
  }

  /**
   * Lädt alle gespeicherten Zeitpläne
   */
  loadAllSchedules() {
    try {
      if (!fs.existsSync(this.schedulesDir)) {
        return;
      }

      const files = fs.readdirSync(this.schedulesDir);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(this.schedulesDir, file);
          const data = fs.readFileSync(filePath, "utf8");
          const schedule = JSON.parse(data);
          this.schedules[schedule.id] = schedule;

          if (schedule.active) {
            this.activeSchedules.add(schedule.id);
          }
        } catch (error) {
          logger.warn(
            `Fehler beim Laden von Zeitplan ${file}: ${error.message}`,
          );
        }
      }
    } catch (error) {
      logger.warn(`Fehler beim Laden der Zeitpläne: ${error.message}`);
    }
  }

  /**
   * Speichert einen Zeitplan
   * @param {object} schedule - Zeitplan-Objekt
   */
  saveSchedule(schedule) {
    const filePath = path.join(this.schedulesDir, `${schedule.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(schedule, null, 2), "utf8");
  }

  /**
   * Erstellt einen neuen Zeitplan
   * @param {string} name - Zeitplan-Name
   * @param {Array<object>} scheduleData - Zeitplan-Daten aus Parser
   * @returns {object} - Erstellter Zeitplan
   */
  createSchedule(name, scheduleData, source = null) {
    const id = uuidv4();

    // Gruppiere nach Bereichen
    const areasMap = {};

    for (const row of scheduleData) {
      const areaName = row.area;
      if (!areasMap[areaName]) {
        // Auflöse Bereich zu Geräten
        const deviceIds = this.areaManager.resolveDevices(areaName);
        areasMap[areaName] = {
          areaName,
          devices: deviceIds,
          schedule: [],
        };
      }

      // Bestimme Temperatur (aus Profil oder direkt)
      let temperature = row.temperature;
      if (row.profile) {
        try {
          temperature = this.heatingProfile.getTemperature(
            row.profile,
            row.temperature,
          );
        } catch (_e) {
          // Verwende direkte Temperatur wenn Profil nicht gefunden
        }
      }

      areasMap[areaName].schedule.push({
        startDateTime: row.startDateTime,
        endDateTime: row.endDateTime,
        temperature,
        profile: row.profile || null,
        deviceProfile: row.deviceProfile ?? null,
        controlMode: row.controlMode ?? "temperature",
        notes: row.notes || null,
      });
    }

    const schedule = {
      id,
      name,
      areas: Object.values(areasMap),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      active: false,
    };

    if (source) {
      schedule.source = source;
    }

    this.schedules[id] = schedule;
    this.saveSchedule(schedule);

    return schedule;
  }

  /**
   * Ruft einen Zeitplan ab
   * @param {string} id - Zeitplan-ID
   * @returns {object|null}
   */
  getSchedule(id) {
    return this.schedules[id] || null;
  }

  /**
   * Ruft alle Zeitpläne ab
   * @returns {Array<object>}
   */
  getAllSchedules() {
    return Object.values(this.schedules);
  }

  findScheduleBySource(type, fileName) {
    return (
      Object.values(this.schedules).find(
        (s) =>
          s.source && s.source.type === type && s.source.fileName === fileName,
      ) || null
    );
  }

  updateSchedule(id, scheduleData, source = null) {
    const existing = this.schedules[id];
    if (!existing) return null;

    // Gruppiere nach Bereichen (gleiche Logik wie createSchedule)
    const areasMap = {};
    for (const row of scheduleData) {
      const areaName = row.area;
      if (!areasMap[areaName]) {
        const deviceIds = this.areaManager.resolveDevices(areaName);
        areasMap[areaName] = { areaName, devices: deviceIds, schedule: [] };
      }
      let temperature = row.temperature;
      if (row.profile) {
        try {
          temperature = this.heatingProfile.getTemperature(
            row.profile,
            row.temperature,
          );
        } catch (_e) {
          // Verwende direkte Temperatur wenn Profil nicht gefunden
        }
      }
      areasMap[areaName].schedule.push({
        startDateTime: row.startDateTime,
        endDateTime: row.endDateTime,
        temperature,
        profile: row.profile || null,
        deviceProfile: row.deviceProfile ?? null,
        controlMode: row.controlMode ?? "temperature",
        notes: row.notes || null,
      });
    }

    existing.areas = Object.values(areasMap);
    existing.updatedAt = new Date().toISOString();
    if (source) {
      existing.source = source;
    }

    this._clearAppliedFor(id);
    this.saveSchedule(existing);
    return existing;
  }

  /**
   * Aktiviert einen Zeitplan
   * @param {string} id - Zeitplan-ID
   * @returns {boolean}
   */
  activateSchedule(id) {
    const schedule = this.schedules[id];
    if (!schedule) {
      return false;
    }

    schedule.active = true;
    schedule.updatedAt = new Date().toISOString();
    this.activeSchedules.add(id);
    this.saveSchedule(schedule);

    // Prüfe sofort ob Aktionen ausgeführt werden müssen
    this.checkAndExecute();

    return true;
  }

  /**
   * Deaktiviert einen Zeitplan
   * @param {string} id - Zeitplan-ID
   * @returns {boolean}
   */
  deactivateSchedule(id) {
    const schedule = this.schedules[id];
    if (!schedule) {
      return false;
    }

    schedule.active = false;
    schedule.updatedAt = new Date().toISOString();
    this.activeSchedules.delete(id);
    this._clearAppliedFor(id);
    this.saveSchedule(schedule);

    return true;
  }

  _clearAppliedFor(scheduleId) {
    const prefix = `${scheduleId}|`;
    for (const key of this.lastApplied.keys()) {
      if (key.startsWith(prefix)) {
        this.lastApplied.delete(key);
      }
    }
  }

  /**
   * Löscht einen Zeitplan
   * @param {string} id - Zeitplan-ID
   * @returns {boolean}
   */
  deleteSchedule(id) {
    const schedule = this.schedules[id];
    if (!schedule) {
      return false;
    }

    this.deactivateSchedule(id);
    delete this.schedules[id];

    const filePath = path.join(this.schedulesDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return true;
  }

  /**
   * Startet den Scheduler (prüft regelmäßig auf auszuführende Aktionen)
   */
  startScheduler() {
    // Prüfe alle 60 Sekunden
    this.checkInterval = setInterval(() => {
      this.checkAndExecute();
    }, 60000);

    // Prüfe sofort beim Start
    this.checkAndExecute();
  }

  /**
   * Stoppt den Scheduler
   */
  stopScheduler() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  getActiveCount() {
    return this.activeSchedules.size;
  }

  /**
   * Prüft und führt Aktionen aus.
   *
   * Schreibt pro Geraet nur bei Aenderung der gewuenschten Aktion gegenueber
   * dem letzten Lauf. So koennen wir koexistieren mit Heizungs-Plugins, die
   * dieselben Gruppen steuern, ohne deren Setpoints alle 60 Sekunden zu
   * ueberschreiben.
   */
  async checkAndExecute() {
    if (!this.deviceController) {
      return;
    }

    const now = new Date();
    this.lastCheckTime = now;

    for (const scheduleId of this.activeSchedules) {
      const schedule = this.schedules[scheduleId];
      if (!schedule || !schedule.active) {
        continue;
      }

      for (let areaIdx = 0; areaIdx < schedule.areas.length; areaIdx++) {
        const area = schedule.areas[areaIdx];

        const activeItem = area.schedule.find((item) => {
          const s = new Date(item.startDateTime);
          const e = new Date(item.endDateTime);
          return now >= s && now <= e;
        });

        const desired = describeAction(activeItem);

        for (const deviceId of area.devices) {
          const key = `${scheduleId}|${areaIdx}|${deviceId}`;
          const previous = this.lastApplied.get(key) || null;

          if (sameAction(previous, desired)) {
            continue;
          }

          try {
            if (desired) {
              if (desired.kind === "profile") {
                await this.deviceController.setHeatingProfile(
                  deviceId,
                  desired.value,
                );
              } else {
                await this.deviceController.setTemperature(
                  deviceId,
                  desired.value,
                );
              }
            } else if (previous && previous.kind === "profile") {
              // deviceProfile-Fenster gerade beendet -> zurueck auf Profil 1.
              // Bei Temperaturfenstern lassen wir den Setpoint stehen und
              // ueberlassen einem ggf. parallelen Plugin die weitere Steuerung.
              await this.deviceController.setHeatingProfile(deviceId, 1);
            }

            this.lastApplied.set(key, desired);
          } catch (error) {
            logger.error(
              `Fehler beim Steuern von Geraet ${deviceId}: ${error.message}`,
            );
          }
        }
      }
    }
  }

  /**
   * Setzt den DeviceController
   * @param {object} deviceController - DeviceController Instanz
   */
  setDeviceController(deviceController) {
    this.deviceController = deviceController;
  }
}

export default ScheduleManager;
