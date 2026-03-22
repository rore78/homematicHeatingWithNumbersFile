import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import ExcelParser from './src/parser/excelParser.js';
import NumbersParser from './src/parser/numbersParser.js';
import ScheduleManager from './src/scheduler/scheduleManager.js';
import AreaManager from './src/areas/areaManager.js';
import HeatingProfile from './src/scheduler/heatingProfile.js';
import HomematicIPAddon, { Config } from './src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Upload-Konfiguration
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.numbers'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Nur Excel (.xlsx, .xls) und Numbers (.numbers) Dateien sind erlaubt'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
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
    
    console.log('Homematic IP Addon initialisiert');
    return true;
  } catch (error) {
    console.error('Fehler bei der Initialisierung:', error.message);
    return false;
  }
}

// API Routes

// Upload und Parse
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();

    let parser;
    if (ext === '.numbers') {
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
      count: data.length
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
app.post('/api/schedule', async (req, res) => {
  try {
    const { name, data } = req.body;

    if (!name || !data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Name und Daten (Array) erforderlich' });
    }

    if (!scheduleManager) {
      return res.status(503).json({ error: 'Schedule Manager nicht initialisiert' });
    }

    const schedule = scheduleManager.createSchedule(name, data);
    res.json({ success: true, schedule });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Alle Zeitpläne abrufen
app.get('/api/schedules', (req, res) => {
  try {
    if (!scheduleManager) {
      return res.status(503).json({ error: 'Schedule Manager nicht initialisiert' });
    }

    const schedules = scheduleManager.getAllSchedules();
    res.json({ success: true, schedules });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Spezifischen Zeitplan abrufen
app.get('/api/schedules/:id', (req, res) => {
  try {
    if (!scheduleManager) {
      return res.status(503).json({ error: 'Schedule Manager nicht initialisiert' });
    }

    const schedule = scheduleManager.getSchedule(req.params.id);
    if (!schedule) {
      return res.status(404).json({ error: 'Zeitplan nicht gefunden' });
    }

    res.json({ success: true, schedule });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Zeitplan aktivieren
app.post('/api/schedules/:id/activate', (req, res) => {
  try {
    if (!scheduleManager) {
      return res.status(503).json({ error: 'Schedule Manager nicht initialisiert' });
    }

    const success = scheduleManager.activateSchedule(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Zeitplan nicht gefunden' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Zeitplan deaktivieren
app.post('/api/schedules/:id/deactivate', (req, res) => {
  try {
    if (!scheduleManager) {
      return res.status(503).json({ error: 'Schedule Manager nicht initialisiert' });
    }

    const success = scheduleManager.deactivateSchedule(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Zeitplan nicht gefunden' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Zeitplan löschen
app.delete('/api/schedules/:id', (req, res) => {
  try {
    if (!scheduleManager) {
      return res.status(503).json({ error: 'Schedule Manager nicht initialisiert' });
    }

    const success = scheduleManager.deleteSchedule(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Zeitplan nicht gefunden' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bereiche abrufen
app.get('/api/areas', (req, res) => {
  try {
    if (!areaManager) {
      return res.status(503).json({ error: 'Area Manager nicht initialisiert' });
    }

    const areas = areaManager.getAllAreas();
    res.json({ success: true, areas });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bereich erstellen/aktualisieren
app.post('/api/areas', (req, res) => {
  try {
    if (!areaManager) {
      return res.status(503).json({ error: 'Area Manager nicht initialisiert' });
    }

    const { name, deviceIds } = req.body;

    if (!name || !Array.isArray(deviceIds)) {
      return res.status(400).json({ error: 'Name und deviceIds (Array) erforderlich' });
    }

    const area = areaManager.createArea(name, deviceIds);
    res.json({ success: true, area });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Bereich löschen
app.delete('/api/areas/:name', (req, res) => {
  try {
    if (!areaManager) {
      return res.status(503).json({ error: 'Area Manager nicht initialisiert' });
    }

    const success = areaManager.deleteArea(req.params.name);
    if (!success) {
      return res.status(404).json({ error: 'Bereich nicht gefunden' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Heizprofile abrufen
app.get('/api/profiles', (req, res) => {
  try {
    if (!heatingProfile) {
      return res.status(503).json({ error: 'Heating Profile nicht initialisiert' });
    }

    const profiles = heatingProfile.getAllProfiles();
    res.json({ success: true, profiles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Geräte abrufen
app.get('/api/devices', async (req, res) => {
  try {
    if (!addon) {
      return res.status(503).json({ error: 'Addon nicht initialisiert' });
    }

    const devices = await addon.getDevices();
    res.json({ success: true, devices });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error Handler
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(error.status || 500).json({
    error: error.message || 'Interner Serverfehler'
  });
});

// Server starten
async function startServer() {
  const initialized = await initializeAddon();
  
  if (!initialized) {
    console.warn('Warnung: Addon konnte nicht initialisiert werden. Server startet trotzdem.');
  }

  app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
    console.log(`Upload-Interface verfügbar unter http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM Signal empfangen. Server wird beendet...');
  if (scheduleManager) {
    scheduleManager.stopScheduler();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT Signal empfangen. Server wird beendet...');
  if (scheduleManager) {
    scheduleManager.stopScheduler();
  }
  process.exit(0);
});

export default app;

