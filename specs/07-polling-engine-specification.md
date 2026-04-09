# Epic 7: Stuendliche Polling Engine -- Spezifikation

## 1. Ziel

Ein robuster zentraler Polling-Mechanismus der alle konfigurierten Dateiquellen (USB, FRITZ!Box NAS, spaeter iCloud) periodisch prueft, Aenderungen per MD5-Pruefsummenvergleich erkennt und Zeitplaene vollautomatisch aktualisiert. Die Web-UI zeigt den Polling-Status pro Quelle und bietet einen "Jetzt pruefen"-Button.

## 2. Entscheidungen aus dem Brainstorming

| Thema | Entscheidung |
|---|---|
| Architektur | Eigene Klasse `PollingEngine` in `src/polling/pollingEngine.js` |
| Polling-Strategie | Sequenziell -- eine Quelle nach der anderen |
| Aenderungsverhalten | Vollautomatik -- sofort importieren bei Pruefsummen-Aenderung |
| Intervall | Konfigurierbar via Dropdown (15 Min, 30 Min, 1 Stunde, 2 Stunden, 6 Stunden), Standard: 60 Min |
| Fehlerbehandlung | Nach 5 aufeinanderfolgenden Fehlern wird die Quelle automatisch deaktiviert |
| Status-Daten | Standard: Zeitstempel (lastChecked, lastChanged) + Fehlerinfo (lastError, lastErrorAt, consecutiveErrors) |
| Status-Persistierung | Eigene Datei `polling-status.json` (Config + Status + Log) |
| Geloeschte Dateien | Zeitplan als "Quelle nicht verfuegbar" markieren |
| UI-Platzierung | In bestehende Dateiquellen-Ansicht integriert |
| "Jetzt pruefen"-Scope | Pro Quelle ein Button + ein globaler Button |
| REST API | 4 Endpunkte: status, trigger, config, log |
| Auto-Start | Automatisch wenn mindestens eine Quelle aktiviert ist |
| Polling-Log | Ringpuffer mit 50 Eintraegen, nur signifikante Events (Aenderung, Import, Fehler) |
| Timer-Reset | Manueller Poll setzt den automatischen Timer zurueck |

## 3. Implementierung

### 3.1 PollingEngine

**Datei:** `src/polling/pollingEngine.js`

Zentrale Klasse die den periodischen Polling-Zyklus steuert:

```javascript
import { Logger } from '../utils/logger.js';

export class PollingEngine {
  constructor(fileSourceManager, scheduleManager, statusFilePath = 'polling-status.json') {
    this.fileSourceManager = fileSourceManager;
    this.scheduleManager = scheduleManager;
    this.statusFilePath = statusFilePath;
    this.timer = null;
    this.isRunning = false;  // true waehrend eines Poll-Zyklus laeuft
    this.status = null;      // geladen aus polling-status.json
    this.logger = new Logger('PollingEngine');
  }
}
```

**Konfiguration und Status (`polling-status.json`):**

```json
{
  "enabled": true,
  "intervalMinutes": 60,
  "sources": {
    "usb": {
      "lastChecked": "2026-03-22T14:00:00.000Z",
      "lastChanged": "2026-03-22T10:30:00.000Z",
      "consecutiveErrors": 0,
      "lastError": null,
      "lastErrorAt": null
    },
    "fritzbox": {
      "lastChecked": null,
      "lastChanged": null,
      "consecutiveErrors": 3,
      "lastError": "Verbindung fehlgeschlagen.",
      "lastErrorAt": "2026-03-22T13:00:00.000Z"
    }
  },
  "log": [
    {
      "timestamp": "2026-03-22T14:00:00.000Z",
      "type": "change",
      "source": "usb",
      "message": "Datei 'Heizplan.xlsx' geaendert, Import durchgefuehrt.",
      "details": { "fileName": "Heizplan.xlsx", "action": "updated", "scheduleId": "abc-123" }
    },
    {
      "timestamp": "2026-03-22T13:00:00.000Z",
      "type": "error",
      "source": "fritzbox",
      "message": "Verbindung fehlgeschlagen. (Fehler 3/5)",
      "details": { "error": "ECONNREFUSED", "consecutiveErrors": 3 }
    }
  ]
}
```

