import fs from "fs";
import path from "path";
import crypto from "crypto";
import { FileSource } from "./fileSource.js";

/**
 * USB-Dateiquelle.
 * Liest Tabellendateien (.xlsx, .numbers) von einem USB-Laufwerk.
 */
export class UsbFileSource extends FileSource {
  constructor(config = {}) {
    super();
    this.mountPoint = config.mountPoint || "";
    this.subFolder = config.subFolder || "";
  }

  getType() {
    return "usb";
  }

  getConfig() {
    return {
      mountPoint: this.mountPoint,
      subFolder: this.subFolder,
    };
  }

  updateConfig(config) {
    if (config.mountPoint !== undefined) this.mountPoint = config.mountPoint;
    if (config.subFolder !== undefined) this.subFolder = config.subFolder;
  }

  _getSearchPath() {
    if (!this.mountPoint) {
      throw new Error("USB-Dateiquelle: Kein Mount-Punkt konfiguriert.");
    }
    return this.subFolder
      ? path.join(this.mountPoint, this.subFolder)
      : this.mountPoint;
  }

  async isAvailable() {
    try {
      const searchPath = this._getSearchPath();
      const stat = fs.statSync(searchPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  async listFiles() {
    const searchPath = this._getSearchPath();

    if (!fs.existsSync(searchPath)) {
      throw new Error(
        `USB-Laufwerk nicht gefunden unter ${searchPath}`,
      );
    }

    const entries = fs.readdirSync(searchPath);
    const files = [];

    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase();
      if (![".xlsx", ".xls", ".numbers"].includes(ext)) continue;

      const fullPath = path.join(searchPath, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          files.push({
            name: entry,
            path: fullPath,
            size: stat.size,
            modified: stat.mtime.toISOString(),
          });
        }
      } catch {
        // Datei verschwunden (USB entfernt?) -- ueberspringen
      }
    }

    return files;
  }

  async readFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(
        "Datei nicht mehr verfuegbar (USB-Stick entfernt?)",
      );
    }
    return fs.readFileSync(filePath);
  }

  async getChecksum(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(
        "Datei nicht mehr verfuegbar (USB-Stick entfernt?)",
      );
    }
    const content = fs.readFileSync(filePath);
    return crypto.createHash("md5").update(content).digest("hex");
  }
}

export default UsbFileSource;
