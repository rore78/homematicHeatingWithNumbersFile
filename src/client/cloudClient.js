import axios from "axios";

/**
 * Homematic IP Cloud Client
 * Implementiert das HmipClient-Interface fuer die Cloud-API.
 * Verwaltet die Authentifizierung und Kommunikation mit der Homematic IP Cloud API.
 *
 * @implements {HmipClient}
 */
export class CloudClient {
  constructor(config) {
    this.config = config;
    this.authToken = config.authToken;
    this.accessPointSGTIN = config.accessPointSGTIN;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.apiUrl = config.apiUrl || "https://ps1.homematic.com:6969";
    this.clientAuthToken = null;
    this.clientCharacteristics = null;
  }

  // -- HmipClient Interface --

  /**
   * Baut die Verbindung auf (fuer Cloud: authentifizieren).
   * @returns {Promise<void>}
   */
  async connect() {
    await this.authenticate();
  }

  /**
   * Beendet die Verbindung (fuer Cloud: Noop, stateless HTTP).
   * @returns {Promise<void>}
   */
  async disconnect() {
    this.clientAuthToken = null;
  }

  /**
   * Registriert einen Event-Handler (fuer Cloud: Noop, kein Push-Support).
   * @param {string} _event
   * @param {function} _handler
   */
  on(_event, _handler) {
    // Cloud hat keine Push-Events
  }

  /**
   * Liefert den vollstaendigen Systemstatus.
   * @returns {Promise<Object>}
   */
  async getSystemState() {
    if (!this.clientAuthToken) {
      await this.authenticate();
    }
    const response = await axios.get(
      `${this.apiUrl}/hmip/home/getCurrentState`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.clientAuthToken}`,
        },
      },
    );
    return response.data;
  }

  /**
   * Setzt die Zieltemperatur.
   * @param {string} deviceId
   * @param {number} temperature - °C
   * @returns {Promise<void>}
   */
  async setTemperature(deviceId, temperature) {
    await this.setDeviceData(deviceId, 0, "SET_POINT_TEMPERATURE", temperature);
  }

  /**
   * Aktiviert/deaktiviert Boost (ueber setDeviceData).
   * @param {string} deviceId
   * @param {boolean} boost
   * @returns {Promise<void>}
   */
  async setBoost(deviceId, boost) {
    await this.setDeviceData(deviceId, 1, "BOOST_MODE", boost);
  }

  /**
   * Aktiviert ein Heizprofil.
   * @param {string} deviceId
   * @param {string|number} profileIndex - 'PROFILE_1' oder 1-6
   * @returns {Promise<void>}
   */
  async setActiveProfile(deviceId, profileIndex) {
    const num =
      typeof profileIndex === "string"
        ? parseInt(profileIndex.replace("PROFILE_", ""), 10)
        : profileIndex;
    await this.setHeatingProfile(deviceId, num);
  }

  /**
   * Setzt den Steuerungsmodus.
   * @param {string} deviceId
   * @param {string} controlMode - 'AUTOMATIC' oder 'MANUAL'
   * @returns {Promise<void>}
   */
  async setControlMode(deviceId, controlMode) {
    const mode = controlMode === "AUTOMATIC" ? 0 : 1;
    await this.setDeviceData(deviceId, 1, "SET_POINT_MODE", mode);
  }

  /**
   * Schaltet einen Schaltaktor.
   * @param {string} deviceId
   * @param {boolean} on
   * @param {number} [channelIndex=1]
   * @returns {Promise<void>}
   */
  async setSwitchState(deviceId, on, channelIndex = 1) {
    await this.setDeviceData(deviceId, channelIndex, "ON", on);
  }

  // -- Cloud-spezifische Implementierung --

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
            accessPointId: this.accessPointSGTIN,
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        if (response.data && response.data.clientAuthToken) {
          this.clientAuthToken = response.data.clientAuthToken;
          return this.clientAuthToken;
        }
      }

      throw new Error(
        "Authentifizierung fehlgeschlagen: Keine gueltigen Credentials",
      );
    } catch (error) {
      if (error.response) {
        throw new Error(
          `Authentifizierungsfehler: ${error.response.status} - ${error.response.data?.message || error.message}`,
        );
      }
      throw new Error(`Authentifizierungsfehler: ${error.message}`);
    }
  }

  /**
   * Ruft alle Geraete ab
   * @returns {Promise<Array>}
   */
  async getDevices() {
    try {
      const state = await this.getSystemState();
      const raw = state?.devices || {};
      const list = Array.isArray(raw) ? raw : Object.values(raw);
      return list.map((d) => this._normalizeDevice(d));
    } catch (error) {
      if (error.response) {
        throw new Error(
          `Fehler beim Abrufen der Geraete: ${error.response.status} - ${error.response.data?.message || error.message}`,
        );
      }
      throw new Error(`Fehler beim Abrufen der Geraete: ${error.message}`);
    }
  }

  /**
   * Ruft ein spezifisches Geraet ab
   * @param {string} deviceId
   * @returns {Promise<object>}
   */
  async getDevice(deviceId) {
    try {
      const devices = await this.getDevices();
      const device = devices.find((d) => d.id === deviceId);

      if (!device) {
        throw new Error(`Geraet mit ID ${deviceId} nicht gefunden`);
      }

      return device;
    } catch (error) {
      throw new Error(`Fehler beim Abrufen des Geraets: ${error.message}`);
    }
  }

  /**
   * Normalisiert Cloud-Geraetedaten in das HmipDevice-Format.
   * @private
   */
  _normalizeDevice(device) {
    return {
      id: device.id,
      name: device.label || device.name || "",
      type: device.type || "",
      model: device.modelType || "",
      manufacturer: device.manufacturer || "eQ-3",
      firmware: device.firmwareVersion || "",
      lowBat: device.lowBat || false,
      unreach: device.unreach || false,
      channels: device.functionalChannels || [],
    };
  }

  /**
   * Setzt einen Geraeteparameter (Cloud-spezifisch).
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
          value,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.clientAuthToken}`,
          },
        },
      );

      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(
          `Fehler beim Setzen des Geraeteparameters: ${error.response.status} - ${error.response.data?.message || error.message}`,
        );
      }
      throw new Error(
        `Fehler beim Setzen des Geraeteparameters: ${error.message}`,
      );
    }
  }

  /**
   * Setzt die Helligkeit eines Dimmers (Cloud-spezifisch).
   */
  async setDimLevel(deviceId, level) {
    return this.setDeviceData(
      deviceId,
      1,
      "LEVEL",
      Math.max(0, Math.min(1.0, level)),
    );
  }

  /**
   * Aktiviert ein Heizprofil auf einem HmIP-Thermostat (Cloud-spezifisch).
   */
  async setHeatingProfile(deviceId, profileNumber) {
    await this.setDeviceData(deviceId, 1, "SET_POINT_MODE", 0);
    return this.setDeviceData(deviceId, 1, "ACTIVE_PROFILE", profileNumber);
  }

  async getHeatingProfile(deviceId) {
    const state = await this.getSystemState();
    const device = state.devices?.[deviceId];
    if (!device) throw new Error(`Geraet ${deviceId} nicht gefunden.`);
    const channel = device.functionalChannels?.["1"];
    return {
      activeProfile: channel?.activeProfile ?? null,
      mode: channel?.setPointMode ?? null,
    };
  }
}

export default CloudClient;