**Log-Eintragstypen:**

| type | Wann geloggt |
|---|---|
| `change` | Datei-Aenderung erkannt und importiert |
| `import` | Neue Datei erstmals importiert |
| `error` | Fehler beim Scannen oder Importieren |
| `disabled` | Quelle nach 5 Fehlern automatisch deaktiviert |
| `source_missing` | Zuvor vorhandene Datei nicht mehr gefunden |

**`loadStatus()`:**

1. `polling-status.json` lesen (falls vorhanden)
2. Defaults anwenden: `{ enabled: true, intervalMinutes: 60, sources: {}, log: [] }`
3. In `this.status` speichern

**`saveStatus()`:**

1. `this.status` nach `polling-status.json` schreiben

**`start()`:**

1. `loadStatus()` aufrufen
2. Pruefen ob `status.enabled === true`
3. Pruefen ob mindestens eine Quelle im FileSourceManager aktiviert ist
4. Wenn beides true: Timer starten mit `setInterval(pollCycle, intervalMinutes * 60 * 1000)`
5. Timer-Referenz in `this.timer` speichern
6. Loggen: "Polling gestartet (Intervall: {interval} Minuten)"

**`stop()`:**

1. `clearInterval(this.timer)`
2. `this.timer = null`
3. Loggen: "Polling gestoppt"

**`restart()`:**

1. `stop()` aufrufen
2. `start()` aufrufen
3. Wird genutzt nach Konfigurations-Aenderungen und manuellem Trigger

**`pollCycle()`:**

Hauptmethode -- prueft alle aktivierten Quellen sequenziell:

1. Wenn `this.isRunning === true`: Abbrechen (verhindert ueberlappende Zyklen)
2. `this.isRunning = true`
3. Alle registrierten Quellen vom FileSourceManager holen
4. Fuer jede Quelle die `enabled === true` ist:
   a. `pollSource(type)` aufrufen (try/catch)
5. `this.isRunning = false`
6. `saveStatus()`

**`pollSource(type)`:**

Prueft eine einzelne Quelle auf Aenderungen:

1. `fileSourceManager.scanSource(type)` aufrufen
2. Bei Fehler:
   a. `sources[type].consecutiveErrors++`
   b. `sources[type].lastError = error.message`
   c. `sources[type].lastErrorAt = new Date().toISOString()`
   d. Log-Eintrag: `{ type: "error", source, message, details }`
   e. Wenn `consecutiveErrors >= 5`:
      - Quelle deaktivieren: `fileSourceManager.updateSourceConfig(type, { enabled: false })`
      - Log-Eintrag: `{ type: "disabled", source, message: "Quelle nach 5 Fehlern deaktiviert." }`
   f. Return
3. Bei Erfolg:
   a. `sources[type].consecutiveErrors = 0`
   b. `sources[type].lastError = null`
   c. `sources[type].lastChecked = new Date().toISOString()`
4. Scan-Ergebnisse mit gespeicherten Pruefsummen vergleichen:
   a. Fuer jede Datei im Scan-Ergebnis: Pruefsumme mit `sources.json` `files`-Eintrag vergleichen
   b. Neue oder geaenderte Dateien identifizieren
5. Fuer jede geaenderte/neue Datei:
   a. `fileSourceManager.importFile(type, fileName, this.scheduleManager)` aufrufen
   b. `sources[type].lastChanged = new Date().toISOString()`
   c. Log-Eintrag: `{ type: "change"|"import", source, message, details }`
6. Zuvor vorhandene Dateien pruefen die jetzt fehlen:
   a. Zeitplaene mit `source.type === type` und `source.fileName === fehlendeDatei` suchen
   b. Zeitplan-Source-Feld erweitern: `source.unavailable = true`
   c. Log-Eintrag: `{ type: "source_missing", source, message }`

