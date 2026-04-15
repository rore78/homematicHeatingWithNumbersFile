import fs from "fs";
import path from "path";
import Config from "./config/config.js";
import CloudClient from "./client/cloudClient.js";
import ConnectApiClient from "./client/connectApiClient.js";
import DeviceController from "./devices/deviceController.js";
import ScheduleManager from "./scheduler/scheduleManager.js";
import AreaManager from "./areas/areaManager.js";
import logger from "./utils/logger.js";

/**
 * Homematic IP Plugin -- HCU Connect API + Cloud API
 *
 * Startet das Plugin im erkannten Modus (hcu oder cloud), initialisiert
 * die Module und startet die Zeitplan-Ausfuehrungsschleife.
 */
export class HomematicIPPlugin {
  constructor(options = {}) {
    this.config = options.config instanceof Config ? options.config : new Config(options);
    this.dataDir = options.dataDir || process.env.DATA_DIR || process.cwd();
    this.client = null;
    this.controller = null;
    this.scheduleManager = null;
    this.mode = null;
  }

  /**
   * Startet das Plugin: erstellt Client, verbindet, initialisiert Module.
   * @returns {Promise<void>}
   */
  async start() {
    this._prepareDataDir();

    const validation = this.config.validate();
    if (!validation.valid) {
      throw new Error(`Konfigurationsfehler: ${validation.errors.join(", ")}`);
    }

    this.mode = this.config.getMode();
    logger.info(`Plugin startet im Modus: ${this.mode}`);

    // Client erstellen
    if (this.mode === "hcu") {
      this.client = new ConnectApiClient({
        ...this.config.hcu,
        configTemplate: this._buildConfigTemplate(),
        configUpdateHandler: (props) => this._onConfigUpdate(props),
      });
    } else if (this.mode === "cloud") {
      this.client = new CloudClient(this.config.cloud);
    } else {
      throw new Error(`Unbekannter Modus: ${this.mode}`);
    }

    // Verbinden
    await this.client.connect();

    // DeviceController
    this.controller = new DeviceController(this.client);

    // AreaManager und ScheduleManager mit DATA_DIR-Pfaden
    const areaManager = new AreaManager(
      path.join(this.dataDir, "areas.json"),
    );
    this.scheduleManager = new ScheduleManager(this.controller, {
      schedulesDir: path.join(this.dataDir, "schedules"),
      areaManager,
    });

    // Event-Handler fuer Live-Updates (nur im HCU-Modus relevant)
    if (this.mode === "hcu") {
      this.client.on("deviceChanged", (device) => {
        logger.debug(`Geraet geaendert: ${device?.id}`);
      });
      this.client.on("disconnected", () => {
        logger.warn("Verbindung zur HCU verloren");
      });
    }

    logger.info("Plugin erfolgreich gestartet");
  }

  /**
   * Stoppt das Plugin sauber.
   * @returns {Promise<void>}
   */
  async stop() {
    if (this.scheduleManager?.stopScheduler) {
      this.scheduleManager.stopScheduler();
    }
    if (this.client) {
      await this.client.disconnect();
    }
    logger.info("Plugin gestoppt");
  }

  getMode() {
    return this.mode;
  }

  getClient() {
    return this.client;
  }

  getController() {
    return this.controller;
  }

  // -- interne Helfer --

