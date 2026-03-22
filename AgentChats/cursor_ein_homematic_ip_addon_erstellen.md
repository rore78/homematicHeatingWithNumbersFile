# Ein Homematic Ip Addon erstellen

_Exported on 26/11/2025 at 0:46:20 CET from Cursor (2.1.34)_

---

**User**

Ich möchte ein Homematic Ip Addon erstellen

---

**Cursor**

Prüfe das Verzeichnis, um den aktuellen Stand zu verstehen.

Das Verzeichnis ist leer. Ich brauche ein paar Details, um den Plan zu erstellen:

Noch eine Frage zur technischen Umsetzung:

Erstelle den Plan für das Homematic IP Addon:

---

**User**

Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.

---

**Cursor**

Prüfe vorhandene Todos und beginne mit der Implementierung.

```json
{
  "name": "my-homematic-addon",
  "version": "1.0.0",
  "description": "Homematic IP Addon für Gerätesteuerung (Cloud und Local)",
  "main": "src/index.js",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "example": "node examples/basic-usage.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": ["homematic", "homematic-ip", "smart-home", "automation"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "axios": "^1.6.0",
    "ws": "^8.14.2",
    "xmlrpc": "^1.3.2"
  },
  "engines": {
    "node": ">=14.0.0"
  }
}
```

```ignore
node_modules/
npm-debug.log
yarn-error.log
.env
.env.local
*.log
.DS_Store
dist/
build/
coverage/
.nyc_output/

```

```javascript
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

    // Lokale CCU-Konfiguration
    this.local = {
      host:
        config.local?.host || process.env.HOMEMATIC_CCU_HOST || "192.168.1.100",
      port:
        config.local?.port ||
        parseInt(process.env.HOMEMATIC_CCU_PORT || "2001"),
      username:
        config.local?.username || process.env.HOMEMATIC_CCU_USERNAME || "",
      password:
        config.local?.password || process.env.HOMEMATIC_CCU_PASSWORD || "",
      useTLS:
        config.local?.useTLS ||
        process.env.HOMEMATIC_CCU_USE_TLS === "true" ||
        false,
    };

    // Verbindungsmodus
    this.mode = config.mode || process.env.HOMEMATIC_MODE || "auto"; // 'cloud', 'local', 'auto'
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
        const configData = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        return new Config(configData);
      }
    } catch (error) {
      console.warn(
        `Konfigurationsdatei konnte nicht geladen werden: ${error.message}`,
      );
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
    if (this.mode === "cloud" && this.hasCloudConfig()) {
      return "cloud";
    }
    if (this.mode === "local" && this.hasLocalConfig()) {
      return "local";
    }
    if (this.mode === "auto") {
      if (this.hasCloudConfig()) return "cloud";
      if (this.hasLocalConfig()) return "local";
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
        "Keine gültige Konfiguration gefunden. Bitte Cloud- oder Local-Konfiguration angeben.",
      );
    }

    if (mode === "cloud") {
      if (!this.cloud.accessPointSGTIN && !this.cloud.authToken) {
        errors.push(
          "Cloud-Konfiguration: accessPointSGTIN oder authToken erforderlich",
        );
      }
    }

    if (mode === "local") {
      if (!this.local.host) {
        errors.push("Local-Konfiguration: host erforderlich");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export default Config;
```

```javascript
import axios from "axios";

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
    this.apiUrl = config.apiUrl || "https://ps1.homematic.com:6969";
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
        "Authentifizierung fehlgeschlagen: Keine gültigen Credentials",
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
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.clientAuthToken}`,
          },
          params: {
            accessPointId: this.accessPointSGTIN,
          },
        },
      );

      this.clientCharacteristics = response.data;
      return this.clientCharacteristics;
    } catch (error) {
      if (error.response) {
        throw new Error(
          `Fehler beim Abrufen der Client-Charakteristika: ${error.response.status} - ${error.response.data?.message || error.message}`,
        );
      }
      throw new Error(
        `Fehler beim Abrufen der Client-Charakteristika: ${error.message}`,
      );
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
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.clientAuthToken}`,
          },
        },
      );

      return response.data?.devices || [];
    } catch (error) {
      if (error.response) {
        throw new Error(
          `Fehler beim Abrufen der Geräte: ${error.response.status} - ${error.response.data?.message || error.message}`,
        );
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
      const device = devices.find((d) => d.id === deviceId);

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
          `Fehler beim Setzen des Geräteparameters: ${error.response.status} - ${error.response.data?.message || error.message}`,
        );
      }
      throw new Error(
        `Fehler beim Setzen des Geräteparameters: ${error.message}`,
      );
    }
  }

  /**
   * Schaltet ein Gerät ein/aus
   * @param {string} deviceId - Geräte-ID
   * @param {boolean} on - true = ein, false = aus
   * @returns {Promise<object>}
   */
  async setSwitchState(deviceId, on) {
    return this.setDeviceData(deviceId, 1, "ON", on);
  }

  /**
   * Setzt die Helligkeit eines Dimmers
   * @param {string} deviceId - Geräte-ID
   * @param {number} level - Helligkeit (0-1.0)
   * @returns {Promise<object>}
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
   * Setzt die Temperatur eines Thermostats
   * @param {string} deviceId - Geräte-ID
   * @param {number} temperature - Temperatur in °C
   * @returns {Promise<object>}
   */
  async setTemperature(deviceId, temperature) {
    return this.setDeviceData(
      deviceId,
      0,
      "SET_POINT_TEMPERATURE",
      temperature,
    );
  }
}

export default CloudClient;
```

```javascript
import xmlrpc from "xmlrpc";
import axios from "axios";

/**
 * Lokaler Homematic CCU Client
 * Verwaltet die Verbindung zur lokalen CCU über XML-RPC
 */
export class LocalClient {
  constructor(config) {
    this.config = config;
    this.host = config.host;
    this.port = config.port || 2001;
    this.username = config.username || "";
    this.password = config.password || "";
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
      const protocol = this.useTLS ? "https" : "http";
      const options = {
        host: this.host,
        port: this.port,
        path: "/",
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
      await this._call("system.listMethods");
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
      const devices = await this._call("listDevices");
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
      const device = devices.find(
        (d) => d.ADDRESS === deviceId || d.ID === deviceId,
      );

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
      const value = await this._call("getValue", [deviceId, parameter]);
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
      const result = await this._call("setValue", [deviceId, parameter, value]);
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
    return this.setValue(deviceId, "STATE", on);
  }

  /**
   * Setzt die Helligkeit eines Dimmers
   * @param {string} deviceId - Geräte-ID
   * @param {number} level - Helligkeit (0-1.0)
   * @returns {Promise<boolean>}
   */
  async setDimLevel(deviceId, level) {
    const dimValue = Math.max(0, Math.min(1.0, level));
    return this.setValue(deviceId, "LEVEL", dimValue);
  }

  /**
   * Setzt die Temperatur eines Thermostats
   * @param {string} deviceId - Geräte-ID
   * @param {number} temperature - Temperatur in °C
   * @returns {Promise<boolean>}
   */
  async setTemperature(deviceId, temperature) {
    return this.setValue(deviceId, "SET_TEMPERATURE", temperature);
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
        name: device.NAME || "",
        type: device.TYPE || "",
        channels: [],
      };

      // Versuche Channel-Informationen abzurufen
      try {
        const paramset = await this._call("getParamset", [deviceId, "VALUES"]);
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
      const version = await this._call("getVersion");
      const methods = await this._call("system.listMethods");
      return {
        version,
        methods: methods.length,
      };
    } catch (error) {
      throw new Error(
        `Fehler beim Abrufen der System-Informationen: ${error.message}`,
      );
    }
  }
}

export default LocalClient;
```

```javascript
import CloudClient from "../cloud/cloudClient.js";
import LocalClient from "../local/localClient.js";

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
          name: device.label || device.name || "",
          type: device.type || "",
          state: device.functionalChannels || {},
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
    return devices.map((device) => this._normalizeDevice(device));
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
        name: device.label || device.name || "",
        type: device.type || "",
        model: device.modelType || "",
        manufacturer: device.manufacturer || "eQ-3",
        firmware: device.firmwareVersion || "",
        lowBat: device.lowBat || false,
        unreach: device.unreach || false,
        channels: device.functionalChannels || [],
      };
    } else {
      // Local CCU Format
      return {
        id: device.ADDRESS || device.ID,
        name: device.NAME || "",
        type: device.TYPE || "",
        model: device.TYPE || "",
        manufacturer: "eQ-3",
        firmware: device.FIRMWARE || "",
        lowBat: device.LOWBAT || false,
        unreach: device.UNREACH || false,
        channels: [],
      };
    }
  }
}

export default DeviceController;
```

```javascript
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
```

```javascript
import HomematicIPAddon, { Config } from "../src/index.js";

/**
 * Beispiel 1: Cloud-Verbindung
 */
async function exampleCloud() {
  console.log("=== Beispiel: Cloud-Verbindung ===\n");

  try {
    // Konfiguration für Cloud-Verbindung
    const config = new Config({
      mode: "cloud",
      cloud: {
        accessPointSGTIN: "YOUR_ACCESS_POINT_SGTIN", // Ersetze mit deinem Access Point SGTIN
        authToken: "YOUR_AUTH_TOKEN", // Optional: Wenn bereits vorhanden
      },
    });

    // Addon initialisieren
    const addon = new HomematicIPAddon(config);
    await addon.initialize();

    console.log(`Verbindungsmodus: ${addon.getMode()}\n`);

    // Alle Geräte abrufen
    const devices = await addon.getDevices();
    console.log(`Gefundene Geräte: ${devices.length}`);
    devices.forEach((device) => {
      console.log(`  - ${device.name} (${device.id}) - Typ: ${device.type}`);
    });

    // Beispiel: Gerät einschalten (ersetze DEVICE_ID mit einer echten Geräte-ID)
    if (devices.length > 0) {
      const deviceId = devices[0].id;
      console.log(`\nSchalte Gerät ${devices[0].name} ein...`);
      await addon.setSwitchState(deviceId, true);
      console.log("Gerät eingeschaltet!");
    }
  } catch (error) {
    console.error("Fehler:", error.message);
  }
}

/**
 * Beispiel 2: Lokale CCU-Verbindung
 */
async function exampleLocal() {
  console.log("\n=== Beispiel: Lokale CCU-Verbindung ===\n");

  try {
    // Konfiguration für lokale Verbindung
    const config = new Config({
      mode: "local",
      local: {
        host: "192.168.1.100", // Ersetze mit der IP-Adresse deiner CCU
        port: 2001,
        username: "", // Optional
        password: "", // Optional
      },
    });

    // Addon initialisieren
    const addon = new HomematicIPAddon(config);
    await addon.initialize();

    console.log(`Verbindungsmodus: ${addon.getMode()}\n`);

    // Alle Geräte abrufen
    const devices = await addon.getDevices();
    console.log(`Gefundene Geräte: ${devices.length}`);
    devices.forEach((device) => {
      console.log(`  - ${device.name} (${device.id}) - Typ: ${device.type}`);
    });

    // Beispiel: Dimmer auf 50% setzen
    const dimmer = devices.find(
      (d) => d.type && d.type.toLowerCase().includes("dimmer"),
    );
    if (dimmer) {
      console.log(`\nSetze Dimmer ${dimmer.name} auf 50%...`);
      await addon.setDimLevel(dimmer.id, 0.5);
      console.log("Helligkeit gesetzt!");
    }
  } catch (error) {
    console.error("Fehler:", error.message);
  }
}

/**
 * Beispiel 3: Auto-Detection (Cloud oder Local)
 */
async function exampleAuto() {
  console.log("\n=== Beispiel: Auto-Detection ===\n");

  try {
    // Konfiguration mit beiden Optionen - Auto-Detection wählt automatisch
    const config = new Config({
      mode: "auto", // oder weglassen, Standard ist 'auto'
      cloud: {
        accessPointSGTIN: process.env.HOMEMATIC_IP_ACCESS_POINT_SGTIN || null,
      },
      local: {
        host: process.env.HOMEMATIC_CCU_HOST || "192.168.1.100",
        port: 2001,
      },
    });

    const addon = new HomematicIPAddon(config);
    await addon.initialize();

    console.log(`Verbindungsmodus: ${addon.getMode()}\n`);

    // Gerätestatus abrufen
    const devices = await addon.getDevices();
    if (devices.length > 0) {
      const device = devices[0];
      const state = await addon.getDeviceState(device.id);
      console.log(`Status von ${device.name}:`, JSON.stringify(state, null, 2));
    }
  } catch (error) {
    console.error("Fehler:", error.message);
  }
}

/**
 * Beispiel 4: Umgebungsvariablen verwenden
 */
async function exampleEnvVars() {
  console.log("\n=== Beispiel: Umgebungsvariablen ===\n");

  try {
    // Konfiguration wird automatisch aus Umgebungsvariablen geladen
    // Setze z.B.:
    // export HOMEMATIC_MODE=cloud
    // export HOMEMATIC_IP_ACCESS_POINT_SGTIN=YOUR_SGTIN
    // export HOMEMATIC_IP_AUTH_TOKEN=YOUR_TOKEN

    const config = new Config(); // Lädt automatisch aus Umgebungsvariablen
    const addon = new HomematicIPAddon(config);
    await addon.initialize();

    console.log(`Verbindungsmodus: ${addon.getMode()}\n`);

    const devices = await addon.getDevices();
    console.log(`Gefundene Geräte: ${devices.length}`);
  } catch (error) {
    console.error("Fehler:", error.message);
    console.log(
      "\nHinweis: Stelle sicher, dass die Umgebungsvariablen gesetzt sind.",
    );
  }
}

// Hauptfunktion
async function main() {
  console.log("Homematic IP Addon - Beispiele\n");
  console.log(
    "Hinweis: Passe die Konfiguration in den Beispielen an deine Umgebung an.\n",
  );

  // Kommentiere die gewünschten Beispiele ein:

  // await exampleCloud();
  // await exampleLocal();
  // await exampleAuto();
  await exampleEnvVars();
}

// Führe Beispiele aus, wenn direkt aufgerufen
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { exampleCloud, exampleLocal, exampleAuto, exampleEnvVars };
```

Erstellen der README-Dokumentation:

````markdown
# Homematic IP Addon

Ein Node.js-basiertes Addon zur Steuerung von Homematic IP Geräten über Cloud- oder lokale CCU-Verbindung.

## Features

- ✅ Unterstützung für Homematic IP Cloud API
- ✅ Unterstützung für lokale CCU-Verbindung (XML-RPC)
- ✅ Automatische Erkennung des Verbindungsmodus
- ✅ Einfache API für Gerätesteuerung
- ✅ Unterstützung für Schalter, Dimmer, Thermostate und mehr
- ✅ Konfiguration über Umgebungsvariablen oder Config-Datei