**`triggerPoll(type = null)`:**

Manueller Poll -- "Jetzt pruefen":

1. Wenn `type !== null`: Nur `pollSource(type)` aufrufen
2. Wenn `type === null`: `pollCycle()` aufrufen (alle Quellen)
3. Timer zuruecksetzen: `restart()` aufrufen (setzt Intervall neu)
4. `saveStatus()`
5. Ergebnis zurueckgeben

**`updateConfig(config)`:**

Polling-Konfiguration aendern:

1. `status.enabled` und/oder `status.intervalMinutes` aktualisieren
2. `saveStatus()`
3. `restart()` aufrufen (damit neues Intervall greift)

**`getStatus()`:**

Status fuer API/UI zurueckgeben:

```javascript
{
  enabled: true,
  intervalMinutes: 60,
  running: false,           // ob gerade ein Zyklus laeuft
  nextPoll: "2026-03-22T15:00:00.000Z",  // berechnet aus Timer
  sources: {
    "usb": { lastChecked, lastChanged, consecutiveErrors, lastError, lastErrorAt },
    "fritzbox": { ... }
  }
}
```

**`getLog(limit = 50)`:**

Die letzten N Log-Eintraege zurueckgeben (neueste zuerst).

**`addLogEntry(entry)`:**

1. Eintrag zu `this.status.log` hinzufuegen (am Anfang)
2. Wenn `log.length > 50`: Aelteste Eintraege entfernen (Ringpuffer)

### 3.2 Zeitplan-Source-Erweiterung: "Quelle nicht verfuegbar"

**Datei:** `src/scheduler/scheduleManager.js`

Das bestehende `source`-Feld im Zeitplan wird um `unavailable` erweitert:

```javascript
source: {
  type: "usb",
  fileName: "Heizplan.xlsx",
  lastChecksum: "abc123...",
  importedAt: "2026-03-22T10:30:00.000Z",
  unavailable: true  // NEU: Datei wurde bei letztem Scan nicht gefunden
}
```

Zeitplan bleibt aktiv, aber die UI zeigt eine Warnung an. Wenn die Datei spaeter wieder auftaucht (z.B. USB-Stick wird wieder eingesteckt), wird `unavailable` auf `false` gesetzt und der Zeitplan ggf. aktualisiert.

### 3.3 REST API Endpunkte

**Datei:** `server.js`

#### `GET /api/polling/status`

Aktueller Polling-Status.

**Response:**
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "intervalMinutes": 60,
    "running": false,
    "nextPoll": "2026-03-22T15:00:00.000Z",
    "sources": {
      "usb": {
        "lastChecked": "2026-03-22T14:00:00.000Z",
        "lastChanged": "2026-03-22T10:30:00.000Z",
        "consecutiveErrors": 0,
        "lastError": null,
        "lastErrorAt": null
      }
    }
  }
}
```

#### `POST /api/polling/trigger`

Manueller Poll-Trigger ("Jetzt pruefen").

**Request Body (optional):**
```json
{ "type": "usb" }
```

Wenn `type` angegeben: Nur diese Quelle pruefen. Ohne `type`: Alle aktivierten Quellen.

**Response:**
```json
{
  "success": true,
  "message": "Pruefung abgeschlossen.",
  "data": {
    "sourcesChecked": ["usb"],
    "changes": [
      { "source": "usb", "fileName": "Heizplan.xlsx", "action": "updated" }
    ]
  }
}
```

#### `PUT /api/polling/config`

Polling-Konfiguration aendern.

**Request Body:**
```json
{
  "enabled": true,
  "intervalMinutes": 60
}
```

**Validierung:**
- `intervalMinutes` muss einer der erlaubten Werte sein: 15, 30, 60, 120, 360
- `enabled` muss boolean sein

**Response:**
```json
{
  "success": true,
  "message": "Polling-Konfiguration aktualisiert.",
  "data": { "enabled": true, "intervalMinutes": 60 }
}
```

#### `GET /api/polling/log`

Letzte Polling-Ereignisse.

**Query-Parameter:**
- `limit` (optional, Standard: 50, Max: 50)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2026-03-22T14:00:00.000Z",
      "type": "change",
      "source": "usb",
      "message": "Datei 'Heizplan.xlsx' geaendert, Import durchgefuehrt.",
      "details": { "fileName": "Heizplan.xlsx", "action": "updated", "scheduleId": "abc-123" }
    }
  ]
}
```

