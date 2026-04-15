# Epic 8: iCloud als Dateiquelle (Experimentell) -- Spezifikation

## 1. Ziel

Zugriff auf Tabellendateien (.numbers, .xlsx) in iCloud Drive ueber eine Python-Bridge (pyicloud). Die iCloud-Quelle integriert sich in das bestehende FileSource/Polling-System. Zusaetzlich wird ein generischer Push-Endpunkt mit API-Key-Authentifizierung bereitgestellt, der als Fallback oder Alternative zum direkten iCloud-Zugriff dient (z.B. via iOS-Kurzbefehl).

**Wichtig:** Diese Quelle ist als "experimentell" gekennzeichnet, da sie von Apples undokumentierter Web-API abhaengt und jederzeit brechen kann.

## 2. Entscheidungen aus dem Brainstorming

| Thema                     | Entscheidung                                                       |
| ------------------------- | ------------------------------------------------------------------ |
| Primaer-Ansatz            | iCloud Web-Session via pyicloud (Python-Bridge)                    |
| Fallback                  | Generischer Push-Endpunkt (HTTP POST mit API-Key)                  |
| Bibliothek                | pyicloud via child_process (Python-Bridge mit Session-Cache)       |
| Python-Bridge-Architektur | Ein Script pro Aktion mit persistentem Session-Verzeichnis         |
| Bridge-Operationen        | 5 Aktionen: login, verify-2fa, list, download, status              |
| 2FA-Handling              | Einmaliger Setup-Flow in der Web-UI                                |
| Session-Speicherung       | Eigene Datei `icloud-session.json` + pyicloud Session-Verzeichnis  |
| Token-Ablauf              | Automatisch erkennen + UI-Warnung "Re-Auth noetig"                 |
| Python-Abhaengigkeit      | Optional mit graceful degradation (Addon funktioniert ohne Python) |
| Push-Endpunkt             | Eigenstaendiger Import-Endpunkt (kein FileSource)                  |
| Push-Authentifizierung    | API-Key als Bearer Token, automatisch generiert                    |
| Push-Verhalten            | Sofort parsen und importieren                                      |
| UI-Layout                 | Multi-Schritt-Wizard innerhalb der Quellen-Karte                   |
| API-Key-Verwaltung        | Automatisch generiert, anzeigbar + Copy-Button + Regenerieren      |
| Kurzbefehl-Hilfe          | Schritt-fuer-Schritt-Anleitung in der UI                           |

## 3. Implementierung

### 3.1 IcloudFileSource

**Datei:** `src/sources/icloudFileSource.js`

Implementiert `FileSource` fuer iCloud Drive. Delegiert alle iCloud-Operationen an das Python-Bridge-Script.

```javascript
import { FileSource } from "./fileSource.js";
import { execFile } from "child_process";
import { promisify } from "util";

export class IcloudFileSource extends FileSource {
  constructor(config = {}) {
    // config: { appleId, password (Base64), path, sessionDir }
  }
}
```

**Konstruktor-Parameter:**

| Feld         | Typ    | Beschreibung                                                          |
| ------------ | ------ | --------------------------------------------------------------------- |
| `appleId`    | string | Apple-ID E-Mail-Adresse                                               |
| `password`   | string | Base64-kodiertes Passwort                                             |
| `path`       | string | Pfad im iCloud Drive (z.B. `/Heizung`)                                |
| `sessionDir` | string | Verzeichnis fuer pyicloud Session-Cache (Standard: `icloud-session/`) |

**Interner Zustand:**

```javascript
this.pythonAvailable = null; // null = nicht geprueft, true/false
this.sessionValid = null; // null = nicht geprueft, true/false
this.authState = "unknown"; // 'unknown' | 'not_configured' | 'python_missing' |
// 'login_required' | '2fa_required' | 'authenticated' |
// 'reauth_required'
```

**`_checkPython()`:**

Prueft ob Python 3 und pyicloud verfuegbar sind:

1. `execFile('python3', ['--version'])` ausfuehren
2. `execFile('python3', ['-c', 'import pyicloud'])` ausfuehren
3. Bei Erfolg: `this.pythonAvailable = true`
4. Bei Fehler: `this.pythonAvailable = false`, `this.authState = 'python_missing'`
5. Ergebnis cachen (nur einmal pruefen pro Server-Start)

**`_execBridge(action, args = {})`:**