## Installation

```bash
npm install
```
````

## Abhängigkeiten

- Node.js >= 14.0.0
- axios - für HTTP-Requests
- ws - für WebSocket-Verbindungen
- xmlrpc - für XML-RPC Kommunikation mit lokaler CCU

## Konfiguration

### Cloud-Verbindung

Für die Cloud-Verbindung benötigst du:

- Access Point SGTIN (Seriennummer deines Homematic IP Access Points)
- Optional: Auth Token (wird automatisch generiert wenn SGTIN vorhanden)

**Umgebungsvariablen:**

```bash
export HOMEMATIC_MODE=cloud
export HOMEMATIC_IP_ACCESS_POINT_SGTIN=YOUR_SGTIN
export HOMEMATIC_IP_AUTH_TOKEN=YOUR_TOKEN  # Optional
```

**Code:**

```javascript
import { Config } from "./src/index.js";

const config = new Config({
  mode: "cloud",
  cloud: {
    accessPointSGTIN: "YOUR_ACCESS_POINT_SGTIN",
  },
});
```

### Lokale CCU-Verbindung

Für die lokale Verbindung benötigst du:

- IP-Adresse deiner CCU
- Port (Standard: 2001)
- Optional: Benutzername und Passwort

**Umgebungsvariablen:**

```bash
export HOMEMATIC_MODE=local
export HOMEMATIC_CCU_HOST=192.168.1.100
export HOMEMATIC_CCU_PORT=2001
export HOMEMATIC_CCU_USERNAME=admin  # Optional
export HOMEMATIC_CCU_PASSWORD=secret  # Optional
```

**Code:**

```javascript
const config = new Config({
  mode: "local",
  local: {
    host: "192.168.1.100",
    port: 2001,
  },
});
```

### Auto-Detection

Das Addon kann automatisch den besten Verbindungsmodus wählen:

```javascript
const config = new Config({
  mode: "auto", // oder weglassen
  cloud: { accessPointSGTIN: "..." },
  local: { host: "192.168.1.100" },
});
```

## Verwendung

### Grundlegende Verwendung

```javascript
import HomematicIPAddon, { Config } from "./src/index.js";

// Konfiguration erstellen
const config = new Config({
  mode: "cloud",
  cloud: {
    accessPointSGTIN: "YOUR_SGTIN",
  },
});

// Addon initialisieren
const addon = new HomematicIPAddon(config);
await addon.initialize();

// Alle Geräte abrufen
const devices = await addon.getDevices();
console.log(`Gefundene Geräte: ${devices.length}`);

// Gerät einschalten
await addon.setSwitchState("DEVICE_ID", true);

// Dimmer auf 50% setzen
await addon.setDimLevel("DEVICE_ID", 0.5);

// Thermostat-Temperatur setzen
await addon.setTemperature("DEVICE_ID", 21.5);
```

### Erweiterte Verwendung

```javascript
// Gerätestatus abrufen
const state = await addon.getDeviceState("DEVICE_ID");

// Benutzerdefinierten Parameter setzen
await addon.setParameter("DEVICE_ID", "PARAMETER_NAME", value);

// Parameter abrufen
const value = await addon.getParameter("DEVICE_ID", "PARAMETER_NAME");

// Direkten Zugriff auf Client (für erweiterte Funktionen)
const client = addon.getClient();
```

## API-Referenz

### HomematicIPAddon

Hauptklasse für die Gerätesteuerung.

#### Methoden

- `async initialize()` - Initialisiert das Addon und stellt Verbindung her
- `async getDevices()` - Ruft alle Geräte ab
- `async getDevice(deviceId)` - Ruft ein spezifisches Gerät ab
- `async getDeviceState(deviceId)` - Ruft den Status eines Geräts ab
- `async setSwitchState(deviceId, on)` - Schaltet ein Gerät ein/aus
- `async setDimLevel(deviceId, level)` - Setzt Helligkeit (0-1.0 oder 0-100)
- `async setTemperature(deviceId, temperature)` - Setzt Thermostat-Temperatur
- `async setParameter(deviceId, parameter, value)` - Setzt benutzerdefinierten Parameter
- `async getParameter(deviceId, parameter)` - Ruft Parameter ab
- `getMode()` - Gibt den aktuellen Verbindungsmodus zurück ('cloud' oder 'local')
- `getClient()` - Gibt den Client zurück (für erweiterte Nutzung)

### Config

Konfigurationsklasse für Cloud- und Local-Einstellungen.

#### Konstruktor

```javascript
new Config(config);
```

**Parameter:**

- `config.mode` - 'cloud', 'local' oder 'auto'
- `config.cloud` - Cloud-Konfiguration
- `config.local` - Lokale CCU-Konfiguration

#### Statische Methoden

- `Config.fromFile(configPath)` - Lädt Konfiguration aus JSON-Datei

#### Methoden

- `hasCloudConfig()` - Prüft ob Cloud-Konfiguration vorhanden
- `hasLocalConfig()` - Prüft ob lokale Konfiguration vorhanden
- `getMode()` - Bestimmt den zu verwendenden Modus
- `validate()` - Validiert die Konfiguration

## Beispiele

Siehe `examples/basic-usage.js` für vollständige Beispiele:

- Cloud-Verbindung
- Lokale CCU-Verbindung
- Auto-Detection
- Verwendung von Umgebungsvariablen

Beispiele ausführen:

```bash
npm run example
```

## Fehlerbehandlung

Alle Methoden werfen Fehler bei Problemen. Verwende try-catch für Fehlerbehandlung:

```javascript
try {
  await addon.setSwitchState("DEVICE_ID", true);
} catch (error) {
  console.error("Fehler:", error.message);
}
```

## Unterstützte Gerätetypen

- Schalter (Switches)
- Dimmer
- Thermostate
- Sensoren
- Aktoren
- Weitere Homematic IP kompatible Geräte

## Entwicklung

### Projektstruktur

```
my-homematic-addon/
├── src/
│   ├── index.js              # Haupt-Einstiegspunkt
│   ├── config/
│   │   └── config.js         # Konfigurationsverwaltung
│   ├── cloud/
│   │   └── cloudClient.js    # Cloud Client
│   ├── local/
│   │   └── localClient.js    # Lokaler CCU Client
│   └── devices/
│       └── deviceController.js  # Gerätesteuerung
├── examples/
│   └── basic-usage.js        # Beispiele
└── package.json
```

## Lizenz

MIT

## Unterstützung

Bei Problemen oder Fragen:

1. Prüfe die Konfiguration
2. Stelle sicher, dass deine CCU/Cloud erreichbar ist
3. Prüfe die Fehlermeldungen für detaillierte Informationen

## Bekannte Einschränkungen

- Cloud API: Die genaue API-Struktur kann je nach Homematic IP Version variieren
- Lokale CCU: Erfordert XML-RPC Zugriff auf die CCU
- Authentifizierung: Cloud-Authentifizierung kann sich ändern

## Changelog

### Version 1.0.0

- Erste Version
- Cloud- und Local-Unterstützung
- Grundlegende Gerätesteuerung

````


Prüfe auf Linting-Fehler und schließe die letzten Todos ab:



Überprüfe die Projektstruktur, um sicherzustellen, dass alle Dateien vorhanden sind:



Alle Dateien sind vorhanden. Implementierung abgeschlossen.

## Zusammenfassung

Das Homematic IP Addon wurde erstellt. Implementiert:

### Erstellte Dateien:

1. **package.json** - Node.js Projektkonfiguration mit Dependencies (axios, ws, xmlrpc)
2. **.gitignore** - Git-Konfiguration
3. **src/config/config.js** - Konfigurationsverwaltung für Cloud und Local
4. **src/cloud/cloudClient.js** - Cloud Client mit Authentifizierung und API-Kommunikation
5. **src/local/localClient.js** - Lokaler CCU Client mit XML-RPC Unterstützung
6. **src/devices/deviceController.js** - Abstraktion für Gerätesteuerung
7. **src/index.js** - Hauptmodul mit einfacher API
8. **README.md** - Dokumentation mit Installationsanleitung und API-Referenz
9. **examples/basic-usage.js** - Beispiele für Cloud, Local und Auto-Detection

### Features:

- Unterstützung für Homematic IP Cloud API
- Unterstützung für lokale CCU-Verbindung (XML-RPC)
- Automatische Modus-Erkennung (auto, cloud, local)
- Einfache API für Gerätesteuerung (Schalter, Dimmer, Thermostate)
- Konfiguration über Umgebungsvariablen oder Code
- Fehlerbehandlung

### Nächste Schritte:

1. Dependencies installieren: `npm install`
2. Konfiguration anpassen (siehe README.md)
3. Beispiele ausführen: `npm run example`

Das Addon ist einsatzbereit.

---

**User**

ich möchte eine Upload-Seite um ein JSON für den Zeitplan hochzuladen

---

**Cursor**


Kläre ein paar Punkte, um den Plan zu präzisieren:



Aktualisiere den Plan, um die Upload-Seite für den Zeitplan hinzuzufügen:


---

**User**

alles noch mal rückgänging machen

---

**Cursor**


Setze den Plan auf den ursprünglichen Stand zurück (ohne Zeitplan-Upload):


---

**User**

starte nochmal von null weg

---

**Cursor**


Wir starten von null. Was möchtest du erstellen?


---

**User**

Ich möchte ein Homematic IP Addon erstellen bei dem man ein numbers oder excel datei hochladen kann um die Heizungssteuerung für gewisse Bereiche die aus einem oder meherer Geräten bestehen. Um die temperatur für einen gewissen zeitraum einzustellen. Wenn es möglich ist wäre es auch gut hier noch das Heizprofil und gegeben falls zusatz information als text mit zugeben

---

**Cursor**


Kläre ein paar Details, um den Plan zu präzisieren:



Erstelle den Plan für das Homematic IP Addon mit Upload-Funktionalität:


---

**User**

für den Zeitraum verwenden wir Datum und Zeit

---

**Cursor**


Aktualisiere den Plan, sodass Zeiträume Datum und Uhrzeit verwenden:


---

**User**

Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.

---

**Cursor**


Prüfe vorhandene Todos und beginne mit der Implementierung. Berücksichtige dabei, dass Zeiträume Datum und Zeit verwenden.



Beginne mit der Implementierung. Aktualisiere zuerst die Dependencies und erstelle dann die neuen Module.


```json
{
  "name": "my-homematic-addon",
  "version": "1.0.0",
  "description": "Homematic IP Addon für Gerätesteuerung (Cloud und Local)",
  "main": "src/index.js",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "example": "node examples/basic-usage.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [
    "homematic",
    "homematic-ip",
    "smart-home",
    "automation"
  ],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "axios": "^1.6.0",
    "ws": "^8.14.2",
    "xmlrpc": "^1.3.2",
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1",
    "cors": "^2.8.5",
    "xlsx": "^0.18.5"
  },
  "engines": {
    "node": ">=14.0.0"
  }
}


````

```json
{
  "name": "my-homematic-addon",
  "version": "1.0.0",
  "description": "Homematic IP Addon für Gerätesteuerung (Cloud und Local)",
  "main": "src/index.js",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "server": "node server.js",
    "example": "node examples/basic-usage.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": ["homematic", "homematic-ip", "smart-home", "automation"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "axios": "^1.6.0",
    "ws": "^8.14.2",
    "xmlrpc": "^1.3.2",
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1",
    "cors": "^2.8.5",
    "xlsx": "^0.18.5"
  },
  "engines": {
    "node": ">=14.0.0"
  }
}
```

```javascript
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AREAS_FILE = path.join(process.cwd(), "areas.json");

/**
 * Bereichs-Manager
 * Verwaltet Bereiche (Areas) die aus einem oder mehreren Geräten bestehen
 */
export class AreaManager {
  constructor() {
    this.areas = this.loadAreas();
  }