### 3.4 Frontend -- Polling-Integration in Dateiquellen-Ansicht

**Dateien:** `public/index.html`, `public/app.js`, `public/style.css`

#### Globale Polling-Steuerung (oberhalb der Quellen-Karten)

```
+----------------------------------------------------------+
| Automatisches Polling                                     |
|                                                           |
| Aktiviert: [x]    Intervall: [1 Stunde       v]          |
|                                                           |
| Naechste Pruefung: 22.03.2026, 15:00                     |
|                                                           |
| [Alle Quellen pruefen]                                    |
+----------------------------------------------------------+
```

**Verhalten:**
- Checkbox "Aktiviert" ruft `PUT /api/polling/config` auf
- Dropdown "Intervall" mit Optionen: 15 Minuten, 30 Minuten, 1 Stunde, 2 Stunden, 6 Stunden
- "Naechste Pruefung" wird aus `GET /api/polling/status` gelesen
- "Alle Quellen pruefen" ruft `POST /api/polling/trigger` auf (ohne `type`)
- Waehrend des Pruefens: Button disabled + Ladeindikator

#### Pro-Quelle Polling-Status (in bestehenden Quellen-Karten)

Jede Quellen-Karte (USB, FRITZ!Box) wird um Polling-Status erweitert:

```
+----------------------------------------------------------+
| USB-Laufwerk                              [Aktiviert: x]  |
| Mount: /media/usb0/Heizung                                |
|                                                           |
| ... bestehende Konfiguration ...                          |
|                                                           |
| Polling-Status:                                           |
|   Zuletzt geprueft: 22.03.2026, 14:00                    |
|   Zuletzt geaendert: 22.03.2026, 10:30                   |
|   Status: OK                                              |
|                                                           |
| [Jetzt pruefen]  [Dateien anzeigen]                       |
+----------------------------------------------------------+
```

**Status-Anzeige:**
- **OK**: Gruener Text, keine Fehler
- **Fehler (N/5)**: Oranger Text mit Fehlermeldung, z.B. "USB-Laufwerk nicht gefunden (Fehler 2/5)"
- **Deaktiviert (Fehler)**: Roter Text, "Nach 5 Fehlern automatisch deaktiviert. [Reaktivieren]"
- **Quelle nicht verfuegbar**: Gelber Hinweis bei Zeitplaenen deren Quelldatei fehlt

**"Jetzt pruefen"-Button pro Quelle:**
- Ruft `POST /api/polling/trigger` mit `{ "type": "usb" }` auf
- Waehrend des Pruefens: disabled + Spinner
- Nach Abschluss: Status aktualisieren

#### Polling-Log Ansicht

Neuer ausklappbarer Bereich unterhalb der Polling-Steuerung:

```
+----------------------------------------------------------+
| Polling-Protokoll                              [v Zuklappen] |
|                                                           |
| 22.03.2026, 14:00 | USB     | Datei 'Heizplan.xlsx'     |
|                    |         | geaendert, Import          |
|                    |         | durchgefuehrt.             |
| 22.03.2026, 13:00 | FRITZ!Box| Verbindung fehlgeschlagen. |
|                    |          | (Fehler 3/5)              |
| ...                                                       |
+----------------------------------------------------------+
```

**Verhalten:**
- Standardmaessig zugeklappt
- Laedt Daten von `GET /api/polling/log`
- Farbkodierung: Gruen fuer Imports/Changes, Rot fuer Errors, Orange fuer Warnungen
- Aktualisiert sich nach jedem manuellen "Jetzt pruefen"

### 3.5 Server.js Integration

**Datei:** `server.js`

