import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { FileSource } from "./fileSource.js";
import logger from "../utils/logger.js";

const execFileAsync = promisify(execFile);

const BRIDGE_SCRIPT = path.join(
  process.cwd(),
  "scripts",
  "icloud_bridge.py",
);

/**
 * iCloud Drive Dateiquelle via Python-Bridge (pyicloud).
 * Experimentell -- abhaengig von Apples undokumentierter Web-API.
 */
export class IcloudFileSource extends FileSource {
  constructor(config = {}) {
    super();
    this.appleId = config.appleId || "";
    this.password = config.password || ""; // Base64-kodiert
    this.path = config.path || "/";
    this.sessionDir = config.sessionDir || path.join(process.cwd(), "icloud-session");
    this.pythonAvailable = null;
    this.sessionValid = null;
    this.authState = "unknown";
  }

  getType() {
    return "icloud";
  }

  getConfig() {
    return {
      appleId: this.appleId,
      path: this.path,
    };
  }

  updateConfig(config) {
    if (config.appleId !== undefined) this.appleId = config.appleId;
    if (config.password !== undefined) this.password = config.password;
    if (config.path !== undefined) this.path = config.path;
    if (config.sessionDir !== undefined) this.sessionDir = config.sessionDir;
  }

  async _checkPython() {
    if (this.pythonAvailable !== null) return this.pythonAvailable;
    try {
      await execFileAsync("python3", ["--version"]);
      await execFileAsync("python3", ["-c", "import pyicloud"]);
      this.pythonAvailable = true;
    } catch {
      this.pythonAvailable = false;
      this.authState = "python_missing";
    }
    return this.pythonAvailable;
  }

  async _execBridge(action, args = {}) {
    const cmdArgs = [
      BRIDGE_SCRIPT,
      "--action",
      action,
      "--session-dir",
      this.sessionDir,
      ...Object.entries(args).flatMap(([k, v]) => [`--${k}`, String(v)]),
    ];
    const { stdout } = await execFileAsync("python3", cmdArgs, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  }

  async isAvailable() {
    if (!this.appleId) return false;
    const hasPython = await this._checkPython();
    if (!hasPython) return false;
    try {
      const result = await this._execBridge("status");
      return result.authenticated === true;
    } catch {
      return false;
    }
  }

  async listFiles() {
    const result = await this._execBridge("list", { path: this.path });
    if (result.status === "reauth_required") {
      this.authState = "reauth_required";
      throw new Error("Session abgelaufen. Erneute Anmeldung erforderlich.");
    }
    if (result.status === "error") {
      throw new Error(result.message);
    }
    return (result.files || []).map((f) => ({
      name: f.name,
      path: f.path,
      size: f.size || 0,
      modified: f.modified || null,
    }));
  }

  async readFile(filePath) {
    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const ext = path.extname(filePath);
    const tmpPath = path.join(
      uploadsDir,
      `icloud-temp-${crypto.randomUUID()}${ext}`,
    );

    try {
      const result = await this._execBridge("download", {
        path: filePath,
        output: tmpPath,
      });
      if (result.status === "reauth_required") {
        this.authState = "reauth_required";
        throw new Error("Session abgelaufen.");
      }
      if (result.status === "error") {
        throw new Error(result.message);
      }
      return fs.readFileSync(tmpPath);
    } finally {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    }
  }

  async getChecksum(filePath) {
    const buffer = await this.readFile(filePath);
    return crypto.createHash("md5").update(buffer).digest("hex");
  }

  async login(appleId, password) {
    try {
      const result = await this._execBridge("login", {
        "apple-id": appleId,
        password,
      });
      if (result.status === "2fa_required") {
        this.authState = "2fa_required";
        return { status: "2fa_required", message: result.message };
      }
      if (result.status === "ok") {
        this.authState = "authenticated";
        return { status: "ok" };
      }
      return {
        status: "error",
        message: result.message || "Anmeldung fehlgeschlagen.",
      };
    } catch (error) {
      return { status: "error", message: error.message };
    }
  }

  async verify2fa(code) {
    try {
      const result = await this._execBridge("verify-2fa", { code });
      if (result.status === "ok") {
        this.authState = "authenticated";
        return { status: "ok", message: "Erfolgreich angemeldet." };
      }
      return {
        status: "error",
        message: result.message || "Ungueltiger Code.",
      };
    } catch (error) {
      return { status: "error", message: error.message };
    }
  }

  async checkSession() {
    try {
      const result = await this._execBridge("status");
      if (result.authenticated === false) {
        this.authState = "reauth_required";
      } else {
        this.authState = "authenticated";
      }
      return result;
    } catch (error) {
      this.authState = "reauth_required";
      return { authenticated: false, error: error.message };
    }
  }

  getAuthState() {
    if (!this.appleId) return "not_configured";
    if (this.pythonAvailable === false) return "python_missing";
    return this.authState;
  }

  async logout() {
    // Session-Verzeichnis loeschen
    if (fs.existsSync(this.sessionDir)) {
      fs.rmSync(this.sessionDir, { recursive: true, force: true });
    }
    this.authState = "login_required";
    this.sessionValid = null;
    logger.info("iCloud-Session geloescht.");
  }
}

export default IcloudFileSource;
