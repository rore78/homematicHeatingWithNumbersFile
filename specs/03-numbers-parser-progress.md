# Epic 3: Nativer Apple Numbers Parser -- Progress

## Team (Star Trek TNG)

| Crew Member | Aufgabe                                       | Status   |
| ----------- | --------------------------------------------- | -------- |
| Picard      | SpreadsheetParser erstellen                   | Erledigt |
| Riker       | Alte Parser entfernen, Imports aktualisieren  | Erledigt |
| Troi        | .numbers-Parsing testen, xlsx-Version pruefen | Erledigt |
| LaForge     | Tests migrieren und erweitern                 | Erledigt |
| Data        | Verifikation und Progress-Datei               | Erledigt |

## Steps

- [x] 1. xlsx 0.18.5 .numbers-Support getestet -- funktioniert mit Beispieldatei
- [x] 2. SpreadsheetParser erstellt (vereint ExcelParser + NumbersParser)
- [x] 3. Getrennte Datum/Zeit-Spalten unterstuetzt (Start-Datum + Start-Zeit aus .numbers)
- [x] 4. "Veranstaltung" als notes-Spalte erkannt
- [x] 5. Export-Hinweis bei fehlerhafter .numbers-Datei
- [x] 6. Alte Parser entfernt (excelParser.js, numbersParser.js)
- [x] 7. Imports in server.js und tests aktualisiert
- [x] 8. Upload-Route vereinfacht (kein Extension-Check fuer Parser-Auswahl)
- [x] 9. 38 Parser-Tests (migriert + 6 neue), alle bestehen
- [x] 10. Alle 98 Tests bestehen, Lint sauber

## Geaenderte/Neue Dateien

| Datei                                  | Aenderung                                              |
| -------------------------------------- | ------------------------------------------------------ |
| `src/parser/spreadsheetParser.js`      | **Neu:** Vereinter Parser fuer .xlsx und .numbers      |
| `src/parser/excelParser.js`            | **Entfernt**                                           |
| `src/parser/numbersParser.js`          | **Entfernt**                                           |
| `server.js`                            | Import auf SpreadsheetParser, Upload-Route vereinfacht |
| `tests/unit/spreadsheetParser.test.js` | **Neu:** 38 Tests (migriert + erweitert)               |
| `tests/unit/excelParser.test.js`       | **Entfernt**                                           |
| `tests/integration/api.test.js`        | Import auf SpreadsheetParser                           |

## Wichtige Erkenntnisse

- xlsx 0.18.5 kann .numbers-Dateien lesen (experimenteller Support funktioniert)
- Die .numbers-Beispieldatei hat getrennte Datum/Zeit-Spalten (Start-Datum, Start-Zeit) statt kombinierter
- SpreadsheetParser erkennt automatisch ob getrennte oder kombinierte Spalten vorliegen
- Kein xlsx-Upgrade noetig, Version 0.18.5 reicht aus

## Verification Results

- `npm test`: 98 tests, 6 files, all passing
- `npm run lint`: 0 errors, 0 warnings
- .numbers-Beispieldatei: 4 Zeilen korrekt geparst mit allen Feldern

## Status: COMPLETE
