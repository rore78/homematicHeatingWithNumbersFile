# Epic 4: USB-Laufwerk als Dateiquelle -- Progress

## Team (Star Trek Voyager)

| Crew Member | Aufgabe | Status |
|-------------|---------|--------|
| Janeway | FileSource Basis-Klasse + UsbFileSource | Erledigt |
| Chakotay | FileSourceManager | Erledigt |
| Tuvok | ScheduleManager erweitern (source-Feld) | Erledigt |
| Torres | REST API Endpunkte (5 neue) | Erledigt |
| Paris | Frontend Dateiquellen-Bereich | Erledigt |
| Kim | Tests und Verifikation | Erledigt |

## Steps

- [x] 1. FileSource Basis-Klasse mit 6 abstrakten Methoden
- [x] 2. UsbFileSource: listFiles, readFile, getChecksum (MD5), isAvailable, subFolder-Support
- [x] 3. FileSourceManager: Orchestrierung, sources.json Persistenz, Scan + Import-Logik
- [x] 4. ScheduleManager: source-Feld in createSchedule, updateSchedule, findScheduleBySource
- [x] 5. REST API: GET /api/sources, PUT /api/sources/:type, POST scan, GET files, POST import
- [x] 6. Frontend: Dateiquellen-Bereich mit USB-Konfiguration, Scan-Button, Dateiliste + Import
- [x] 7. Bug-Fix: DEFAULT_CONFIG deep copy (shared reference mutation)
- [x] 8. Unit-Tests: FileSource (6), UsbFileSource (14), FileSourceManager (13)
- [x] 9. Alle 131 Tests bestehen, Lint sauber

## Neue/Geaenderte Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/sources/fileSource.js` | **Neu:** Abstrakte Basis-Klasse |
| `src/sources/usbFileSource.js` | **Neu:** USB-Implementierung |
| `src/sources/fileSourceManager.js` | **Neu:** Orchestrierung + Persistenz |
| `src/scheduler/scheduleManager.js` | source-Feld, findScheduleBySource, updateSchedule |
| `server.js` | 5 neue API-Endpunkte, FileSourceManager-Integration |
| `public/index.html` | Neuer "Dateiquellen"-Bereich |
| `public/app.js` | Dateiquellen-UI-Logik |
| `public/style.css` | Styling fuer Dateiquellen |
| `tests/unit/fileSource.test.js` | **Neu:** 6 Tests |
| `tests/unit/usbFileSource.test.js` | **Neu:** 14 Tests |
| `tests/unit/fileSourceManager.test.js` | **Neu:** 13 Tests |

## Verification Results

- `npm test`: 131 tests, 9 files, all passing
- `npm run lint`: 0 errors, 0 warnings

## Status: COMPLETE