  _prepareDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    const sub = ["schedules", "uploads"];
    for (const s of sub) {
      const p = path.join(this.dataDir, s);
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    }
  }

  _buildConfigTemplate() {
    // Plugin-Konfigurationsvorlage fuer die HCU-UI.
    // Die HCU zeigt diese Felder in der Plugin-Einstellungsseite an.
    return {
      properties: {
        pollingInterval: {
          dataType: "INTEGER",
          friendlyName: "Polling-Intervall (Minuten)",
          description:
            "Wie oft Dateiquellen auf Aenderungen geprueft werden",
          defaultValue: "60",
          minimum: 5,
          maximum: 1440,
          required: false,
          groupId: "general",
          order: 1,
        },
        defaultTemperature: {
          dataType: "NUMBER",
          friendlyName: "Standard-Temperatur (°C)",
          description:
            "Fallback-Temperatur wenn kein Zeitplan aktiv ist (5-30 °C)",
          defaultValue: "20",
          minimum: 5,
          maximum: 30,
          required: false,
          groupId: "heating",
          order: 1,
        },
        absenceTemperature: {
          dataType: "NUMBER",
          friendlyName: "Abwesenheits-Temperatur (°C)",
          description: "Temperatur im Abwesenheits-Modus",
          defaultValue: "16",
          minimum: 5,
          maximum: 30,
          required: false,
          groupId: "heating",
          order: 2,
        },
        fritzboxHost: {
          dataType: "STRING",
          friendlyName: "FRITZ!Box IP",
          description: "IP-Adresse der FRITZ!Box fuer NAS-Zugriff",
          defaultValue: "192.168.178.1",
          required: false,
          groupId: "sources",
          order: 1,
        },
        fritzboxUser: {
          dataType: "STRING",
          friendlyName: "FRITZ!Box Benutzer",
          required: false,
          groupId: "sources",
          order: 2,
        },
        fritzboxPassword: {
          dataType: "PASSWORD",
          friendlyName: "FRITZ!Box Passwort",
          required: false,
          groupId: "sources",
          order: 3,
        },
        fritzboxPath: {
          dataType: "STRING",
          friendlyName: "NAS-Pfad",
          description: "Pfad auf der FRITZ!Box NAS",
          defaultValue: "FRITZ.NAS/Heizung/",
          required: false,
          groupId: "sources",
          order: 4,
        },
        usbEnabled: {
          dataType: "BOOLEAN",
          friendlyName: "USB-Quelle aktivieren",
          description:
            "Liest Zeitplandateien von einem USB-Stick (nur CCU3/HCU mit USB)",
          defaultValue: "false",
          required: false,
          groupId: "sources",
          order: 5,
        },
        usbMountPath: {
          dataType: "STRING",
          friendlyName: "USB Mount-Pfad",
          defaultValue: "/media/usb",
          required: false,
          groupId: "sources",
          order: 6,
        },
      },
      groups: {
        general: {
          friendlyName: "Allgemein",
          order: 1,
        },
        heating: {
          friendlyName: "Heizung",
          description: "Standard-Temperaturen",
          order: 2,
        },
        sources: {
          friendlyName: "Dateiquellen",
          description:
            "Konfiguration externer Quellen fuer Zeitplandateien (USB, FRITZ!Box)",
          order: 3,
        },
      },
    };
  }

  _onConfigUpdate(properties) {
    // Persistiere geaenderte Konfigurationswerte in .env-artiger Datei.
    const configFile = path.join(this.dataDir, "plugin-config.json");
    try {
      let existing = {};
      if (fs.existsSync(configFile)) {
        existing = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      }
      const merged = { ...existing, ...properties };
      fs.writeFileSync(configFile, JSON.stringify(merged, null, 2), "utf-8");
      logger.info(
        `Plugin-Konfiguration aktualisiert: ${Object.keys(properties).join(", ")}`,
      );
    } catch (err) {
      logger.error(
        `Konnte Plugin-Konfiguration nicht speichern: ${err.message}`,
      );
      throw err;
    }
  }
}

// Exporte fuer programmatische Nutzung
export { Config, CloudClient, ConnectApiClient, DeviceController };
export default HomematicIPPlugin;

// Direkter Start wenn als Hauptmodul ausgefuehrt
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const plugin = new HomematicIPPlugin();
  plugin.start().catch((err) => {
    logger.error(`Plugin-Start fehlgeschlagen: ${err.message}`);
    process.exit(1);
  });

  // SIGTERM/SIGINT Handling
  const shutdown = async () => {
    logger.info("Shutdown-Signal empfangen");
    await plugin.stop();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
