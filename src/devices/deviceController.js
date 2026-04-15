import { isHmipClient } from "../client/hmipClient.js";

/**
 * Device Controller
 * Abstrahiert die Geraetesteuerung ueber das HmipClient-Interface.
 *
 * Arbeitet einheitlich mit CloudClient (REST) und ConnectApiClient
 * (WebSocket) -- kein instanceof-Check mehr noetig.
 */
export class DeviceController {
  constructor(client) {
    if (!isHmipClient(client)) {
      throw new Error(
        "DeviceController benoetigt einen Client der das HmipClient-Interface implementiert",
      );
    }
    this.client = client;
  }

  /**
   * Ruft alle Geraete ab.
   * @returns {Promise<Array>}
   */
  async getDevices() {
    try {
      return await this.client.getDevices();
    } catch (error) {
      throw new Error(`Fehler beim Abrufen der Geraete: ${error.message}`);
    }
  }

  /**
   * Ruft ein spezifisches Geraet ab.
   * @param {string} deviceId
   * @returns {Promise<object>}
   */
  async getDevice(deviceId) {
    try {
      return await this.client.getDevice(deviceId);
    } catch (error) {
      throw new Error(`Fehler beim Abrufen des Geraets: ${error.message}`);
    }
  }

  /**
   * Ruft den Status eines Geraets ab. Nutzt das normalisierte HmipDevice-Format.
   * @param {string} deviceId
   * @returns {Promise<object>}
   */
  async getDeviceState(deviceId) {
    try {
      const device = await this.client.getDevice(deviceId);
      return {
        id: device.id,
        name: device.name || "",
        type: device.type || "",
        state: device.channels || {},
      };
    } catch (error) {
      throw new Error(`Fehler beim Abrufen des Geraetestatus: ${error.message}`);
    }
  }

  /**
   * Schaltet ein Geraet ein/aus.
   * @param {string} deviceId
   * @param {boolean} on
   * @returns {Promise<boolean>}
   */
  async setSwitchState(deviceId, on) {
    try {
      await this.client.setSwitchState(deviceId, on);
      return true;
    } catch (error) {
      throw new Error(`Fehler beim Schalten des Geraets: ${error.message}`);
    }
  }

  /**
   * Setzt die Temperatur (Zieltemperatur).
   * @param {string} deviceId - Geraete- oder Gruppen-ID (client-abhaengig)
   * @param {number} temperature - °C
   * @returns {Promise<boolean>}
   */
  async setTemperature(deviceId, temperature) {
    try {
      await this.client.setTemperature(deviceId, temperature);
      return true;
    } catch (error) {
      throw new Error(`Fehler beim Setzen der Temperatur: ${error.message}`);
    }
  }

  /**
   * Aktiviert ein Heizprofil.
   * @param {string} deviceId
   * @param {number|string} profileNumber - 1-6 oder 'PROFILE_1' bis 'PROFILE_6'
   * @returns {Promise<boolean>}
   */
  async setHeatingProfile(deviceId, profileNumber) {
    const num =
      typeof profileNumber === "string"
        ? parseInt(profileNumber.replace("PROFILE_", ""), 10)
        : profileNumber;
    if (![1, 2, 3, 4, 5, 6].includes(num)) {
      throw new Error(
        `Ungueltiges Geraeteprofil: ${profileNumber}. Erlaubt: 1-6.`,
      );
    }
    try {
      await this.client.setActiveProfile(deviceId, `PROFILE_${num}`);
      return true;
    } catch (error) {
      throw new Error(`Fehler beim Setzen des Heizprofils: ${error.message}`);
    }
  }

  /**
   * Aktiviert/deaktiviert Boost.
   * @param {string} deviceId
   * @param {boolean} boost
   * @returns {Promise<boolean>}
   */
  async setBoost(deviceId, boost) {
    try {
      await this.client.setBoost(deviceId, boost);
      return true;
    } catch (error) {
      throw new Error(`Fehler beim Setzen des Boost-Modus: ${error.message}`);
    }
  }

  /**
   * Setzt den Steuerungsmodus.
   * @param {string} deviceId
   * @param {string} controlMode - 'AUTOMATIC' oder 'MANUAL'
   * @returns {Promise<boolean>}
   */
  async setControlMode(deviceId, controlMode) {
    try {
      await this.client.setControlMode(deviceId, controlMode);
      return true;
    } catch (error) {
      throw new Error(`Fehler beim Setzen des Steuerungsmodus: ${error.message}`);
    }
  }
}

export default DeviceController;