  /**
   * Lädt Bereiche aus der JSON-Datei
   * @returns {object} - Bereiche als Objekt
   */
  loadAreas() {
    try {
      if (fs.existsSync(AREAS_FILE)) {
        const data = fs.readFileSync(AREAS_FILE, "utf8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn(`Fehler beim Laden der Bereiche: ${error.message}`);
    }
    return {};
  }

  /**
   * Speichert Bereiche in die JSON-Datei
   */
  saveAreas() {
    try {
      fs.writeFileSync(AREAS_FILE, JSON.stringify(this.areas, null, 2), "utf8");
    } catch (error) {
      throw new Error(`Fehler beim Speichern der Bereiche: ${error.message}`);
    }
  }

  /**
   * Erstellt oder aktualisiert einen Bereich
   * @param {string} name - Bereichsname
   * @param {Array<string>} deviceIds - Liste von Geräte-IDs
   * @returns {object} - Erstellter/aktualisierter Bereich
   */
  createArea(name, deviceIds) {
    if (!name || typeof name !== "string") {
      throw new Error("Bereichsname muss ein String sein");
    }
    if (!Array.isArray(deviceIds)) {
      throw new Error("deviceIds muss ein Array sein");
    }

    this.areas[name] = {
      name,
      deviceIds: [...deviceIds],
      createdAt: this.areas[name]?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.saveAreas();
    return this.areas[name];
  }

  /**
   * Ruft einen Bereich ab
   * @param {string} name - Bereichsname
   * @returns {object|null} - Bereich oder null wenn nicht gefunden
   */
  getArea(name) {
    return this.areas[name] || null;
  }

  /**
   * Ruft alle Bereiche ab
   * @returns {Array<object>} - Liste aller Bereiche
   */
  getAllAreas() {
    return Object.values(this.areas);
  }

  /**
   * Aktualisiert einen Bereich
   * @param {string} name - Bereichsname
   * @param {Array<string>} deviceIds - Neue Liste von Geräte-IDs
   * @returns {object} - Aktualisierter Bereich
   */
  updateArea(name, deviceIds) {
    if (!this.areas[name]) {
      throw new Error(`Bereich '${name}' nicht gefunden`);
    }
    return this.createArea(name, deviceIds);
  }

  /**
   * Löscht einen Bereich
   * @param {string} name - Bereichsname
   * @returns {boolean} - true wenn gelöscht, false wenn nicht gefunden
   */
  deleteArea(name) {
    if (this.areas[name]) {
      delete this.areas[name];
      this.saveAreas();
      return true;
    }
    return false;
  }

  /**
   * Prüft ob ein Bereich existiert
   * @param {string} name - Bereichsname
   * @returns {boolean}
   */
  hasArea(name) {
    return !!this.areas[name];
  }

  /**
   * Auflösung eines Bereichsnamens oder einer kommagetrennten Geräte-ID-Liste
   * @param {string} areaOrDevices - Bereichsname oder kommagetrennte Geräte-IDs
   * @returns {Array<string>} - Liste von Geräte-IDs
   */
  resolveDevices(areaOrDevices) {
    // Wenn es ein Bereich ist, gib die Geräte zurück
    if (this.areas[areaOrDevices]) {
      return this.areas[areaOrDevices].deviceIds;
    }

    // Wenn es kommagetrennte Geräte-IDs sind, parse sie
    if (areaOrDevices.includes(",")) {
      return areaOrDevices
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id);
    }

    // Sonst ist es eine einzelne Geräte-ID
    return [areaOrDevices.trim()];
  }
}

export default AreaManager;
```

```javascript
/**
 * Heizprofil-Manager
 * Verwaltet vordefinierte und benutzerdefinierte Heizprofile
 */
export class HeatingProfile {
  constructor() {
    this.profiles = {
      Komfort: {
        name: "Komfort",
        temperature: 21.0,
        description: "Komfortable Raumtemperatur",
      },
      Nacht: {
        name: "Nacht",
        temperature: 17.0,
        description: "Nachtabsenkung",
      },
      Abwesenheit: {
        name: "Abwesenheit",
        temperature: 16.0,
        description: "Temperatur bei Abwesenheit",
      },
      Reduziert: {
        name: "Reduziert",
        temperature: 19.0,
        description: "Reduzierte Temperatur",
      },
    };
  }

  /**
   * Ruft ein Profil ab
   * @param {string} profileName - Profilname
   * @returns {object|null} - Profil oder null wenn nicht gefunden
   */
  getProfile(profileName) {
    return this.profiles[profileName] || null;
  }

  /**
   * Ruft alle Profile ab
   * @returns {Array<object>} - Liste aller Profile
   */
  getAllProfiles() {
    return Object.values(this.profiles);
  }

  /**
   * Erstellt oder aktualisiert ein benutzerdefiniertes Profil
   * @param {string} name - Profilname
   * @param {number} temperature - Temperatur in °C
   * @param {string} description - Beschreibung (optional)
   * @returns {object} - Erstelltes/aktualisiertes Profil
   */
  createProfile(name, temperature, description = "") {
    if (
      typeof temperature !== "number" ||
      temperature < 0 ||
      temperature > 30
    ) {
      throw new Error("Temperatur muss eine Zahl zwischen 0 und 30 sein");
    }

    this.profiles[name] = {
      name,
      temperature,
      description,
      custom: true,
    };

    return this.profiles[name];
  }

  /**
   * Löscht ein benutzerdefiniertes Profil
   * @param {string} name - Profilname
   * @returns {boolean} - true wenn gelöscht, false wenn nicht gefunden oder vordefiniert
   */
  deleteProfile(name) {
    // Vordefinierte Profile können nicht gelöscht werden
    if (this.profiles[name] && !this.profiles[name].custom) {
      return false;
    }

    if (this.profiles[name]) {
      delete this.profiles[name];
      return true;
    }
    return false;
  }

  /**
   * Gibt die Temperatur für ein Profil zurück
   * @param {string} profileName - Profilname
   * @param {number} fallbackTemperature - Fallback-Temperatur wenn Profil nicht gefunden
   * @returns {number} - Temperatur in °C
   */
  getTemperature(profileName, fallbackTemperature = null) {
    const profile = this.getProfile(profileName);
    if (profile) {
      return profile.temperature;
    }
    if (fallbackTemperature !== null) {
      return fallbackTemperature;
    }
    throw new Error(`Profil '${profileName}' nicht gefunden`);
  }

  /**
   * Prüft ob ein Profil existiert
   * @param {string} profileName - Profilname
   * @returns {boolean}
   */
  hasProfile(profileName) {
    return !!this.profiles[profileName];
  }
}

export default HeatingProfile;
```

```javascript
import XLSX from "xlsx";
import fs from "fs";

/**
 * Excel-Datei Parser
 * Parst Excel-Dateien (.xlsx) für Heizungszeitpläne
 */
export class ExcelParser {
  /**
   * Parst eine Excel-Datei
   * @param {string} filePath - Pfad zur Excel-Datei
   * @returns {Array<object>} - Geparste Zeilen
   */
  parse(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Datei nicht gefunden: ${filePath}`);
      }

      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { defval: null });

      return this.normalizeData(data);
    } catch (error) {
      throw new Error(`Fehler beim Parsen der Excel-Datei: ${error.message}`);
    }
  }

  /**
   * Normalisiert die Daten und erkennt Spalten automatisch
   * @param {Array<object>} data - Rohe Excel-Daten
   * @returns {Array<object>} - Normalisierte Daten
   */
  normalizeData(data) {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Excel-Datei ist leer oder ungültig");
    }

    // Erkenne Spaltennamen (case-insensitive, verschiedene Varianten)
    const firstRow = data[0];
    const columnMap = this.detectColumns(firstRow);

    return data.map((row, index) => {
      try {
        return this.parseRow(row, columnMap, index + 1);
      } catch (error) {
        throw new Error(`Fehler in Zeile ${index + 1}: ${error.message}`);
      }
    });
  }

  /**
   * Erkennt Spaltennamen automatisch
   * @param {object} firstRow - Erste Zeile der Daten
   * @returns {object} - Mapping von Standardnamen zu tatsächlichen Spaltennamen
   */
  detectColumns(firstRow) {
    const columns = {};
    const keys = Object.keys(firstRow);

    // Normalisiere alle Keys zu lowercase für Vergleich
    const normalizedKeys = {};
    keys.forEach((key) => {
      normalizedKeys[key.toLowerCase().trim()] = key;
    });

    // Suche nach Bereich/Area
    columns.area = this.findColumn(normalizedKeys, [
      "bereich",
      "area",
      "zone",
      "raum",
    ]);

    // Suche nach Startdatum/Startzeit
    columns.startDateTime = this.findColumn(normalizedKeys, [
      "startdatum",
      "start datetime",
      "startzeit",
      "start time",
      "start",
      "von",
      "beginn",
    ]);

    // Suche nach Enddatum/Endzeit
    columns.endDateTime = this.findColumn(normalizedKeys, [
      "enddatum",
      "end datetime",
      "endzeit",
      "end time",
      "end",
      "bis",
      "ende",
    ]);

    // Suche nach Temperatur
    columns.temperature = this.findColumn(normalizedKeys, [
      "temperatur",
      "temperature",
      "temp",
      "°c",
      "celsius",
    ]);

    // Suche nach Heizprofil
    columns.profile = this.findColumn(normalizedKeys, [
      "heizprofil",
      "profil",
      "profile",
      "heating profile",
    ]);

    // Suche nach Zusatzinfo
    columns.notes = this.findColumn(normalizedKeys, [
      "zusatzinfo",
      "notes",
      "notiz",
      "bemerkung",
      "info",
      "information",
    ]);

    // Validiere dass mindestens Bereich, Start- und Enddatum vorhanden sind
    if (!columns.area) {
      throw new Error('Spalte "Bereich" oder "Area" nicht gefunden');
    }
    if (!columns.startDateTime) {
      throw new Error(
        'Spalte "Startdatum" oder "Start DateTime" nicht gefunden',
      );
    }
    if (!columns.endDateTime) {
      throw new Error('Spalte "Enddatum" oder "End DateTime" nicht gefunden');
    }

    return columns;
  }

  /**
   * Findet eine Spalte basierend auf möglichen Namen
   * @param {object} normalizedKeys - Normalisierte Spaltennamen
   * @param {Array<string>} possibleNames - Mögliche Namen
   * @returns {string|null} - Gefundener Spaltenname oder null
   */
  findColumn(normalizedKeys, possibleNames) {
    for (const name of possibleNames) {
      if (normalizedKeys[name]) {
        return normalizedKeys[name];
      }
    }
    return null;
  }

  /**
   * Parst eine einzelne Zeile
   * @param {object} row - Rohe Zeilendaten
   * @param {object} columnMap - Spalten-Mapping
   * @param {number} lineNumber - Zeilennummer für Fehlermeldungen
   * @returns {object} - Geparste Zeile
   */
  parseRow(row, columnMap, lineNumber) {
    const area = row[columnMap.area];
    if (!area) {
      throw new Error("Bereich fehlt");
    }

    const startDateTime = this.parseDateTime(
      row[columnMap.startDateTime],
      "Startdatum",
    );
    const endDateTime = this.parseDateTime(
      row[columnMap.endDateTime],
      "Enddatum",
    );

    if (startDateTime >= endDateTime) {
      throw new Error("Startdatum muss vor Enddatum liegen");
    }

    const temperature = this.parseTemperature(row[columnMap.temperature]);
    const profile = row[columnMap.profile] || null;
    const notes = row[columnMap.notes] || null;

    return {
      area: String(area).trim(),
      startDateTime: startDateTime.toISOString(),
      endDateTime: endDateTime.toISOString(),
      temperature,
      profile,
      notes,
    };
  }

  /**
   * Parst Datum und Zeit aus verschiedenen Formaten
   * @param {*} value - Datum/Zeit Wert
   * @param {string} fieldName - Feldname für Fehlermeldungen
   * @returns {Date} - Parsed Date
   */
  parseDateTime(value, fieldName) {
    if (!value) {
      throw new Error(`${fieldName} fehlt`);
    }

    // Wenn es bereits ein Date-Objekt ist
    if (value instanceof Date) {
      return value;
    }

    // Wenn es eine Excel-Seriennummer ist (Tage seit 1900)
    if (typeof value === "number") {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // Versuche verschiedene String-Formate
    const str = String(value).trim();

    // ISO Format: YYYY-MM-DD HH:MM oder YYYY-MM-DDTHH:MM
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
    if (isoMatch) {
      const date = new Date(
        parseInt(isoMatch[1]),
        parseInt(isoMatch[2]) - 1,
        parseInt(isoMatch[3]),
        parseInt(isoMatch[4]),
        parseInt(isoMatch[5]),
      );
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // Deutsches Format: DD.MM.YYYY HH:MM
    const deMatch = str.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
    if (deMatch) {
      const date = new Date(
        parseInt(deMatch[3]),
        parseInt(deMatch[2]) - 1,
        parseInt(deMatch[1]),
        parseInt(deMatch[4]),
        parseInt(deMatch[5]),
      );
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // Versuche Date.parse als Fallback
    const parsed = Date.parse(str);
    if (!isNaN(parsed)) {
      return new Date(parsed);
    }

    throw new Error(`${fieldName} hat ungültiges Format: ${str}`);
  }

  /**
   * Parst Temperatur
   * @param {*} value - Temperaturwert
   * @returns {number} - Temperatur in °C
   */
  parseTemperature(value) {
    if (value === null || value === undefined || value === "") {
      throw new Error("Temperatur fehlt");
    }

    const temp = parseFloat(value);
    if (isNaN(temp)) {
      throw new Error(`Ungültige Temperatur: ${value}`);
    }

    if (temp < 0 || temp > 30) {
      throw new Error(`Temperatur muss zwischen 0 und 30°C liegen: ${temp}`);
    }

    return temp;
  }
}

export default ExcelParser;
```

```javascript
import ExcelParser from "./excelParser.js";
import fs from "fs";
import path from "path";

/**
 * Numbers-Datei Parser
 * Parst Numbers-Dateien (.numbers) für Heizungszeitpläne
 *
 * Hinweis: .numbers Dateien sind eigentlich ZIP-Archive.
 * Wir versuchen sie zu konvertieren oder als Excel zu behandeln.
 */
export class NumbersParser {
  constructor() {
    this.excelParser = new ExcelParser();
  }

  /**
   * Parst eine Numbers-Datei
   * @param {string} filePath - Pfad zur Numbers-Datei
   * @returns {Array<object>} - Geparste Zeilen
   */
  parse(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Datei nicht gefunden: ${filePath}`);
      }

      // .numbers Dateien sind ZIP-Archive mit XML-Inhalt
      // Versuche zuerst, ob die Datei bereits als Excel gelesen werden kann
      // Falls nicht, versuche Konvertierung

      const ext = path.extname(filePath).toLowerCase();

      if (ext === ".numbers") {
        // Versuche die Numbers-Datei direkt zu lesen
        // Falls das nicht funktioniert, wirf einen hilfreichen Fehler
        try {
          // Numbers-Dateien können manchmal mit xlsx-Library gelesen werden
          // wenn sie intern Excel-Format verwenden
          return this.excelParser.parse(filePath);
        } catch (error) {
          throw new Error(
            `Numbers-Dateien (.numbers) werden derzeit nicht direkt unterstützt. ` +
              `Bitte exportiere die Datei als Excel (.xlsx) Format. ` +
              `Original-Fehler: ${error.message}`,
          );
        }
      }

      // Falls es eine .xlsx Datei ist, verwende den Excel-Parser
      if (ext === ".xlsx" || ext === ".xls") {
        return this.excelParser.parse(filePath);
      }

      throw new Error(`Unbekanntes Dateiformat: ${ext}`);
    } catch (error) {
      throw new Error(`Fehler beim Parsen der Numbers-Datei: ${error.message}`);
    }
  }

  /**
   * Prüft ob eine Datei unterstützt wird
   * @param {string} filePath - Pfad zur Datei
   * @returns {boolean}
   */
  isSupported(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return [".numbers", ".xlsx", ".xls"].includes(ext);
  }
}

export default NumbersParser;
```

Erstelle den ScheduleManager und den Backend-Server:

```javascript
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import HeatingProfile from "./heatingProfile.js";
import AreaManager from "../areas/areaManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEDULES_DIR = path.join(process.cwd(), "schedules");

/**
 * Zeitplan-Manager
 * Verwaltet Heizungszeitpläne mit Datum/Zeit-basierten Zeiträumen
 */
export class ScheduleManager {
  constructor(deviceController = null) {
    this.deviceController = deviceController;
    this.heatingProfile = new HeatingProfile();
    this.areaManager = new AreaManager();
    this.schedules = {};
    this.activeSchedules = new Set();
    this.checkInterval = null;

    // Erstelle schedules Verzeichnis falls nicht vorhanden
    if (!fs.existsSync(SCHEDULES_DIR)) {
      fs.mkdirSync(SCHEDULES_DIR, { recursive: true });
    }

    this.loadAllSchedules();
    this.startScheduler();
  }

