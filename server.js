import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import SpreadsheetParser from "./src/parser/spreadsheetParser.js";
import ScheduleManager from "./src/scheduler/scheduleManager.js";
import AreaManager from "./src/areas/areaManager.js";
import HeatingProfile from "./src/scheduler/heatingProfile.js";
import HomematicIPAddon, { Config } from "./src/index.js";
import logger from "./src/utils/logger.js";
import FileSourceManager from "./src/sources/fileSourceManager.js";
import UsbFileSource from "./src/sources/usbFileSource.js";
import FritzboxFileSource from "./src/sources/fritzboxFileSource.js";
import PollingEngine from "./src/polling/pollingEngine.js";
import IcloudFileSource from "./src/sources/icloudFileSource.js";
import PushManager from "./src/sources/pushManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

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
let fileSourceManager = null;
let pollingEngine = null;
let pushManager = null;

// Initialisiere Homematic IP Addon
async function initializeAddon() {
  // Unabhaengige Komponenten immer initialisieren
  areaManager = new AreaManager();
  heatingProfile = new HeatingProfile();
  scheduleManager = new ScheduleManager(null);

  fileSourceManager = new FileSourceManager();
  fileSourceManager.registerSource(new UsbFileSource());
  fileSourceManager.registerSource(new FritzboxFileSource());
  fileSourceManager.registerSource(new IcloudFileSource());

  pushManager = new PushManager();

  pollingEngine = new PollingEngine(fileSourceManager, scheduleManager);

  // Homematic-Verbindung versuchen (optional)
  try {
    const config = new Config();
    addon = new HomematicIPAddon(config);
    await addon.initialize();
    scheduleManager.setDeviceController(addon.controller);
    logger.info("Homematic IP Addon initialisiert (CCU verbunden)");
  } catch (error) {
    logger.warn(
      "CCU-Verbindung fehlgeschlagen, Server startet ohne Geraetesteuerung:",
      error.message,
    );
  }

  // Polling starten wenn Quellen aktiviert
  pollingEngine.start();

  return true;
}

// API Routes

// Upload und Parse
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Keine Datei hochgeladen" });
    }

    const filePath = req.file.path;
    const parser = new SpreadsheetParser();
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

