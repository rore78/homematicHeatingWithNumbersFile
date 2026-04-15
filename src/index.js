import fs from "fs";
import path from "path";
import Config from "./config/config.js";
import CloudClient from "./client/cloudClient.js";
import ConnectApiClient from "./client/connectApiClient.js";
import DeviceController from "./devices/deviceController.js";
import ScheduleManager from "./scheduler/scheduleManager.js";
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

    // ScheduleManager nutzt aktuell process.cwd() fuer Pfade.
    // Wir chdir() in das dataDir damit Zeitplaene/Bereiche in /data landen.
    // (Wird in einem spaeteren Schritt durch DATA_DIR-Parameter ersetzt.)
    const originalCwd = process.cwd();
    process.chdir(this.dataDir);
    try {
      this.scheduleManager = new ScheduleManager(this.controller);
    } finally {
      process.chdir(originalCwd);
    }

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
    // Wird in Schritt 10 ausgefuellt. Leer lassen fuer jetzt.
    return null;
  }

  _onConfigUpdate(_properties) {
    // Wird in Schritt 10 ausgefuellt.
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
