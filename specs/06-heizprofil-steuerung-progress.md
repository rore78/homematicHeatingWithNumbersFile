# Epic 6: Heizprofil-Steuerung auf Geraeten -- Progress

## Team (Star Trek DS9)

| Crew Member | Aufgabe                                           | Status   |
| ----------- | ------------------------------------------------- | -------- |
| Sisko       | Client + DeviceController Heizprofil-Methoden     | Erledigt |
| Kira        | SpreadsheetParser parseProfileValue + Datenmodell | Erledigt |
| Odo         | ScheduleManager + HeatingProfile erweitern        | Erledigt |
| Dax         | REST API + Frontend anpassen                      | Erledigt |
| Bashir      | Tests und Verifikation                            | Erledigt |

## Steps

- [x] 1. LocalClient: setHeatingProfile (SET_POINT_MODE=0 + ACTIVE_PROFILE), getHeatingProfile
- [x] 2. CloudClient: setHeatingProfile, getHeatingProfile via Cloud API
- [x] 3. DeviceController: setHeatingProfile, getHeatingProfile, \_resolveChannelId (Kanal-Adressierung)
- [x] 4. SpreadsheetParser: parseProfileValue erkennt "Geraeteprofil:N", "GP:N", "Profil:N"
- [x] 5. Parser: controlMode + deviceProfile in normalisierten Daten, Temperatur optional bei deviceProfile
- [x] 6. HeatingProfile: isDeviceProfile() statische Methode
- [x] 7. ScheduleManager: controlMode/deviceProfile in createSchedule/updateSchedule
- [x] 8. checkAndExecute: Switch-Case temperature vs deviceProfile, lastCheckTime, Profil-1-Zuruecksetzung
- [x] 9. REST API: GET/POST /api/devices/:id/heating-profile Endpunkte
- [x] 10. Frontend: "Steuerung"-Spalte mit formatControlMode (Temp/Profil/Addon-Profil)
- [x] 11. Regex-Fix: "Geraeteprofil" (ae-Digraph) zusaetzlich zu "Geräteprofil" (ä)
- [x] 12. Alle 157 Tests bestehen, Lint sauber

## Geaenderte Dateien

| Datei                                  | Aenderung                                                |
| -------------------------------------- | -------------------------------------------------------- |
| `src/local/localClient.js`             | setHeatingProfile, getHeatingProfile                     |
| `src/cloud/cloudClient.js`             | setHeatingProfile, getHeatingProfile                     |
| `src/devices/deviceController.js`      | setHeatingProfile, getHeatingProfile, \_resolveChannelId |
| `src/parser/spreadsheetParser.js`      | parseProfileValue, controlMode/deviceProfile in parseRow |
| `src/scheduler/scheduleManager.js`     | checkAndExecute Switch-Case, lastCheckTime, Profil-Reset |
| `src/scheduler/heatingProfile.js`      | isDeviceProfile() statisch                               |
| `server.js`                            | GET/POST /api/devices/:id/heating-profile                |
| `public/index.html`                    | "Steuerung"-Spalte statt Temperatur+Heizprofil           |
| `public/app.js`                        | formatControlMode(), Preview-Tabelle angepasst           |
| `tests/unit/heatingProfile.test.js`    | +5 Tests (isDeviceProfile)                               |
| `tests/unit/spreadsheetParser.test.js` | +11 Tests (parseProfileValue, parse mit Geraeteprofil)   |

## Verification Results

- `npm test`: 157 tests, 10 files, all passing
- `npm run lint`: 0 errors, 0 warnings

## Status: COMPLETE
