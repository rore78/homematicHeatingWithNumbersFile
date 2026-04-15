# Epic 9: HCU Connect API Plugin -- Testplan

## Automatisierte Tests

### Unit-Tests (vitest)

| Szenario | Datei | Test-Typ |
|---|---|---|
| HmipClient `isHmipClient` Typ-Check (null, partial, vollstaendig) | tests/unit/hmipClient.test.js | automated |
| CloudClient implementiert HmipClient | tests/unit/hmipClient.test.js | automated |
| ConnectApiClient implementiert HmipClient | tests/unit/hmipClient.test.js | automated |
| WebSocket-Header (authtoken, plugin-id, hmip-system-events) korrekt | tests/unit/connectApiClient.test.js | automated |
| Fehler ohne Auth-Token beim connect() | tests/unit/connectApiClient.test.js | automated |
| `hmip-system-events` Header nur wenn `subscribeSystemEvents: true` | tests/unit/connectApiClient.test.js | automated |
| PluginMessage-Envelope Format (pluginId, id, type, body) | tests/unit/connectApiClient.test.js | automated |
| Request/Response-Korrelation via UUID | tests/unit/connectApiClient.test.js | automated |
| Timeout-Fehler wenn keine Antwort kommt | tests/unit/connectApiClient.test.js | automated |
| errorCode im Response fuehrt zu Fehler | tests/unit/connectApiClient.test.js | automated |
| setTemperature Pfad + Body + Clipping (5-30°C) | tests/unit/connectApiClient.test.js | automated |
| setActiveProfile konvertiert 2 zu PROFILE_2 | tests/unit/connectApiClient.test.js | automated |
| setBoost sendet boolean | tests/unit/connectApiClient.test.js | automated |
| PLUGIN_STATE_REQUEST antwortet mit READY | tests/unit/connectApiClient.test.js | automated |
| CONFIG_TEMPLATE_REQUEST liefert template | tests/unit/connectApiClient.test.js | automated |
| CONFIG_UPDATE_REQUEST ruft Handler und antwortet APPLIED | tests/unit/connectApiClient.test.js | automated |
| CONFIG_UPDATE_REQUEST antwortet FAILED bei Handler-Fehler | tests/unit/connectApiClient.test.js | automated |
| System-Event DEVICE_CHANGED emittiert deviceChanged | tests/unit/connectApiClient.test.js | automated |
| System-Event GROUP_CHANGED emittiert groupChanged | tests/unit/connectApiClient.test.js | automated |
| System-Event HOME_CHANGED invalidiert Cache | tests/unit/connectApiClient.test.js | automated |
| Geraete-Normalisierung aus functionalChannels | tests/unit/connectApiClient.test.js | automated |
| Disconnect beendet pending Requests mit Fehler | tests/unit/connectApiClient.test.js | automated |
| Config: hcu-Mode wird aus Config/ENV erkannt | tests/unit/config.test.js | automated |
| Config: auto-Mode bevorzugt HCU wenn vorhanden | tests/unit/config.test.js | automated |
| Config: validate HCU ohne Token gibt Fehler | tests/unit/config.test.js | automated |

**Ausgefuehrt via:**
```bash
npm test                  # Alle Tests
npm run test:coverage     # Mit Abdeckung
```

### Linter + Formatter

| Szenario | Befehl | Test-Typ |
|---|---|---|
| ESLint gibt keine Fehler | `npm run lint` | automated |
| Prettier-Formatierung konsistent | `npm run format:check` | automated |

## Manuelle Tests

### Remote-Entwicklung (Mac → HCU im LAN)

| Szenario | Schritte | Erwartetes Ergebnis | Test-Typ |
|---|---|---|---|
| Auth-Flow ueber CLI | `npm run auth:hcu hcu1-XXXX.local ABCDEF` mit Aktivierungsschluessel aus HCUweb | Token und Client-ID werden ausgegeben, `.env`-Anleitung wird angezeigt | manual |
| Plugin startet mit Token | `.env` mit `HOMEMATIC_MODE=hcu`, `HOMEMATIC_HCU_HOST`, `HOMEMATIC_AUTH_TOKEN` -> `npm start` | Log-Ausgabe "Plugin startet im Modus: hcu" und "Connect API verbunden: wss://..." | manual |
| Systemstatus abrufen | REPL oder Debug-Aufruf: `await plugin.getClient().getSystemState()` | Liefert Objekt mit `devices` und `groups` | manual |
| Temperatur setzen | `await plugin.getClient().setTemperature("<gruppen-id>", 21.5)` | HmIP-Thermostat uebernimmt Temperatur, kein Fehler | manual |
| Event-Empfang | Waehrend Plugin laeuft: Temperatur in der HmIP-App aendern | Log zeigt `Geraet geaendert: ...` | manual |

### Docker Build

| Szenario | Schritte | Erwartetes Ergebnis | Test-Typ |
|---|---|---|---|
| Dockerfile baut ohne Fehler | `npm run build:hcu` | Image `heizungssteuerung-plugin:1.0.0` wird erstellt, `build/*.tar.gz` liegt vor | manual |
| Image enthaelt Plugin-LABEL | `docker inspect heizungssteuerung-plugin:1.0.0 --format '{{json .Config.Labels}}'` | LABEL `de.eq3.hmip.plugin.metadata` enthaelt pluginId, version, friendlyName | manual |
| Image ist linux/arm64 | `docker inspect heizungssteuerung-plugin:1.0.0 --format '{{.Architecture}}'` | `arm64` | manual |

### Installation auf HCU

| Szenario | Schritte | Erwartetes Ergebnis | Test-Typ |
|---|---|---|---|
| Plugin-Upload | Image-tar.gz auf HCU uebertragen und laden | HCUweb zeigt Plugin unter Einstellungen -> Plugins | manual |
| Plugin-Konfiguration | In HCUweb Plugin oeffnen | Konfigurationsfelder (Polling, Temperaturen, FRITZ!Box) werden gruppiert angezeigt | manual |
| Konfiguration aendern | FRITZ!Box-IP setzen und speichern | `/data/plugin-config.json` enthaelt den neuen Wert | manual |
| Plugin laeuft | Plugin aktivieren | Logs zeigen "Plugin startet im Modus: hcu" und "Connect API verbunden" | manual |
| Temperatur setzen | Ueber die Plugin-API eine Temperatur setzen | HmIP-Thermostat uebernimmt Temperatur | manual |
| Container-Restart | HCU neu starten | Plugin startet automatisch neu, `/data/` bleibt erhalten | manual |

## Abdeckungsziele

Nach Epic 9 (Stand 2026-04-15):

| Modul | Coverage |
|---|---|
| src/client/hmipClient.js | 100% |
| src/client/connectApiClient.js | ~80% |
| src/client/cloudClient.js | ~42% (Interface-Methoden getestet, interne Cloud-Specifics nicht) |
| src/config/config.js | ~81% |

Die bestehenden Module (ScheduleManager, AreaManager, Parser, Sources) behalten ihre Abdeckung >= 80% aus vorherigen Epics.
