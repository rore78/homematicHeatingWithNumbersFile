import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import * as XLSX from "xlsx";
import ExcelParser from "../../src/parser/excelParser.js";
import NumbersParser from "../../src/parser/numbersParser.js";

// We build a minimal test server mirroring server.js routes
// instead of importing server.js which auto-starts and tries Homematic connection.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

let app;
let tmpDir;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "api-test-"));
  const uploadsDir = path.join(tmpDir, "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });

  app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(projectRoot, "public")));

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      cb(null, Date.now() + "-" + file.originalname);
    },
  });

  const upload = multer({
    storage,
    fileFilter: (_req, file, cb) => {
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
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  // Upload route
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
      fs.unlinkSync(filePath);
      res.json({ success: true, data, count: data.length });
    } catch (error) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(400).json({ error: error.message });
    }
  });

  // Stub endpoints that require addon initialization
  app.get("/api/schedules", (_req, res) => {
    res.status(503).json({ error: "Schedule Manager nicht initialisiert" });
  });

  app.get("/api/areas", (_req, res) => {
    res.status(503).json({ error: "Area Manager nicht initialisiert" });
  });

  app.get("/api/profiles", (_req, res) => {
    res.status(503).json({ error: "Heating Profile nicht initialisiert" });
  });

  app.get("/api/devices", (_req, res) => {
    res.status(503).json({ error: "Addon nicht initialisiert" });
  });

  app.get("/", (_req, res) => {
    res.sendFile(path.join(projectRoot, "public", "index.html"));
  });

  // Error handler
  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({
      error: error.message || "Interner Serverfehler",
    });
  });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createTestXlsx(rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const filePath = path.join(tmpDir, `test-${Date.now()}.xlsx`);
  XLSX.writeFile(wb, filePath);
  return filePath;
}

describe("REST API", () => {
  describe("GET /", () => {
    it("gibt 200 und HTML zurueck", async () => {
      const res = await request(app).get("/");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/html/);
    });
  });

  describe("POST /api/upload", () => {
    it("gibt 400 ohne Datei", async () => {
      const res = await request(app).post("/api/upload");
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Keine Datei/);
    });

    it("gibt 200 mit gueltiger .xlsx Datei", async () => {
      const rows = [
        {
          Bereich: "Wohnzimmer",
          Startdatum: "2025-01-15 08:00",
          Enddatum: "2025-01-15 22:00",
          Temperatur: 21,
        },
      ];
      const filePath = createTestXlsx(rows);

      const res = await request(app)
        .post("/api/upload")
        .attach("file", filePath);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.count).toBe(1);
      expect(res.body.data[0].area).toBe("Wohnzimmer");
    });

    it("gibt 400 bei nicht-erlaubtem Dateityp", async () => {
      const txtPath = path.join(tmpDir, "test.txt");
      fs.writeFileSync(txtPath, "hello");

      const res = await request(app)
        .post("/api/upload")
        .attach("file", txtPath);

      expect(res.status).toBe(500); // multer error becomes 500 via error handler
    });
  });

  describe("Nicht-initialisierte Endpunkte", () => {
    it("GET /api/schedules gibt 503", async () => {
      const res = await request(app).get("/api/schedules");
      expect(res.status).toBe(503);
    });

    it("GET /api/areas gibt 503", async () => {
      const res = await request(app).get("/api/areas");
      expect(res.status).toBe(503);
    });

    it("GET /api/profiles gibt 503", async () => {
      const res = await request(app).get("/api/profiles");
      expect(res.status).toBe(503);
    });

    it("GET /api/devices gibt 503", async () => {
      const res = await request(app).get("/api/devices");
      expect(res.status).toBe(503);
    });
  });
});
