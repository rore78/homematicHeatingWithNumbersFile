import fs from "fs";
import path from "path";
import crypto from "crypto";
import logger from "../utils/logger.js";
import SpreadsheetParser from "../parser/spreadsheetParser.js";

const PUSH_CONFIG_FILE = path.join(process.cwd(), "push-config.json");

const DEFAULT_CONFIG = {
  enabled: false,
  apiKey: "",
  lastUpload: null,
  lastUploadFile: null,
};

/**
 * PushManager
 * Verwaltet den generischen Push-Endpunkt fuer Datei-Uploads via HTTP.
 */
export class PushManager {
  constructor(configFilePath = PUSH_CONFIG_FILE) {
    this.configFilePath = configFilePath;
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.configFilePath, "utf8"));
        return { ...JSON.parse(JSON.stringify(DEFAULT_CONFIG)), ...data };
      }
    } catch (error) {
      logger.warn(`Fehler beim Laden der Push-Konfiguration: ${error.message}`);
    }
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  saveConfig() {
    fs.writeFileSync(
      this.configFilePath,
      JSON.stringify(this.config, null, 2),
      "utf8",
    );
  }

  generateApiKey() {
    return crypto.randomBytes(32).toString("hex");
  }

  enable() {
    this.config.enabled = true;
    if (!this.config.apiKey) {
      this.config.apiKey = this.generateApiKey();
    }
    this.saveConfig();
  }

  disable() {
    this.config.enabled = false;
    this.saveConfig();
  }

  regenerateKey() {
    this.config.apiKey = this.generateApiKey();
    this.saveConfig();
    return this.config.apiKey;
  }

  validateApiKey(key) {
    if (!this.config.enabled) return false;
    if (!this.config.apiKey) return false;
    return key === this.config.apiKey;
  }

  getConfig() {
    return {
      enabled: this.config.enabled,
      apiKey: this.config.apiKey,
      endpoint: "/api/push/upload",
      lastUpload: this.config.lastUpload,
      lastUploadFile: this.config.lastUploadFile,
    };
  }

  async handleUpload(filePath, originalName, scheduleManager) {
    const parser = new SpreadsheetParser();
    const data = parser.parse(filePath);

    const content = fs.readFileSync(filePath);
    const checksum = crypto.createHash("md5").update(content).digest("hex");

    const sourceObj = {
      type: "push",
      fileName: originalName,
      lastChecksum: checksum,
      importedAt: new Date().toISOString(),
    };

    const scheduleName = path.basename(
      originalName,
      path.extname(originalName),
    );

    const existing = scheduleManager.findScheduleBySource("push", originalName);

    let schedule;
    let action;

    if (existing) {
      schedule = scheduleManager.updateSchedule(existing.id, data, sourceObj);
      action = "updated";
    } else {
      schedule = scheduleManager.createSchedule(scheduleName, data, sourceObj);
      action = "created";
    }

    this.config.lastUpload = new Date().toISOString();
    this.config.lastUploadFile = originalName;
    this.saveConfig();

    logger.info(
      `Push-Upload '${originalName}' (${action}): ${data.length} Eintraege`,
    );

    return {
      scheduleId: schedule.id,
      action,
      entries: data.length,
    };
  }
}

export default PushManager;