Zentrale Methode die das Python-Bridge-Script ausfuehrt:

```javascript
async _execBridge(action, args = {}) {
  const cmdArgs = [
    'scripts/icloud_bridge.py',
    '--action', action,
    '--session-dir', this.sessionDir,
    ...Object.entries(args).flatMap(([k, v]) => [`--${k}`, v])
  ];
  const { stdout, stderr } = await execFileAsync('python3', cmdArgs, {
    timeout: 30000,  // 30 Sekunden Timeout
    maxBuffer: 10 * 1024 * 1024  // 10 MB fuer Datei-Downloads
  });
  return JSON.parse(stdout);
}
```

**`getType()`:** return `'icloud'`

**`getConfig()`:** return `{ appleId, path }` (ohne Passwort)

**`updateConfig(config)`:** Aktualisiert Instance-Variablen.

**`isAvailable()`:**

1. `_checkPython()` aufrufen (falls noch nicht geprueft)
2. Wenn Python fehlt: return `false`
3. `_execBridge('status')` aufrufen
4. Wenn `authenticated === true`: return `true`
5. Sonst: return `false`

**`listFiles()`:**

1. `_execBridge('list', { path: this.path })` aufrufen
2. Ergebnis filtern nach `.xlsx`, `.xls`, `.numbers`
3. Zurueckgeben als `Array<{ name, path, size, modified }>`

**`readFile(filePath)`:**

1. Temporaere Datei erstellen: `uploads/icloud-temp-{uuid}.{ext}`
2. `_execBridge('download', { path: filePath, output: tempPath })` aufrufen
3. Datei lesen und als Buffer zurueckgeben
4. Temporaere Datei loeschen

**`getChecksum(filePath)`:**

1. `readFile(filePath)` aufrufen
2. MD5-Hash berechnen: `crypto.createHash('md5').update(buffer).digest('hex')`
3. Hash-String zurueckgeben

**Zusaetzliche Methoden (nicht im FileSource-Interface):**

**`login(appleId, password)`:**

1. `_execBridge('login', { 'apple-id': appleId, password })` aufrufen
2. Ergebnis pruefen:
   - `status === '2fa_required'`: `this.authState = '2fa_required'`, return `{ status: '2fa_required' }`
   - `status === 'ok'`: `this.authState = 'authenticated'`, return `{ status: 'ok' }`
   - Fehler: return `{ status: 'error', message: '...' }`

**`verify2fa(code)`:**

1. `_execBridge('verify-2fa', { code })` aufrufen
2. Bei Erfolg: `this.authState = 'authenticated'`
3. Return `{ status, session_valid }`

**`checkSession()`:**

1. `_execBridge('status')` aufrufen
2. Ergebnis: `{ authenticated: true/false }`
3. Wenn `authenticated === false`: `this.authState = 'reauth_required'`
4. Return Ergebnis

**`getAuthState()`:**

Return aktuellen `this.authState` fuer die UI.

### 3.2 Python-Bridge-Script

**Datei:** `scripts/icloud_bridge.py`

Standalone-Python-Script das via CLI-Argumente gesteuert wird und JSON via stdout zurueckgibt. Alle Fehler werden als JSON auf stdout ausgegeben (nicht stderr), damit Node.js sie parsen kann.

**Abhaengigkeiten:** `pyicloud` (pip3)

**Aktionen:**

#### `--action login`

```
Eingabe: --apple-id <email> --password <password> --session-dir <path>
Ausgabe: {"status": "2fa_required"} oder {"status": "ok"}
Fehler:  {"status": "error", "message": "..."}
```

1. `PyiCloudService(apple_id, password, cookie_directory=session_dir)` erstellen
2. Wenn `api.requires_2fa`: Return `{"status": "2fa_required"}`
3. Sonst: Return `{"status": "ok"}`

#### `--action verify-2fa`

```
Eingabe: --code <6-stellig> --session-dir <path>
Ausgabe: {"status": "ok", "session_valid": true}
Fehler:  {"status": "error", "message": "Ungueltiger Code."}
```

1. Session aus Session-Verzeichnis laden
2. `api.validate_2fa_code(code)` aufrufen
3. `api.trust_session()` aufrufen (verhindert erneute 2FA-Abfrage)

#### `--action list`