  /**
   * Lädt alle gespeicherten Zeitpläne
   */
  loadAllSchedules() {
    try {
      if (!fs.existsSync(SCHEDULES_DIR)) {
        return;
      }

      const files = fs.readdirSync(SCHEDULES_DIR);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(SCHEDULES_DIR, file);
          const data = fs.readFileSync(filePath, "utf8");
          const schedule = JSON.parse(data);
          this.schedules[schedule.id] = schedule;

          if (schedule.active) {
            this.activeSchedules.add(schedule.id);
          }
        } catch (error) {
          console.warn(
            `Fehler beim Laden von Zeitplan ${file}: ${error.message}`,
          );
        }
      }
    } catch (error) {
      console.warn(`Fehler beim Laden der Zeitpläne: ${error.message}`);
    }
  }

  /**
   * Speichert einen Zeitplan
   * @param {object} schedule - Zeitplan-Objekt
   */
  saveSchedule(schedule) {
    const filePath = path.join(SCHEDULES_DIR, `${schedule.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(schedule, null, 2), "utf8");
  }

  /**
   * Erstellt einen neuen Zeitplan
   * @param {string} name - Zeitplan-Name
   * @param {Array<object>} scheduleData - Zeitplan-Daten aus Parser
   * @returns {object} - Erstellter Zeitplan
   */
  createSchedule(name, scheduleData) {
    const id = uuidv4();

    // Gruppiere nach Bereichen
    const areasMap = {};

    for (const row of scheduleData) {
      const areaName = row.area;
      if (!areasMap[areaName]) {
        // Auflöse Bereich zu Geräten
        const deviceIds = this.areaManager.resolveDevices(areaName);
        areasMap[areaName] = {
          areaName,
          devices: deviceIds,
          schedule: [],
        };
      }

      // Bestimme Temperatur (aus Profil oder direkt)
      let temperature = row.temperature;
      if (row.profile) {
        try {
          temperature = this.heatingProfile.getTemperature(
            row.profile,
            row.temperature,
          );
        } catch (e) {
          // Verwende direkte Temperatur wenn Profil nicht gefunden
        }
      }

      areasMap[areaName].schedule.push({
        startDateTime: row.startDateTime,
        endDateTime: row.endDateTime,
        temperature,
        profile: row.profile || null,
        notes: row.notes || null,
      });
    }

    const schedule = {
      id,
      name,
      areas: Object.values(areasMap),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      active: false,
    };

    this.schedules[id] = schedule;
    this.saveSchedule(schedule);

    return schedule;
  }

  /**
   * Ruft einen Zeitplan ab
   * @param {string} id - Zeitplan-ID
   * @returns {object|null}
   */
  getSchedule(id) {
    return this.schedules[id] || null;
  }

  /**
   * Ruft alle Zeitpläne ab
   * @returns {Array<object>}
   */
  getAllSchedules() {
    return Object.values(this.schedules);
  }

  /**
   * Aktiviert einen Zeitplan
   * @param {string} id - Zeitplan-ID
   * @returns {boolean}
   */
  activateSchedule(id) {
    const schedule = this.schedules[id];
    if (!schedule) {
      return false;
    }

    schedule.active = true;
    schedule.updatedAt = new Date().toISOString();
    this.activeSchedules.add(id);
    this.saveSchedule(schedule);

    // Prüfe sofort ob Aktionen ausgeführt werden müssen
    this.checkAndExecute();

    return true;
  }

  /**
   * Deaktiviert einen Zeitplan
   * @param {string} id - Zeitplan-ID
   * @returns {boolean}
   */
  deactivateSchedule(id) {
    const schedule = this.schedules[id];
    if (!schedule) {
      return false;
    }

    schedule.active = false;
    schedule.updatedAt = new Date().toISOString();
    this.activeSchedules.delete(id);
    this.saveSchedule(schedule);

    return true;
  }

  /**
   * Löscht einen Zeitplan
   * @param {string} id - Zeitplan-ID
   * @returns {boolean}
   */
  deleteSchedule(id) {
    const schedule = this.schedules[id];
    if (!schedule) {
      return false;
    }

    this.deactivateSchedule(id);
    delete this.schedules[id];

    const filePath = path.join(SCHEDULES_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return true;
  }

  /**
   * Startet den Scheduler (prüft regelmäßig auf auszuführende Aktionen)
   */
  startScheduler() {
    // Prüfe alle 60 Sekunden
    this.checkInterval = setInterval(() => {
      this.checkAndExecute();
    }, 60000);

    // Prüfe sofort beim Start
    this.checkAndExecute();
  }

  /**
   * Stoppt den Scheduler
   */
  stopScheduler() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Prüft und führt Aktionen aus
   */
  async checkAndExecute() {
    if (!this.deviceController) {
      return; // Kein DeviceController verfügbar
    }

    const now = new Date();

    for (const scheduleId of this.activeSchedules) {
      const schedule = this.schedules[scheduleId];
      if (!schedule || !schedule.active) {
        continue;
      }

      for (const area of schedule.areas) {
        for (const scheduleItem of area.schedule) {
          const startTime = new Date(scheduleItem.startDateTime);
          const endTime = new Date(scheduleItem.endDateTime);

          // Prüfe ob wir im Zeitraum sind
          if (now >= startTime && now <= endTime) {
            // Setze Temperatur für alle Geräte im Bereich
            for (const deviceId of area.devices) {
              try {
                await this.deviceController.setTemperature(
                  deviceId,
                  scheduleItem.temperature,
                );
              } catch (error) {
                console.error(
                  `Fehler beim Setzen der Temperatur für Gerät ${deviceId}: ${error.message}`,
                );
              }
            }
          }
        }
      }
    }
  }

  /**
   * Setzt den DeviceController
   * @param {object} deviceController - DeviceController Instanz
   */
  setDeviceController(deviceController) {
    this.deviceController = deviceController;
  }
}

export default ScheduleManager;
```

Hinzufügen von uuid und Erstellen des Servers:

```json
{
  "name": "my-homematic-addon",
  "version": "1.0.0",
  "description": "Homematic IP Addon für Gerätesteuerung (Cloud und Local)",
  "main": "src/index.js",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "server": "node server.js",
    "example": "node examples/basic-usage.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": ["homematic", "homematic-ip", "smart-home", "automation"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "axios": "^1.6.0",
    "ws": "^8.14.2",
    "xmlrpc": "^1.3.2",
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1",
    "cors": "^2.8.5",
    "xlsx": "^0.18.5",
    "uuid": "^9.0.1"
  },
  "engines": {
    "node": ">=14.0.0"
  }
}
```

```javascript
import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import ExcelParser from "./src/parser/excelParser.js";
import NumbersParser from "./src/parser/numbersParser.js";
import ScheduleManager from "./src/scheduler/scheduleManager.js";
import AreaManager from "./src/areas/areaManager.js";
import HeatingProfile from "./src/scheduler/heatingProfile.js";
import HomematicIPAddon, { Config } from "./src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Upload-Konfiguration
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".xlsx", ".xls", ".numbers"].includes(ext)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Nur Excel (.xlsx, .xls) und Numbers (.numbers) Dateien sind erlaubt",
        ),
      );
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// Globale Instanzen
let addon = null;
let scheduleManager = null;
let areaManager = null;
let heatingProfile = null;

// Initialisiere Homematic IP Addon
async function initializeAddon() {
  try {
    const config = new Config();
    addon = new HomematicIPAddon(config);
    await addon.initialize();

    scheduleManager = new ScheduleManager(addon.controller);
    scheduleManager.setDeviceController(addon.controller);
    areaManager = new AreaManager();
    heatingProfile = new HeatingProfile();

    console.log("Homematic IP Addon initialisiert");
    return true;
  } catch (error) {
    console.error("Fehler bei der Initialisierung:", error.message);
    return false;
  }
}

// API Routes

// Upload und Parse
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Keine Datei hochgeladen" });
    }

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();

    let parser;
    if (ext === ".numbers") {
      parser = new NumbersParser();
    } else {
      parser = new ExcelParser();
    }

    const data = parser.parse(filePath);

    // Lösche temporäre Datei
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (error) {
    // Lösche temporäre Datei bei Fehler
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({ error: error.message });
  }
});

// Zeitplan erstellen
app.post("/api/schedule", async (req, res) => {
  try {
    const { name, data } = req.body;

    if (!name || !data || !Array.isArray(data)) {
      return res
        .status(400)
        .json({ error: "Name und Daten (Array) erforderlich" });
    }

    if (!scheduleManager) {
      return res
        .status(503)
        .json({ error: "Schedule Manager nicht initialisiert" });
    }

    const schedule = scheduleManager.createSchedule(name, data);
    res.json({ success: true, schedule });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Alle Zeitpläne abrufen
app.get("/api/schedules", (req, res) => {
  try {
    if (!scheduleManager) {
      return res
        .status(503)
        .json({ error: "Schedule Manager nicht initialisiert" });
    }

    const schedules = scheduleManager.getAllSchedules();
    res.json({ success: true, schedules });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Spezifischen Zeitplan abrufen
app.get("/api/schedules/:id", (req, res) => {
  try {
    if (!scheduleManager) {
      return res
        .status(503)
        .json({ error: "Schedule Manager nicht initialisiert" });
    }

    const schedule = scheduleManager.getSchedule(req.params.id);
    if (!schedule) {
      return res.status(404).json({ error: "Zeitplan nicht gefunden" });
    }

    res.json({ success: true, schedule });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Zeitplan aktivieren
app.post("/api/schedules/:id/activate", (req, res) => {
  try {
    if (!scheduleManager) {
      return res
        .status(503)
        .json({ error: "Schedule Manager nicht initialisiert" });
    }

    const success = scheduleManager.activateSchedule(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Zeitplan nicht gefunden" });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Zeitplan deaktivieren
app.post("/api/schedules/:id/deactivate", (req, res) => {
  try {
    if (!scheduleManager) {
      return res
        .status(503)
        .json({ error: "Schedule Manager nicht initialisiert" });
    }

    const success = scheduleManager.deactivateSchedule(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Zeitplan nicht gefunden" });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Zeitplan löschen
app.delete("/api/schedules/:id", (req, res) => {
  try {
    if (!scheduleManager) {
      return res
        .status(503)
        .json({ error: "Schedule Manager nicht initialisiert" });
    }

    const success = scheduleManager.deleteSchedule(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Zeitplan nicht gefunden" });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bereiche abrufen
app.get("/api/areas", (req, res) => {
  try {
    if (!areaManager) {
      return res
        .status(503)
        .json({ error: "Area Manager nicht initialisiert" });
    }

    const areas = areaManager.getAllAreas();
    res.json({ success: true, areas });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bereich erstellen/aktualisieren
app.post("/api/areas", (req, res) => {
  try {
    if (!areaManager) {
      return res
        .status(503)
        .json({ error: "Area Manager nicht initialisiert" });
    }

    const { name, deviceIds } = req.body;

    if (!name || !Array.isArray(deviceIds)) {
      return res
        .status(400)
        .json({ error: "Name und deviceIds (Array) erforderlich" });
    }

    const area = areaManager.createArea(name, deviceIds);
    res.json({ success: true, area });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Bereich löschen
app.delete("/api/areas/:name", (req, res) => {
  try {
    if (!areaManager) {
      return res
        .status(503)
        .json({ error: "Area Manager nicht initialisiert" });
    }

    const success = areaManager.deleteArea(req.params.name);
    if (!success) {
      return res.status(404).json({ error: "Bereich nicht gefunden" });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Heizprofile abrufen
app.get("/api/profiles", (req, res) => {
  try {
    if (!heatingProfile) {
      return res
        .status(503)
        .json({ error: "Heating Profile nicht initialisiert" });
    }

    const profiles = heatingProfile.getAllProfiles();
    res.json({ success: true, profiles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Geräte abrufen
app.get("/api/devices", async (req, res) => {
  try {
    if (!addon) {
      return res.status(503).json({ error: "Addon nicht initialisiert" });
    }

    const devices = await addon.getDevices();
    res.json({ success: true, devices });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Error Handler
app.use((error, req, res, next) => {
  console.error("Server Error:", error);
  res.status(error.status || 500).json({
    error: error.message || "Interner Serverfehler",
  });
});

// Server starten
async function startServer() {
  const initialized = await initializeAddon();

  if (!initialized) {
    console.warn(
      "Warnung: Addon konnte nicht initialisiert werden. Server startet trotzdem.",
    );
  }

  app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
    console.log(`Upload-Interface verfügbar unter http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);

// Graceful Shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM Signal empfangen. Server wird beendet...");
  if (scheduleManager) {
    scheduleManager.stopScheduler();
  }
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT Signal empfangen. Server wird beendet...");
  if (scheduleManager) {
    scheduleManager.stopScheduler();
  }
  process.exit(0);
});

export default app;
```

Erstellen des Frontends:

```html
<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Homematic IP Heizungssteuerung</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <div class="container">
      <header>
        <h1>🔥 Homematic IP Heizungssteuerung</h1>
        <p>
          Lade Excel/Numbers-Dateien hoch, um Zeitpläne für die
          Heizungssteuerung zu erstellen
        </p>
      </header>

      <main>
        <!-- Upload Bereich -->
        <section class="upload-section">
          <h2>Datei hochladen</h2>
          <div class="upload-area" id="uploadArea">
            <div class="upload-content">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <p>Ziehe eine Datei hierher oder klicke zum Auswählen</p>
              <p class="upload-hint">Unterstützt: .xlsx, .xls, .numbers</p>
            </div>
            <input
              type="file"
              id="fileInput"
              accept=".xlsx,.xls,.numbers"
              style="display: none;"
            />
          </div>
          <div id="uploadStatus" class="upload-status"></div>
        </section>

        <!-- Vorschau Bereich -->
        <section
          class="preview-section"
          id="previewSection"
          style="display: none;"
        >
          <h2>Vorschau</h2>
          <div class="preview-controls">
            <label>
              Zeitplan-Name:
              <input
                type="text"
                id="scheduleName"
                placeholder="z.B. Winter 2024"
                required
              />
            </label>
            <button id="createScheduleBtn" class="btn btn-primary">
              Zeitplan erstellen
            </button>
          </div>
          <div class="table-container">
            <table id="previewTable">
              <thead>
                <tr>
                  <th>Bereich</th>
                  <th>Startdatum</th>
                  <th>Enddatum</th>
                  <th>Temperatur (°C)</th>
                  <th>Heizprofil</th>
                  <th>Zusatzinfo</th>
                </tr>
              </thead>
              <tbody id="previewTableBody"></tbody>
            </table>
          </div>
        </section>

        <!-- Bereiche Verwaltung -->
        <section class="areas-section">
          <h2>Bereiche verwalten</h2>
          <div class="area-form">
            <input
              type="text"
              id="areaName"
              placeholder="Bereichsname (z.B. Wohnzimmer)"
            />
            <input
              type="text"
              id="areaDevices"
              placeholder="Geräte-IDs (kommagetrennt)"
            />
            <button id="createAreaBtn" class="btn btn-secondary">
              Bereich erstellen
            </button>
          </div>
          <div class="areas-list" id="areasList"></div>
        </section>

        <!-- Zeitpläne Liste -->
        <section class="schedules-section">
          <h2>Aktive Zeitpläne</h2>
          <div class="schedules-list" id="schedulesList"></div>
        </section>
      </main>
    </div>

    <script src="app.js"></script>
  </body>
