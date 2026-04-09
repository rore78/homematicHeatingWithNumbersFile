import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import HeatingProfile from "./heatingProfile.js";
import AreaManager from "../areas/areaManager.js";
import logger from "../utils/logger.js";

const SCHEDULES_DIR = path.join(process.cwd(), "schedules");

/**
 * Zeitplan-Manager
 * Verwaltet Heizungszeitpläne mit Datum/Zeit-basierten Zeiträumen
 */
export class ScheduleManager {
  constructor(deviceController = null) {
    this.deviceController = deviceController;
    this.heatingProfile = new HeatingProfile();
    this.areaManager = new AreaManager();
    this.schedules = {};
    this.activeSchedules = new Set();
    this.checkInterval = null;
    this.lastCheckTime = new Date();

    // Erstelle schedules Verzeichnis falls nicht vorhanden
    if (!fs.existsSync(SCHEDULES_DIR)) {
      fs.mkdirSync(SCHEDULES_DIR, { recursive: true });
    }

    this.loadAllSchedules();
    this.startScheduler();
  }

  /**
   * Lädt alle gespeicherten Zeitpläne
   */
  loadAllSchedules() {
    try {
      if (!fs.existsSync(SCHEDULES_DIR)) {
        return;
      }

      const files = fs.readdirSync(SCHEDULES_DIR);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(SCHEDULES_DIR, file);
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
    const filePath = path.join(SCHEDULES_DIR, `${schedule.id}.json`);
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
          s.source &&
          s.source.type === type &&
          s.source.fileName === fileName,
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
    this.saveSchedule(schedule);

    return true;
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

    const filePath = path.join(SCHEDULES_DIR, `${id}.json`);
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
   * Prüft und führt Aktionen aus
   */
  async checkAndExecute() {
    if (!this.deviceController) {
      return;
    }

    const now = new Date();
    const lastCheck = this.lastCheckTime;
    this.lastCheckTime = now;

    for (const scheduleId of this.activeSchedules) {
      const schedule = this.schedules[scheduleId];
      if (!schedule || !schedule.active) {
        continue;
      }

      for (const area of schedule.areas) {
        for (const scheduleItem of area.schedule) {
          const startTime = new Date(scheduleItem.startDateTime);
          const endTime = new Date(scheduleItem.endDateTime);
          const controlMode = scheduleItem.controlMode || "temperature";

          if (now >= startTime && now <= endTime) {
            for (const deviceId of area.devices) {
              try {
                if (controlMode === "deviceProfile") {
                  await this.deviceController.setHeatingProfile(
                    deviceId,
                    scheduleItem.deviceProfile,
                  );
                } else {
                  await this.deviceController.setTemperature(
                    deviceId,
                    scheduleItem.temperature,
                  );
                }
              } catch (error) {
                logger.error(
                  `Fehler beim Steuern von Geraet ${deviceId}: ${error.message}`,
                );
              }
            }
          }

          // Profil-Zuruecksetzung: wenn deviceProfile-Zeitfenster gerade geendet hat
          if (controlMode === "deviceProfile") {
            const justEnded = endTime > lastCheck && endTime <= now;
            const noActiveWindow = !area.schedule.some((item) => {
              const s = new Date(item.startDateTime);
              const e = new Date(item.endDateTime);
              return now >= s && now <= e;
            });

            if (justEnded && noActiveWindow) {
              for (const deviceId of area.devices) {
                try {
                  await this.deviceController.setHeatingProfile(deviceId, 1);
                } catch (error) {
                  logger.error(
                    `Fehler beim Zuruecksetzen auf Profil 1 fuer Geraet ${deviceId}: ${error.message}`,
                  );
                }
              }
            }
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
