import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Konfigurationsverwaltung für Homematic IP Addon
 * Unterstützt sowohl Cloud- als auch lokale CCU-Konfiguration
 */
export class Config {
  constructor(config = {}) {
    // Cloud-Konfiguration
    this.cloud = {
      accessPointSGTIN: config.cloud?.accessPointSGTIN || process.env.HOMEMATIC_IP_ACCESS_POINT_SGTIN || null,
      authToken: config.cloud?.authToken || process.env.HOMEMATIC_IP_AUTH_TOKEN || null,
      clientId: config.cloud?.clientId || process.env.HOMEMATIC_IP_CLIENT_ID || null,
      clientSecret: config.cloud?.clientSecret || process.env.HOMEMATIC_IP_CLIENT_SECRET || null,
      apiUrl: config.cloud?.apiUrl || process.env.HOMEMATIC_IP_API_URL || 'https://ps1.homematic.com:6969'
    };

    // Lokale CCU-Konfiguration
    this.local = {
      host: config.local?.host || process.env.HOMEMATIC_CCU_HOST || '192.168.1.100',
      port: config.local?.port || parseInt(process.env.HOMEMATIC_CCU_PORT || '2001'),
      username: config.local?.username || process.env.HOMEMATIC_CCU_USERNAME || '',
      password: config.local?.password || process.env.HOMEMATIC_CCU_PASSWORD || '',
      useTLS: config.local?.useTLS || process.env.HOMEMATIC_CCU_USE_TLS === 'true' || false
    };

    // Verbindungsmodus
    this.mode = config.mode || process.env.HOMEMATIC_MODE || 'auto'; // 'cloud', 'local', 'auto'
  }

  /**
   * Lädt Konfiguration aus einer JSON-Datei
   * @param {string} configPath - Pfad zur Konfigurationsdatei
   * @returns {Config} - Config-Instanz
   */
  static fromFile(configPath) {
    try {
      const fullPath = path.resolve(configPath);
      if (fs.existsSync(fullPath)) {
        const configData = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        return new Config(configData);
      }
    } catch (error) {
      console.warn(`Konfigurationsdatei konnte nicht geladen werden: ${error.message}`);
    }
    return new Config();
  }

  /**
   * Prüft ob Cloud-Konfiguration vorhanden ist
   * @returns {boolean}
   */
  hasCloudConfig() {
    return !!(this.cloud.accessPointSGTIN || this.cloud.authToken);
  }

  /**
   * Prüft ob lokale Konfiguration vorhanden ist
   * @returns {boolean}
   */
  hasLocalConfig() {
    return !!this.local.host;
  }

  /**
   * Bestimmt den zu verwendenden Modus
   * @returns {string} - 'cloud', 'local' oder null wenn keine Konfiguration vorhanden
   */
  getMode() {
    if (this.mode === 'cloud' && this.hasCloudConfig()) {
      return 'cloud';
    }
    if (this.mode === 'local' && this.hasLocalConfig()) {
      return 'local';
    }
    if (this.mode === 'auto') {
      if (this.hasCloudConfig()) return 'cloud';
      if (this.hasLocalConfig()) return 'local';
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
      errors.push('Keine gültige Konfiguration gefunden. Bitte Cloud- oder Local-Konfiguration angeben.');
    }

    if (mode === 'cloud') {
      if (!this.cloud.accessPointSGTIN && !this.cloud.authToken) {
        errors.push('Cloud-Konfiguration: accessPointSGTIN oder authToken erforderlich');
      }
    }

    if (mode === 'local') {
      if (!this.local.host) {
        errors.push('Local-Konfiguration: host erforderlich');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export default Config;

