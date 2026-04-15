# Epic 3: Nativer Apple Numbers Parser -- Spezifikation

## 1. Ziel

Den NumbersParser-Stub durch eine funktionierende Implementierung ersetzen, die .numbers-Dateien parsen kann. Gleichzeitig ExcelParser und NumbersParser zu einem einzigen `SpreadsheetParser` zusammenfuehren, da die xlsx-Library (SheetJS) beide Formate unterstuetzt.

## 2. Entscheidungen aus dem Brainstorming

| Thema              | Entscheidung                                                               |
| ------------------ | -------------------------------------------------------------------------- |
| Parsing-Ansatz     | xlsx-Library (SheetJS) -- unterstuetzt .xlsx und .numbers experimentell    |
| Fehlerbehandlung   | Fehler + Export-Hinweis ("Bitte exportiere als .xlsx")                     |
| Kompatibilitaet    | Nur einfache Tabellen (eine Tabelle pro Sheet, Text/Zahlen/Datum)          |
| Sheet-Auswahl      | Immer erstes Sheet                                                         |
| Parser-Architektur | Ein SpreadsheetParser statt zwei Klassen                                   |
| Dateiname          | `src/parser/spreadsheetParser.js` (neu), alte Dateien entfernen            |
| xlsx-Version       | Bei ^0.18.5 bleiben, nur upgraden wenn .numbers nicht funktioniert         |
| Testdatei          | Programmatisch erzeugte .xlsx mit identischen Daten aus der .numbers-Datei |
| Teststrategie      | Beispieldatei + Snapshot-Vergleich                                         |

## 3. Implementierung

### 3.1 Neuer SpreadsheetParser

**Datei:** `src/parser/spreadsheetParser.js`

**Klasse:** `SpreadsheetParser`

Basiert auf dem bestehenden `ExcelParser` mit folgenden Aenderungen:

- **Klassenname:** `SpreadsheetParser` statt `ExcelParser`
- **parse(filePath):** Erkennt anhand der Dateiendung ob es sich um .numbers oder .xlsx/.xls handelt. Fuer beide Formate wird `XLSX.readFile()` aufgerufen. Bei .numbers-Dateien wird ein spezifischer Try-Catch-Block mit hilfreicher Fehlermeldung eingefuegt.
- **Alle bestehenden Methoden bleiben erhalten:** `normalizeData()`, `detectColumns()`, `parseRow()`, `parseDateTime()`, `parseTemperature()`
- **Keine funktionalen Aenderungen** an der Parsing-Logik -- nur Umbenennung und .numbers-Fehlerbehandlung

**Fehlerbehandlung fuer .numbers:**

```javascript
try {
  const workbook = XLSX.readFile(filePath);
  // ... normales Parsing
} catch (error) {
  if (ext === ".numbers") {
    throw new Error(
      "Die Numbers-Datei konnte nicht gelesen werden. " +
        "Bitte exportiere die Datei als Excel (.xlsx) in Apple Numbers " +
        "(Ablage > Exportieren > Excel).",
    );
  }
  throw error;
}
```

### 3.2 Dateien entfernen

- `src/parser/excelParser.js` -- entfernen (Logik wandert in spreadsheetParser.js)
- `src/parser/numbersParser.js` -- entfernen (Stub wird nicht mehr gebraucht)

### 3.3 Import-Aktualisierungen

**server.js:**

- Bisherig: `import { ExcelParser } from './src/parser/excelParser.js'` + `import { NumbersParser } from './src/parser/numbersParser.js'`
- Neu: `import { SpreadsheetParser } from './src/parser/spreadsheetParser.js'`
- Upload-Route vereinfachen: Keine Extension-Pruefung mehr fuer Parser-Auswahl, immer `new SpreadsheetParser()` verwenden

**src/index.js:**

- Falls ExcelParser oder NumbersParser dort importiert werden: Import auf SpreadsheetParser umstellen

### 3.4 xlsx-Library Version

- Erster Schritt: Testen ob `XLSX.readFile()` mit Version 0.18.5 die Datei `examples/HmIP-Sondertermine.numbers` lesen kann
- Falls ja: Version beibehalten
- Falls nein: Upgrade auf neueste xlsx-Version (`npm install xlsx@latest`), erneut testen
- Falls auch das scheitert: Fehler + Export-Hinweis ist der dokumentierte Fallback

