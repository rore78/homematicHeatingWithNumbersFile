import axios from 'axios';

/**
 * Homematic IP Cloud Client
 * Verwaltet die Authentifizierung und Kommunikation mit der Homematic IP Cloud API
 */
export class CloudClient {
  constructor(config) {
    this.config = config;
    this.authToken = config.authToken;
    this.accessPointSGTIN = config.accessPointSGTIN;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.apiUrl = config.apiUrl || 'https://ps1.homematic.com:6969';
    this.clientAuthToken = null;
    this.clientCharacteristics = null;
  }

  /**
   * Authentifiziert den Client mit der Cloud API
   * @returns {Promise<string>} - Auth Token
   */
  async authenticate() {
    try {
      // Wenn bereits ein Token vorhanden ist, verwende es
      if (this.authToken) {
        this.clientAuthToken = this.authToken;
        return this.clientAuthToken;
      }

      // Wenn Access Point SGTIN vorhanden ist, hole Client Auth Token
      if (this.accessPointSGTIN) {
        const response = await axios.post(
          `${this.apiUrl}/hmip/home/accessPoint/requestClientAuthToken`,
          {
            accessPointId: this.accessPointSGTIN
          },
          {
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.data && response.data.clientAuthToken) {
          this.clientAuthToken = response.data.clientAuthToken;
          return this.clientAuthToken;
        }
      }

      throw new Error('Authentifizierung fehlgeschlagen: Keine gültigen Credentials');
    } catch (error) {
      if (error.response) {
        throw new Error(`Authentifizierungsfehler: ${error.response.status} - ${error.response.data?.message || error.message}`);
      }
      throw new Error(`Authentifizierungsfehler: ${error.message}`);
    }
  }

  /**
   * Ruft die Client-Charakteristika ab
   * @returns {Promise<object>}
   */
  async getClientCharacteristics() {
    try {
      if (!this.clientAuthToken) {
        await this.authenticate();
      }

      const response = await axios.get(
        `${this.apiUrl}/hmip/home/accessPoint/getClientCharacteristics`,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.clientAuthToken}`
          },
          params: {
            accessPointId: this.accessPointSGTIN
          }
        }
      );

      this.clientCharacteristics = response.data;
      return this.clientCharacteristics;
    } catch (error) {
      if (error.response) {
        throw new Error(`Fehler beim Abrufen der Client-Charakteristika: ${error.response.status} - ${error.response.data?.message || error.message}`);
      }
      throw new Error(`Fehler beim Abrufen der Client-Charakteristika: ${error.message}`);
    }
  }

  /**
   * Ruft alle Geräte ab
   * @returns {Promise<Array>} - Liste der Geräte
   */
  async getDevices() {
    try {
      if (!this.clientAuthToken) {
        await this.authenticate();
      }

      const response = await axios.get(
        `${this.apiUrl}/hmip/home/getCurrentState`,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.clientAuthToken}`
          }
        }
      );

      return response.data?.devices || [];
    } catch (error) {
      if (error.response) {
        throw new Error(`Fehler beim Abrufen der Geräte: ${error.response.status} - ${error.response.data?.message || error.message}`);
      }
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
      const devices = await this.getDevices();
      const device = devices.find(d => d.id === deviceId);
      
      if (!device) {
        throw new Error(`Gerät mit ID ${deviceId} nicht gefunden`);
      }

      return device;
    } catch (error) {
      throw new Error(`Fehler beim Abrufen des Geräts: ${error.message}`);
    }
  }

  /**
   * Setzt einen Geräteparameter
   * @param {string} deviceId - Geräte-ID
   * @param {string} channelId - Kanal-ID
   * @param {string} parameter - Parametername
   * @param {*} value - Parameterwert
   * @returns {Promise<object>}
   */
  async setDeviceData(deviceId, channelId, parameter, value) {
    try {
      if (!this.clientAuthToken) {
        await this.authenticate();
      }

      const response = await axios.post(
        `${this.apiUrl}/hmip/device/control/setDeviceData`,
        {
          deviceId,
          channelId,
          parameter,
          value
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.clientAuthToken}`
          }
        }
      );

      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`Fehler beim Setzen des Geräteparameters: ${error.response.status} - ${error.response.data?.message || error.message}`);
      }
      throw new Error(`Fehler beim Setzen des Geräteparameters: ${error.message}`);
    }
  }

  /**
   * Schaltet ein Gerät ein/aus
   * @param {string} deviceId - Geräte-ID
   * @param {boolean} on - true = ein, false = aus
   * @returns {Promise<object>}
   */
  async setSwitchState(deviceId, on) {
    return this.setDeviceData(deviceId, 1, 'ON', on);
  }

  /**
   * Setzt die Helligkeit eines Dimmers
   * @param {string} deviceId - Geräte-ID
   * @param {number} level - Helligkeit (0-1.0)
   * @returns {Promise<object>}
   */
  async setDimLevel(deviceId, level) {
    return this.setDeviceData(deviceId, 1, 'LEVEL', Math.max(0, Math.min(1.0, level)));
  }

  /**
   * Setzt die Temperatur eines Thermostats
   * @param {string} deviceId - Geräte-ID
   * @param {number} temperature - Temperatur in °C
   * @returns {Promise<object>}
   */
  async setTemperature(deviceId, temperature) {
    return this.setDeviceData(deviceId, 0, 'SET_POINT_TEMPERATURE', temperature);
  }
}

export default CloudClient;

