import fs from "fs";
import path from "path";
import logger from "../utils/logger.js";

/**
 * Konfigurationsverwaltung fuer Homematic IP Addon
 * Unterstuetzt Cloud- und HCU-Konfiguration (Connect API)
 */
export class Config {
  constructor(config = {}) {
    // Cloud-Konfiguration
    this.cloud = {
      accessPointSGTIN:
        config.cloud?.accessPointSGTIN ||
        process.env.HOMEMATIC_IP_ACCESS_POINT_SGTIN ||
        null,
      authToken:
        config.cloud?.authToken || process.env.HOMEMATIC_IP_AUTH_TOKEN || null,
      clientId:
        config.cloud?.clientId || process.env.HOMEMATIC_IP_CLIENT_ID || null,
      clientSecret:
        config.cloud?.clientSecret ||
        process.env.HOMEMATIC_IP_CLIENT_SECRET ||
        null,
      apiUrl:
        config.cloud?.apiUrl ||
        process.env.HOMEMATIC_IP_API_URL ||
        "https://ps1.homematic.com:6969",
    };

    // HCU Connect API Konfiguration
    this.hcu = {
      host:
        config.hcu?.host ||
        process.env.HOMEMATIC_HCU_HOST ||
        "host.containers.internal",
      port:
        config.hcu?.port || parseInt(process.env.HOMEMATIC_HCU_PORT || "9001"),
      pluginId:
        config.hcu?.pluginId ||
        process.env.HOMEMATIC_PLUGIN_ID ||
        "com.redlberger.hmip.heizungssteuerung",
      authToken:
        config.hcu?.authToken || process.env.HOMEMATIC_AUTH_TOKEN || null,
    };

    // Verbindungsmodus
    this.mode = config.mode || process.env.HOMEMATIC_MODE || "auto"; // 'cloud', 'hcu', 'auto'
  }

  /**
   * Laedt Konfiguration aus einer JSON-Datei
   * @param {string} configPath - Pfad zur Konfigurationsdatei
   * @returns {Config} - Config-Instanz
   */
  static fromFile(configPath) {
    try {
      const fullPath = path.resolve(configPath);
      if (fs.existsSync(fullPath)) {
        const configData = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        return new Config(configData);
      }
    } catch (error) {
      logger.warn(
        `Konfigurationsdatei konnte nicht geladen werden: ${error.message}`,
      );
    }
    return new Config();
  }

  /**
   * Prueft ob Cloud-Konfiguration vorhanden ist
   * @returns {boolean}
   */
  hasCloudConfig() {
    return !!(this.cloud.accessPointSGTIN || this.cloud.authToken);
  }

  /**
   * Prueft ob HCU-Konfiguration vorhanden ist
   * @returns {boolean}
   */
  hasHcuConfig() {
    return !!(
      this.hcu.host &&
      (this.hcu.authToken || this._hasContainerToken())
    );
  }

  /**
   * Prueft ob ein Container-Token vorhanden ist (/TOKEN Datei)
   * @returns {boolean}
   * @private
   */
  _hasContainerToken() {
    try {
      return fs.existsSync("/TOKEN");
    } catch {
      return false;
    }
  }

  /**
   * Bestimmt den zu verwendenden Modus
   * @returns {string|null} - 'cloud', 'hcu' oder null
   */
  getMode() {
    if (this.mode === "cloud" && this.hasCloudConfig()) {
      return "cloud";
    }
    if (this.mode === "hcu" && this.hasHcuConfig()) {
      return "hcu";
    }
    if (this.mode === "auto") {
      if (this.hasHcuConfig()) return "hcu";
      if (this.hasCloudConfig()) return "cloud";
    }
    return null;
  }

  /**
   * Validiert die Konfiguration
   * @returns {object} - { valid: boolean, errors: string[] }
   */
  validate() {
    const errors = [];
    const mode = this.getMode();

    if (!mode) {
      errors.push(
        "Keine gueltige Konfiguration gefunden. Bitte Cloud- oder HCU-Konfiguration angeben.",
      );
    }

    if (mode === "cloud") {
      if (!this.cloud.accessPointSGTIN && !this.cloud.authToken) {
        errors.push(
          "Cloud-Konfiguration: accessPointSGTIN oder authToken erforderlich",
        );
      }
    }

    if (mode === "hcu") {
      if (!this.hcu.host) {
        errors.push("HCU-Konfiguration: host erforderlich");
      }
      if (!this.hcu.authToken && !this._hasContainerToken()) {
        errors.push(
          "HCU-Konfiguration: authToken oder /TOKEN Datei erforderlich",
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export default Config;
