import ExcelParser from './excelParser.js';
import fs from 'fs';
import path from 'path';

/**
 * Numbers-Datei Parser
 * Parst Numbers-Dateien (.numbers) für Heizungszeitpläne
 * 
 * Hinweis: .numbers Dateien sind eigentlich ZIP-Archive.
 * Wir versuchen sie zu konvertieren oder als Excel zu behandeln.
 */
export class NumbersParser {
  constructor() {
    this.excelParser = new ExcelParser();
  }

  /**
   * Parst eine Numbers-Datei
   * @param {string} filePath - Pfad zur Numbers-Datei
   * @returns {Array<object>} - Geparste Zeilen
   */
  parse(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Datei nicht gefunden: ${filePath}`);
      }

      // .numbers Dateien sind ZIP-Archive mit XML-Inhalt
      // Versuche zuerst, ob die Datei bereits als Excel gelesen werden kann
      // Falls nicht, versuche Konvertierung
      
      const ext = path.extname(filePath).toLowerCase();
      
      if (ext === '.numbers') {
        // Versuche die Numbers-Datei direkt zu lesen
        // Falls das nicht funktioniert, wirf einen hilfreichen Fehler
        try {
          // Numbers-Dateien können manchmal mit xlsx-Library gelesen werden
          // wenn sie intern Excel-Format verwenden
          return this.excelParser.parse(filePath);
        } catch (error) {
          throw new Error(
            `Numbers-Dateien (.numbers) werden derzeit nicht direkt unterstützt. ` +
            `Bitte exportiere die Datei als Excel (.xlsx) Format. ` +
            `Original-Fehler: ${error.message}`
          );
        }
      }

      // Falls es eine .xlsx Datei ist, verwende den Excel-Parser
      if (ext === '.xlsx' || ext === '.xls') {
        return this.excelParser.parse(filePath);
      }

      throw new Error(`Unbekanntes Dateiformat: ${ext}`);
    } catch (error) {
      throw new Error(`Fehler beim Parsen der Numbers-Datei: ${error.message}`);
    }
  }

  /**
   * Prüft ob eine Datei unterstützt wird
   * @param {string} filePath - Pfad zur Datei
   * @returns {boolean}
   */
  isSupported(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ['.numbers', '.xlsx', '.xls'].includes(ext);
  }
}

export default NumbersParser;