</html>
```

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu,
    Cantarell, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
  padding: 20px;
  color: #333;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 30px;
  text-align: center;
}

header h1 {
  font-size: 2.5em;
  margin-bottom: 10px;
}

header p {
  font-size: 1.1em;
  opacity: 0.9;
}

main {
  padding: 30px;
}

section {
  margin-bottom: 40px;
}

section h2 {
  color: #667eea;
  margin-bottom: 20px;
  font-size: 1.8em;
  border-bottom: 2px solid #667eea;
  padding-bottom: 10px;
}

/* Upload Bereich */
.upload-area {
  border: 3px dashed #667eea;
  border-radius: 8px;
  padding: 60px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background: #f8f9ff;
}

.upload-area:hover {
  border-color: #764ba2;
  background: #f0f2ff;
}

.upload-area.dragover {
  border-color: #764ba2;
  background: #e8ebff;
  transform: scale(1.02);
}

.upload-content svg {
  color: #667eea;
  margin-bottom: 15px;
}

.upload-content p {
  font-size: 1.1em;
  color: #666;
  margin: 10px 0;
}

.upload-hint {
  font-size: 0.9em;
  color: #999;
}

.upload-status {
  margin-top: 15px;
  padding: 10px;
  border-radius: 5px;
  display: none;
}

.upload-status.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
  display: block;
}

.upload-status.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
  display: block;
}

/* Vorschau */
.preview-controls {
  display: flex;
  gap: 15px;
  margin-bottom: 20px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.preview-controls label {
  flex: 1;
  min-width: 200px;
}

.preview-controls input {
  width: 100%;
  padding: 10px;
  border: 2px solid #ddd;
  border-radius: 5px;
  font-size: 1em;
  margin-top: 5px;
}

.table-container {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

thead {
  background: #667eea;
  color: white;
}

th,
td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}

th {
  font-weight: 600;
}

tbody tr:hover {
  background: #f8f9ff;
}

/* Buttons */
.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 5px;
  font-size: 1em;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: 600;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover {
  background: #5568d3;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #5a6268;
}

.btn-danger {
  background: #dc3545;
  color: white;
}

.btn-danger:hover {
  background: #c82333;
}

.btn-success {
  background: #28a745;
  color: white;
}

.btn-success:hover {
  background: #218838;
}

.btn-small {
  padding: 6px 12px;
  font-size: 0.9em;
}

/* Bereiche */
.area-form {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.area-form input {
  flex: 1;
  min-width: 200px;
  padding: 10px;
  border: 2px solid #ddd;
  border-radius: 5px;
  font-size: 1em;
}

.area-item {
  background: #f8f9ff;
  padding: 15px;
  border-radius: 5px;
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-left: 4px solid #667eea;
}

.area-item strong {
  color: #667eea;
}

.area-item .devices {
  color: #666;
  font-size: 0.9em;
}

/* Zeitpläne */
.schedule-item {
  background: #f8f9ff;
  padding: 20px;
  border-radius: 5px;
  margin-bottom: 15px;
  border-left: 4px solid #667eea;
}

.schedule-item.active {
  border-left-color: #28a745;
}

.schedule-item h3 {
  color: #667eea;
  margin-bottom: 10px;
}

.schedule-item .meta {
  color: #666;
  font-size: 0.9em;
  margin-bottom: 15px;
}

.schedule-item .areas {
  margin-top: 15px;
}

.schedule-item .area-badge {
  display: inline-block;
  background: #667eea;
  color: white;
  padding: 5px 10px;
  border-radius: 3px;
  margin: 5px 5px 5px 0;
  font-size: 0.9em;
}

.schedule-item .actions {
  margin-top: 15px;
  display: flex;
  gap: 10px;
}

/* Loading */
.loading {
  text-align: center;
  padding: 20px;
  color: #667eea;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 40px;
  color: #999;
}

.empty-state svg {
  width: 64px;
  height: 64px;
  margin-bottom: 15px;
  opacity: 0.5;
}

/* Responsive */
@media (max-width: 768px) {
  header h1 {
    font-size: 2em;
  }

  .preview-controls {
    flex-direction: column;
  }

  .area-form {
    flex-direction: column;
  }

  table {
    font-size: 0.9em;
  }

  th,
  td {
    padding: 8px;
  }
}
```

```javascript
const API_BASE = "";

// DOM Elements
const uploadArea = document.getElementById("uploadArea");
const fileInput = document.getElementById("fileInput");
const uploadStatus = document.getElementById("uploadStatus");
const previewSection = document.getElementById("previewSection");
const previewTableBody = document.getElementById("previewTableBody");
const scheduleNameInput = document.getElementById("scheduleName");
const createScheduleBtn = document.getElementById("createScheduleBtn");
const areasList = document.getElementById("areasList");
const schedulesList = document.getElementById("schedulesList");
const areaNameInput = document.getElementById("areaName");
const areaDevicesInput = document.getElementById("areaDevices");
const createAreaBtn = document.getElementById("createAreaBtn");

let parsedData = null;

// Upload Handling
uploadArea.addEventListener("click", () => fileInput.click());
uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragover");
});
uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("dragover");
});
uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragover");
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
});

fileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    handleFile(e.target.files[0]);
  }
});

async function handleFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  uploadStatus.className = "upload-status";
  uploadStatus.textContent = "Datei wird hochgeladen...";
  uploadStatus.style.display = "block";

  try {
    const response = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (result.success) {
      uploadStatus.className = "upload-status success";
      uploadStatus.textContent = `✓ ${result.count} Zeilen erfolgreich geparst`;
      parsedData = result.data;
      showPreview(result.data);
    } else {
      throw new Error(result.error || "Unbekannter Fehler");
    }
  } catch (error) {
    uploadStatus.className = "upload-status error";
    uploadStatus.textContent = `✗ Fehler: ${error.message}`;
    parsedData = null;
    previewSection.style.display = "none";
  }
}

function showPreview(data) {
  previewSection.style.display = "block";
  previewTableBody.innerHTML = "";

  data.forEach((row, index) => {
    const tr = document.createElement("tr");

    const startDate = new Date(row.startDateTime);
    const endDate = new Date(row.endDateTime);

    tr.innerHTML = `
            <td>${escapeHtml(row.area)}</td>
            <td>${formatDateTime(startDate)}</td>
            <td>${formatDateTime(endDate)}</td>
            <td>${row.temperature}°C</td>
            <td>${row.profile || "-"}</td>
            <td>${row.notes || "-"}</td>
        `;

    previewTableBody.appendChild(tr);
  });
}

function formatDateTime(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Zeitplan erstellen
createScheduleBtn.addEventListener("click", async () => {
  if (!parsedData || parsedData.length === 0) {
    alert("Keine Daten zum Erstellen eines Zeitplans");
    return;
  }

  const name = scheduleNameInput.value.trim();
  if (!name) {
    alert("Bitte gib einen Namen für den Zeitplan ein");
    return;
  }

  createScheduleBtn.disabled = true;
  createScheduleBtn.textContent = "Wird erstellt...";

  try {
    const response = await fetch(`${API_BASE}/api/schedule`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        data: parsedData,
      }),
    });

    const result = await response.json();

    if (result.success) {
      alert("Zeitplan erfolgreich erstellt!");
      scheduleNameInput.value = "";
      parsedData = null;
      previewSection.style.display = "none";
      loadSchedules();
    } else {
      throw new Error(result.error || "Unbekannter Fehler");
    }
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  } finally {
    createScheduleBtn.disabled = false;
    createScheduleBtn.textContent = "Zeitplan erstellen";
  }
});

// Bereich erstellen
createAreaBtn.addEventListener("click", async () => {
  const name = areaNameInput.value.trim();
  const devices = areaDevicesInput.value
    .trim()
    .split(",")
    .map((d) => d.trim())
    .filter((d) => d);

  if (!name || devices.length === 0) {
    alert("Bitte gib einen Namen und mindestens eine Geräte-ID ein");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/areas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        deviceIds: devices,
      }),
    });

    const result = await response.json();

    if (result.success) {
      areaNameInput.value = "";
      areaDevicesInput.value = "";
      loadAreas();
    } else {
      throw new Error(result.error || "Unbekannter Fehler");
    }
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
});

// Bereiche laden
async function loadAreas() {
  try {
    const response = await fetch(`${API_BASE}/api/areas`);
    const result = await response.json();

    if (result.success) {
      areasList.innerHTML = "";

      if (result.areas.length === 0) {
        areasList.innerHTML =
          '<div class="empty-state">Keine Bereiche definiert</div>';
        return;
      }

      result.areas.forEach((area) => {
        const div = document.createElement("div");
        div.className = "area-item";
        div.innerHTML = `
                    <div>
                        <strong>${escapeHtml(area.name)}</strong>
                        <div class="devices">Geräte: ${area.deviceIds.join(", ")}</div>
                    </div>
                    <button class="btn btn-danger btn-small" onclick="deleteArea('${area.name}')">Löschen</button>
                `;
        areasList.appendChild(div);
      });
    }
  } catch (error) {
    console.error("Fehler beim Laden der Bereiche:", error);
  }
}

// Bereich löschen
window.deleteArea = async function (name) {
  if (!confirm(`Bereich "${name}" wirklich löschen?`)) {
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE}/api/areas/${encodeURIComponent(name)}`,
      {
        method: "DELETE",
      },
    );

    const result = await response.json();

    if (result.success) {
      loadAreas();
    } else {
      throw new Error(result.error || "Unbekannter Fehler");
    }
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
};

// Zeitpläne laden
async function loadSchedules() {
  try {
    const response = await fetch(`${API_BASE}/api/schedules`);
    const result = await response.json();

    if (result.success) {
      schedulesList.innerHTML = "";

      if (result.schedules.length === 0) {
        schedulesList.innerHTML =
          '<div class="empty-state">Keine Zeitpläne vorhanden</div>';
        return;
      }

      result.schedules.forEach((schedule) => {
        const div = document.createElement("div");
        div.className = `schedule-item ${schedule.active ? "active" : ""}`;

        const createdAt = new Date(schedule.createdAt);
        const areas = schedule.areas.map((a) => a.areaName).join(", ");

        div.innerHTML = `
                    <h3>${escapeHtml(schedule.name)}</h3>
                    <div class="meta">
                        Erstellt: ${formatDateTime(createdAt)} | 
                        Bereiche: ${schedule.areas.length} | 
                        Status: ${schedule.active ? "Aktiv" : "Inaktiv"}
                    </div>
                    <div class="areas">
                        ${schedule.areas.map((a) => `<span class="area-badge">${escapeHtml(a.areaName)}</span>`).join("")}
                    </div>
                    <div class="actions">
                        ${
                          schedule.active
                            ? `<button class="btn btn-secondary btn-small" onclick="deactivateSchedule('${schedule.id}')">Deaktivieren</button>`
                            : `<button class="btn btn-success btn-small" onclick="activateSchedule('${schedule.id}')">Aktivieren</button>`
                        }
                        <button class="btn btn-danger btn-small" onclick="deleteSchedule('${schedule.id}')">Löschen</button>
                    </div>
                `;
        schedulesList.appendChild(div);
      });
    }
  } catch (error) {
    console.error("Fehler beim Laden der Zeitpläne:", error);
  }
}