```
Eingabe: --path <icloud-drive-pfad> --session-dir <path>
Ausgabe: {"files": [{"name": "plan.xlsx", "size": 5000, "modified": "2026-03-22T10:30:00Z", "path": "/Heizung/plan.xlsx"}]}
Fehler:  {"status": "error", "message": "Pfad nicht gefunden."} oder {"status": "reauth_required"}
```

1. Session laden, pruefen ob authentifiziert
2. `api.drive.navigate(path)` aufrufen
3. Dateien auflisten, filtern nach .xlsx/.xls/.numbers
4. Metadaten extrahieren und als JSON zurueckgeben

#### `--action download`

```
Eingabe: --path <datei-pfad> --output <lokaler-pfad> --session-dir <path>
Ausgabe: {"status": "ok", "path": "/tmp/file.xlsx", "size": 5000}
Fehler:  {"status": "error", "message": "..."} oder {"status": "reauth_required"}
```

1. Session laden
2. Datei via `api.drive.navigate(path).open(stream=True)` herunterladen
3. In `--output` schreiben

#### `--action status`

```
Eingabe: --session-dir <path>
Ausgabe: {"status": "ok", "authenticated": true} oder {"status": "ok", "authenticated": false}
Fehler:  {"status": "error", "message": "..."}
```

1. Session laden
2. Pruefen ob Session gueltig ist (`api.requires_2fa`, Drive-Zugriff versuchen)

**Fehlerbehandlung im Script:**

Alle Exceptions werden gefangen und als JSON ausgegeben:

```python
try:
    # ... Aktion ausfuehren
except PyiCloudFailedLoginException:
    print(json.dumps({"status": "error", "message": "Anmeldung fehlgeschlagen. Bitte Apple-ID und Passwort pruefen."}))
except PyiCloudAPIResponseException as e:
    if "session" in str(e).lower():
        print(json.dumps({"status": "reauth_required", "message": "Session abgelaufen."}))
    else:
        print(json.dumps({"status": "error", "message": str(e)}))
except Exception as e:
    print(json.dumps({"status": "error", "message": f"Unbekannter Fehler: {str(e)}"}))
```

Exit-Code: immer 0 (Fehler werden via JSON kommuniziert, nicht via Exit-Code).

### 3.3 icloud-session.json

**Datei:** `icloud-session.json` (Runtime, nicht im Repository)

Speichert den iCloud-Authentifizierungszustand:

```json
{
  "appleId": "user@icloud.com",
  "authState": "authenticated",
  "lastAuthenticated": "2026-03-22T14:00:00.000Z",
  "lastSessionCheck": "2026-03-22T14:00:00.000Z",
  "sessionDir": "icloud-session/"
}
```

**Hinweis:** Die eigentlichen Session-Cookies werden von pyicloud im `sessionDir` verwaltet. `icloud-session.json` ist nur Metadaten fuer die Node.js-Seite.

### 3.4 Generischer Push-Endpunkt

**Datei:** `server.js` (neue Endpunkte)

Der Push-Endpunkt ist unabhaengig von der iCloud-Quelle. Er akzeptiert Dateien per HTTP POST und importiert sie sofort.

#### API-Key-Verwaltung

**Datei:** `push-config.json` (Runtime)

```json
{
  "enabled": false,
  "apiKey": "a7b3c9d2e1f4g5h6i7j8k9l0m1n2o3p4",
  "lastUpload": null,
  "lastUploadFile": null
}
```

API-Key wird beim ersten Aktivieren generiert:

```javascript
import crypto from "crypto";
const apiKey = crypto.randomBytes(32).toString("hex");
```

#### `POST /api/push/upload`

Empfaengt eine Datei und importiert sie sofort.

**Authentifizierung:**

```
Authorization: Bearer <API-Key>
```

**Request:** multipart/form-data mit Feld `file` (.xlsx, .xls, .numbers)

**Workflow:**

1. API-Key aus Header pruefen
2. Wenn ungueltig: `401 { success: false, error: "Ungueltiger API-Key." }`
3. Wenn Push deaktiviert: `403 { success: false, error: "Push-Endpunkt ist deaktiviert." }`
4. Datei via multer empfangen (gleiche Limits wie bestehender Upload: max 10 MB)
5. `SpreadsheetParser.parse(tempFile)` aufrufen
6. Pruefsumme berechnen (MD5)
7. Bestehenden Zeitplan suchen: `scheduleManager.findScheduleBySource('push', fileName)`
8. Zeitplan erstellen oder aktualisieren
9. Source-Objekt am Zeitplan speichern: `{ type: 'push', fileName, lastChecksum, importedAt }`
10. Temporaere Datei loeschen
11. `push-config.json` aktualisieren (lastUpload, lastUploadFile)

