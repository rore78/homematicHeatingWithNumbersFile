import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import { readFileSync, existsSync } from "fs";
import logger from "../utils/logger.js";

const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const MAX_RECONNECT_DELAY_MS = 60000;
const CONTAINER_TOKEN_PATH = "/TOKEN";

/**
 * Homematic IP Connect API Client (HCU)
 *
 * Implementiert das HmipClient-Interface ueber eine WebSocket-Verbindung
 * zur Home Control Unit. Nutzt das PluginMessage-Envelope mit HMIP_SYSTEM_*
 * Nachrichten fuer Geraetesteuerung und System-Events fuer Live-Updates.
 *
 * @implements {HmipClient}
 */
export class ConnectApiClient {
  constructor(config = {}) {
    this.pluginId = config.pluginId || "com.redlberger.hmip.heizungssteuerung";
    this.host = config.host || "host.containers.internal";
    this.port = config.port || 9001;
    this.authToken = config.authToken || this._readContainerToken();
    this.friendlyName = config.friendlyName || {
      de: "Heizungssteuerung",
      en: "Heating Control",
    };
    this.subscribeSystemEvents = config.subscribeSystemEvents !== false;

    this.ws = null;
    this.connected = false;
    this.pendingRequests = new Map(); // id -> { resolve, reject, timeout }
    this.eventHandlers = new Map(); // eventType -> [handler]
    this.systemState = null; // Gecachter Systemstatus
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.shouldReconnect = true;
    this.configTemplate = config.configTemplate || null;
    this.configUpdateHandler = config.configUpdateHandler || null;
  }

  // -- HmipClient Interface --