Initialisierung der PollingEngine:

```javascript
import { PollingEngine } from './src/polling/pollingEngine.js';

// Nach FileSourceManager und ScheduleManager Initialisierung:
const pollingEngine = new PollingEngine(fileSourceManager, scheduleManager);
pollingEngine.start();
```

Neue Endpunkte registrieren:
- `GET /api/polling/status` → `pollingEngine.getStatus()`
- `POST /api/polling/trigger` → `pollingEngine.triggerPoll(req.body.type)`
- `PUT /api/polling/config` → `pollingEngine.updateConfig(req.body)`
- `GET /api/polling/log` → `pollingEngine.getLog(req.query.limit)`

## 4. Tests

### 4.1 Unit-Tests PollingEngine

**Datei:** `tests/unit/pollingEngine.test.js`

FileSourceManager und ScheduleManager werden gemockt:

1. **constructor** -- Initialisiert mit korrekten Defaults
2. **loadStatus** -- Laedt polling-status.json, wendet Defaults an bei fehlender Datei
3. **saveStatus** -- Schreibt Status korrekt nach polling-status.json
4. **start** -- Startet Timer wenn enabled und Quellen aktiv
5. **start** -- Startet NICHT wenn enabled=false
6. **start** -- Startet NICHT wenn keine Quelle aktiviert ist
7. **stop** -- Stoppt Timer, setzt timer auf null
8. **pollCycle** -- Ruft pollSource fuer jede aktivierte Quelle auf
9. **pollCycle** -- Verhindert ueberlappende Zyklen (isRunning-Guard)
10. **pollSource** -- Erkennt geaenderte Datei und importiert automatisch
11. **pollSource** -- Ignoriert unveraenderte Dateien (gleiche Pruefsumme)
12. **pollSource** -- Erkennt neue Dateien und importiert
13. **pollSource** -- Zaehlt consecutiveErrors bei Fehler hoch
14. **pollSource** -- Setzt consecutiveErrors auf 0 bei Erfolg
15. **pollSource** -- Deaktiviert Quelle nach 5 aufeinanderfolgenden Fehlern
16. **pollSource** -- Markiert Zeitplan als "unavailable" wenn Datei fehlt
17. **pollSource** -- Setzt "unavailable" zurueck wenn Datei wieder da ist
18. **triggerPoll** -- Prueft einzelne Quelle wenn type angegeben
19. **triggerPoll** -- Prueft alle Quellen wenn type null
20. **triggerPoll** -- Setzt Timer zurueck (restart)
21. **updateConfig** -- Aktualisiert Intervall und Enabled-Status
22. **updateConfig** -- Validiert erlaubte Intervall-Werte
23. **updateConfig** -- Ruft restart auf nach Aenderung
24. **getStatus** -- Gibt korrekten Status zurueck inkl. nextPoll
25. **getLog** -- Gibt neueste Eintraege zuerst zurueck
26. **addLogEntry** -- Begrenzt Log auf 50 Eintraege (Ringpuffer)
27. **addLogEntry** -- Aelteste Eintraege werden entfernt

### 4.2 Integrationstests REST API

**Datei:** `tests/integration/polling-api.test.js`

1. **GET /api/polling/status** -- Gibt Status mit allen Feldern zurueck
2. **POST /api/polling/trigger** -- Triggert Poll-Zyklus, gibt Ergebnis zurueck
3. **POST /api/polling/trigger mit type** -- Prueft nur angegebene Quelle
4. **PUT /api/polling/config** -- Aktualisiert Intervall
5. **PUT /api/polling/config** -- Validierungsfehler bei ungueltigem Intervall
6. **PUT /api/polling/config** -- Aktiviert/Deaktiviert Polling
7. **GET /api/polling/log** -- Gibt Log-Eintraege zurueck
8. **GET /api/polling/log mit limit** -- Begrenzt Anzahl der Eintraege

### 4.3 Erweiterung bestehender Tests

**Datei:** `tests/unit/fileSourceManager.test.js`

