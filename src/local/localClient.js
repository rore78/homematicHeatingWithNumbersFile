import xmlrpc from 'xmlrpc';
import axios from 'axios';

/**
 * Lokaler Homematic CCU Client
 * Verwaltet die Verbindung zur lokalen CCU über XML-RPC
 */
export class LocalClient {
  constructor(config) {
    this.config = config;
    this.host = config.host;
    this.port = config.port || 2001;
    this.username = config.username || '';
    this.password = config.password || '';
    this.useTLS = config.useTLS || false;
    this.client = null;
    this.connected = false;
  }

  /**
   * Erstellt den XML-RPC Client
   * @returns {object} - XML-RPC Client
   */
  _getClient() {
    if (!this.client) {
      const protocol = this.useTLS ? 'https' : 'http';
      const options = {
        host: this.host,
        port: this.port,
        path: '/'
      };

      if (this.useTLS) {
        this.client = xmlrpc.createSecureClient(options);
      } else {
        this.client = xmlrpc.createClient(options);
      }
    }
    return this.client;
  }

  /**
   * Führt einen XML-RPC Methodenaufruf aus
   * @param {string} method - Methodenname
   * @param {Array} params - Parameter
   * @returns {Promise<*>}
   */
  async _call(method, params = []) {
    return new Promise((resolve, reject) => {
      const client = this._getClient();
      client.methodCall(method, params, (error, value) => {
        if (error) {
          reject(new Error(`XML-RPC Fehler: ${error.message}`));
        } else {
          resolve(value);
        }
      });
    });
  }

  /**
   * Verbindet zur CCU
   * @returns {Promise<boolean>}
   */
  async connect() {
    try {
      // Test-Verbindung durch Abrufen der System-Variablen
      await this._call('system.listMethods');
      this.connected = true;
      return true;
    } catch (error) {
      this.connected = false;
      throw new Error(`Verbindung zur CCU fehlgeschlagen: ${error.message}`);
    }
  }

  /**
   * Ruft alle Geräte ab
   * @returns {Promise<Array>} - Liste der Geräte
   */
  async getDevices() {
    try {
      const devices = await this._call('listDevices');
      return devices || [];
    } catch (error) {
      throw new Error(`Fehler beim Abrufen der Geräte: ${error.message}`);
    }
  }

  /**
   * Ruft ein spezifisches Gerät ab
   * @param {string} deviceId - Geräte-ID (z.B. "BidCoS-RF:1234567890")
   * @returns {Promise<object>} - Geräteinformationen
   */
  async getDevice(deviceId) {
    try {
      const devices = await this.getDevices();
      const device = devices.find(d => d.ADDRESS === deviceId || d.ID === deviceId);
      
      if (!device) {
        throw new Error(`Gerät mit ID ${deviceId} nicht gefunden`);
      }

      return device;
    } catch (error) {
      throw new Error(`Fehler beim Abrufen des Geräts: ${error.message}`);
    }
  }

  /**
   * Ruft den Wert eines Geräteparameters ab
   * @param {string} deviceId - Geräte-ID
   * @param {string} parameter - Parametername
   * @returns {Promise<*>}
   */
  async getValue(deviceId, parameter) {
    try {
      const value = await this._call('getValue', [deviceId, parameter]);
      return value;
    } catch (error) {
      throw new Error(`Fehler beim Abrufen des Wertes: ${error.message}`);
    }
  }

  /**
   * Setzt einen Geräteparameter
   * @param {string} deviceId - Geräte-ID
   * @param {string} parameter - Parametername
   * @param {*} value - Parameterwert
   * @returns {Promise<boolean>}
   */
  async setValue(deviceId, parameter, value) {
    try {
      const result = await this._call('setValue', [deviceId, parameter, value]);
      return result === true || result === 1;
    } catch (error) {
      throw new Error(`Fehler beim Setzen des Wertes: ${error.message}`);
    }
  }

  /**
   * Schaltet ein Gerät ein/aus
   * @param {string} deviceId - Geräte-ID
   * @param {boolean} on - true = ein, false = aus
   * @returns {Promise<boolean>}
   */
  async setSwitchState(deviceId, on) {
    return this.setValue(deviceId, 'STATE', on);
  }

  /**
   * Setzt die Helligkeit eines Dimmers
   * @param {string} deviceId - Geräte-ID
   * @param {number} level - Helligkeit (0-1.0)
   * @returns {Promise<boolean>}
   */
  async setDimLevel(deviceId, level) {
    const dimValue = Math.max(0, Math.min(1.0, level));
    return this.setValue(deviceId, 'LEVEL', dimValue);
  }

  /**
   * Setzt die Temperatur eines Thermostats
   * @param {string} deviceId - Geräte-ID
   * @param {number} temperature - Temperatur in °C
   * @returns {Promise<boolean>}
   */
  async setTemperature(deviceId, temperature) {
    return this.setValue(deviceId, 'SET_TEMPERATURE', temperature);
  }

  /**
   * Ruft den Status eines Geräts ab
   * @param {string} deviceId - Geräte-ID
   * @returns {Promise<object>} - Gerätestatus
   */
  async getDeviceState(deviceId) {
    try {
      const device = await this.getDevice(deviceId);
      const state = {
        id: device.ADDRESS || device.ID,
        name: device.NAME || '',
        type: device.TYPE || '',
        channels: []
      };

      // Versuche Channel-Informationen abzurufen
      try {
        const paramset = await this._call('getParamset', [deviceId, 'VALUES']);
        state.parameters = paramset || {};
      } catch (e) {
        // Ignoriere Fehler beim Abrufen der Parameter
      }

      return state;
    } catch (error) {
      throw new Error(`Fehler beim Abrufen des Gerätestatus: ${error.message}`);
    }
  }

  /**
   * Ruft System-Informationen ab
   * @returns {Promise<object>}
   */
  async getSystemInfo() {
    try {
      const version = await this._call('getVersion');
      const methods = await this._call('system.listMethods');
      return {
        version,
        methods: methods.length
      };
    } catch (error) {
      throw new Error(`Fehler beim Abrufen der System-Informationen: ${error.message}`);
    }
  }
}

export default LocalClient;