  /**
   * Baut die WebSocket-Verbindung zur HCU auf.
   * @returns {Promise<void>}
   */
  async connect() {
    if (!this.authToken) {
      throw new Error(
        "Kein Auth-Token verfuegbar. Bitte HOMEMATIC_AUTH_TOKEN setzen oder /TOKEN bereitstellen.",
      );
    }

    return new Promise((resolve, reject) => {
      const url = `wss://${this.host}:${this.port}`;
      const headers = {
        authtoken: this.authToken,
        "plugin-id": this.pluginId,
      };
      if (this.subscribeSystemEvents) {
        headers["hmip-system-events"] = "true";
      }

      this.ws = new WebSocket(url, {
        rejectUnauthorized: false, // Selbstsigniertes Zertifikat der HCU
        headers,
      });

      const onOpen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this._emit("connected");
        logger.info(`Connect API verbunden: ${url}`);
        this.ws.off("error", onError);
        resolve();
      };
      const onError = (err) => {
        this.ws.off("open", onOpen);
        reject(err);
      };

      this.ws.once("open", onOpen);
      this.ws.once("error", onError);
      this.ws.on("message", (data) => this._onRawMessage(data));
      this.ws.on("close", () => this._onClose());
      this.ws.on("error", (err) => this._onError(err));
    });
  }

  /**
   * Beendet die Verbindung sauber.
   * @returns {Promise<void>}
   */
  async disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    // Pending Requests abbrechen
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Verbindung geschlossen"));
    }
    this.pendingRequests.clear();
  }

  /**
   * Registriert einen Event-Handler.
   * @param {string} event - Event-Typ
   * @param {function} handler
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  /**
   * Ruft den Systemstatus von der HCU ab.
   * @returns {Promise<Object>}
   */
  async getSystemState() {
    const result = await this._systemRequest("/hmip/home/getSystemState", {});
    this.systemState = result;
    return result;
  }

  /**
   * Liefert alle bekannten Geraete als normalisiertes Array.
   * @returns {Promise<HmipDevice[]>}
   */
  async getDevices() {
    if (!this.systemState) {
      await this.getSystemState();
    }
    const raw = this.systemState?.devices || {};
    return Object.entries(raw).map(([id, device]) =>
      this._normalizeDevice(id, device),
    );
  }

  /**
   * Liefert ein einzelnes Geraet anhand der ID.
   * @param {string} deviceId
   * @returns {Promise<HmipDevice>}
   */
  async getDevice(deviceId) {
    const devices = await this.getDevices();
    const device = devices.find((d) => d.id === deviceId);
    if (!device) {
      throw new Error(`Geraet mit ID ${deviceId} nicht gefunden`);
    }
    return device;
  }

  /**
   * Setzt die Zieltemperatur einer Heizgruppe.
   * @param {string} groupId
   * @param {number} temperature - °C (5-30)
   */
  async setTemperature(groupId, temperature) {
    const clamped = Math.max(5, Math.min(30, temperature));
    await this._systemRequest("/hmip/group/heating/setSetPointTemperature", {
      groupId,
      setPointTemperature: clamped,
    });
  }

  /**
   * Aktiviert/deaktiviert Boost.
   * @param {string} groupId
   * @param {boolean} boost
   */
  async setBoost(groupId, boost) {
    await this._systemRequest("/hmip/group/heating/setBoost", {
      groupId,
      boost,
    });
  }

  /**
   * Aktiviert ein Heizprofil.
   * @param {string} groupId
   * @param {string} profileIndex - 'PROFILE_1' bis 'PROFILE_6'
   */
  async setActiveProfile(groupId, profileIndex) {
    const profile =
      typeof profileIndex === "number"
        ? `PROFILE_${profileIndex}`
        : profileIndex;
    await this._systemRequest("/hmip/group/heating/setActiveProfile", {
      groupId,
      profileIndex: profile,
    });
  }

  /**
   * Setzt den Steuerungsmodus.
   * @param {string} groupId
   * @param {string} controlMode - 'AUTOMATIC' oder 'MANUAL'
   */
  async setControlMode(groupId, controlMode) {
    await this._systemRequest("/hmip/group/heating/setControlMode", {
      groupId,
      controlMode,
    });
  }

  /**
   * Schaltet einen Schaltaktor.
   * @param {string} deviceId
   * @param {boolean} on
   * @param {number} [channelIndex=1]
   */
  async setSwitchState(deviceId, on, channelIndex = 1) {
    await this._systemRequest("/hmip/device/control/setSwitchState", {
      deviceId,
      channelIndex,
      on,
    });
  }

  /**
   * Aktiviert dauerhafte Abwesenheit (Economy-Modus).
   */
  async activateAbsence() {
    await this._systemRequest(
      "/hmip/home/heating/activateAbsencePermanent",
      {},
    );
  }

  /**
   * Deaktiviert Abwesenheit.
   */
  async deactivateAbsence() {
    await this._systemRequest("/hmip/home/heating/deactivateAbsence", {});
  }

  // -- Nachrichten senden / empfangen --

  _sendMessage(type, body = {}, id = null) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket nicht verbunden");
    }
    const messageId = id || uuidv4();
    const message = {
      pluginId: this.pluginId,
      id: messageId,
      type,
      body,
    };
    this.ws.send(JSON.stringify(message));
    return messageId;
  }

  _sendRequest(type, body = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Zeitueberschreitung fuer ${type} (${id})`));
      }, timeoutMs);
      this.pendingRequests.set(id, { resolve, reject, timeout });
      try {
        this._sendMessage(type, body, id);
      } catch (err) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  async _systemRequest(path, body) {
    const response = await this._sendRequest("HMIP_SYSTEM_REQUEST", {
      path,
      body,
    });
    const code = response.body?.code;
    if (code !== 200) {
      const errorCode = response.body?.body?.errorCode || "UNKNOWN";
      throw new Error(
        `HmIP System-Fehler: ${errorCode} (HTTP ${code}, Pfad: ${path})`,
      );
    }
    return response.body?.body;
  }

  _onRawMessage(data) {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (err) {
      logger.warn(`Ungueltige JSON-Nachricht empfangen: ${err.message}`);
      return;
    }
    this._handleMessage(message);
  }

  _handleMessage(message) {
    // 1. Pending Request aufloesen (Response-Korrelation via ID)
    if (message.id && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id);
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(message.id);
      pending.resolve(message);
      return;
    }

    // 2. Eingehende Requests von der HCU
    switch (message.type) {
      case "PLUGIN_STATE_REQUEST":
        this._handlePluginStateRequest(message);
        break;
      case "CONFIG_TEMPLATE_REQUEST":
        this._handleConfigTemplateRequest(message);
        break;
      case "CONFIG_UPDATE_REQUEST":
        this._handleConfigUpdateRequest(message);
        break;
      case "STATUS_REQUEST":
        this._handleStatusRequest(message);
        break;
      case "HMIP_SYSTEM_EVENT":
        this._handleSystemEvent(message);
        break;
      case "INCLUSION_EVENT":
      case "EXCLUSION_EVENT":
      case "DISCOVER_REQUEST":
        // Dieses Plugin bindet keine Drittanbieter-Geraete ein.
        break;
      case "ERROR_RESPONSE":
        logger.error(
          `Connect API Fehler: ${message.body?.error?.code} - ${message.body?.error?.message}`,
        );
        break;
      default:
        logger.debug(`Unbehandelte Nachricht: ${message.type}`);
    }
  }

  _handlePluginStateRequest(message) {
    try {
      this._sendMessage(
        "PLUGIN_STATE_RESPONSE",
        {
          pluginReadinessStatus: "READY",
          friendlyName: this.friendlyName,
        },
        message.id,
      );
    } catch (err) {
      logger.error(`PluginStateResponse fehlgeschlagen: ${err.message}`);
    }
  }

  _handleConfigTemplateRequest(message) {
    if (!this.configTemplate) {
      // Leeres Template wenn nichts konfiguriert
      this._sendMessage(
        "CONFIG_TEMPLATE_RESPONSE",
        { properties: {}, groups: {} },
        message.id,
      );
      return;
    }
    this._sendMessage(
      "CONFIG_TEMPLATE_RESPONSE",
      this.configTemplate,
      message.id,
    );
  }

  _handleConfigUpdateRequest(message) {
    const properties = message.body?.properties || {};
    let status = "APPLIED";
    let errorMessage;

    try {
      if (this.configUpdateHandler) {
        this.configUpdateHandler(properties);
      }
    } catch (err) {
      status = "FAILED";
      errorMessage = err.message;
      logger.error(`Config-Update fehlgeschlagen: ${err.message}`);
    }

    this._sendMessage(
      "CONFIG_UPDATE_RESPONSE",
      { status, message: errorMessage },
      message.id,
    );
  }

  _handleStatusRequest(message) {
    // Dieses Plugin verwaltet keine eigenen Drittanbieter-Geraete.
    // Wir antworten mit leerer Geraete-Liste.
    this._sendMessage(
      "STATUS_RESPONSE",
      { devices: [], success: true },
      message.id,
    );
  }

  _handleSystemEvent(message) {
    const transaction = message.body?.eventTransaction;
    if (!transaction?.events) return;

    const events = Array.isArray(transaction.events)
      ? transaction.events
      : Object.values(transaction.events);

    for (const event of events) {
      switch (event.pushEventType) {
        case "DEVICE_CHANGED":
          this._emit("deviceChanged", event.device);
          break;
        case "DEVICE_ADDED":
          this._emit("deviceAdded", event.device);
          break;
        case "DEVICE_REMOVED":
          this._emit("deviceRemoved", event.id);
          break;
        case "GROUP_CHANGED":
          this._emit("groupChanged", event.group);
          break;
        case "HOME_CHANGED":
          // Cache invalidieren, damit der naechste getSystemState frisch laedt
          this.systemState = null;
          break;
      }
    }
  }

  _emit(event, data) {
    const handlers = this.eventHandlers.get(event) || [];
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (err) {
        logger.error(`Event-Handler-Fehler (${event}): ${err.message}`);
      }
    }
  }

  _onClose() {
    this.connected = false;
    this._emit("disconnected");
    // Pending Requests beim Close abbrechen
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("WebSocket geschlossen"));
    }
    this.pendingRequests.clear();

    if (this.shouldReconnect) {
      this._scheduleReconnect();
    }
  }

  _onError(err) {
    logger.warn(`WebSocket-Fehler: ${err.message}`);
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(
      MAX_RECONNECT_DELAY_MS,
      1000 * Math.pow(2, this.reconnectAttempts),
    );
    this.reconnectAttempts++;
    logger.info(`Reconnect in ${delay}ms (Versuch ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        logger.warn(`Reconnect fehlgeschlagen: ${err.message}`);
      });
    }, delay);
  }

  _readContainerToken() {
    try {
      if (existsSync(CONTAINER_TOKEN_PATH)) {
        return readFileSync(CONTAINER_TOKEN_PATH, "utf-8").trim();
      }
    } catch {
      // Ignorieren -- kein Token in der Container-Umgebung verfuegbar
    }
    return null;
  }

  /**
   * Normalisiert ein Connect-API-Geraet in das HmipDevice-Format.
   * @private
   */
  _normalizeDevice(id, device) {
    const channels = device?.functionalChannels || {};
    const { temperature, setPointTemperature, humidity } =
      this._extractHeatingValues(channels);

    return {
      id,
      name: device.label || device.type || id,
      type: device.type || "",
      model: device.modelType || "",
      manufacturer: device.manufacturer || "eQ-3",
      firmware: device.firmwareVersion || "",
      lowBat: this._anyChannelProp(channels, "lowBat"),
      unreach: this._anyChannelProp(channels, "unreach"),
      channels,
      temperature,
      setPointTemperature,
      humidity,
    };
  }

  _extractHeatingValues(channels) {
    let temperature, setPointTemperature, humidity;
    for (const ch of Object.values(channels)) {
      if (ch.actualTemperature != null && temperature == null) {
        temperature = ch.actualTemperature;
      }
      if (ch.setPointTemperature != null && setPointTemperature == null) {
        setPointTemperature = ch.setPointTemperature;
      }
      if (ch.humidity != null && humidity == null) {
        humidity = ch.humidity;
      }
    }
    return { temperature, setPointTemperature, humidity };
  }

  _anyChannelProp(channels, prop) {
    return Object.values(channels).some((ch) => ch?.[prop] === true);
  }
}

export default ConnectApiClient;
