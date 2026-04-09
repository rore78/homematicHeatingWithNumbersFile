import fs from "fs";
import path from "path";
import logger from "../utils/logger.js";

const ALLOWED_INTERVALS = [15, 30, 60, 120, 360];
const MAX_CONSECUTIVE_ERRORS = 5;
const MAX_LOG_ENTRIES = 50;

const DEFAULT_STATUS = {
  enabled: true,
  intervalMinutes: 60,
  sources: {},
  log: [],
};

/**
 * PollingEngine
 * Prueft periodisch alle aktivierten Dateiquellen auf Aenderungen
 * und importiert automatisch bei Pruefsummen-Aenderungen.
 */
export class PollingEngine {
  constructor(
    fileSourceManager,
    scheduleManager,
    statusFilePath = path.join(process.cwd(), "polling-status.json"),
  ) {
    this.fileSourceManager = fileSourceManager;
    this.scheduleManager = scheduleManager;
    this.statusFilePath = statusFilePath;
    this.timer = null;
    this.isRunning = false;
    this.startedAt = null;
    this.status = this.loadStatus();
  }

  loadStatus() {
    try {
      if (fs.existsSync(this.statusFilePath)) {
        const data = JSON.parse(
          fs.readFileSync(this.statusFilePath, "utf8"),
        );
        return { ...JSON.parse(JSON.stringify(DEFAULT_STATUS)), ...data };
      }
    } catch (error) {
      logger.warn(
        `Fehler beim Laden des Polling-Status: ${error.message}`,
      );
    }
    return JSON.parse(JSON.stringify(DEFAULT_STATUS));
  }

  saveStatus() {
    try {
      fs.writeFileSync(
        this.statusFilePath,
        JSON.stringify(this.status, null, 2),
        "utf8",
      );
    } catch (error) {
      logger.error(
        `Fehler beim Speichern des Polling-Status: ${error.message}`,
      );
    }
  }

  start() {
    this.status = this.loadStatus();

    if (!this.status.enabled) {
      logger.debug("Polling ist deaktiviert.");
      return;
    }

    // Pruefen ob mindestens eine Quelle aktiviert ist
    const sources = this.fileSourceManager.sources;
    let hasEnabledSource = false;
    for (const [type] of sources) {
      const cfg = this.fileSourceManager.config[type];
      if (cfg && cfg.enabled) {
        hasEnabledSource = true;
        break;
      }
    }

    if (!hasEnabledSource) {
      logger.debug("Polling: Keine aktivierte Quelle gefunden.");
      return;
    }

    const intervalMs = this.status.intervalMinutes * 60 * 1000;
    this.timer = setInterval(() => this.pollCycle(), intervalMs);
    this.startedAt = new Date();

    logger.info(
      `Polling gestartet (Intervall: ${this.status.intervalMinutes} Minuten)`,
    );
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.startedAt = null;
    logger.debug("Polling gestoppt");
  }

  restart() {
    this.stop();
    this.start();
  }

