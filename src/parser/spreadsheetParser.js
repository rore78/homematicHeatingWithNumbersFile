import XLSX from "xlsx";
import fs from "fs";
import path from "path";

/**
 * Spreadsheet Parser
 * Parst Excel- (.xlsx/.xls) und Numbers-Dateien (.numbers) fuer Heizungszeitplaene
 */
export class SpreadsheetParser {
  /**
   * Parst eine Tabellendatei
   * @param {string} filePath - Pfad zur Datei
   * @returns {Array<object>} - Geparste Zeilen
   */
  parse(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Datei nicht gefunden: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();

    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { defval: null });

      return this.normalizeData(data);
    } catch (error) {
      if (ext === ".numbers") {
        throw new Error(
          "Die Numbers-Datei konnte nicht gelesen werden. " +
            "Bitte exportiere die Datei als Excel (.xlsx) in Apple Numbers " +
            "(Ablage > Exportieren > Excel).",
        );
      }
      throw new Error(`Fehler beim Parsen der Datei: ${error.message}`);
    }
  }

  /**
   * Normalisiert die Daten und erkennt Spalten automatisch
   * @param {Array<object>} data - Rohe Tabellendaten
   * @returns {Array<object>} - Normalisierte Daten
   */
  normalizeData(data) {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Datei ist leer oder ungueltig");
    }

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
   * @returns {object} - Mapping von Standardnamen zu tatsaechlichen Spaltennamen
   */
  detectColumns(firstRow) {
    const columns = {};
    const keys = Object.keys(firstRow);

    const normalizedKeys = {};
    keys.forEach((key) => {
      normalizedKeys[key.toLowerCase().trim()] = key;
    });

    // Bereich/Area
    columns.area = this.findColumn(normalizedKeys, [
      "bereich",
      "area",
      "zone",
      "raum",
    ]);

    // Kombiniertes Startdatum/Startzeit
    columns.startDateTime = this.findColumn(normalizedKeys, [
      "startdatum",
      "start datetime",
      "startzeit",
      "start time",
      "start",
      "von",
      "beginn",
    ]);

    // Kombiniertes Enddatum/Endzeit
    columns.endDateTime = this.findColumn(normalizedKeys, [
      "enddatum",
      "end datetime",
      "endzeit",
      "end time",
      "end",
      "bis",
      "ende",
    ]);

    // Getrennte Datum/Zeit-Spalten (z.B. aus Numbers-Dateien)
    columns.startDate = this.findColumn(normalizedKeys, [
      "start-datum",
      "startdatum",
    ]);
    columns.startTime = this.findColumn(normalizedKeys, [
      "start-zeit",
      "startzeit",
    ]);
    columns.endDate = this.findColumn(normalizedKeys, [
      "end-datum",
      "enddatum",
    ]);
    columns.endTime = this.findColumn(normalizedKeys, [
      "end-zeit",
      "endzeit",
    ]);

    // Wenn getrennte Spalten gefunden und keine kombinierten vorhanden
    // (Vermeidung von Konflikten wenn z.B. "Startdatum" sowohl als kombiniert
    // als auch als getrennt erkannt wird)
    columns.hasSeparateDateTime =
      columns.startDate !== null &&
      columns.startTime !== null &&
      columns.endDate !== null &&
      columns.endTime !== null &&
      columns.startDate !== columns.startDateTime;

    // Temperatur
    columns.temperature = this.findColumn(normalizedKeys, [
      "temperatur",
      "temperature",
      "temp",
      "°c",
      "celsius",
    ]);

    // Heizprofil
    columns.profile = this.findColumn(normalizedKeys, [
      "heizprofil",
      "profil",
      "profile",
      "heating profile",
    ]);

    // Zusatzinfo (auch "Veranstaltung" aus Numbers-Dateien)
    columns.notes = this.findColumn(normalizedKeys, [
      "zusatzinfo",
      "veranstaltung",
      "notes",
      "notiz",
      "bemerkung",
      "information",
      "info",
    ]);

    // Validiere Pflichtspalten
    if (!columns.area) {
      throw new Error('Spalte "Bereich" oder "Area" nicht gefunden');
    }
    if (!columns.startDateTime && !columns.hasSeparateDateTime) {
      throw new Error(
        'Spalte "Startdatum" oder "Start DateTime" nicht gefunden',
      );
    }
    if (!columns.endDateTime && !columns.hasSeparateDateTime) {
      throw new Error('Spalte "Enddatum" oder "End DateTime" nicht gefunden');
    }

    return columns;
  }

  /**
   * Findet eine Spalte basierend auf moeglichen Namen
   * @param {object} normalizedKeys - Normalisierte Spaltennamen
   * @param {Array<string>} possibleNames - Moegliche Namen
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
   * @param {number} _lineNumber - Zeilennummer fuer Fehlermeldungen
   * @returns {object} - Geparste Zeile
   */
  parseRow(row, columnMap, _lineNumber) {
    const area = row[columnMap.area];
    if (!area) {
      throw new Error("Bereich fehlt");
    }

    let startDateTime, endDateTime;

    if (columnMap.hasSeparateDateTime) {
      startDateTime = this.combineDateAndTime(
        row[columnMap.startDate],
        row[columnMap.startTime],
        "Startdatum",
      );
      endDateTime = this.combineDateAndTime(
        row[columnMap.endDate],
        row[columnMap.endTime],
        "Enddatum",
      );
    } else {
      startDateTime = this.parseDateTime(
        row[columnMap.startDateTime],
        "Startdatum",
      );
      endDateTime = this.parseDateTime(
        row[columnMap.endDateTime],
        "Enddatum",
      );
    }

    if (startDateTime >= endDateTime) {
      throw new Error("Startdatum muss vor Enddatum liegen");
    }

    const profileValue = row[columnMap.profile] || null;
    const { controlMode, deviceProfile } =
      this.parseProfileValue(profileValue);

    let temperature = null;
    const profile = controlMode === "temperature" ? profileValue : null;

    if (controlMode === "deviceProfile") {
      // Geraeteprofil: Temperatur optional (ignoriert)
      try {
        temperature = this.parseTemperature(row[columnMap.temperature]);
      } catch {
        temperature = null;
      }
    } else {
      temperature = this.parseTemperature(row[columnMap.temperature]);
    }

    const notes = row[columnMap.notes] || null;

    return {
      area: String(area).trim(),
      startDateTime: startDateTime.toISOString(),
      endDateTime: endDateTime.toISOString(),
      temperature,
      profile,
      deviceProfile,
      controlMode,
      notes,
    };
  }

  parseProfileValue(value) {
    if (!value || typeof value !== "string") {
      return { controlMode: "temperature", deviceProfile: null };
    }

    const trimmed = value.trim();
    const match = trimmed.match(
      /^(?:Ger[aä]teprofil|Geraeteprofil|GP|Profil):(\d)$/i,
    );
    if (match) {
      const num = parseInt(match[1], 10);
      if (num >= 1 && num <= 3) {
        return { controlMode: "deviceProfile", deviceProfile: num };
      }
      throw new Error(
        `Ungueltiges Geraeteprofil: ${num}. Erlaubt: 1, 2 oder 3.`,
      );
    }

    return { controlMode: "temperature", deviceProfile: null };
  }

  /**
   * Kombiniert getrennte Datum- und Zeit-Werte zu einem Date-Objekt
   * @param {*} dateValue - Datumswert (ISO-String oder Date)
   * @param {*} timeValue - Zeitwert (ISO-String oder Date, nur Uhrzeit relevant)
   * @param {string} fieldName - Feldname fuer Fehlermeldungen
   * @returns {Date}
   */
  combineDateAndTime(dateValue, timeValue, fieldName) {
    if (!dateValue) {
      throw new Error(`${fieldName} fehlt`);
    }
    if (!timeValue) {
      throw new Error(`${fieldName}-Zeit fehlt`);
    }

    const datePart = dateValue instanceof Date ? dateValue : new Date(dateValue);
    const timePart = timeValue instanceof Date ? timeValue : new Date(timeValue);

    if (isNaN(datePart.getTime())) {
      throw new Error(`${fieldName} hat ungueltiges Datum`);
    }
    if (isNaN(timePart.getTime())) {
      throw new Error(`${fieldName} hat ungueltige Zeit`);
    }

    // Datum von datePart, Uhrzeit von timePart (UTC)
    const combined = new Date(
      Date.UTC(
        datePart.getUTCFullYear(),
        datePart.getUTCMonth(),
        datePart.getUTCDate(),
        timePart.getUTCHours(),
        timePart.getUTCMinutes(),
        timePart.getUTCSeconds(),
      ),
    );

    return combined;
  }

  /**
   * Parst Datum und Zeit aus verschiedenen Formaten
   * @param {*} value - Datum/Zeit Wert
   * @param {string} fieldName - Feldname fuer Fehlermeldungen
   * @returns {Date} - Parsed Date
   */
  parseDateTime(value, fieldName) {
    if (!value) {
      throw new Error(`${fieldName} fehlt`);
    }

    if (value instanceof Date) {
      return value;
    }

    // Excel-Seriennummer (Tage seit 1900)
    if (typeof value === "number") {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

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

    // Fallback
    const parsed = Date.parse(str);
    if (!isNaN(parsed)) {
      return new Date(parsed);
    }

    throw new Error(`${fieldName} hat ungueltiges Format: ${str}`);
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
      throw new Error(`Ungueltige Temperatur: ${value}`);
    }

    if (temp < 0 || temp > 30) {
      throw new Error(`Temperatur muss zwischen 0 und 30°C liegen: ${temp}`);
    }

    return temp;
  }
}

export default SpreadsheetParser;
