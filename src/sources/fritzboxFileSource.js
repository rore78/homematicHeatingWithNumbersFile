import crypto from "crypto";
import { Writable } from "stream";
import { FileSource } from "./fileSource.js";
import logger from "../utils/logger.js";

function encodeCredential(plain) {
  return Buffer.from(plain, "utf-8").toString("base64");
}

function decodeCredential(encoded) {
  if (!encoded) return "";
  return Buffer.from(encoded, "base64").toString("utf-8");
}

/**
 * FRITZ!Box NAS Dateiquelle ueber FTP.
 */
export class FritzboxFileSource extends FileSource {
  constructor(config = {}) {
    super();
    this.host = config.host || "";
    this.port = config.port || 21;
    this.username = config.username || "";
    this.password = config.password || ""; // Base64-kodiert
    this.path = config.path || "";
    this.secure = config.secure !== undefined ? config.secure : true;
  }

  getType() {
    return "fritzbox";
  }

  getConfig() {
    return {
      host: this.host,
      port: this.port,
      username: this.username,
      path: this.path,
      secure: this.secure,
    };
  }

  updateConfig(config) {
    if (config.host !== undefined) this.host = config.host;
    if (config.port !== undefined) this.port = config.port;
    if (config.username !== undefined) this.username = config.username;
    if (config.password !== undefined) this.password = config.password;
    if (config.path !== undefined) this.path = config.path;
    if (config.secure !== undefined) this.secure = config.secure;
  }

  async _connect() {
    const ftp = await import("basic-ftp");
    const client = new ftp.Client();
    client.ftp.verbose = false;

    const accessOpts = {
      host: this.host,
      port: this.port,
      user: this.username,
      password: decodeCredential(this.password),
      secure: this.secure,
      secureOptions: { rejectUnauthorized: false },
    };

    try {
      await client.access(accessOpts);
      return client;
    } catch (firstError) {
      // Ein Retry nach 5 Sekunden
      logger.debug(
        `FTP-Verbindung fehlgeschlagen, Retry in 5s: ${firstError.message}`,
      );
      await new Promise((r) => setTimeout(r, 5000));
      const retryClient = new ftp.Client();
      retryClient.ftp.verbose = false;
      await retryClient.access(accessOpts);
      return retryClient;
    }
  }

  async isAvailable() {
    if (!this.host) return false;
    try {
      const client = await this._connect();
      client.close();
      return true;
    } catch {
      return false;
    }
  }

  async listFiles() {
    const client = await this._connect();
    try {
      if (this.path) {
        await client.cd(this.path);
      }
      const listing = await client.list();
      const files = [];

      for (const entry of listing) {
        if (entry.isDirectory) continue;
        const ext = entry.name.toLowerCase();
        if (
          !ext.endsWith(".xlsx") &&
          !ext.endsWith(".xls") &&
          !ext.endsWith(".numbers")
        )
          continue;

        const filePath = this.path
          ? `${this.path}/${entry.name}`
          : entry.name;

        files.push({
          name: entry.name,
          path: filePath,
          size: entry.size,
          modified: entry.modifiedAt
            ? entry.modifiedAt.toISOString()
            : null,
        });
      }

      return files;
    } finally {
      client.close();
    }
  }

  async readFile(filePath) {
    const client = await this._connect();
    try {
      const chunks = [];
      const writable = new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(chunk);
          callback();
        },
      });
      await client.downloadTo(writable, filePath);
      return Buffer.concat(chunks);
    } finally {
      client.close();
    }
  }

  async getChecksum(filePath) {
    const buffer = await this.readFile(filePath);
    return crypto.createHash("md5").update(buffer).digest("hex");
  }

  async testConnection() {
    let client;
    try {
      client = await this._connect();

      if (this.path) {
        await client.cd(this.path);
      }

      client.close();
      return {
        success: true,
        message: "Verbindung erfolgreich. Pfad existiert.",
      };
    } catch (error) {
      if (client) {
        try {
          client.close();
        } catch {
          // ignore
        }
      }

      const msg = error.message || "";
      const code = error.code || "";

      if (code === "ECONNREFUSED" || msg.includes("ECONNREFUSED")) {
        return {
          success: false,
          message:
            `Verbindung fehlgeschlagen. Bitte pruefen Sie: ` +
            `1) Ist die FRITZ!Box unter ${this.host} erreichbar? ` +
            `2) Ist FTP in der FRITZ!Box unter Internet > Freigaben > FTP aktiviert?`,
        };
      }

      if (
        code === "ETIMEDOUT" ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("timeout")
      ) {
        return {
          success: false,
          message: `Zeitueberschreitung. Die FRITZ!Box unter ${this.host} antwortet nicht.`,
        };
      }

      if (msg.includes("530") || msg.includes("Login incorrect")) {
        return {
          success: false,
          message:
            "Anmeldung fehlgeschlagen. Bitte Benutzername und Passwort pruefen.",
        };
      }

      if (msg.includes("550") || msg.includes("not found")) {
        return {
          success: false,
          message: `Pfad '${this.path}' nicht gefunden auf der FRITZ!Box. Bitte pruefen Sie den Pfad (z.B. FRITZ.NAS/Heizung).`,
        };
      }

      return {
        success: false,
        message: `Unbekannter Fehler: ${msg}`,
      };
    }
  }
}

export { encodeCredential, decodeCredential };
export default FritzboxFileSource;
