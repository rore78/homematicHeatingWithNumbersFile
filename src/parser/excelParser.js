import * as XLSX from "xlsx";
import fs from "fs";

/**
 * Excel-Datei Parser
 * Parst Excel-Dateien (.xlsx) für Heizungszeitpläne
 */
export class ExcelParser {
  /**
   * Parst eine Excel-Datei
   * @param {string} filePath - Pfad zur Excel-Datei
   * @returns {Array<object>} - Geparste Zeilen
   */
  parse(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Datei nicht gefunden: ${filePath}`);
      }

      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { defval: null });

      return this.normalizeData(data);
    } catch (error) {
      throw new Error(`Fehler beim Parsen der Excel-Datei: ${error.message}`);
    }
  }

  /**
   * Normalisiert die Daten und erkennt Spalten automatisch
   * @param {Array<object>} data - Rohe Excel-Daten
   * @returns {Array<object>} - Normalisierte Daten
   */
  normalizeData(data) {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Excel-Datei ist leer oder ungültig");
    }

    // Erkenne Spaltennamen (case-insensitive, verschiedene Varianten)
    const firstRow = data[0];
    const columnMap = this.detectColumns(firstRow);

    return data.map((row, index) => {
      try {
        return this.parseRow(row, columnMap, index + 1);
      } catch (error) {
        throw new Error(`Fehler in Zeile ${index + 1}: ${error.message}`);
      }
    });
  }

  /**
   * Erkennt Spaltennamen automatisch
   * @param {object} firstRow - Erste Zeile der Daten
   * @returns {object} - Mapping von Standardnamen zu tatsächlichen Spaltennamen
   */
  detectColumns(firstRow) {
    const columns = {};
    const keys = Object.keys(firstRow);

    // Normalisiere alle Keys zu lowercase für Vergleich
    const normalizedKeys = {};
    keys.forEach((key) => {
      normalizedKeys[key.toLowerCase().trim()] = key;
    });

    // Suche nach Bereich/Area
    columns.area = this.findColumn(normalizedKeys, [
      "bereich",
      "area",
      "zone",
      "raum",
    ]);

    // Suche nach Startdatum/Startzeit
    columns.startDateTime = this.findColumn(normalizedKeys, [
      "startdatum",
      "start datetime",
      "startzeit",
      "start time",
      "start",
      "von",
      "beginn",
    ]);

    // Suche nach Enddatum/Endzeit
    columns.endDateTime = this.findColumn(normalizedKeys, [
      "enddatum",
      "end datetime",
      "endzeit",
      "end time",
      "end",
      "bis",
      "ende",
    ]);

    // Suche nach Temperatur
    columns.temperature = this.findColumn(normalizedKeys, [
      "temperatur",
      "temperature",
      "temp",
      "°c",
      "celsius",
    ]);

    // Suche nach Heizprofil
    columns.profile = this.findColumn(normalizedKeys, [
      "heizprofil",
      "profil",
      "profile",
      "heating profile",
    ]);

    // Suche nach Zusatzinfo
    columns.notes = this.findColumn(normalizedKeys, [
      "zusatzinfo",
      "notes",
      "notiz",
      "bemerkung",
      "info",
      "information",
    ]);

    // Validiere dass mindestens Bereich, Start- und Enddatum vorhanden sind
    if (!columns.area) {
      throw new Error('Spalte "Bereich" oder "Area" nicht gefunden');
    }
    if (!columns.startDateTime) {
      throw new Error(
        'Spalte "Startdatum" oder "Start DateTime" nicht gefunden',
      );
    }
    if (!columns.endDateTime) {
      throw new Error('Spalte "Enddatum" oder "End DateTime" nicht gefunden');
    }

    return columns;
  }

  /**
   * Findet eine Spalte basierend auf möglichen Namen
   * @param {object} normalizedKeys - Normalisierte Spaltennamen
   * @param {Array<string>} possibleNames - Mögliche Namen
   * @returns {string|null} - Gefundener Spaltenname oder null
   */
  findColumn(normalizedKeys, possibleNames) {
    for (const name of possibleNames) {
      if (normalizedKeys[name]) {
        return normalizedKeys[name];
      }
    }
    return null;
  }

  /**
   * Parst eine einzelne Zeile
   * @param {object} row - Rohe Zeilendaten
   * @param {object} columnMap - Spalten-Mapping
   * @param {number} lineNumber - Zeilennummer für Fehlermeldungen
   * @returns {object} - Geparste Zeile
   */
  parseRow(row, columnMap, lineNumber) {
    const area = row[columnMap.area];
    if (!area) {
      throw new Error("Bereich fehlt");
    }

    const startDateTime = this.parseDateTime(
      row[columnMap.startDateTime],
      "Startdatum",
    );
    const endDateTime = this.parseDateTime(
      row[columnMap.endDateTime],
      "Enddatum",
    );

    if (startDateTime >= endDateTime) {
      throw new Error("Startdatum muss vor Enddatum liegen");
    }

    const temperature = this.parseTemperature(row[columnMap.temperature]);
    const profile = row[columnMap.profile] || null;
    const notes = row[columnMap.notes] || null;

    return {
      area: String(area).trim(),
      startDateTime: startDateTime.toISOString(),
      endDateTime: endDateTime.toISOString(),
      temperature,
      profile,
      notes,
    };
  }

  /**
   * Parst Datum und Zeit aus verschiedenen Formaten
   * @param {*} value - Datum/Zeit Wert
   * @param {string} fieldName - Feldname für Fehlermeldungen
   * @returns {Date} - Parsed Date
   */
  parseDateTime(value, fieldName) {
    if (!value) {
      throw new Error(`${fieldName} fehlt`);
    }

    // Wenn es bereits ein Date-Objekt ist
    if (value instanceof Date) {
      return value;
    }

    // Wenn es eine Excel-Seriennummer ist (Tage seit 1900)
    if (typeof value === "number") {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // Versuche verschiedene String-Formate
    const str = String(value).trim();

    // ISO Format: YYYY-MM-DD HH:MM oder YYYY-MM-DDTHH:MM
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
    if (isoMatch) {
      const date = new Date(
        parseInt(isoMatch[1]),
        parseInt(isoMatch[2]) - 1,
        parseInt(isoMatch[3]),
        parseInt(isoMatch[4]),
        parseInt(isoMatch[5]),
      );
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // Deutsches Format: DD.MM.YYYY HH:MM
    const deMatch = str.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
    if (deMatch) {
      const date = new Date(
        parseInt(deMatch[3]),
        parseInt(deMatch[2]) - 1,
        parseInt(deMatch[1]),
        parseInt(deMatch[4]),
        parseInt(deMatch[5]),
      );
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // Versuche Date.parse als Fallback
    const parsed = Date.parse(str);
    if (!isNaN(parsed)) {
      return new Date(parsed);
    }

    throw new Error(`${fieldName} hat ungültiges Format: ${str}`);
  }

  /**
   * Parst Temperatur
   * @param {*} value - Temperaturwert
   * @returns {number} - Temperatur in °C
   */
  parseTemperature(value) {
    if (value === null || value === undefined || value === "") {
      throw new Error("Temperatur fehlt");
    }

    const temp = parseFloat(value);
    if (isNaN(temp)) {
      throw new Error(`Ungültige Temperatur: ${value}`);
    }

    if (temp < 0 || temp > 30) {
      throw new Error(`Temperatur muss zwischen 0 und 30°C liegen: ${temp}`);
    }

    return temp;
  }
}

export default ExcelParser;