  async pollCycle() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const sources = this.fileSourceManager.sources;
      for (const [type] of sources) {
        const cfg = this.fileSourceManager.config[type];
        if (!cfg || !cfg.enabled) continue;

        try {
          await this.pollSource(type);
        } catch (error) {
          logger.error(
            `Polling-Fehler fuer '${type}': ${error.message}`,
          );
        }
      }
    } finally {
      this.isRunning = false;
      this.saveStatus();
    }
  }

  async pollSource(type) {
    if (!this.status.sources[type]) {
      this.status.sources[type] = {
        lastChecked: null,
        lastChanged: null,
        consecutiveErrors: 0,
        lastError: null,
        lastErrorAt: null,
      };
    }

    const sourceStatus = this.status.sources[type];

    // Scan ausfuehren
    let scanResult;
    try {
      scanResult = await this.fileSourceManager.scanSource(type);
    } catch (error) {
      sourceStatus.consecutiveErrors++;
      sourceStatus.lastError = error.message;
      sourceStatus.lastErrorAt = new Date().toISOString();

      this.addLogEntry({
        type: "error",
        source: type,
        message: `${error.message} (Fehler ${sourceStatus.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`,
        details: {
          error: error.message,
          consecutiveErrors: sourceStatus.consecutiveErrors,
        },
      });

      if (sourceStatus.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        await this.fileSourceManager.updateSourceConfig(type, {
          enabled: false,
        });
        this.addLogEntry({
          type: "disabled",
          source: type,
          message: `Quelle nach ${MAX_CONSECUTIVE_ERRORS} Fehlern automatisch deaktiviert.`,
          details: {},
        });
      }
      return [];
    }

    // Erfolg -- Fehler zuruecksetzen
    sourceStatus.consecutiveErrors = 0;
    sourceStatus.lastError = null;
    sourceStatus.lastChecked = new Date().toISOString();

    // Pruefsummen vergleichen
    const previousFiles = this.fileSourceManager.config[type]?.files || {};
    const currentFiles = {};
    for (const file of scanResult.files) {
      try {
        const source = this.fileSourceManager.getSource(type);
        currentFiles[file.name] = await source.getChecksum(file.path);
      } catch {
        // Datei nicht lesbar
      }
    }

    const changes = [];

    // Neue oder geaenderte Dateien
    for (const [fileName, checksum] of Object.entries(currentFiles)) {
      const previousChecksum = previousFiles[fileName];
      if (previousChecksum !== checksum) {
        try {
          const result = await this.fileSourceManager.importFile(
            type,
            fileName,
            this.scheduleManager,
          );
          sourceStatus.lastChanged = new Date().toISOString();

          const logType = previousChecksum ? "change" : "import";
          this.addLogEntry({
            type: logType,
            source: type,
            message: `Datei '${fileName}' ${logType === "import" ? "neu importiert" : "geaendert, Import durchgefuehrt"}.`,
            details: {
              fileName,
              action: result.action,
              scheduleId: result.scheduleId,
            },
          });

          changes.push({
            source: type,
            fileName,
            action: result.action,
          });
        } catch (error) {
          this.addLogEntry({
            type: "error",
            source: type,
            message: `Fehler beim Import von '${fileName}': ${error.message}`,
            details: { fileName, error: error.message },
          });
        }
      }
    }

    // Fehlende Dateien erkennen
    for (const previousFileName of Object.keys(previousFiles)) {
      if (!currentFiles[previousFileName]) {
        const schedule = this.scheduleManager.findScheduleBySource(
          type,
          previousFileName,
        );
        if (schedule && schedule.source) {
          schedule.source.unavailable = true;
          this.scheduleManager.saveSchedule(schedule);

          this.addLogEntry({
            type: "source_missing",
            source: type,
            message: `Datei '${previousFileName}' nicht mehr gefunden. Zeitplan bleibt aktiv.`,
            details: { fileName: previousFileName },
          });
        }
      }
    }

    // Dateien die wieder da sind
    for (const fileName of Object.keys(currentFiles)) {
      const schedule = this.scheduleManager.findScheduleBySource(
        type,
        fileName,
      );
      if (schedule && schedule.source && schedule.source.unavailable) {
        schedule.source.unavailable = false;
        this.scheduleManager.saveSchedule(schedule);
      }
    }

    return changes;
  }

  async triggerPoll(type = null) {
    const changes = [];

    if (type) {
      const result = await this.pollSource(type);
      changes.push(...(result || []));
    } else {
      await this.pollCycle();
      // Changes are logged but not returned from pollCycle directly
    }

    this.saveStatus();
    this.restart();

    return {
      sourcesChecked: type ? [type] : [...this.fileSourceManager.sources.keys()],
      changes,
    };
  }

  updateConfig(config) {
    if (config.enabled !== undefined) {
      this.status.enabled = !!config.enabled;
    }
    if (config.intervalMinutes !== undefined) {
      if (!ALLOWED_INTERVALS.includes(config.intervalMinutes)) {
        throw new Error(
          `Ungueltiges Intervall: ${config.intervalMinutes}. Erlaubt: ${ALLOWED_INTERVALS.join(", ")} Minuten.`,
        );
      }
      this.status.intervalMinutes = config.intervalMinutes;
    }
    this.saveStatus();
    this.restart();
  }

  getStatus() {
    let nextPoll = null;
    if (this.timer && this.startedAt) {
      const intervalMs = this.status.intervalMinutes * 60 * 1000;
      nextPoll = new Date(this.startedAt.getTime() + intervalMs).toISOString();
    }

    return {
      enabled: this.status.enabled,
      intervalMinutes: this.status.intervalMinutes,
      running: this.isRunning,
      nextPoll,
      sources: this.status.sources,
    };
  }

  getLog(limit = MAX_LOG_ENTRIES) {
    const max = Math.min(parseInt(limit) || MAX_LOG_ENTRIES, MAX_LOG_ENTRIES);
    return this.status.log.slice(0, max);
  }

  addLogEntry(entry) {
    this.status.log.unshift({
      timestamp: new Date().toISOString(),
      ...entry,
    });
    if (this.status.log.length > MAX_LOG_ENTRIES) {
      this.status.log = this.status.log.slice(0, MAX_LOG_ENTRIES);
    }
  }
}

export default PollingEngine;
