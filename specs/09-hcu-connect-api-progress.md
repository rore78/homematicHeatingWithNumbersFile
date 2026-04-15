# Epic 9: HCU Connect API Plugin -- Progress

## Status

**COMPLETE** -- alle Schritte umgesetzt, Tests/Lint/Format sauber.

## Steps

- [x] Step 1: CCU3-Code entfernen (addon/, localClient, server.js, public/) -- commit `0b30981`
- [x] Step 2: HmipClient Interface definieren -- commit `23a0fc4`
- [x] Step 3: CloudClient auf HmipClient Interface refactoren -- commit `12df595`
- [x] Step 4: ConnectApiClient implementieren (WebSocket + PluginMessage) -- commit `e394011`
- [x] Step 5: DeviceController auf HmipClient Interface anpassen -- commit `adf3eb0`
- [x] Step 6: Plugin-Haupteinstieg umschreiben (src/index.js) -- commit `d0eb0df`
- [x] Step 7: Dockerfile + Build-Script + .dockerignore -- commit `202ceeb`
- [x] Step 8: Pfade konfigurierbar machen (DATA_DIR) -- commit `5ad06a3`
- [x] Step 9: Tests schreiben -- commit `93d8174`
- [x] Step 10: Config-Template fuer HCU-UI -- commit `eeb0708`

## Verifikation

- `npm test`: 217 Tests passed (14 Dateien, +26 neue Tests)
- `npm run lint`: fehlerfrei
- `npm run format:check`: alle Dateien formatiert
- Neue Coverage:
  - `src/client/hmipClient.js`: 100%
  - `src/client/connectApiClient.js`: ~80%

## Log

### 2026-04-15

- **Step 1**: addon/, src/local/, public/, server.js geloescht. xmlrpc, express, multer, cors, supertest aus dependencies entfernt. Config komplett umgeschrieben: cloud + hcu modes (local mode entfernt).
- **Step 2**: src/client/hmipClient.js mit JSDoc-Interface und isHmipClient Runtime-Check.
- **Step 3**: src/cloud/cloudClient.js -> src/client/cloudClient.js verschoben und Interface-Methoden hinzugefuegt (connect/disconnect/on/getSystemState/setBoost/setActiveProfile/setControlMode mit channelIndex).
- **Step 4**: ConnectApiClient mit WebSocket, PluginMessage-Envelope, pending-request Map mit Timeouts, Message-Routing, 8 HmIP System Requests, System-Events, Reconnect-Logik, Container-Token-Lesen. ConnectApiAuth fuer Remote-Entwicklung + scripts/auth-hcu.js CLI.
- **Step 5**: DeviceController auf Interface umgestellt (instanceof entfernt). setBoost und setControlMode hinzugefuegt. setParameter/getParameter/setDimLevel entfernt (nicht mehr noetig).
- **Step 6**: src/index.js als HomematicIPPlugin umgeschrieben. Mode-basiertes Client-Erstellen, DATA_DIR Setup, Event-Handler fuer HCU, SIGTERM/SIGINT Handler.
- **Step 7**: Dockerfile (Multi-Stage, arm64, Plugin-LABEL), .dockerignore, scripts/build-hcu-plugin.sh, npm run build:hcu + auth:hcu.
- **Step 8**: AreaManager/ScheduleManager akzeptieren Path-Parameter. src/index.js uebergibt DATA_DIR-basierte Pfade. Kein chdir mehr.
- **Step 10**: PropertyTemplate fuer 8 Plugin-Einstellungen (Polling, Temperaturen, FRITZ!Box, USB) in 3 Gruppen (general, heating, sources). CONFIG_UPDATE_REQUEST-Handler speichert in plugin-config.json.
- **Step 9**: 26 neue Tests (20 ConnectApiClient + 6 HmipClient) mit Mock-WebSocket. Alle 217 Tests gruen. Prettier-Formatierung durchgefuehrt.

## Naechste Schritte

Dieses Epic ist abgeschlossen. Offene Punkte fuer zukuenftige Epics:

1. **Praxistest auf echter HCU**: Bauen mit `npm run build:hcu`, auf HCU uebertragen, Plugin aktivieren, Temperatur-Flow mit echtem Thermostat verifizieren.
2. **Integration der Plugin-Konfiguration**: `plugin-config.json` in Polling/Scheduler einhaengen, sodass Config-Aenderungen aus HCUweb aktiv werden.
3. **Integrationstests mit Mock-WebSocket-Server**: End-to-end Plugin-Lebenszyklus inklusive DeviceController durchspielen.
