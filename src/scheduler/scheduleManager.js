import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import HeatingProfile from './heatingProfile.js';
import AreaManager from '../areas/areaManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEDULES_DIR = path.join(process.cwd(), 'schedules');

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
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(SCHEDULES_DIR, file);
          const data = fs.readFileSync(filePath, 'utf8');
          const schedule = JSON.parse(data);
          this.schedules[schedule.id] = schedule;
          
          if (schedule.active) {
            this.activeSchedules.add(schedule.id);
          }
        } catch (error) {
          console.warn(`Fehler beim Laden von Zeitplan ${file}: ${error.message}`);
        }
      }
    } catch (error) {
      console.warn(`Fehler beim Laden der Zeitpläne: ${error.message}`);
    }
  }

  /**
   * Speichert einen Zeitplan
   * @param {object} schedule - Zeitplan-Objekt
   */
  saveSchedule(schedule) {
    const filePath = path.join(SCHEDULES_DIR, `${schedule.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(schedule, null, 2), 'utf8');
  }

  /**
   * Erstellt einen neuen Zeitplan
   * @param {string} name - Zeitplan-Name
   * @param {Array<object>} scheduleData - Zeitplan-Daten aus Parser
   * @returns {object} - Erstellter Zeitplan
   */
  createSchedule(name, scheduleData) {
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
          schedule: []
        };
      }

      // Bestimme Temperatur (aus Profil oder direkt)
      let temperature = row.temperature;
      if (row.profile) {
        try {
          temperature = this.heatingProfile.getTemperature(row.profile, row.temperature);
        } catch (e) {
          // Verwende direkte Temperatur wenn Profil nicht gefunden
        }
      }

      areasMap[areaName].schedule.push({
        startDateTime: row.startDateTime,
        endDateTime: row.endDateTime,
        temperature,
        profile: row.profile || null,
        notes: row.notes || null
      });
    }

    const schedule = {
      id,
      name,
      areas: Object.values(areasMap),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      active: false
    };

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

  /**
   * Prüft und führt Aktionen aus
   */
  async checkAndExecute() {
    if (!this.deviceController) {
      return; // Kein DeviceController verfügbar
    }

    const now = new Date();

    for (const scheduleId of this.activeSchedules) {
      const schedule = this.schedules[scheduleId];
      if (!schedule || !schedule.active) {
        continue;
      }

      for (const area of schedule.areas) {
        for (const scheduleItem of area.schedule) {
          const startTime = new Date(scheduleItem.startDateTime);
          const endTime = new Date(scheduleItem.endDateTime);

          // Prüfe ob wir im Zeitraum sind
          if (now >= startTime && now <= endTime) {
            // Setze Temperatur für alle Geräte im Bereich
            for (const deviceId of area.devices) {
              try {
                await this.deviceController.setTemperature(
                  deviceId,
                  scheduleItem.temperature
                );
              } catch (error) {
                console.error(
                  `Fehler beim Setzen der Temperatur für Gerät ${deviceId}: ${error.message}`
                );
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

