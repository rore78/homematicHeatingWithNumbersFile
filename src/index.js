import Config from "./config/config.js";
import CloudClient from "./cloud/cloudClient.js";
import LocalClient from "./local/localClient.js";
import DeviceController from "./devices/deviceController.js";

/**
 * Homematic IP Addon
 * Hauptklasse für die Verwaltung von Homematic IP Geräten
 */
export class HomematicIPAddon {
  constructor(config = {}) {
    this.config = config instanceof Config ? config : new Config(config);
    this.client = null;
    this.controller = null;
    this.mode = null;
  }

  /**
   * Initialisiert das Addon basierend auf der Konfiguration
   * @returns {Promise<HomematicIPAddon>}
   */
  async initialize() {
    // Validiere Konfiguration
    const validation = this.config.validate();
    if (!validation.valid) {
      throw new Error(`Konfigurationsfehler: ${validation.errors.join(", ")}`);
    }

    // Bestimme Modus
    this.mode = this.config.getMode();
    if (!this.mode) {
      throw new Error("Keine gültige Konfiguration gefunden");
    }

    // Erstelle Client basierend auf Modus
    if (this.mode === "cloud") {
      this.client = new CloudClient(this.config.cloud);
      await this.client.authenticate();
    } else if (this.mode === "local") {
      this.client = new LocalClient(this.config.local);
      await this.client.connect();
    }

    // Erstelle Device Controller
    this.controller = new DeviceController(this.client);

    return this;
  }

  /**
   * Ruft alle Geräte ab
   * @returns {Promise<Array>}
   */
  async getDevices() {
    if (!this.controller) {
      throw new Error("Addon nicht initialisiert. Rufe initialize() auf.");
    }
    return this.controller.getDevices();
  }

  /**
   * Ruft ein spezifisches Gerät ab
   * @param {string} deviceId - Geräte-ID
   * @returns {Promise<object>}
   */
  async getDevice(deviceId) {
    if (!this.controller) {
      throw new Error("Addon nicht initialisiert. Rufe initialize() auf.");
    }
    return this.controller.getDevice(deviceId);
  }

  /**
   * Ruft den Status eines Geräts ab
   * @param {string} deviceId - Geräte-ID
   * @returns {Promise<object>}
   */
  async getDeviceState(deviceId) {
    if (!this.controller) {
      throw new Error("Addon nicht initialisiert. Rufe initialize() auf.");
    }
    return this.controller.getDeviceState(deviceId);
  }

  /**
   * Schaltet ein Gerät ein/aus
   * @param {string} deviceId - Geräte-ID
   * @param {boolean} on - true = ein, false = aus
   * @returns {Promise<boolean>}
   */
  async setSwitchState(deviceId, on) {
    if (!this.controller) {
      throw new Error("Addon nicht initialisiert. Rufe initialize() auf.");
    }
    return this.controller.setSwitchState(deviceId, on);
  }

  /**
   * Setzt die Helligkeit eines Dimmers
   * @param {string} deviceId - Geräte-ID
   * @param {number} level - Helligkeit (0-1.0 oder 0-100)
   * @returns {Promise<boolean>}
   */
  async setDimLevel(deviceId, level) {
    if (!this.controller) {
      throw new Error("Addon nicht initialisiert. Rufe initialize() auf.");
    }
    return this.controller.setDimLevel(deviceId, level);
  }

  /**
   * Setzt die Temperatur eines Thermostats
   * @param {string} deviceId - Geräte-ID
   * @param {number} temperature - Temperatur in °C
   * @returns {Promise<boolean>}
   */
  async setTemperature(deviceId, temperature) {
    if (!this.controller) {
      throw new Error("Addon nicht initialisiert. Rufe initialize() auf.");
    }
    return this.controller.setTemperature(deviceId, temperature);
  }

  /**
   * Setzt einen benutzerdefinierten Geräteparameter
   * @param {string} deviceId - Geräte-ID
   * @param {string} parameter - Parametername
   * @param {*} value - Parameterwert
   * @returns {Promise<boolean>}
   */
  async setParameter(deviceId, parameter, value) {
    if (!this.controller) {
      throw new Error("Addon nicht initialisiert. Rufe initialize() auf.");
    }
    return this.controller.setParameter(deviceId, parameter, value);
  }

  /**
   * Ruft einen Geräteparameter ab
   * @param {string} deviceId - Geräte-ID
   * @param {string} parameter - Parametername
   * @returns {Promise<*>}
   */
  async getParameter(deviceId, parameter) {
    if (!this.controller) {
      throw new Error("Addon nicht initialisiert. Rufe initialize() auf.");
    }
    return this.controller.getParameter(deviceId, parameter);
  }

  /**
   * Gibt den aktuellen Verbindungsmodus zurück
   * @returns {string} - 'cloud' oder 'local'
   */
  getMode() {
    return this.mode;
  }

  /**
   * Gibt den Client zurück (für erweiterte Nutzung)
   * @returns {CloudClient|LocalClient}
   */
  getClient() {
    return this.client;
  }
}

// Export aller Klassen für erweiterte Nutzung
export { Config, CloudClient, LocalClient, DeviceController };

// Standard-Export
export default HomematicIPAddon;