## 4. Tests

### 4.1 Testdatei-Erzeugung

Ein einmaliges Script (oder im Test-Setup) das:

1. `examples/HmIP-Sondertermine.numbers` mit dem SpreadsheetParser parst
2. Die normalisierten Daten als JSON speichert (Referenz-Snapshot)
3. Mit `XLSX.writeFile()` eine identische .xlsx-Datei erzeugt: `examples/HmIP-Sondertermine.xlsx`

Falls die .numbers-Datei nicht geparst werden kann (xlsx 0.18.5 versagt), muss die .xlsx-Testdatei manuell aus Apple Numbers exportiert werden.

### 4.2 Test-Suite

**Datei:** `tests/parser/spreadsheetParser.test.js`

**Tests:**

1. **Parse .xlsx-Datei** -- SpreadsheetParser liest die erzeugte .xlsx-Testdatei, Ergebnis wird gegen den Referenz-Snapshot verglichen
2. **Parse .numbers-Datei** -- SpreadsheetParser liest `HmIP-Sondertermine.numbers`, Ergebnis wird gegen den Referenz-Snapshot verglichen
3. **Ausgabe-Gleichheit** -- .numbers und .xlsx liefern die identische normalisierte Ausgabe (gleiche Feldnamen, gleiche Werte)
4. **Spalten-Erkennung** -- `detectColumns()` findet alle erwarteten Spalten (area, startDateTime, endDateTime, temperature, profile, notes)
5. **Datum-Parsing** -- Verschiedene Datumsformate werden korrekt geparst (ISO, deutsch DD.MM.YYYY, Excel-Seriennummer)
6. **Temperatur-Validierung** -- Gueltige Temperaturen (0-30) werden akzeptiert, ungueltige abgelehnt
7. **Fehler bei ungueltiger Datei** -- Nicht-Tabellendatei wirft Fehler
8. **Fehler bei .numbers mit Export-Hinweis** -- Wenn .numbers-Parsing fehlschlaegt, enthaelt die Fehlermeldung den Export-Hinweis

### 4.3 Bestehende ExcelParser-Tests migrieren

Falls in Epic 1 bereits Tests fuer ExcelParser geschrieben wurden: Import und Klassennamen auf SpreadsheetParser umstellen. Alle bestehenden Tests muessen weiterhin bestehen.

## 5. Aenderungsumfang

```
Neu:
  src/parser/spreadsheetParser.js       -- Hauptimplementierung
  tests/parser/spreadsheetParser.test.js -- Tests
  examples/HmIP-Sondertermine.xlsx      -- Programmatisch erzeugte Testdatei

Geaendert:
  server.js                             -- Import + Upload-Route vereinfachen
  src/index.js                          -- Import aktualisieren (falls relevant)

Entfernt:
  src/parser/excelParser.js             -- Logik in spreadsheetParser.js
  src/parser/numbersParser.js           -- Stub nicht mehr noetig
```

## 6. Akzeptanzkriterien

1. Upload von `HmIP-Sondertermine.numbers` ueber die Web-UI liefert die gleichen Zeitplandaten wie die aequivalente .xlsx-Datei
2. `npm test` besteht mit allen neuen und migrierten Tests
3. Fehlermeldungen sind auf Deutsch
4. Bei nicht-lesbaren .numbers-Dateien erscheint der Export-Hinweis
5. Bestehende .xlsx-Upload-Funktionalitaet ist nicht beeintraechtigt (Rueckwaertskompatibilitaet)
6. Keine neuen Abhaengigkeiten noetig (xlsx-Library ist bereits vorhanden)

## 7. Offene Risiken

- **xlsx 0.18.5 .numbers-Support:** Experimentell. Falls die Beispieldatei nicht geparst werden kann, ist der Export-Hinweis der Fallback. In dem Fall ist der "native" Parser faktisch ein "Best-Effort-Parser mit klarem Workaround".
- **Apple Numbers Format-Aenderungen:** Zukuenftige Numbers-Versionen koennten das .iwa-Format aendern und den xlsx-Parser brechen. Der Export-Hinweis bleibt als stabiler Fallback.