**Response (Erfolg):**

```json
{
  "success": true,
  "message": "Zeitplan 'Heizplan' aktualisiert.",
  "data": {
    "scheduleId": "uuid-123",
    "action": "updated",
    "entries": 5
  }
}
```

**Response (Fehler):**

```json
{
  "success": false,
  "error": "Fehler beim Parsen: Spalte 'Bereich' nicht gefunden."
}
```

#### `GET /api/push/config`

Push-Endpunkt-Konfiguration abfragen.

**Response:**

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "apiKey": "a7b3c9d2...",
    "endpoint": "/api/push/upload",
    "lastUpload": "2026-03-22T10:30:00.000Z",
    "lastUploadFile": "Heizplan.xlsx"
  }
}
```

#### `PUT /api/push/config`

Push-Endpunkt konfigurieren.

**Request Body:**

```json
{ "enabled": true }
```

Beim Aktivieren wird automatisch ein API-Key generiert falls noch keiner existiert.

**Response:**

```json
{
  "success": true,
  "message": "Push-Endpunkt aktiviert.",
  "data": { "enabled": true, "apiKey": "a7b3c9d2..." }
}
```

#### `POST /api/push/regenerate-key`

Neuen API-Key generieren (invalidiert den alten).

**Response:**

```json
{
  "success": true,
  "message": "Neuer API-Key generiert.",
  "data": { "apiKey": "neuer-key..." }
}
```

### 3.5 REST API -- iCloud-spezifische Endpunkte

Zusaetzlich zu den bestehenden `/api/sources/:type/*` Endpunkten braucht iCloud spezifische Endpunkte fuer den 2FA-Flow:

#### `POST /api/sources/icloud/login`

Startet den Login-Prozess.

**Request Body:**

```json
{
  "appleId": "user@icloud.com",
  "password": "mein-passwort"
}
```

**Response (2FA noetig):**

```json
{
  "success": true,
  "data": {
    "status": "2fa_required",
    "message": "Bestaetigungscode wurde an Ihre Apple-Geraete gesendet."
  }
}
```

**Response (Erfolg ohne 2FA):**

```json
{
  "success": true,
  "data": { "status": "authenticated" }
}
```

#### `POST /api/sources/icloud/verify-2fa`

Verifiziert den 2FA-Code.

**Request Body:**

```json
{ "code": "123456" }
```

**Response:**

```json
{
  "success": true,
  "data": { "status": "authenticated", "message": "Erfolgreich angemeldet." }
}
```

#### `GET /api/sources/icloud/auth-state`

Aktueller Authentifizierungszustand fuer die UI.

**Response:**

```json
{
  "success": true,
  "data": {
    "authState": "authenticated",
    "pythonAvailable": true,
    "appleId": "user@icloud.com",
    "lastAuthenticated": "2026-03-22T14:00:00.000Z"
  }
}
```

Moegliche `authState`-Werte:

- `python_missing` -- Python 3 oder pyicloud nicht installiert
- `not_configured` -- Keine Apple-ID hinterlegt
- `login_required` -- Noch nicht angemeldet
- `2fa_required` -- 2FA-Code eingeben
- `authenticated` -- Verbunden und Session gueltig
- `reauth_required` -- Session abgelaufen, erneute Anmeldung noetig

#### `POST /api/sources/icloud/logout`

Abmelden und Session loeschen.

**Response:**

```json
{
  "success": true,
  "message": "iCloud-Session geloescht."
}
```

### 3.6 sources.json Erweiterung

```json
{
  "usb": { "..." },
  "fritzbox": { "..." },
  "icloud": {
    "enabled": false,
    "appleId": "",
    "password": "",
    "path": "",
    "lastChecked": null,
    "files": {}
  }
}
```

**Felder (iCloud-spezifisch):**

| Feld          | Typ          | Beschreibung                             |
| ------------- | ------------ | ---------------------------------------- |
| `enabled`     | boolean      | Ob die Quelle aktiv ist                  |
| `appleId`     | string       | Apple-ID E-Mail                          |
| `password`    | string       | Base64-kodiertes Passwort                |
| `path`        | string       | Pfad im iCloud Drive                     |
| `lastChecked` | string\|null | Letzter Scan-Zeitstempel                 |
| `files`       | object       | Zuletzt gesehene Dateien mit Pruefsummen |

### 3.7 FileSourceManager-Anpassungen

**Datei:** `src/sources/fileSourceManager.js`

1. `IcloudFileSource` importieren und registrieren
2. `DEFAULT_CONFIG` um `icloud`-Eintrag erweitern
3. Bei `updateSourceConfig('icloud', config)`: Passwort Base64-kodieren
4. Bei `getAllSources()`: iCloud-Passwort maskieren, `authState` hinzufuegen
5. Spezielle iCloud-Methoden delegieren: `loginIcloud()`, `verify2faIcloud()`, `checkIcloudSession()`

### 3.8 server.js Integration

**Datei:** `server.js`

```javascript
import { IcloudFileSource } from "./src/sources/icloudFileSource.js";

// Registrierung
const icloudSource = new IcloudFileSource();
fileSourceManager.registerSource(icloudSource);

// Bestehende Endpunkte funktionieren automatisch fuer :type = "icloud":
// GET /api/sources (inkl. icloud)
// PUT /api/sources/icloud (Config aendern)
// POST /api/sources/icloud/scan
// GET /api/sources/icloud/files
// POST /api/sources/icloud/import

// Neue iCloud-spezifische Endpunkte:
// POST /api/sources/icloud/login
// POST /api/sources/icloud/verify-2fa
// GET /api/sources/icloud/auth-state
// POST /api/sources/icloud/logout

// Neue Push-Endpunkte:
// POST /api/push/upload
// GET /api/push/config
// PUT /api/push/config
// POST /api/push/regenerate-key
```

### 3.9 Frontend

**Dateien:** `public/index.html`, `public/app.js`, `public/style.css`

#### iCloud-Karte (Multi-Schritt-Wizard)

Unterhalb der FRITZ!Box-Karte. Zeigt je nach `authState` den passenden Zustand:

**Zustand `python_missing`:**

```
┌─────────────────────────────────────────────────────────┐
│ iCloud Drive (Experimentell)                             │
│                                                          │
│ ⚠ Python 3 + pyicloud nicht gefunden.                   │
│                                                          │
│ iCloud-Zugriff erfordert Python 3 und das pyicloud-Paket.│
│ Installation auf der CCU3:                                │
│   1. Python-Addon installieren (z.B. python3-ccu)        │
│   2. SSH-Zugang oeffnen                                  │
│   3. pip3 install pyicloud                               │
│                                                          │
│                                     [Erneut pruefen]     │
└─────────────────────────────────────────────────────────┘
```

**Zustand `not_configured` / `login_required`:**

```
┌─────────────────────────────────────────────────────────┐
│ iCloud Drive (Experimentell)              [Aktiviert: O] │
│                                                          │
│ Apple-ID:     [                          ]               │
│ Passwort:     [                          ]               │
│ iCloud-Pfad:  [/Heizung                  ]               │
│                                                          │
│ ℹ Verwenden Sie Ihr Apple-ID-Passwort oder ein           │
│   app-spezifisches Passwort (appleid.apple.com).         │
│   Zugangsdaten werden kodiert auf der CCU gespeichert.   │
│                                                          │
│ [Speichern]  [Anmelden]                                  │
└─────────────────────────────────────────────────────────┘
```

**Zustand `2fa_required`:**

```
┌─────────────────────────────────────────────────────────┐
│ iCloud Drive (Experimentell)                             │
│                                                          │
│ Ein Bestaetigungscode wurde an Ihre Apple-Geraete        │
│ gesendet. Bitte geben Sie den 6-stelligen Code ein.      │
│                                                          │
│ 2FA-Code:  [______]              [Bestaetigen]           │
│                                                          │
│ [Abbrechen]                                              │
└─────────────────────────────────────────────────────────┘
```

**Zustand `authenticated`:**

```
┌─────────────────────────────────────────────────────────┐
│ iCloud Drive (Experimentell)              [Aktiviert: x] │
│                                                          │
│ Apple-ID: user@icloud.com                                │
│ Pfad: /Heizung                                           │
│ Session: Gueltig ✓                                       │
│                                                          │
│ Polling-Status:                                          │
│   Zuletzt geprueft: 22.03.2026, 14:00                   │
│   Zuletzt geaendert: 22.03.2026, 10:30                  │
│   Dateien: 1 (.numbers)                                  │
│                                                          │
│ [Jetzt pruefen]  [Abmelden]  [Dateien anzeigen]         │
└─────────────────────────────────────────────────────────┘
```

**Zustand `reauth_required`:**

```
┌─────────────────────────────────────────────────────────┐
│ iCloud Drive (Experimentell)              [Aktiviert: x] │
│                                                          │
│ ⚠ Session abgelaufen. Erneute Anmeldung erforderlich.   │
│   Polling fuer diese Quelle ist pausiert.                │
│                                                          │
│ [Erneut anmelden]                                        │
└─────────────────────────────────────────────────────────┘
```

#### Push-Endpunkt-Karte

Unterhalb der iCloud-Karte:

```
┌─────────────────────────────────────────────────────────┐
│ Push-Endpunkt (Datei-Upload via HTTP)                    │
│                                                          │
│ Aktiviert: [x]                                           │
│                                                          │
│ API-Key: a7b3c9d2e1f4g5h6...           [Kopieren]       │
│                                [Neuen Key generieren]    │
│                                                          │
│ Endpunkt: POST http://[CCU-IP]:3000/api/push/upload      │
│ Header:   Authorization: Bearer <API-Key>                │
│                                                          │
│ Letzter Upload: 22.03.2026, 10:30 (Heizplan.xlsx)       │
│                                                          │
│ ─── iOS-Kurzbefehl einrichten ───                        │
│                                                          │
│ So erstellen Sie einen Kurzbefehl der eine Datei aus     │
│ iCloud Drive automatisch an diesen Endpunkt sendet:      │
│                                                          │
│ 1. "Kurzbefehle"-App auf dem iPhone/iPad oeffnen         │
│ 2. Neuen Kurzbefehl erstellen                            │
│ 3. Aktion "Datei" hinzufuegen                            │
│    → Pfad auf die Datei in iCloud Drive setzen           │
│ 4. Aktion "Inhalt von URL abrufen" hinzufuegen           │
│    → URL: http://[CCU-IP]:3000/api/push/upload           │
│    → Methode: POST                                       │
│    → Header: Authorization = Bearer <API-Key>            │
│    → Body: Formular → Datei hinzufuegen                  │
│ 5. Optional: Als Automation einrichten                    │
│    (z.B. taeglich um 08:00)                              │
└─────────────────────────────────────────────────────────┘
```

**Verhalten:**

- "Kopieren" kopiert den API-Key in die Zwischenablage
- "Neuen Key generieren" zeigt Bestaetigung ("Bisheriger Key wird ungueltig. Fortfahren?")
- `[CCU-IP]` wird dynamisch durch die aktuelle Server-Adresse ersetzt
- Kurzbefehl-Anleitung ist standardmaessig zugeklappt (Accordion)

## 4. Tests

### 4.1 Unit-Tests IcloudFileSource

**Datei:** `tests/unit/icloudFileSource.test.js`

Python-Bridge wird gemockt (child_process.execFile wird gestubt):

1. **getType** -- gibt 'icloud' zurueck
2. **getConfig** -- gibt Config ohne Passwort zurueck
3. **\_checkPython** -- erkennt verfuegbares Python 3 + pyicloud
4. **\_checkPython** -- erkennt fehlendes Python (authState = python_missing)
5. **\_checkPython** -- erkennt fehlendes pyicloud (authState = python_missing)
6. **\_execBridge** -- ruft Python-Script mit korrekten Argumenten auf
7. **\_execBridge** -- parsed JSON-Ausgabe korrekt
8. **\_execBridge** -- Timeout nach 30 Sekunden
9. **isAvailable** -- true bei authenticated Session
10. **isAvailable** -- false bei fehlendem Python
11. **isAvailable** -- false bei abgelaufener Session
12. **login** -- sendet Apple-ID und Passwort an Bridge
13. **login** -- erkennt 2fa_required Status
14. **login** -- erkennt erfolgreichen Login
15. **login** -- Fehlermeldung bei falschen Zugangsdaten
16. **verify2fa** -- sendet Code an Bridge, setzt authState
17. **verify2fa** -- Fehlermeldung bei ungueltigem Code
18. **listFiles** -- filtert .xlsx/.numbers aus iCloud-Drive-Listing
19. **listFiles** -- leerer Ordner gibt leeres Array zurueck
20. **readFile** -- laedt Datei herunter und gibt Buffer zurueck
21. **readFile** -- loescht temporaere Datei nach dem Lesen
22. **getChecksum** -- berechnet korrekten MD5-Hash
23. **checkSession** -- erkennt gueltige Session
24. **checkSession** -- erkennt abgelaufene Session (authState = reauth_required)
25. **getAuthState** -- gibt aktuellen Zustand zurueck

### 4.2 Unit-Tests Push-Endpunkt

**Datei:** `tests/unit/pushEndpoint.test.js`

1. **API-Key-Generierung** -- erzeugt 64-Zeichen hex-String
2. **API-Key-Validierung** -- akzeptiert gueltigen Key
3. **API-Key-Validierung** -- lehnt ungueltigen Key ab (401)
4. **API-Key-Validierung** -- lehnt fehlenden Header ab (401)
5. **Push deaktiviert** -- lehnt Upload ab (403)
6. **Upload** -- parst .xlsx und erstellt Zeitplan
7. **Upload** -- parst .numbers und erstellt Zeitplan
8. **Upload** -- aktualisiert bestehenden Zeitplan bei gleicher Dateiname
9. **Upload** -- lehnt ungueltige Dateiendung ab
10. **Upload** -- Fehlermeldung bei Parse-Fehler
11. **Key-Regenerierung** -- neuer Key, alter ungueltig
12. **Config laden/speichern** -- push-config.json Persistenz

### 4.3 Integrationstests REST API

**Datei:** `tests/integration/icloud-api.test.js`

(iCloud-Bridge wird gemockt, Push-Endpunkt wird real getestet)

1. **GET /api/sources** -- enthaelt icloud-Eintrag mit maskiertem Passwort
2. **PUT /api/sources/icloud** -- speichert iCloud-Konfiguration
3. **GET /api/sources/icloud/auth-state** -- gibt authState zurueck
4. **POST /api/sources/icloud/login** -- startet Login-Prozess (gemockt)
5. **POST /api/sources/icloud/verify-2fa** -- verifiziert Code (gemockt)
6. **POST /api/sources/icloud/logout** -- loescht Session
7. **GET /api/push/config** -- gibt Push-Konfiguration zurueck
8. **PUT /api/push/config** -- aktiviert Push, generiert Key
9. **POST /api/push/upload** -- Upload mit gueltigem Key erstellt Zeitplan
10. **POST /api/push/upload** -- Upload ohne Key gibt 401
11. **POST /api/push/upload** -- Upload bei deaktiviertem Push gibt 403
12. **POST /api/push/regenerate-key** -- generiert neuen Key

### 4.4 Python-Bridge-Tests

**Datei:** `tests/unit/icloud_bridge_test.py` (Python unittest)

(pyicloud wird gemockt via unittest.mock)

1. **login** -- ruft PyiCloudService mit korrekten Parametern auf
2. **login** -- erkennt 2FA-Anforderung
3. **verify-2fa** -- ruft validate_2fa_code + trust_session auf
4. **list** -- listet Dateien aus Drive-Ordner
5. **download** -- speichert Datei am angegebenen Pfad
6. **status** -- erkennt gueltige/abgelaufene Session
7. **Fehlerbehandlung** -- gibt JSON bei Login-Fehler zurueck
8. **Fehlerbehandlung** -- gibt JSON bei Netzwerk-Fehler zurueck

## 5. Abhaengigkeiten

**Neue npm-Pakete:** Keine (nutzt bestehende: multer, crypto, child_process)

**Python-Abhaengigkeiten (optional, nur fuer iCloud):**

- Python 3.x
- `pyicloud` (pip3)

**Voraussetzungen:**

- Epic 4 (FileSourceManager, FileSource-Interface)
- Epic 5 (FRITZ!Box -- fuer Passwort-Encoding-Pattern)
- Epic 7 (Polling Engine -- fuer automatisches Polling der iCloud-Quelle)
- Epic 3 (Numbers-Parser -- fuer .numbers-Dateien)

## 6. Aenderungsumfang

```
Neu:
  src/sources/icloudFileSource.js            -- iCloud FileSource via Python-Bridge
  scripts/icloud_bridge.py                   -- Python-Script fuer pyicloud
  push-config.json                           -- Push-Endpunkt-Konfiguration (Runtime)
  icloud-session.json                        -- iCloud-Session-Metadaten (Runtime)
  icloud-session/                            -- pyicloud Cookie-Verzeichnis (Runtime)
  tests/unit/icloudFileSource.test.js        -- Unit-Tests
  tests/unit/pushEndpoint.test.js            -- Push-Endpunkt-Tests
  tests/integration/icloud-api.test.js       -- API-Integrationstests
  tests/unit/icloud_bridge_test.py           -- Python-Bridge-Tests

Geaendert:
  server.js                                  -- iCloud + Push Endpunkte, IcloudFileSource registrieren
  src/sources/fileSourceManager.js           -- iCloud-Eintrag, iCloud-spezifische Methoden
  sources.json                               -- icloud-Defaults
  public/index.html                          -- iCloud-Karte, Push-Karte
  public/app.js                              -- iCloud-UI-Logik, 2FA-Flow, Push-Logik
  public/style.css                           -- Styling (Wizard-Zustaende, Warnungen)
  .gitignore                                 -- icloud-session/, push-config.json, icloud-session.json
```

## 7. Akzeptanzkriterien

### iCloud-Zugriff

1. Wenn Python 3 + pyicloud installiert: iCloud-Quelle ist in der UI konfigurierbar
2. Wenn Python fehlt: UI zeigt Installationsanleitung, restliches Addon funktioniert
3. 2FA-Flow funktioniert: Apple-ID eingeben → Code am iPhone empfangen → Code eingeben → verbunden
4. Nach erfolgreicher Authentifizierung: Polling erkennt .numbers/.xlsx-Dateien im konfigurierten iCloud-Drive-Ordner
5. Datei-Aenderungen in iCloud fuehren zur automatischen Aktualisierung des Zeitplans
6. Session-Ablauf wird erkannt und als "Re-Authentifizierung noetig" in der UI angezeigt
7. "Experimentell"-Kennzeichnung ist in der UI sichtbar
8. Zugangsdaten werden Base64-kodiert gespeichert

### Push-Endpunkt

9. Push-Endpunkt kann in der UI aktiviert/deaktiviert werden
10. API-Key wird automatisch generiert und ist in der UI sichtbar + kopierbar
11. Datei-Upload via `POST /api/push/upload` mit gueltigem Bearer Token erstellt/aktualisiert Zeitplan
12. Ungueltiger oder fehlender API-Key wird mit 401 abgelehnt
13. iOS-Kurzbefehl-Anleitung ist in der UI verfuegbar

### Allgemein

14. Bestehende Quellen (USB, FRITZ!Box) sind nicht beeintraechtigt
15. `npm test` besteht mit allen neuen und bestehenden Tests
16. Fehlermeldungen sind auf Deutsch

## 8. Offene Risiken

- **Apple Web-API-Aenderungen:** Apple aendert die undokumentierte iCloud Web-API regelmaessig. pyicloud muss aktualisiert werden wenn Apple Aenderungen vornimmt. Dies kann zu temporaeren Ausfaellen fuehren.
- **2FA-Token-Lebensdauer:** Die Lebensdauer von Trust-Tokens ist nicht dokumentiert und variiert. Benutzer muessen moeglicherweise alle 30-90 Tage erneut 2FA durchfuehren.
- **Python auf CCU3:** Die CCU3 hat standardmaessig kein Python. Installation erfordert technisches Wissen (SSH-Zugang, pip). Dies ist der Hauptgrund warum die iCloud-Quelle als "experimentell" gilt.
- **Speicherverbrauch:** Python + pyicloud benoetigt zusaetzlichen RAM auf der ressourcenbeschraenkten CCU3 (512 MB). Bei jedem Bridge-Aufruf wird ein Python-Prozess gestartet.
- **Apple-Account-Sicherheit:** Login-Versuche von der CCU3 koennen von Apple als verdaechtig eingestuft werden, was zu Account-Sperrungen fuehren kann. App-spezifische Passwoerter reduzieren dieses Risiko.
- **Push-Endpunkt im LAN:** Der Push-Endpunkt ist nur durch einen API-Key geschuetzt. In Netzwerken mit nicht vertrauenswuerdigen Geraeten koennte der Key abgefangen werden (kein HTTPS auf der CCU3).
- **Kurzbefehl-Zuverlaessigkeit:** iOS-Kurzbefehle koennen durch Systemupdates, Energiesparmodus oder App-Hintergrund-Limits unzuverlaessig werden.
