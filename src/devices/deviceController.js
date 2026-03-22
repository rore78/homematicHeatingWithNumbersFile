import CloudClient from '../cloud/cloudClient.js';
import LocalClient from '../local/localClient.js';

/**
 * Device Controller
 * Abstrahiert die Gerätesteuerung für Cloud- und Local-Verbindungen
 */
export class DeviceController {
  constructor(client) {
    this.client = client;
    this.isCloud = client instanceof CloudClient;
    this.isLocal = client instanceof LocalClient;
  }

  /**
   * Ruft alle Geräte ab
   * @returns {Promise<Array>} - Liste der Geräte
   */
  async getDevices() {
    try {
      const devices = await this.client.getDevices();
      return this._normalizeDevices(devices);
    } catch (error) {
      throw new Error(`Fehler beim Abrufen der Geräte: ${error.message}`);
    }
  }

  /**
   * Ruft ein spezifisches Gerät ab
   * @param {string} deviceId - Geräte-ID
   * @returns {Promise<object>} - Geräteinformationen
   */
  async getDevice(deviceId) {
    try {
      const device = await this.client.getDevice(deviceId);
      return this._normalizeDevice(device);
    } catch (error) {
      throw new Error(`Fehler beim Abrufen des Geräts: ${error.message}`);
    }
  }

  /**
   * Ruft den Status eines Geräts ab
   * @param {string} deviceId - Geräte-ID
   * @returns {Promise<object>} - Gerätestatus
   */
  async getDeviceState(deviceId) {
    try {
      if (this.isLocal) {
        return await this.client.getDeviceState(deviceId);
      } else {
        const device = await this.client.getDevice(deviceId);
        return {
          id: device.id,
          name: device.label || device.name || '',
          type: device.type || '',
          state: device.functionalChannels || {}
        };
      }
    } catch (error) {
      throw new Error(`Fehler beim Abrufen des Gerätestatus: ${error.message}`);
    }
  }

  /**
   * Schaltet ein Gerät ein/aus
   * @param {string} deviceId - Geräte-ID
   * @param {boolean} on - true = ein, false = aus
   * @returns {Promise<boolean>}
   */
  async setSwitchState(deviceId, on) {
    try {
      if (this.isCloud) {
        await this.client.setSwitchState(deviceId, on);
        return true;
      } else {
        return await this.client.setSwitchState(deviceId, on);
      }
    } catch (error) {
      throw new Error(`Fehler beim Schalten des Geräts: ${error.message}`);
    }
  }

  /**
   * Setzt die Helligkeit eines Dimmers
   * @param {string} deviceId - Geräte-ID
   * @param {number} level - Helligkeit (0-1.0 oder 0-100)
   * @returns {Promise<boolean>}
   */
  async setDimLevel(deviceId, level) {
    try {
      // Normalisiere Level auf 0-1.0 Bereich
      const normalizedLevel = level > 1.0 ? level / 100 : level;
      
      if (this.isCloud) {
        await this.client.setDimLevel(deviceId, normalizedLevel);
        return true;
      } else {
        return await this.client.setDimLevel(deviceId, normalizedLevel);
      }
    } catch (error) {
      throw new Error(`Fehler beim Setzen der Helligkeit: ${error.message}`);
    }
  }

  /**
   * Setzt die Temperatur eines Thermostats
   * @param {string} deviceId - Geräte-ID
   * @param {number} temperature - Temperatur in °C
   * @returns {Promise<boolean>}
   */
  async setTemperature(deviceId, temperature) {
    try {
      if (this.isCloud) {
        await this.client.setTemperature(deviceId, temperature);
        return true;
      } else {
        return await this.client.setTemperature(deviceId, temperature);
      }
    } catch (error) {
      throw new Error(`Fehler beim Setzen der Temperatur: ${error.message}`);
    }
  }

  /**
   * Setzt einen benutzerdefinierten Geräteparameter
   * @param {string} deviceId - Geräte-ID
   * @param {string} parameter - Parametername
   * @param {*} value - Parameterwert
   * @returns {Promise<boolean>}
   */
  async setParameter(deviceId, parameter, value) {
    try {
      if (this.isCloud) {
        // Für Cloud: channelId wird standardmäßig auf 1 gesetzt
        await this.client.setDeviceData(deviceId, 1, parameter, value);
        return true;
      } else {
        return await this.client.setValue(deviceId, parameter, value);
      }
    } catch (error) {
      throw new Error(`Fehler beim Setzen des Parameters: ${error.message}`);
    }
  }

  /**
   * Ruft einen Geräteparameter ab
   * @param {string} deviceId - Geräte-ID
   * @param {string} parameter - Parametername
   * @returns {Promise<*>}
   */
  async getParameter(deviceId, parameter) {
    try {
      if (this.isLocal) {
        return await this.client.getValue(deviceId, parameter);
      } else {
        const device = await this.client.getDevice(deviceId);
        // Versuche Parameter aus den functionalChannels zu extrahieren
        if (device.functionalChannels) {
          for (const channel of device.functionalChannels) {
            if (channel[parameter] !== undefined) {
              return channel[parameter];
            }
          }
        }
        throw new Error(`Parameter ${parameter} nicht gefunden`);
      }
    } catch (error) {
      throw new Error(`Fehler beim Abrufen des Parameters: ${error.message}`);
    }
  }

  /**
   * Normalisiert Geräte-Arrays für einheitliche Darstellung
   * @param {Array} devices - Rohe Gerätedaten
   * @returns {Array} - Normalisierte Geräte
   * @private
   */
  _normalizeDevices(devices) {
    if (!Array.isArray(devices)) {
      return [];
    }
    return devices.map(device => this._normalizeDevice(device));
  }

  /**
   * Normalisiert ein einzelnes Gerät
   * @param {object} device - Rohe Gerätedaten
   * @returns {object} - Normalisiertes Gerät
   * @private
   */
  _normalizeDevice(device) {
    if (this.isCloud) {
      return {
        id: device.id,
        name: device.label || device.name || '',
        type: device.type || '',
        model: device.modelType || '',
        manufacturer: device.manufacturer || 'eQ-3',
        firmware: device.firmwareVersion || '',
        lowBat: device.lowBat || false,
        unreach: device.unreach || false,
        channels: device.functionalChannels || []
      };
    } else {
      // Local CCU Format
      return {
        id: device.ADDRESS || device.ID,
        name: device.NAME || '',
        type: device.TYPE || '',
        model: device.TYPE || '',
        manufacturer: 'eQ-3',
        firmware: device.FIRMWARE || '',
        lowBat: device.LOWBAT || false,
        unreach: device.UNREACH || false,
        channels: []
      };
    }
  }
}

export default DeviceController;