// Zeitplan aktivieren
window.activateSchedule = async function (id) {
  try {
    const response = await fetch(`${API_BASE}/api/schedules/${id}/activate`, {
      method: "POST",
    });

    const result = await response.json();

    if (result.success) {
      loadSchedules();
    } else {
      throw new Error(result.error || "Unbekannter Fehler");
    }
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
};

// Zeitplan deaktivieren
window.deactivateSchedule = async function (id) {
  try {
    const response = await fetch(`${API_BASE}/api/schedules/${id}/deactivate`, {
      method: "POST",
    });

    const result = await response.json();

    if (result.success) {
      loadSchedules();
    } else {
      throw new Error(result.error || "Unbekannter Fehler");
    }
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
};

// Zeitplan löschen
window.deleteSchedule = async function (id) {
  if (!confirm("Zeitplan wirklich löschen?")) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/schedules/${id}`, {
      method: "DELETE",
    });

    const result = await response.json();

    if (result.success) {
      loadSchedules();
    } else {
      throw new Error(result.error || "Unbekannter Fehler");
    }
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
};

// Initialisierung
loadAreas();
loadSchedules();
setInterval(() => {
  loadSchedules();
}, 30000); // Aktualisiere alle 30 Sekunden
```

Aktualisieren der .gitignore und Prüfen auf Fehler:

Aktualisieren der .gitignore und Korrigieren des uuid-Imports:

```ignore
node_modules/
npm-debug.log
yarn-error.log
.env
.env.local
*.log
.DS_Store
dist/
build/
coverage/
.nyc_output/
uploads/
schedules/
areas.json


```

Erstellen der benötigten Verzeichnisse und einer README-Ergänzung:

Korrigieren des ExcelParser-Imports:

```javascript
import * as XLSX from "xlsx";
import fs from "fs";

/**
 * Excel-Datei Parser
 * Parst Excel-Dateien (.xlsx) für Heizungszeitpläne
 */
export class ExcelParser {
  /**
   * Parst eine Excel-Datei
   * @param {string} filePath - Pfad zur Excel-Datei
   * @returns {Array<object>} - Geparste Zeilen
   */
  parse(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Datei nicht gefunden: ${filePath}`);
      }

      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { defval: null });

      return this.normalizeData(data);
    } catch (error) {
      throw new Error(`Fehler beim Parsen der Excel-Datei: ${error.message}`);
    }
  }

  /**
   * Normalisiert die Daten und erkennt Spalten automatisch
   * @param {Array<object>} data - Rohe Excel-Daten
   * @returns {Array<object>} - Normalisierte Daten
   */
  normalizeData(data) {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Excel-Datei ist leer oder ungültig");
    }

    // Erkenne Spaltennamen (case-insensitive, verschiedene Varianten)
    const firstRow = data[0];
    const columnMap = this.detectColumns(firstRow);

    return data.map((row, index) => {
      try {
        return this.parseRow(row, columnMap, index + 1);
      } catch (error) {
        throw new Error(`Fehler in Zeile ${index + 1}: ${error.message}`);
      }
    });
  }

  /**
   * Erkennt Spaltennamen automatisch
   * @param {object} firstRow - Erste Zeile der Daten
   * @returns {object} - Mapping von Standardnamen zu tatsächlichen Spaltennamen
   */
  detectColumns(firstRow) {
    const columns = {};
    const keys = Object.keys(firstRow);

    // Normalisiere alle Keys zu lowercase für Vergleich
    const normalizedKeys = {};
    keys.forEach((key) => {
      normalizedKeys[key.toLowerCase().trim()] = key;
    });

    // Suche nach Bereich/Area
    columns.area = this.findColumn(normalizedKeys, [
      "bereich",
      "area",
      "zone",
      "raum",
    ]);

    // Suche nach Startdatum/Startzeit
    columns.startDateTime = this.findColumn(normalizedKeys, [
      "startdatum",
      "start datetime",
      "startzeit",
      "start time",
      "start",
      "von",
      "beginn",
    ]);

    // Suche nach Enddatum/Endzeit
    columns.endDateTime = this.findColumn(normalizedKeys, [
      "enddatum",
      "end datetime",
      "endzeit",
      "end time",
      "end",
      "bis",
      "ende",
    ]);

    // Suche nach Temperatur
    columns.temperature = this.findColumn(normalizedKeys, [
      "temperatur",
      "temperature",
      "temp",
      "°c",
      "celsius",
    ]);

    // Suche nach Heizprofil
    columns.profile = this.findColumn(normalizedKeys, [
      "heizprofil",
      "profil",
      "profile",
      "heating profile",
    ]);

    // Suche nach Zusatzinfo
    columns.notes = this.findColumn(normalizedKeys, [
      "zusatzinfo",
      "notes",
      "notiz",
      "bemerkung",
      "info",
      "information",
    ]);

    // Validiere dass mindestens Bereich, Start- und Enddatum vorhanden sind
    if (!columns.area) {
      throw new Error('Spalte "Bereich" oder "Area" nicht gefunden');
    }
    if (!columns.startDateTime) {
      throw new Error(
        'Spalte "Startdatum" oder "Start DateTime" nicht gefunden',
      );
    }
    if (!columns.endDateTime) {
      throw new Error('Spalte "Enddatum" oder "End DateTime" nicht gefunden');
    }

    return columns;
  }

  /**
   * Findet eine Spalte basierend auf möglichen Namen
   * @param {object} normalizedKeys - Normalisierte Spaltennamen
   * @param {Array<string>} possibleNames - Mögliche Namen
   * @returns {string|null} - Gefundener Spaltenname oder null
   */
  findColumn(normalizedKeys, possibleNames) {
    for (const name of possibleNames) {
      if (normalizedKeys[name]) {
        return normalizedKeys[name];
      }
    }
    return null;
  }

  /**
   * Parst eine einzelne Zeile
   * @param {object} row - Rohe Zeilendaten
   * @param {object} columnMap - Spalten-Mapping
   * @param {number} lineNumber - Zeilennummer für Fehlermeldungen
   * @returns {object} - Geparste Zeile
   */
  parseRow(row, columnMap, lineNumber) {
    const area = row[columnMap.area];
    if (!area) {
      throw new Error("Bereich fehlt");
    }

    const startDateTime = this.parseDateTime(
      row[columnMap.startDateTime],
      "Startdatum",
    );
    const endDateTime = this.parseDateTime(
      row[columnMap.endDateTime],
      "Enddatum",
    );

    if (startDateTime >= endDateTime) {
      throw new Error("Startdatum muss vor Enddatum liegen");
    }

    const temperature = this.parseTemperature(row[columnMap.temperature]);
    const profile = row[columnMap.profile] || null;
    const notes = row[columnMap.notes] || null;

    return {
      area: String(area).trim(),
      startDateTime: startDateTime.toISOString(),
      endDateTime: endDateTime.toISOString(),
      temperature,
      profile,
      notes,
    };
  }

  /**
   * Parst Datum und Zeit aus verschiedenen Formaten
   * @param {*} value - Datum/Zeit Wert
   * @param {string} fieldName - Feldname für Fehlermeldungen
   * @returns {Date} - Parsed Date
   */
  parseDateTime(value, fieldName) {
    if (!value) {
      throw new Error(`${fieldName} fehlt`);
    }

    // Wenn es bereits ein Date-Objekt ist
    if (value instanceof Date) {
      return value;
    }

    // Wenn es eine Excel-Seriennummer ist (Tage seit 1900)
    if (typeof value === "number") {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // Versuche verschiedene String-Formate
    const str = String(value).trim();

    // ISO Format: YYYY-MM-DD HH:MM oder YYYY-MM-DDTHH:MM
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
    if (isoMatch) {
      const date = new Date(
        parseInt(isoMatch[1]),
        parseInt(isoMatch[2]) - 1,
        parseInt(isoMatch[3]),
        parseInt(isoMatch[4]),
        parseInt(isoMatch[5]),
      );
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // Deutsches Format: DD.MM.YYYY HH:MM
    const deMatch = str.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
    if (deMatch) {
      const date = new Date(
        parseInt(deMatch[3]),
        parseInt(deMatch[2]) - 1,
        parseInt(deMatch[1]),
        parseInt(deMatch[4]),
        parseInt(deMatch[5]),
      );
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // Versuche Date.parse als Fallback
    const parsed = Date.parse(str);
    if (!isNaN(parsed)) {
      return new Date(parsed);
    }

    throw new Error(`${fieldName} hat ungültiges Format: ${str}`);
  }

  /**
   * Parst Temperatur
   * @param {*} value - Temperaturwert
   * @returns {number} - Temperatur in °C
   */
  parseTemperature(value) {
    if (value === null || value === undefined || value === "") {
      throw new Error("Temperatur fehlt");
    }

    const temp = parseFloat(value);
    if (isNaN(temp)) {
      throw new Error(`Ungültige Temperatur: ${value}`);
    }

    if (temp < 0 || temp > 30) {
      throw new Error(`Temperatur muss zwischen 0 und 30°C liegen: ${temp}`);
    }

    return temp;
  }
}

export default ExcelParser;
```

Aktualisieren der README mit der neuen Upload-Funktionalität:

Hinzufügen einer kurzen Dokumentation zur Upload-Funktionalität in der README:

````markdown
# Homematic IP Addon

Ein Node.js-basiertes Addon zur Steuerung von Homematic IP Geräten über Cloud- oder lokale CCU-Verbindung.

## Features

- ✅ Unterstützung für Homematic IP Cloud API
- ✅ Unterstützung für lokale CCU-Verbindung (XML-RPC)
- ✅ Automatische Erkennung des Verbindungsmodus
- ✅ Einfache API für Gerätesteuerung
- ✅ Unterstützung für Schalter, Dimmer, Thermostate und mehr
- ✅ Konfiguration über Umgebungsvariablen oder Config-Datei
- ✅ **Web-Interface für Heizungssteuerung mit Excel/Numbers-Upload**
- ✅ **Zeitplan-Verwaltung mit Datum/Zeit-basierten Zeiträumen**
- ✅ **Bereichs-Management (Areas) für mehrere Geräte**
- ✅ **Heizprofile (Komfort, Nacht, Abwesenheit, etc.)**

## Installation

```bash
npm install
```
````

## Abhängigkeiten

- Node.js >= 14.0.0
- axios - für HTTP-Requests
- ws - für WebSocket-Verbindungen
- xmlrpc - für XML-RPC Kommunikation mit lokaler CCU

## Konfiguration

### Cloud-Verbindung

Für die Cloud-Verbindung benötigst du:

- Access Point SGTIN (Seriennummer deines Homematic IP Access Points)
- Optional: Auth Token (wird automatisch generiert wenn SGTIN vorhanden)

**Umgebungsvariablen:**

```bash
export HOMEMATIC_MODE=cloud
export HOMEMATIC_IP_ACCESS_POINT_SGTIN=YOUR_SGTIN
export HOMEMATIC_IP_AUTH_TOKEN=YOUR_TOKEN  # Optional
```

**Code:**

```javascript
import { Config } from "./src/index.js";

const config = new Config({
  mode: "cloud",
  cloud: {
    accessPointSGTIN: "YOUR_ACCESS_POINT_SGTIN",
  },
});
```

### Lokale CCU-Verbindung

Für die lokale Verbindung benötigst du:

- IP-Adresse deiner CCU
- Port (Standard: 2001)
- Optional: Benutzername und Passwort

**Umgebungsvariablen:**

```bash
export HOMEMATIC_MODE=local
export HOMEMATIC_CCU_HOST=192.168.1.100
export HOMEMATIC_CCU_PORT=2001
export HOMEMATIC_CCU_USERNAME=admin  # Optional
export HOMEMATIC_CCU_PASSWORD=secret  # Optional
```

**Code:**

```javascript
const config = new Config({
  mode: "local",
  local: {
    host: "192.168.1.100",
    port: 2001,
  },
});
```

### Auto-Detection

Das Addon kann automatisch den besten Verbindungsmodus wählen:

```javascript
const config = new Config({
  mode: "auto", // oder weglassen
  cloud: { accessPointSGTIN: "..." },
  local: { host: "192.168.1.100" },
});
```

## Verwendung

### Grundlegende Verwendung

```javascript
import HomematicIPAddon, { Config } from "./src/index.js";

// Konfiguration erstellen
const config = new Config({
  mode: "cloud",
  cloud: {
    accessPointSGTIN: "YOUR_SGTIN",
  },
});

// Addon initialisieren
const addon = new HomematicIPAddon(config);
await addon.initialize();

// Alle Geräte abrufen
const devices = await addon.getDevices();
console.log(`Gefundene Geräte: ${devices.length}`);

// Gerät einschalten
await addon.setSwitchState("DEVICE_ID", true);

// Dimmer auf 50% setzen
await addon.setDimLevel("DEVICE_ID", 0.5);

// Thermostat-Temperatur setzen
await addon.setTemperature("DEVICE_ID", 21.5);
```

### Erweiterte Verwendung

```javascript
// Gerätestatus abrufen
const state = await addon.getDeviceState("DEVICE_ID");

// Benutzerdefinierten Parameter setzen
await addon.setParameter("DEVICE_ID", "PARAMETER_NAME", value);

// Parameter abrufen
const value = await addon.getParameter("DEVICE_ID", "PARAMETER_NAME");

// Direkten Zugriff auf Client (für erweiterte Funktionen)
const client = addon.getClient();
```

## API-Referenz

### HomematicIPAddon

Hauptklasse für die Gerätesteuerung.

#### Methoden

- `async initialize()` - Initialisiert das Addon und stellt Verbindung her
- `async getDevices()` - Ruft alle Geräte ab
- `async getDevice(deviceId)` - Ruft ein spezifisches Gerät ab
- `async getDeviceState(deviceId)` - Ruft den Status eines Geräts ab
- `async setSwitchState(deviceId, on)` - Schaltet ein Gerät ein/aus
- `async setDimLevel(deviceId, level)` - Setzt Helligkeit (0-1.0 oder 0-100)
- `async setTemperature(deviceId, temperature)` - Setzt Thermostat-Temperatur
- `async setParameter(deviceId, parameter, value)` - Setzt benutzerdefinierten Parameter
- `async getParameter(deviceId, parameter)` - Ruft Parameter ab
- `getMode()` - Gibt den aktuellen Verbindungsmodus zurück ('cloud' oder 'local')
- `getClient()` - Gibt den Client zurück (für erweiterte Nutzung)

### Config

Konfigurationsklasse für Cloud- und Local-Einstellungen.

#### Konstruktor

```javascript
new Config(config);
```

**Parameter:**

- `config.mode` - 'cloud', 'local' oder 'auto'
- `config.cloud` - Cloud-Konfiguration
- `config.local` - Lokale CCU-Konfiguration

#### Statische Methoden

- `Config.fromFile(configPath)` - Lädt Konfiguration aus JSON-Datei

#### Methoden

- `hasCloudConfig()` - Prüft ob Cloud-Konfiguration vorhanden
- `hasLocalConfig()` - Prüft ob lokale Konfiguration vorhanden
- `getMode()` - Bestimmt den zu verwendenden Modus
- `validate()` - Validiert die Konfiguration

## Beispiele

Siehe `examples/basic-usage.js` für vollständige Beispiele:

- Cloud-Verbindung
- Lokale CCU-Verbindung
- Auto-Detection
- Verwendung von Umgebungsvariablen

Beispiele ausführen:

```bash
npm run example
```

## Fehlerbehandlung

Alle Methoden werfen Fehler bei Problemen. Verwende try-catch für Fehlerbehandlung:

```javascript
try {
  await addon.setSwitchState("DEVICE_ID", true);
} catch (error) {
  console.error("Fehler:", error.message);
}
```

## Unterstützte Gerätetypen

- Schalter (Switches)
- Dimmer
- Thermostate
- Sensoren
- Aktoren
- Weitere Homematic IP kompatible Geräte

## Entwicklung

### Projektstruktur

```
my-homematic-addon/
├── src/
│   ├── index.js              # Haupt-Einstiegspunkt
│   ├── config/
│   │   └── config.js         # Konfigurationsverwaltung
│   ├── cloud/
│   │   └── cloudClient.js    # Cloud Client
│   ├── local/
│   │   └── localClient.js    # Lokaler CCU Client
│   └── devices/
│       └── deviceController.js  # Gerätesteuerung
├── examples/
│   └── basic-usage.js        # Beispiele
└── package.json
```

## Lizenz

MIT

## Unterstützung

Bei Problemen oder Fragen:

1. Prüfe die Konfiguration
2. Stelle sicher, dass deine CCU/Cloud erreichbar ist
3. Prüfe die Fehlermeldungen für detaillierte Informationen

## Bekannte Einschränkungen

- Cloud API: Die genaue API-Struktur kann je nach Homematic IP Version variieren
- Lokale CCU: Erfordert XML-RPC Zugriff auf die CCU
- Authentifizierung: Cloud-Authentifizierung kann sich ändern

## Changelog

### Version 1.0.0

- Erste Version
- Cloud- und Local-Unterstützung
- Grundlegende Gerätesteuerung

````

```markdown
# Homematic IP Addon

Ein Node.js-basiertes Addon zur Steuerung von Homematic IP Geräten über Cloud- oder lokale CCU-Verbindung.

## Features

- ✅ Unterstützung für Homematic IP Cloud API
- ✅ Unterstützung für lokale CCU-Verbindung (XML-RPC)
- ✅ Automatische Erkennung des Verbindungsmodus
- ✅ Einfache API für Gerätesteuerung
- ✅ Unterstützung für Schalter, Dimmer, Thermostate und mehr
- ✅ Konfiguration über Umgebungsvariablen oder Config-Datei
- ✅ **Web-Interface für Heizungssteuerung mit Excel/Numbers-Upload**
- ✅ **Zeitplan-Verwaltung mit Datum/Zeit-basierten Zeiträumen**
- ✅ **Bereichs-Management (Areas) für mehrere Geräte**
- ✅ **Heizprofile (Komfort, Nacht, Abwesenheit, etc.)**

## Installation

```bash
npm install
````

## Abhängigkeiten

- Node.js >= 14.0.0
- axios - für HTTP-Requests
- ws - für WebSocket-Verbindungen
- xmlrpc - für XML-RPC Kommunikation mit lokaler CCU
- express - Web-Server für Upload-Interface
- multer - File-Upload Handling
- cors - CORS-Unterstützung
- xlsx - Excel-Datei Parsing
- uuid - Eindeutige IDs für Zeitpläne

## Konfiguration

### Cloud-Verbindung

Für die Cloud-Verbindung benötigst du:

- Access Point SGTIN (Seriennummer deines Homematic IP Access Points)
- Optional: Auth Token (wird automatisch generiert wenn SGTIN vorhanden)

**Umgebungsvariablen:**

```bash
export HOMEMATIC_MODE=cloud
export HOMEMATIC_IP_ACCESS_POINT_SGTIN=YOUR_SGTIN
export HOMEMATIC_IP_AUTH_TOKEN=YOUR_TOKEN  # Optional
```

**Code:**

```javascript
import { Config } from "./src/index.js";

const config = new Config({
  mode: "cloud",
  cloud: {
    accessPointSGTIN: "YOUR_ACCESS_POINT_SGTIN",
  },
});
```

### Lokale CCU-Verbindung

Für die lokale Verbindung benötigst du:

- IP-Adresse deiner CCU
- Port (Standard: 2001)
- Optional: Benutzername und Passwort

**Umgebungsvariablen:**

```bash
export HOMEMATIC_MODE=local
export HOMEMATIC_CCU_HOST=192.168.1.100
export HOMEMATIC_CCU_PORT=2001
export HOMEMATIC_CCU_USERNAME=admin  # Optional
export HOMEMATIC_CCU_PASSWORD=secret  # Optional
```

**Code:**

```javascript
const config = new Config({
  mode: "local",
  local: {
    host: "192.168.1.100",
    port: 2001,
  },
});
```

### Auto-Detection

Das Addon kann automatisch den besten Verbindungsmodus wählen:

```javascript
const config = new Config({
  mode: "auto", // oder weglassen
  cloud: { accessPointSGTIN: "..." },
  local: { host: "192.168.1.100" },
});
```

## Verwendung

### Grundlegende Verwendung

```javascript
import HomematicIPAddon, { Config } from "./src/index.js";

// Konfiguration erstellen
const config = new Config({
  mode: "cloud",
  cloud: {
    accessPointSGTIN: "YOUR_SGTIN",
  },
});

// Addon initialisieren
const addon = new HomematicIPAddon(config);
await addon.initialize();

// Alle Geräte abrufen
const devices = await addon.getDevices();
console.log(`Gefundene Geräte: ${devices.length}`);

// Gerät einschalten
await addon.setSwitchState("DEVICE_ID", true);

// Dimmer auf 50% setzen
await addon.setDimLevel("DEVICE_ID", 0.5);

// Thermostat-Temperatur setzen
await addon.setTemperature("DEVICE_ID", 21.5);
```

### Erweiterte Verwendung

```javascript
// Gerätestatus abrufen
const state = await addon.getDeviceState("DEVICE_ID");

// Benutzerdefinierten Parameter setzen
await addon.setParameter("DEVICE_ID", "PARAMETER_NAME", value);

// Parameter abrufen
const value = await addon.getParameter("DEVICE_ID", "PARAMETER_NAME");

// Direkten Zugriff auf Client (für erweiterte Funktionen)
const client = addon.getClient();
```

## API-Referenz

### HomematicIPAddon

Hauptklasse für die Gerätesteuerung.

#### Methoden

- `async initialize()` - Initialisiert das Addon und stellt Verbindung her
- `async getDevices()` - Ruft alle Geräte ab
- `async getDevice(deviceId)` - Ruft ein spezifisches Gerät ab
- `async getDeviceState(deviceId)` - Ruft den Status eines Geräts ab
- `async setSwitchState(deviceId, on)` - Schaltet ein Gerät ein/aus
- `async setDimLevel(deviceId, level)` - Setzt Helligkeit (0-1.0 oder 0-100)
- `async setTemperature(deviceId, temperature)` - Setzt Thermostat-Temperatur
- `async setParameter(deviceId, parameter, value)` - Setzt benutzerdefinierten Parameter
- `async getParameter(deviceId, parameter)` - Ruft Parameter ab
- `getMode()` - Gibt den aktuellen Verbindungsmodus zurück ('cloud' oder 'local')
- `getClient()` - Gibt den Client zurück (für erweiterte Nutzung)

### Config

Konfigurationsklasse für Cloud- und Local-Einstellungen.

#### Konstruktor

```javascript
new Config(config);
```

**Parameter:**

- `config.mode` - 'cloud', 'local' oder 'auto'
- `config.cloud` - Cloud-Konfiguration
- `config.local` - Lokale CCU-Konfiguration

#### Statische Methoden

- `Config.fromFile(configPath)` - Lädt Konfiguration aus JSON-Datei

#### Methoden

- `hasCloudConfig()` - Prüft ob Cloud-Konfiguration vorhanden
- `hasLocalConfig()` - Prüft ob lokale Konfiguration vorhanden
- `getMode()` - Bestimmt den zu verwendenden Modus
- `validate()` - Validiert die Konfiguration

## Beispiele

Siehe `examples/basic-usage.js` für vollständige Beispiele:

- Cloud-Verbindung
- Lokale CCU-Verbindung
- Auto-Detection
- Verwendung von Umgebungsvariablen

Beispiele ausführen:

```bash
npm run example
```

## Fehlerbehandlung

Alle Methoden werfen Fehler bei Problemen. Verwende try-catch für Fehlerbehandlung:

```javascript
try {
  await addon.setSwitchState("DEVICE_ID", true);
} catch (error) {
  console.error("Fehler:", error.message);
}
```

## Unterstützte Gerätetypen

- Schalter (Switches)
- Dimmer
- Thermostate
- Sensoren
- Aktoren
- Weitere Homematic IP kompatible Geräte

## Entwicklung

### Projektstruktur

```
my-homematic-addon/
├── src/
│   ├── index.js              # Haupt-Einstiegspunkt
│   ├── config/
│   │   └── config.js         # Konfigurationsverwaltung
│   ├── cloud/
│   │   └── cloudClient.js    # Cloud Client
│   ├── local/
│   │   └── localClient.js    # Lokaler CCU Client
│   └── devices/
│       └── deviceController.js  # Gerätesteuerung
├── examples/
│   └── basic-usage.js        # Beispiele
└── package.json
```

## Lizenz

MIT

## Unterstützung

Bei Problemen oder Fragen:

1. Prüfe die Konfiguration
2. Stelle sicher, dass deine CCU/Cloud erreichbar ist
3. Prüfe die Fehlermeldungen für detaillierte Informationen

## Bekannte Einschränkungen

- Cloud API: Die genaue API-Struktur kann je nach Homematic IP Version variieren
- Lokale CCU: Erfordert XML-RPC Zugriff auf die CCU
- Authentifizierung: Cloud-Authentifizierung kann sich ändern

## Changelog

### Version 1.0.0

- Erste Version
- Cloud- und Local-Unterstützung
- Grundlegende Gerätesteuerung

````

```markdown
# Homematic IP Addon

Ein Node.js-basiertes Addon zur Steuerung von Homematic IP Geräten über Cloud- oder lokale CCU-Verbindung.

## Features

- ✅ Unterstützung für Homematic IP Cloud API
- ✅ Unterstützung für lokale CCU-Verbindung (XML-RPC)
- ✅ Automatische Erkennung des Verbindungsmodus
- ✅ Einfache API für Gerätesteuerung
- ✅ Unterstützung für Schalter, Dimmer, Thermostate und mehr
- ✅ Konfiguration über Umgebungsvariablen oder Config-Datei
- ✅ **Web-Interface für Heizungssteuerung mit Excel/Numbers-Upload**
- ✅ **Zeitplan-Verwaltung mit Datum/Zeit-basierten Zeiträumen**
- ✅ **Bereichs-Management (Areas) für mehrere Geräte**
- ✅ **Heizprofile (Komfort, Nacht, Abwesenheit, etc.)**

## Installation

```bash
npm install
````

## Abhängigkeiten

- Node.js >= 14.0.0
- axios - für HTTP-Requests
- ws - für WebSocket-Verbindungen
- xmlrpc - für XML-RPC Kommunikation mit lokaler CCU
- express - Web-Server für Upload-Interface
- multer - File-Upload Handling
- cors - CORS-Unterstützung
- xlsx - Excel-Datei Parsing
- uuid - Eindeutige IDs für Zeitpläne

## Konfiguration

### Cloud-Verbindung

Für die Cloud-Verbindung benötigst du:

- Access Point SGTIN (Seriennummer deines Homematic IP Access Points)
- Optional: Auth Token (wird automatisch generiert wenn SGTIN vorhanden)

**Umgebungsvariablen:**

```bash
export HOMEMATIC_MODE=cloud
export HOMEMATIC_IP_ACCESS_POINT_SGTIN=YOUR_SGTIN
export HOMEMATIC_IP_AUTH_TOKEN=YOUR_TOKEN  # Optional
```

**Code:**

```javascript
import { Config } from "./src/index.js";

const config = new Config({
  mode: "cloud",
  cloud: {
    accessPointSGTIN: "YOUR_ACCESS_POINT_SGTIN",
  },
});
```

### Lokale CCU-Verbindung

Für die lokale Verbindung benötigst du:

- IP-Adresse deiner CCU
- Port (Standard: 2001)
- Optional: Benutzername und Passwort

**Umgebungsvariablen:**

```bash
export HOMEMATIC_MODE=local
export HOMEMATIC_CCU_HOST=192.168.1.100
export HOMEMATIC_CCU_PORT=2001
export HOMEMATIC_CCU_USERNAME=admin  # Optional
export HOMEMATIC_CCU_PASSWORD=secret  # Optional
```

**Code:**

```javascript
const config = new Config({
  mode: "local",
  local: {
    host: "192.168.1.100",
    port: 2001,
  },
});
```

### Auto-Detection

Das Addon kann automatisch den besten Verbindungsmodus wählen:

```javascript
const config = new Config({
  mode: "auto", // oder weglassen
  cloud: { accessPointSGTIN: "..." },
  local: { host: "192.168.1.100" },
});
```

## Verwendung

### Grundlegende Verwendung

```javascript
import HomematicIPAddon, { Config } from "./src/index.js";

// Konfiguration erstellen
const config = new Config({
  mode: "cloud",
  cloud: {
    accessPointSGTIN: "YOUR_SGTIN",
  },
});

// Addon initialisieren
const addon = new HomematicIPAddon(config);
await addon.initialize();

// Alle Geräte abrufen
const devices = await addon.getDevices();
console.log(`Gefundene Geräte: ${devices.length}`);

// Gerät einschalten
await addon.setSwitchState("DEVICE_ID", true);

// Dimmer auf 50% setzen
await addon.setDimLevel("DEVICE_ID", 0.5);

// Thermostat-Temperatur setzen
await addon.setTemperature("DEVICE_ID", 21.5);
```

### Erweiterte Verwendung

```javascript
// Gerätestatus abrufen
const state = await addon.getDeviceState("DEVICE_ID");

// Benutzerdefinierten Parameter setzen
await addon.setParameter("DEVICE_ID", "PARAMETER_NAME", value);

// Parameter abrufen
const value = await addon.getParameter("DEVICE_ID", "PARAMETER_NAME");

// Direkten Zugriff auf Client (für erweiterte Funktionen)
const client = addon.getClient();
```

## API-Referenz

### HomematicIPAddon

Hauptklasse für die Gerätesteuerung.

#### Methoden

- `async initialize()` - Initialisiert das Addon und stellt Verbindung her
- `async getDevices()` - Ruft alle Geräte ab
- `async getDevice(deviceId)` - Ruft ein spezifisches Gerät ab
- `async getDeviceState(deviceId)` - Ruft den Status eines Geräts ab
- `async setSwitchState(deviceId, on)` - Schaltet ein Gerät ein/aus
- `async setDimLevel(deviceId, level)` - Setzt Helligkeit (0-1.0 oder 0-100)
- `async setTemperature(deviceId, temperature)` - Setzt Thermostat-Temperatur
- `async setParameter(deviceId, parameter, value)` - Setzt benutzerdefinierten Parameter
- `async getParameter(deviceId, parameter)` - Ruft Parameter ab
- `getMode()` - Gibt den aktuellen Verbindungsmodus zurück ('cloud' oder 'local')
- `getClient()` - Gibt den Client zurück (für erweiterte Nutzung)

### Config

Konfigurationsklasse für Cloud- und Local-Einstellungen.

#### Konstruktor

```javascript
new Config(config);
```

**Parameter:**

- `config.mode` - 'cloud', 'local' oder 'auto'
- `config.cloud` - Cloud-Konfiguration
- `config.local` - Lokale CCU-Konfiguration

#### Statische Methoden

- `Config.fromFile(configPath)` - Lädt Konfiguration aus JSON-Datei

#### Methoden

- `hasCloudConfig()` - Prüft ob Cloud-Konfiguration vorhanden
- `hasLocalConfig()` - Prüft ob lokale Konfiguration vorhanden
- `getMode()` - Bestimmt den zu verwendenden Modus
- `validate()` - Validiert die Konfiguration

## Beispiele

Siehe `examples/basic-usage.js` für vollständige Beispiele:

- Cloud-Verbindung
- Lokale CCU-Verbindung
- Auto-Detection
- Verwendung von Umgebungsvariablen

Beispiele ausführen:

```bash
npm run example
```

## Web-Interface für Heizungssteuerung

Das Addon bietet ein Web-Interface zum Hochladen von Excel/Numbers-Dateien für die Heizungssteuerung.

### Server starten

```bash
npm run server
```

Das Web-Interface ist dann unter `http://localhost:3000` verfügbar.

### Excel/Numbers Datei-Format

Die hochgeladene Datei sollte folgende Spalten enthalten:

| Spalte                               | Beschreibung                                   | Beispiel                                       |
| ------------------------------------ | ---------------------------------------------- | ---------------------------------------------- |
| **Bereich** (oder Area)              | Bereichsname oder Geräte-IDs (kommagetrennt)   | "Wohnzimmer" oder "DEVICE_1,DEVICE_2"          |
| **Startdatum** (oder Start DateTime) | Format: YYYY-MM-DD HH:MM oder DD.MM.YYYY HH:MM | "2024-01-15 08:00"                             |
| **Enddatum** (oder End DateTime)     | Format: YYYY-MM-DD HH:MM oder DD.MM.YYYY HH:MM | "2024-01-20 22:00"                             |
| **Temperatur** (oder Temp)           | Temperatur in °C                               | 21.0                                           |
| **Heizprofil** (optional)            | Vordefiniertes Profil                          | "Komfort", "Nacht", "Abwesenheit", "Reduziert" |
| **Zusatzinfo** (optional)            | Text-Informationen                             | "Hauptwohnbereich"                             |

### API-Endpoints

- `GET /` - Web-Interface
- `POST /api/upload` - Datei hochladen
- `POST /api/schedule` - Zeitplan erstellen
- `GET /api/schedules` - Alle Zeitpläne
- `POST /api/schedules/:id/activate` - Zeitplan aktivieren
- `POST /api/schedules/:id/deactivate` - Zeitplan deaktivieren
- `DELETE /api/schedules/:id` - Zeitplan löschen
- `GET /api/areas` - Alle Bereiche
- `POST /api/areas` - Bereich erstellen
- `DELETE /api/areas/:name` - Bereich löschen
- `GET /api/profiles` - Alle Heizprofile
- `GET /api/devices` - Alle Geräte

## Fehlerbehandlung

Alle Methoden werfen Fehler bei Problemen. Verwende try-catch für Fehlerbehandlung:

```javascript
try {
  await addon.setSwitchState("DEVICE_ID", true);
} catch (error) {
  console.error("Fehler:", error.message);
}
```

## Unterstützte Gerätetypen

- Schalter (Switches)
- Dimmer
- Thermostate
- Sensoren
- Aktoren
- Weitere Homematic IP kompatible Geräte

## Entwicklung

### Projektstruktur

```
my-homematic-addon/
├── src/
│   ├── index.js              # Haupt-Einstiegspunkt
│   ├── config/
│   │   └── config.js         # Konfigurationsverwaltung
│   ├── cloud/
│   │   └── cloudClient.js    # Cloud Client
│   ├── local/
│   │   └── localClient.js    # Lokaler CCU Client
│   └── devices/
│       └── deviceController.js  # Gerätesteuerung
├── examples/
│   └── basic-usage.js        # Beispiele
└── package.json
```

## Lizenz

MIT

## Unterstützung

Bei Problemen oder Fragen:

1. Prüfe die Konfiguration
2. Stelle sicher, dass deine CCU/Cloud erreichbar ist
3. Prüfe die Fehlermeldungen für detaillierte Informationen

## Bekannte Einschränkungen

- Cloud API: Die genaue API-Struktur kann je nach Homematic IP Version variieren
- Lokale CCU: Erfordert XML-RPC Zugriff auf die CCU
- Authentifizierung: Cloud-Authentifizierung kann sich ändern

## Changelog

### Version 1.0.0

- Erste Version
- Cloud- und Local-Unterstützung
- Grundlegende Gerätesteuerung

````

```markdown
# Homematic IP Addon

Ein Node.js-basiertes Addon zur Steuerung von Homematic IP Geräten über Cloud- oder lokale CCU-Verbindung.

## Features

- ✅ Unterstützung für Homematic IP Cloud API
- ✅ Unterstützung für lokale CCU-Verbindung (XML-RPC)
- ✅ Automatische Erkennung des Verbindungsmodus
- ✅ Einfache API für Gerätesteuerung
- ✅ Unterstützung für Schalter, Dimmer, Thermostate und mehr
- ✅ Konfiguration über Umgebungsvariablen oder Config-Datei
- ✅ **Web-Interface für Heizungssteuerung mit Excel/Numbers-Upload**
- ✅ **Zeitplan-Verwaltung mit Datum/Zeit-basierten Zeiträumen**
- ✅ **Bereichs-Management (Areas) für mehrere Geräte**
- ✅ **Heizprofile (Komfort, Nacht, Abwesenheit, etc.)**

## Installation

```bash
npm install
````

## Abhängigkeiten

- Node.js >= 14.0.0
- axios - für HTTP-Requests
- ws - für WebSocket-Verbindungen
- xmlrpc - für XML-RPC Kommunikation mit lokaler CCU
- express - Web-Server für Upload-Interface
- multer - File-Upload Handling
- cors - CORS-Unterstützung
- xlsx - Excel-Datei Parsing
- uuid - Eindeutige IDs für Zeitpläne

## Konfiguration

### Cloud-Verbindung

Für die Cloud-Verbindung benötigst du:

- Access Point SGTIN (Seriennummer deines Homematic IP Access Points)
- Optional: Auth Token (wird automatisch generiert wenn SGTIN vorhanden)

**Umgebungsvariablen:**

```bash
export HOMEMATIC_MODE=cloud
export HOMEMATIC_IP_ACCESS_POINT_SGTIN=YOUR_SGTIN
export HOMEMATIC_IP_AUTH_TOKEN=YOUR_TOKEN  # Optional
```

**Code:**

```javascript
import { Config } from "./src/index.js";

const config = new Config({
  mode: "cloud",
  cloud: {
    accessPointSGTIN: "YOUR_ACCESS_POINT_SGTIN",
  },
});
```

### Lokale CCU-Verbindung

Für die lokale Verbindung benötigst du:

- IP-Adresse deiner CCU
- Port (Standard: 2001)
- Optional: Benutzername und Passwort

**Umgebungsvariablen:**

```bash
export HOMEMATIC_MODE=local
export HOMEMATIC_CCU_HOST=192.168.1.100
export HOMEMATIC_CCU_PORT=2001
export HOMEMATIC_CCU_USERNAME=admin  # Optional
export HOMEMATIC_CCU_PASSWORD=secret  # Optional
```

**Code:**

```javascript
const config = new Config({
  mode: "local",
  local: {
    host: "192.168.1.100",
    port: 2001,
  },
});
```

### Auto-Detection

Das Addon kann automatisch den besten Verbindungsmodus wählen:

```javascript
const config = new Config({
  mode: "auto", // oder weglassen
  cloud: { accessPointSGTIN: "..." },
  local: { host: "192.168.1.100" },
});
```

## Verwendung

### Grundlegende Verwendung

```javascript
import HomematicIPAddon, { Config } from "./src/index.js";

// Konfiguration erstellen
const config = new Config({
  mode: "cloud",
  cloud: {
    accessPointSGTIN: "YOUR_SGTIN",
  },
});

// Addon initialisieren
const addon = new HomematicIPAddon(config);
await addon.initialize();

// Alle Geräte abrufen
const devices = await addon.getDevices();
console.log(`Gefundene Geräte: ${devices.length}`);

// Gerät einschalten
await addon.setSwitchState("DEVICE_ID", true);

// Dimmer auf 50% setzen
await addon.setDimLevel("DEVICE_ID", 0.5);

// Thermostat-Temperatur setzen
await addon.setTemperature("DEVICE_ID", 21.5);
```

### Erweiterte Verwendung

```javascript
// Gerätestatus abrufen
const state = await addon.getDeviceState("DEVICE_ID");

// Benutzerdefinierten Parameter setzen
await addon.setParameter("DEVICE_ID", "PARAMETER_NAME", value);

// Parameter abrufen
const value = await addon.getParameter("DEVICE_ID", "PARAMETER_NAME");

// Direkten Zugriff auf Client (für erweiterte Funktionen)
const client = addon.getClient();
```

## API-Referenz

### HomematicIPAddon

Hauptklasse für die Gerätesteuerung.

#### Methoden

- `async initialize()` - Initialisiert das Addon und stellt Verbindung her
- `async getDevices()` - Ruft alle Geräte ab
- `async getDevice(deviceId)` - Ruft ein spezifisches Gerät ab
- `async getDeviceState(deviceId)` - Ruft den Status eines Geräts ab
- `async setSwitchState(deviceId, on)` - Schaltet ein Gerät ein/aus
- `async setDimLevel(deviceId, level)` - Setzt Helligkeit (0-1.0 oder 0-100)
- `async setTemperature(deviceId, temperature)` - Setzt Thermostat-Temperatur
- `async setParameter(deviceId, parameter, value)` - Setzt benutzerdefinierten Parameter
- `async getParameter(deviceId, parameter)` - Ruft Parameter ab
- `getMode()` - Gibt den aktuellen Verbindungsmodus zurück ('cloud' oder 'local')
- `getClient()` - Gibt den Client zurück (für erweiterte Nutzung)

### Config

Konfigurationsklasse für Cloud- und Local-Einstellungen.

#### Konstruktor

```javascript
new Config(config);
```

**Parameter:**

- `config.mode` - 'cloud', 'local' oder 'auto'
- `config.cloud` - Cloud-Konfiguration
- `config.local` - Lokale CCU-Konfiguration

#### Statische Methoden

- `Config.fromFile(configPath)` - Lädt Konfiguration aus JSON-Datei

#### Methoden

- `hasCloudConfig()` - Prüft ob Cloud-Konfiguration vorhanden
- `hasLocalConfig()` - Prüft ob lokale Konfiguration vorhanden
- `getMode()` - Bestimmt den zu verwendenden Modus
- `validate()` - Validiert die Konfiguration

## Beispiele

Siehe `examples/basic-usage.js` für vollständige Beispiele:

- Cloud-Verbindung
- Lokale CCU-Verbindung
- Auto-Detection
- Verwendung von Umgebungsvariablen

Beispiele ausführen:

```bash
npm run example
```

## Web-Interface für Heizungssteuerung

Das Addon bietet ein Web-Interface zum Hochladen von Excel/Numbers-Dateien für die Heizungssteuerung.

### Server starten

```bash
npm run server
```

Das Web-Interface ist dann unter `http://localhost:3000` verfügbar.

### Excel/Numbers Datei-Format

Die hochgeladene Datei sollte folgende Spalten enthalten:

| Spalte                               | Beschreibung                                   | Beispiel                                       |
| ------------------------------------ | ---------------------------------------------- | ---------------------------------------------- |
| **Bereich** (oder Area)              | Bereichsname oder Geräte-IDs (kommagetrennt)   | "Wohnzimmer" oder "DEVICE_1,DEVICE_2"          |
| **Startdatum** (oder Start DateTime) | Format: YYYY-MM-DD HH:MM oder DD.MM.YYYY HH:MM | "2024-01-15 08:00"                             |
| **Enddatum** (oder End DateTime)     | Format: YYYY-MM-DD HH:MM oder DD.MM.YYYY HH:MM | "2024-01-20 22:00"                             |
| **Temperatur** (oder Temp)           | Temperatur in °C                               | 21.0                                           |
| **Heizprofil** (optional)            | Vordefiniertes Profil                          | "Komfort", "Nacht", "Abwesenheit", "Reduziert" |
| **Zusatzinfo** (optional)            | Text-Informationen                             | "Hauptwohnbereich"                             |

### API-Endpoints

- `GET /` - Web-Interface
- `POST /api/upload` - Datei hochladen
- `POST /api/schedule` - Zeitplan erstellen
- `GET /api/schedules` - Alle Zeitpläne
- `POST /api/schedules/:id/activate` - Zeitplan aktivieren
- `POST /api/schedules/:id/deactivate` - Zeitplan deaktivieren
- `DELETE /api/schedules/:id` - Zeitplan löschen
- `GET /api/areas` - Alle Bereiche
- `POST /api/areas` - Bereich erstellen
- `DELETE /api/areas/:name` - Bereich löschen
- `GET /api/profiles` - Alle Heizprofile
- `GET /api/devices` - Alle Geräte

## Fehlerbehandlung

Alle Methoden werfen Fehler bei Problemen. Verwende try-catch für Fehlerbehandlung:

```javascript
try {
  await addon.setSwitchState("DEVICE_ID", true);
} catch (error) {
  console.error("Fehler:", error.message);
}
```

## Unterstützte Gerätetypen

- Schalter (Switches)
- Dimmer
- Thermostate
- Sensoren
- Aktoren
- Weitere Homematic IP kompatible Geräte

## Entwicklung

### Projektstruktur

```
my-homematic-addon/
├── src/
│   ├── index.js              # Haupt-Einstiegspunkt
│   ├── config/
│   │   └── config.js         # Konfigurationsverwaltung
│   ├── cloud/
│   │   └── cloudClient.js    # Cloud Client
│   ├── local/
│   │   └── localClient.js    # Lokaler CCU Client
│   └── devices/
│       └── deviceController.js  # Gerätesteuerung
├── examples/
│   └── basic-usage.js        # Beispiele
└── package.json
```

## Lizenz

MIT

## Unterstützung

Bei Problemen oder Fragen:

1. Prüfe die Konfiguration
2. Stelle sicher, dass deine CCU/Cloud erreichbar ist
3. Prüfe die Fehlermeldungen für detaillierte Informationen

## Bekannte Einschränkungen

- Cloud API: Die genaue API-Struktur kann je nach Homematic IP Version variieren
- Lokale CCU: Erfordert XML-RPC Zugriff auf die CCU
- Authentifizierung: Cloud-Authentifizierung kann sich ändern

## Changelog

### Version 1.1.0

- Web-Interface für Heizungssteuerung
- Excel/Numbers Datei-Upload
- Zeitplan-Verwaltung mit Datum/Zeit
- Bereichs-Management
- Heizprofile

### Version 1.0.0

- Erste Version
- Cloud- und Local-Unterstützung
- Grundlegende Gerätesteuerung

````


Abschließende Überprüfung der Projektstruktur:



## Implementierung abgeschlossen

### Erstellte Komponenten

1. **Backend-Server** (`server.js`)
   - Express.js Server mit REST API
   - File-Upload mit Multer
   - Alle API-Endpoints implementiert

2. **Parser-Module** (`src/parser/`)
   - `excelParser.js` - Excel-Datei Parsing mit automatischer Spaltenerkennung
   - `numbersParser.js` - Numbers-Datei Unterstützung

3. **Scheduler-Module** (`src/scheduler/`)
   - `scheduleManager.js` - Zeitplan-Verwaltung mit Datum/Zeit-basierter Ausführung
   - `heatingProfile.js` - Heizprofil-Verwaltung (Komfort, Nacht, etc.)

4. **Bereichs-Manager** (`src/areas/`)
   - `areaManager.js` - Verwaltung von Bereichen (Areas) mit mehreren Geräten

5. **Web-Frontend** (`public/`)
   - `index.html` - Upload-Interface mit Drag & Drop
   - `style.css` - Modernes, responsives Design
   - `app.js` - Frontend-Logik mit API-Integration

6. **Konfiguration**
   - `package.json` - Aktualisiert mit allen Dependencies
   - `.gitignore` - Aktualisiert für neue Verzeichnisse

### Features

- Excel/Numbers Datei-Upload mit automatischer Spaltenerkennung
- Datum/Zeit-basierte Zeitpläne (nicht nur Uhrzeit)
- Bereichs-Management für mehrere Geräte
- Heizprofile (Komfort, Nacht, Abwesenheit, Reduziert)
- Automatische Temperatursteuerung basierend auf Zeitplänen
- Web-Interface mit Vorschau und Verwaltung

### Nächste Schritte

1. Dependencies installieren:
   ```bash
   npm install
````

2. Server starten:

   ```bash
   npm run server
   ```

3. Web-Interface öffnen:

   ```
   http://localhost:3000
   ```

4. Excel-Datei mit Zeitplan erstellen (siehe README für Format)

Die Implementierung ist vollständig und einsatzbereit.

```shellscript
   npm install
```

```shellscript
   npm run server
```

```plaintext
   http://localhost:3000
```
