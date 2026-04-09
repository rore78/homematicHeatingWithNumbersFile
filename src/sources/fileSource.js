/**
 * Abstrakte Basis-Klasse fuer Dateiquellen.
 * Definiert das Interface das alle Dateiquellen implementieren muessen.
 */
export class FileSource {
  async listFiles() {
    throw new Error("Nicht implementiert");
  }

  async readFile(_filePath) {
    throw new Error("Nicht implementiert");
  }

  async getChecksum(_filePath) {
    throw new Error("Nicht implementiert");
  }

  async isAvailable() {
    throw new Error("Nicht implementiert");
  }

  getType() {
    throw new Error("Nicht implementiert");
  }

  getConfig() {
    throw new Error("Nicht implementiert");
  }
}

export default FileSource;
