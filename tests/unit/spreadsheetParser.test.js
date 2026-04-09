import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import os from "os";
import SpreadsheetParser from "../../src/parser/spreadsheetParser.js";

/**
 * Helper: creates a temporary .xlsx file from an array of row objects.
 * Returns the file path. Caller must clean up.
 */
function createTestXlsx(rows, tmpDir) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const filePath = path.join(tmpDir, `test-${Date.now()}.xlsx`);
  XLSX.writeFile(wb, filePath);
  return filePath;
}

describe("SpreadsheetParser", () => {
  let parser;
  let tmpDir;

  beforeEach(() => {
    parser = new SpreadsheetParser();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spreadsheetparser-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- detectColumns ---

  describe("detectColumns", () => {
    it("erkennt Standard-Spaltennamen", () => {
      const row = {
        Bereich: "Wohnzimmer",
        Startdatum: "2025-01-15 08:00",
        Enddatum: "2025-01-15 22:00",
        Temperatur: 21,
        Heizprofil: "Komfort",
        Zusatzinfo: "Test",
      };
      const columns = parser.detectColumns(row);
      expect(columns.area).toBe("Bereich");
      expect(columns.startDateTime).toBe("Startdatum");
      expect(columns.endDateTime).toBe("Enddatum");
      expect(columns.temperature).toBe("Temperatur");
      expect(columns.profile).toBe("Heizprofil");
      expect(columns.notes).toBe("Zusatzinfo");
    });

    it("erkennt case-insensitive Spaltennamen", () => {
      const row = {
        BEREICH: "X",
        STARTDATUM: "2025-01-15 08:00",
        ENDDATUM: "2025-01-15 22:00",
        TEMPERATUR: 21,
      };
      const columns = parser.detectColumns(row);
      expect(columns.area).toBe("BEREICH");
      expect(columns.startDateTime).toBe("STARTDATUM");
      expect(columns.endDateTime).toBe("ENDDATUM");
    });

    it("erkennt alternative Spaltennamen", () => {
      const row = {
        Area: "X",
        Von: "2025-01-15 08:00",
        Bis: "2025-01-15 22:00",
        Temp: 21,
      };
      const columns = parser.detectColumns(row);
      expect(columns.area).toBe("Area");
      expect(columns.startDateTime).toBe("Von");
      expect(columns.endDateTime).toBe("Bis");
      expect(columns.temperature).toBe("Temp");
    });

    it("erkennt getrennte Datum/Zeit-Spalten", () => {
      const row = {
        Bereich: "Saal",
        "Start-Datum": "2025-12-24",
        "Start-Zeit": "08:00",
        "End-Datum": "2025-12-24",
        "End-Zeit": "12:00",
        Temperatur: 21,
      };
      const columns = parser.detectColumns(row);
      expect(columns.hasSeparateDateTime).toBe(true);
      expect(columns.startDate).toBe("Start-Datum");
      expect(columns.startTime).toBe("Start-Zeit");
      expect(columns.endDate).toBe("End-Datum");
      expect(columns.endTime).toBe("End-Zeit");
    });

    it("erkennt Veranstaltung als notes-Spalte", () => {
      const row = {
        Bereich: "X",
        Startdatum: "2025-01-15 08:00",
        Enddatum: "2025-01-15 22:00",
        Temperatur: 21,
        Veranstaltung: "Konzert",
      };
      const columns = parser.detectColumns(row);
      expect(columns.notes).toBe("Veranstaltung");
    });

    it("wirft Fehler bei fehlender Pflichtspalte Bereich", () => {
      const row = {
        Startdatum: "2025-01-15 08:00",
        Enddatum: "2025-01-15 22:00",
        Temperatur: 21,
      };
      expect(() => parser.detectColumns(row)).toThrow("Bereich");
    });

    it("wirft Fehler bei fehlender Pflichtspalte Startdatum", () => {
      const row = {
        Bereich: "X",
        Enddatum: "2025-01-15 22:00",
        Temperatur: 21,
      };
      expect(() => parser.detectColumns(row)).toThrow("Startdatum");
    });

    it("akzeptiert fehlende optionale Spalten", () => {
      const row = {
        Bereich: "X",
        Startdatum: "2025-01-15 08:00",
        Enddatum: "2025-01-15 22:00",
        Temperatur: 21,
      };
      const columns = parser.detectColumns(row);
      expect(columns.profile).toBeNull();
      expect(columns.notes).toBeNull();
    });
  });

  // --- parseDateTime ---

  describe("parseDateTime", () => {
    it("parst ISO-Format mit Leerzeichen", () => {
      const date = parser.parseDateTime("2025-01-15 08:00", "Test");
      expect(date.getFullYear()).toBe(2025);
      expect(date.getMonth()).toBe(0);
      expect(date.getDate()).toBe(15);
      expect(date.getHours()).toBe(8);
      expect(date.getMinutes()).toBe(0);
    });

    it("parst ISO-Format mit T", () => {
      const date = parser.parseDateTime("2025-01-15T08:00", "Test");
      expect(date.getFullYear()).toBe(2025);
      expect(date.getHours()).toBe(8);
    });

    it("parst deutsches Format DD.MM.YYYY HH:MM", () => {
      const date = parser.parseDateTime("15.01.2025 08:00", "Test");
      expect(date.getFullYear()).toBe(2025);
      expect(date.getMonth()).toBe(0);
      expect(date.getDate()).toBe(15);
      expect(date.getHours()).toBe(8);
    });

    it("parst Excel-Seriennummer", () => {
      const date = parser.parseDateTime(45672, "Test");
      expect(date instanceof Date).toBe(true);
      expect(isNaN(date.getTime())).toBe(false);
    });

    it("reicht Date-Objekt durch", () => {
      const original = new Date(2025, 0, 15, 8, 0);
      const result = parser.parseDateTime(original, "Test");
      expect(result).toBe(original);
    });

    it("wirft Fehler bei ungueltigem Format", () => {
      expect(() =>
        parser.parseDateTime("nicht-ein-datum", "Startdatum"),
      ).toThrow("Startdatum");
    });

    it("wirft Fehler bei leerem Wert", () => {
      expect(() => parser.parseDateTime(null, "Enddatum")).toThrow("Enddatum");
      expect(() => parser.parseDateTime("", "Enddatum")).toThrow("Enddatum");
    });
  });

  // --- combineDateAndTime ---

  describe("combineDateAndTime", () => {
    it("kombiniert Date-Objekte korrekt", () => {
      const dateVal = new Date("2025-12-24T00:00:00.000Z");
      const timeVal = new Date("2025-01-01T08:30:00.000Z");
      const result = parser.combineDateAndTime(dateVal, timeVal, "Test");
      expect(result.getUTCFullYear()).toBe(2025);
      expect(result.getUTCMonth()).toBe(11); // December
      expect(result.getUTCDate()).toBe(24);
      expect(result.getUTCHours()).toBe(8);
      expect(result.getUTCMinutes()).toBe(30);
    });

    it("kombiniert ISO-Strings korrekt", () => {
      const result = parser.combineDateAndTime(
        "2025-12-24T00:00:00.000Z",
        "2025-01-01T14:00:00.000Z",
        "Test",
      );
      expect(result.getUTCMonth()).toBe(11);
      expect(result.getUTCDate()).toBe(24);
      expect(result.getUTCHours()).toBe(14);
    });

    it("wirft Fehler bei fehlendem Datum", () => {
      expect(() =>
        parser.combineDateAndTime(null, new Date(), "Startdatum"),
      ).toThrow("Startdatum fehlt");
    });

    it("wirft Fehler bei fehlender Zeit", () => {
      expect(() =>
        parser.combineDateAndTime(new Date(), null, "Startdatum"),
      ).toThrow("Startdatum-Zeit fehlt");
    });
  });

  // --- parseTemperature ---

  describe("parseTemperature", () => {
    it("parst Ganzzahl", () => {
      expect(parser.parseTemperature(21)).toBe(21);
    });

    it("parst Dezimalzahl", () => {
      expect(parser.parseTemperature(21.5)).toBe(21.5);
    });

    it("parst String-Zahl", () => {
      expect(parser.parseTemperature("21.5")).toBe(21.5);
    });

    it("wirft Fehler unter 0", () => {
      expect(() => parser.parseTemperature(-1)).toThrow("0 und 30");
    });

    it("wirft Fehler ueber 30", () => {
      expect(() => parser.parseTemperature(31)).toThrow("0 und 30");
    });

    it("wirft Fehler bei nicht-numerischem Wert", () => {
      expect(() => parser.parseTemperature("abc")).toThrow(
        "Ungueltige Temperatur",
      );
    });

    it("wirft Fehler bei null/leer", () => {
      expect(() => parser.parseTemperature(null)).toThrow("Temperatur fehlt");
      expect(() => parser.parseTemperature("")).toThrow("Temperatur fehlt");
    });
  });

  // --- parseRow ---

  describe("parseRow", () => {
    it("parst komplette Zeile korrekt", () => {
      const columnMap = {
        area: "Bereich",
        startDateTime: "Startdatum",
        endDateTime: "Enddatum",
        temperature: "Temperatur",
        profile: "Heizprofil",
        notes: "Zusatzinfo",
        hasSeparateDateTime: false,
      };
      const row = {
        Bereich: "Wohnzimmer",
        Startdatum: "2025-01-15 08:00",
        Enddatum: "2025-01-15 22:00",
        Temperatur: 21,
        Heizprofil: "Komfort",
        Zusatzinfo: "Testnotiz",
      };
      const result = parser.parseRow(row, columnMap, 1);
      expect(result.area).toBe("Wohnzimmer");
      expect(result.startDateTime).toContain("2025");
      expect(result.endDateTime).toContain("2025");
      expect(result.temperature).toBe(21);
      expect(result.profile).toBe("Komfort");
      expect(result.notes).toBe("Testnotiz");
    });

    it("parst Zeile mit getrennten Datum/Zeit-Spalten", () => {
      const columnMap = {
        area: "Bereich",
        startDate: "Start-Datum",
        startTime: "Start-Zeit",
        endDate: "End-Datum",
        endTime: "End-Zeit",
        temperature: "Temperatur",
        profile: "Heizprofil",
        notes: null,
        hasSeparateDateTime: true,
      };
      const row = {
        Bereich: "Saal",
        "Start-Datum": "2025-12-24T00:00:00.000Z",
        "Start-Zeit": "2025-01-01T08:00:00.000Z",
        "End-Datum": "2025-12-24T00:00:00.000Z",
        "End-Zeit": "2025-01-01T12:00:00.000Z",
        Temperatur: 21.5,
        Heizprofil: "Sonderprogramm",
      };
      const result = parser.parseRow(row, columnMap, 1);
      expect(result.area).toBe("Saal");
      expect(result.temperature).toBe(21.5);
      expect(result.profile).toBe("Sonderprogramm");
      // Verify date+time combination
      const start = new Date(result.startDateTime);
      expect(start.getUTCMonth()).toBe(11); // December
      expect(start.getUTCDate()).toBe(24);
      expect(start.getUTCHours()).toBe(8);
    });

    it("wirft Fehler wenn Startdatum nach Enddatum", () => {
      const columnMap = {
        area: "Bereich",
        startDateTime: "Startdatum",
        endDateTime: "Enddatum",
        temperature: "Temperatur",
        profile: null,
        notes: null,
        hasSeparateDateTime: false,
      };
      const row = {
        Bereich: "Wohnzimmer",
        Startdatum: "2025-01-15 22:00",
        Enddatum: "2025-01-15 08:00",
        Temperatur: 21,
      };
      expect(() => parser.parseRow(row, columnMap, 1)).toThrow(
        "Startdatum muss vor Enddatum",
      );
    });

    it("wirft Fehler bei fehlendem Bereich", () => {
      const columnMap = {
        area: "Bereich",
        startDateTime: "Startdatum",
        endDateTime: "Enddatum",
        temperature: "Temperatur",
        profile: null,
        notes: null,
        hasSeparateDateTime: false,
      };
      const row = {
        Bereich: null,
        Startdatum: "2025-01-15 08:00",
        Enddatum: "2025-01-15 22:00",
        Temperatur: 21,
      };
      expect(() => parser.parseRow(row, columnMap, 1)).toThrow("Bereich fehlt");
    });
  });

  // --- parse (full integration with xlsx file) ---

  describe("parse", () => {
    it("parst programmatisch erzeugte .xlsx Datei", () => {
      const rows = [
        {
          Bereich: "Wohnzimmer",
          Startdatum: "2025-01-15 08:00",
          Enddatum: "2025-01-15 22:00",
          Temperatur: 21,
          Heizprofil: "Komfort",
          Zusatzinfo: "Test",
        },
        {
          Bereich: "Schlafzimmer",
          Startdatum: "2025-01-15 22:00",
          Enddatum: "2025-01-16 06:00",
          Temperatur: 17,
          Heizprofil: "Nacht",
          Zusatzinfo: null,
        },
      ];
      const filePath = createTestXlsx(rows, tmpDir);
      const result = parser.parse(filePath);

      expect(result).toHaveLength(2);
      expect(result[0].area).toBe("Wohnzimmer");
      expect(result[0].temperature).toBe(21);
      expect(result[0].profile).toBe("Komfort");
      expect(result[1].area).toBe("Schlafzimmer");
      expect(result[1].temperature).toBe(17);
    });

    it("wirft Fehler bei leerer Datei", () => {
      const ws = XLSX.utils.aoa_to_sheet([]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const filePath = path.join(tmpDir, "empty.xlsx");
      XLSX.writeFile(wb, filePath);

      expect(() => parser.parse(filePath)).toThrow("leer oder ungueltig");
    });

    it("wirft Fehler bei nicht existierender Datei", () => {
      expect(() => parser.parse("/nonexistent/file.xlsx")).toThrow(
        "Datei nicht gefunden",
      );
    });

    it("parst deutsches Datumsformat in .xlsx", () => {
      const rows = [
        {
          Bereich: "Kueche",
          Startdatum: "15.01.2025 08:00",
          Enddatum: "15.01.2025 22:00",
          Temperatur: 20,
        },
      ];
      const filePath = createTestXlsx(rows, tmpDir);
      const result = parser.parse(filePath);

      expect(result).toHaveLength(1);
      expect(result[0].area).toBe("Kueche");
      expect(result[0].temperature).toBe(20);
    });

    it("parst .numbers-Beispieldatei", () => {
      const numbersPath = path.resolve("examples/HmIP-Sondertermine.numbers");
      if (!fs.existsSync(numbersPath)) {
        return; // Skip wenn Datei nicht vorhanden
      }

      const result = parser.parse(numbersPath);

      expect(result.length).toBeGreaterThan(0);
      // Pruefe erste Zeile
      expect(result[0].area).toBe("Großer Saal");
      expect(result[0].temperature).toBe(21.5);
      expect(result[0].profile).toBe("Sonderprogramm");
      expect(result[0].notes).toBe("Probe Weihnachten");
      // Pruefe dass Start vor Ende liegt
      for (const row of result) {
        expect(new Date(row.startDateTime).getTime()).toBeLessThan(
          new Date(row.endDateTime).getTime(),
        );
      }
    });

    it("gibt Export-Hinweis bei fehlerhafter .numbers-Datei", () => {
      // Erstelle eine Fake-.numbers-Datei (kein gueltiges ZIP)
      const fakePath = path.join(tmpDir, "fake.numbers");
      fs.writeFileSync(fakePath, "das ist keine numbers datei");

      expect(() => parser.parse(fakePath)).toThrow(
        "Bitte exportiere die Datei als Excel",
      );
    });
  });

  // --- normalizeData ---

  describe("normalizeData", () => {
    it("wirft Fehler bei leerem Array", () => {
      expect(() => parser.normalizeData([])).toThrow("leer oder ungueltig");
    });

    it("wirft Fehler bei Nicht-Array", () => {
      expect(() => parser.normalizeData(null)).toThrow("leer oder ungueltig");
    });
  });

  // --- parseProfileValue ---

  describe("parseProfileValue", () => {
    it("erkennt Geraeteprofil:1", () => {
      const result = parser.parseProfileValue("Geraeteprofil:1");
      expect(result.controlMode).toBe("deviceProfile");
      expect(result.deviceProfile).toBe(1);
    });

    it("erkennt Geraeteprofil:3", () => {
      const result = parser.parseProfileValue("Geraeteprofil:3");
      expect(result.controlMode).toBe("deviceProfile");
      expect(result.deviceProfile).toBe(3);
    });

    it("erkennt GP:2", () => {
      const result = parser.parseProfileValue("GP:2");
      expect(result.controlMode).toBe("deviceProfile");
      expect(result.deviceProfile).toBe(2);
    });

    it("erkennt Profil:1", () => {
      const result = parser.parseProfileValue("Profil:1");
      expect(result.controlMode).toBe("deviceProfile");
      expect(result.deviceProfile).toBe(1);
    });

    it("wirft Fehler bei Geraeteprofil:4", () => {
      expect(() => parser.parseProfileValue("Geraeteprofil:4")).toThrow(
        "Erlaubt: 1, 2 oder 3",
      );
    });

    it("wirft Fehler bei Geraeteprofil:0", () => {
      expect(() => parser.parseProfileValue("Geraeteprofil:0")).toThrow(
        "Erlaubt: 1, 2 oder 3",
      );
    });

    it("erkennt Komfort als Temperatur-Modus", () => {
      const result = parser.parseProfileValue("Komfort");
      expect(result.controlMode).toBe("temperature");
      expect(result.deviceProfile).toBeNull();
    });

    it("erkennt null/leer als Temperatur-Modus", () => {
      expect(parser.parseProfileValue(null).controlMode).toBe("temperature");
      expect(parser.parseProfileValue("").controlMode).toBe("temperature");
    });
  });

  // --- parse mit deviceProfile ---

  describe("parse mit Geraeteprofil", () => {
    it("parst Zeile mit Geraeteprofil", () => {
      const rows = [
        {
          Bereich: "Saal",
          Startdatum: "2025-12-24 08:00",
          Enddatum: "2025-12-24 22:00",
          Temperatur: 21,
          Heizprofil: "Geraeteprofil:2",
        },
      ];
      const filePath = createTestXlsx(rows, tmpDir);
      const result = parser.parse(filePath);

      expect(result[0].controlMode).toBe("deviceProfile");
      expect(result[0].deviceProfile).toBe(2);
      expect(result[0].profile).toBeNull();
    });

    it("Geraeteprofil hat Vorrang ueber Temperatur", () => {
      const rows = [
        {
          Bereich: "Saal",
          Startdatum: "2025-12-24 08:00",
          Enddatum: "2025-12-24 22:00",
          Temperatur: 21,
          Heizprofil: "GP:3",
        },
      ];
      const filePath = createTestXlsx(rows, tmpDir);
      const result = parser.parse(filePath);

      expect(result[0].controlMode).toBe("deviceProfile");
      expect(result[0].deviceProfile).toBe(3);
    });

    it("Temperatur-Modus bei normalem Profil", () => {
      const rows = [
        {
          Bereich: "Saal",
          Startdatum: "2025-12-24 08:00",
          Enddatum: "2025-12-24 22:00",
          Temperatur: 21,
          Heizprofil: "Komfort",
        },
      ];
      const filePath = createTestXlsx(rows, tmpDir);
      const result = parser.parse(filePath);

      expect(result[0].controlMode).toBe("temperature");
      expect(result[0].deviceProfile).toBeNull();
      expect(result[0].profile).toBe("Komfort");
      expect(result[0].temperature).toBe(21);
    });
  });
});