Keine Aenderungen noetig -- PollingEngine nutzt die bestehenden Methoden von FileSourceManager.

## 5. Abhaengigkeiten

**Keine neuen npm-Pakete.** Die PollingEngine nutzt ausschliesslich bestehende Module:
- `FileSourceManager` (scanSource, importFile, updateSourceConfig, getAllSources)
- `ScheduleManager` (findScheduleBySource, updateSchedule)
- `Logger` (Logging-Utility)
- `fs/promises` (polling-status.json lesen/schreiben)

**Voraussetzungen:**
- Epic 4 (USB-Dateiquelle, FileSourceManager) muss abgeschlossen sein
- Epic 5 (FRITZ!Box NAS) muss abgeschlossen sein (damit es Quellen zum Pollen gibt)

## 6. Aenderungsumfang

```
Neu:
  src/polling/pollingEngine.js              -- Zentrale Polling Engine Klasse
  tests/unit/pollingEngine.test.js          -- Unit-Tests
  tests/integration/polling-api.test.js     -- API-Integrationstests
  polling-status.json                       -- Polling-Config + Status + Log (Runtime)

Geaendert:
  server.js                                 -- PollingEngine initialisieren, 4 neue API-Endpunkte
  src/scheduler/scheduleManager.js          -- source.unavailable Feld unterstuetzen
  public/index.html                         -- Polling-Steuerung, Pro-Quelle-Status, Log-Ansicht
  public/app.js                             -- Polling-UI-Logik, API-Aufrufe
  public/style.css                          -- Styling fuer Polling-Status, Farbkodierung, Log
```

## 7. Akzeptanzkriterien

1. Polling startet automatisch beim Server-Start wenn mindestens eine Quelle aktiviert ist
2. Aenderung einer Datei auf USB oder FRITZ!Box NAS fuehrt zur automatischen Aktualisierung des Zeitplans innerhalb des naechsten Polling-Zyklus
3. Web-UI zeigt Polling-Status pro Quelle: Zuletzt geprueft, Zuletzt geaendert, Fehlerstatus
4. "Jetzt pruefen"-Button funktioniert global und pro Quelle
5. Polling-Intervall ist ueber Dropdown konfigurierbar (15/30/60/120/360 Min)
6. Nach 5 aufeinanderfolgenden Fehlern wird die Quelle automatisch deaktiviert mit Hinweis in der UI
7. Keine doppelten Zeitplaene bei unveraenderten Dateien (Pruefsummenvergleich)
8. Zeitplaene mit fehlender Quelldatei werden als "Quelle nicht verfuegbar" markiert (bleiben aktiv)
9. Polling-Log zeigt signifikante Events (Aenderungen, Imports, Fehler)
10. Manueller Poll setzt den automatischen Timer zurueck
11. `polling-status.json` ueberlebt Neustarts
12. `npm test` besteht mit allen neuen und bestehenden Tests

## 8. Offene Risiken

- **CCU3-Ressourcen:** Die CCU3 hat begrenzten RAM (512 MB) und einen ARM-Prozessor. Polling mit vielen Dateien oder grossen Spreadsheets koennte Speicherprobleme verursachen. Die sequenzielle Strategie minimiert dieses Risiko.
- **Datei-Locking:** Wenn eine Quelldatei gerade geschrieben wird waehrend der Poll laeuft, koennte ein inkonsistenter Zustand gelesen werden. Dies ist unwahrscheinlich bei stuendlichem Polling, aber bei kuerzeren Intervallen denkbar.
- **FRITZ!Box-Verbindungsstabilitaet:** FTP-Verbindungen zur FRITZ!Box koennen bei WLAN-Instabilitaet oder Router-Last fehlschlagen. Der Fehler-Zaehler mit 5er-Schwelle bietet einen guten Kompromiss.
- **Zeitzone/Systemuhr:** Die CCU3 muss eine korrekte Systemuhr haben, damit Zeitstempel (lastChecked, nextPoll) sinnvoll sind. NTP ist auf der CCU3 normalerweise konfiguriert.