// Heizprofil auslesen
app.get("/api/devices/:id/heating-profile", async (req, res) => {
  try {
    if (!addon) {
      return res.status(503).json({ error: "Addon nicht initialisiert" });
    }
    const result = await addon.controller.getHeatingProfile(req.params.id);
    const modeLabels = { 0: "Auto", 1: "Manuell", 2: "Party" };
    res.json({
      success: true,
      data: {
        activeProfile: result.activeProfile,
        mode: result.mode,
        modeLabel: modeLabels[result.mode] || "Unbekannt",
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Heizprofil setzen
app.post("/api/devices/:id/heating-profile", async (req, res) => {
  try {
    if (!addon) {
      return res.status(503).json({ error: "Addon nicht initialisiert" });
    }
    const { profileNumber } = req.body;
    if (![1, 2, 3].includes(profileNumber)) {
      return res.status(400).json({
        error: "profileNumber muss 1, 2 oder 3 sein.",
      });
    }
    await addon.controller.setHeatingProfile(req.params.id, profileNumber);
    res.json({
      success: true,
      message: `Geraeteprofil ${profileNumber} aktiviert auf Geraet ${req.params.id}.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Dateiquellen -- Alle Quellen auflisten
app.get("/api/sources", async (req, res) => {
  try {
    if (!fileSourceManager) {
      return res
        .status(503)
        .json({ error: "FileSourceManager nicht initialisiert" });
    }
    const data = await fileSourceManager.getAllSources();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dateiquellen -- Quelle konfigurieren
app.put("/api/sources/:type", async (req, res) => {
  try {
    if (!fileSourceManager) {
      return res
        .status(503)
        .json({ error: "FileSourceManager nicht initialisiert" });
    }
    const { type } = req.params;
    const source = fileSourceManager.getSource(type);
    if (!source) {
      return res
        .status(404)
        .json({ error: `Unbekannter Quellentyp: ${type}` });
    }

    const config = req.body;

    // Typ-spezifische Validierung
    if (type === "usb" && config.enabled && !config.mountPoint) {
      return res
        .status(400)
        .json({ error: "Mount-Punkt darf nicht leer sein wenn aktiviert." });
    }
    if (type === "fritzbox" && config.enabled) {
      if (!config.host) {
        return res
          .status(400)
          .json({ error: "Host darf nicht leer sein wenn aktiviert." });
      }
      if (!config.username) {
        return res
          .status(400)
          .json({ error: "Benutzername darf nicht leer sein wenn aktiviert." });
      }
      if (!config.password) {
        return res
          .status(400)
          .json({ error: "Passwort darf nicht leer sein wenn aktiviert." });
      }
    }

    await fileSourceManager.updateSourceConfig(type, config);
    res.json({
      success: true,
      message: `${type.toUpperCase()}-Dateiquelle aktualisiert.`,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Dateiquellen -- Verbindungstest
app.post("/api/sources/:type/test", async (req, res) => {
  try {
    if (!fileSourceManager) {
      return res
        .status(503)
        .json({ error: "FileSourceManager nicht initialisiert" });
    }
    const { type } = req.params;
    const source = fileSourceManager.getSource(type);
    if (!source) {
      return res
        .status(404)
        .json({ error: `Unbekannter Quellentyp: ${type}` });
    }

    const result = await fileSourceManager.testSource(type);
    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.json({ success: false, error: result.message });
    }
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Dateiquellen -- Scan ausloesen
app.post("/api/sources/:type/scan", async (req, res) => {
  try {
    if (!fileSourceManager) {
      return res
        .status(503)
        .json({ error: "FileSourceManager nicht initialisiert" });
    }
    const { type } = req.params;
    const source = fileSourceManager.getSource(type);
    if (!source) {
      return res
        .status(404)
        .json({ error: `Unbekannter Quellentyp: ${type}` });
    }

    const result = await fileSourceManager.scanSource(type);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Dateiquellen -- Gefundene Dateien auflisten (aus Cache)
app.get("/api/sources/:type/files", (req, res) => {
  try {
    if (!fileSourceManager) {
      return res
        .status(503)
        .json({ error: "FileSourceManager nicht initialisiert" });
    }
    const { type } = req.params;
    const source = fileSourceManager.getSource(type);
    if (!source) {
      return res
        .status(404)
        .json({ error: `Unbekannter Quellentyp: ${type}` });
    }

    const result = fileSourceManager.getLastScanResult(type);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dateiquellen -- Datei importieren
app.post("/api/sources/:type/import", async (req, res) => {
  try {
    if (!fileSourceManager || !scheduleManager) {
      return res
        .status(503)
        .json({ error: "Manager nicht initialisiert" });
    }
    const { type } = req.params;
    const { fileName } = req.body;

    if (!fileName) {
      return res.status(400).json({ error: "fileName erforderlich." });
    }

    const source = fileSourceManager.getSource(type);
    if (!source) {
      return res
        .status(404)
        .json({ error: `Unbekannter Quellentyp: ${type}` });
    }

    const result = await fileSourceManager.importFile(
      type,
      fileName,
      scheduleManager,
    );

    const actionText =
      result.action === "created" ? "erstellt" : "aktualisiert";
    const scheduleName = fileName.replace(/\.[^.]+$/, "");

    res.json({
      success: true,
      message: `Zeitplan '${scheduleName}' ${actionText}.`,
      data: result,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// iCloud -- Login
app.post("/api/sources/icloud/login", async (req, res) => {
  try {
    if (!fileSourceManager) {
      return res.status(503).json({ error: "Nicht initialisiert" });
    }
    const source = fileSourceManager.getSource("icloud");
    if (!source) {
      return res.status(404).json({ error: "iCloud-Quelle nicht verfuegbar" });
    }
    const { appleId, password } = req.body;
    if (!appleId || !password) {
      return res
        .status(400)
        .json({ error: "Apple-ID und Passwort erforderlich." });
    }
    const result = await source.login(appleId, password);
    res.json({ success: result.status !== "error", data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// iCloud -- 2FA verifizieren
app.post("/api/sources/icloud/verify-2fa", async (req, res) => {
  try {
    const source = fileSourceManager?.getSource("icloud");
    if (!source) {
      return res.status(404).json({ error: "iCloud-Quelle nicht verfuegbar" });
    }
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: "2FA-Code erforderlich." });
    }
    const result = await source.verify2fa(code);
    res.json({ success: result.status !== "error", data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// iCloud -- Auth-State
app.get("/api/sources/icloud/auth-state", async (req, res) => {
  try {
    const source = fileSourceManager?.getSource("icloud");
    if (!source) {
      return res.status(404).json({ error: "iCloud-Quelle nicht verfuegbar" });
    }
    res.json({
      success: true,
      data: {
        authState: source.getAuthState(),
        pythonAvailable: source.pythonAvailable,
        appleId: source.appleId,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// iCloud -- Logout
app.post("/api/sources/icloud/logout", async (req, res) => {
  try {
    const source = fileSourceManager?.getSource("icloud");
    if (!source) {
      return res.status(404).json({ error: "iCloud-Quelle nicht verfuegbar" });
    }
    await source.logout();
    res.json({ success: true, message: "iCloud-Session geloescht." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Push -- Upload
app.post("/api/push/upload", upload.single("file"), async (req, res) => {
  try {
    if (!pushManager || !scheduleManager) {
      return res.status(503).json({ error: "Nicht initialisiert" });
    }

    // API-Key pruefen
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!pushManager.config.enabled) {
      return res
        .status(403)
        .json({ success: false, error: "Push-Endpunkt ist deaktiviert." });
    }
    if (!pushManager.validateApiKey(token)) {
      return res
        .status(401)
        .json({ success: false, error: "Ungueltiger API-Key." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Keine Datei hochgeladen." });
    }

    const result = await pushManager.handleUpload(
      req.file.path,
      req.file.originalname,
      scheduleManager,
    );

    // Temporaere Datei loeschen
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    const actionText =
      result.action === "created" ? "erstellt" : "aktualisiert";
    const name = req.file.originalname.replace(/\.[^.]+$/, "");
    res.json({
      success: true,
      message: `Zeitplan '${name}' ${actionText}.`,
      data: result,
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({ success: false, error: error.message });
  }
});

// Push -- Config lesen
app.get("/api/push/config", (req, res) => {
  try {
    if (!pushManager) {
      return res.status(503).json({ error: "Nicht initialisiert" });
    }
    res.json({ success: true, data: pushManager.getConfig() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Push -- Config setzen
app.put("/api/push/config", (req, res) => {
  try {
    if (!pushManager) {
      return res.status(503).json({ error: "Nicht initialisiert" });
    }
    const { enabled } = req.body;
    if (enabled) {
      pushManager.enable();
    } else {
      pushManager.disable();
    }
    res.json({
      success: true,
      message: enabled ? "Push-Endpunkt aktiviert." : "Push-Endpunkt deaktiviert.",
      data: { enabled: pushManager.config.enabled, apiKey: pushManager.config.apiKey },
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Push -- Key regenerieren
app.post("/api/push/regenerate-key", (req, res) => {
  try {
    if (!pushManager) {
      return res.status(503).json({ error: "Nicht initialisiert" });
    }
    const apiKey = pushManager.regenerateKey();
    res.json({
      success: true,
      message: "Neuer API-Key generiert.",
      data: { apiKey },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Polling -- Status
app.get("/api/polling/status", (req, res) => {
  try {
    if (!pollingEngine) {
      return res
        .status(503)
        .json({ error: "PollingEngine nicht initialisiert" });
    }
    res.json({ success: true, data: pollingEngine.getStatus() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Polling -- Manueller Trigger
app.post("/api/polling/trigger", async (req, res) => {
  try {
    if (!pollingEngine) {
      return res
        .status(503)
        .json({ error: "PollingEngine nicht initialisiert" });
    }
    const { type } = req.body || {};
    const result = await pollingEngine.triggerPoll(type || null);
    res.json({
      success: true,
      message: "Pruefung abgeschlossen.",
      data: result,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Polling -- Konfiguration
app.put("/api/polling/config", (req, res) => {
  try {
    if (!pollingEngine) {
      return res
        .status(503)
        .json({ error: "PollingEngine nicht initialisiert" });
    }
    pollingEngine.updateConfig(req.body);
    res.json({
      success: true,
      message: "Polling-Konfiguration aktualisiert.",
      data: {
        enabled: pollingEngine.status.enabled,
        intervalMinutes: pollingEngine.status.intervalMinutes,
      },
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Polling -- Log
app.get("/api/polling/log", (req, res) => {
  try {
    if (!pollingEngine) {
      return res
        .status(503)
        .json({ error: "PollingEngine nicht initialisiert" });
    }
    const limit = parseInt(req.query.limit) || 50;
    res.json({ success: true, data: pollingEngine.getLog(limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health-Check
app.get("/api/health", async (req, res) => {
  const health = {
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    mode: addon ? addon.getMode() : "nicht initialisiert",
    ccuVerbunden: false,
    aktiveZeitplaene: 0,
  };

  try {
    if (addon) {
      await addon.getDevices();
      health.ccuVerbunden = true;
    }
  } catch (error) {
    health.ccuVerbunden = false;
    health.ccuFehler = error.message;
  }

  if (scheduleManager) {
    health.aktiveZeitplaene = scheduleManager.getActiveCount();
  }

  const statusCode = health.ccuVerbunden ? 200 : 503;
  res.status(statusCode).json(health);
});

// Frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Error Handler
app.use((error, req, res, _next) => {
  logger.error("Server Error:", error);
  res.status(error.status || 500).json({
    error: error.message || "Interner Serverfehler",
  });
});

// Server starten
async function startServer() {
  const initialized = await initializeAddon();

  if (!initialized) {
    logger.warn(
      "Addon konnte nicht initialisiert werden. Server startet trotzdem.",
    );
  }

  app.listen(PORT, () => {
    logger.info(`Server läuft auf http://localhost:${PORT}`);
  });
}

startServer().catch((err) => logger.error("Server-Start fehlgeschlagen:", err));

// Graceful Shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM Signal empfangen. Server wird beendet...");
  if (scheduleManager) {
    scheduleManager.stopScheduler();
  }
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT Signal empfangen. Server wird beendet...");
  if (scheduleManager) {
    scheduleManager.stopScheduler();
  }
  process.exit(0);
});

export default app;
