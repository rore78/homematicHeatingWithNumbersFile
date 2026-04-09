# Epic 5: FRITZ!Box NAS als Dateiquelle -- Progress

## Team (Star Trek Enterprise)

| Crew Member | Aufgabe | Status |
|-------------|---------|--------|
| Archer | FritzboxFileSource erstellen mit basic-ftp | Erledigt |
| T'Pol | FileSourceManager + server.js erweitern | Erledigt |
| Tucker | Frontend FRITZ!Box-Sektion | Erledigt |
| Reed | Tests und Verifikation | Erledigt |

## Steps

- [x] 1. basic-ftp npm-Paket installiert
- [x] 2. FritzboxFileSource: FTP-Verbindung mit FTPS-Fallback, Retry, Base64-Credentials
- [x] 3. testConnection() mit detaillierten deutschen Fehlermeldungen (530/ECONNREFUSED/550/ETIMEDOUT)
- [x] 4. DEFAULT_CONFIG um fritzbox-Eintrag erweitert
- [x] 5. FileSourceManager generischer: registerSource, scanSource-Fehler, testSource()
- [x] 6. Passwort-Handling: Base64-Kodierung bei PUT, Maskierung bei GET, ********-Erkennung
- [x] 7. POST /api/sources/:type/test Endpunkt fuer Verbindungstest
- [x] 8. PUT /api/sources/fritzbox Validierung (host, username, password)
- [x] 9. Frontend: FRITZ!Box-Karte mit Host/Port/User/Passwort/Pfad, Testen/Scan/Import
- [x] 10. Shared renderSourceFiles() fuer USB und FRITZ!Box
- [x] 11. FritzboxFileSource Tests (10): getType, getConfig, Base64, isAvailable, testConnection
- [x] 12. Alle 141 Tests bestehen, Lint sauber

## Neue/Geaenderte Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/sources/fritzboxFileSource.js` | **Neu:** FTP-basierte FileSource |
| `src/sources/fileSourceManager.js` | fritzbox DEFAULT_CONFIG, generisches registerSource, testSource(), Passwort-Handling |
| `server.js` | FritzboxFileSource registrieren, POST /test Endpunkt, PUT Validierung |
| `public/index.html` | FRITZ!Box-Sektion im Dateiquellen-Tab |
| `public/app.js` | FRITZ!Box-UI-Logik, shared renderSourceFiles |
| `public/style.css` | .source-hint Styling |
| `package.json` | basic-ftp Dependency |
| `tests/unit/fritzboxFileSource.test.js` | **Neu:** 10 Tests |
| `tests/unit/fileSourceManager.test.js` | Fehlermeldung-Anpassung |

## Verification Results

- `npm test`: 141 tests, 10 files, all passing
- `npm run lint`: 0 errors, 0 warnings

## Status: COMPLETE
