# Epic 5: FRITZ!Box NAS als Dateiquelle -- Spezifikation

## 1. Ziel

Das Addon liest Tabellendateien (.xlsx, .numbers) von einem FRITZ!Box NAS-Share ueber FTP. Dabei wird die `FritzboxFileSource` als zweite Implementierung des `FileSourceManager`-Interfaces aus Epic 4 erstellt.

## 2. Entscheidungen aus dem Brainstorming

| Thema | Entscheidung |
|---|---|
| Zugriffsprotokoll | FTP mit optionalem FTPS-Upgrade (`basic-ftp` probiert FTPS, faellt auf FTP zurueck) |
| FTP-Bibliothek | `basic-ftp` (npm) |
| Zugangsdaten | Base64-kodiert in `sources.json` mit Hinweis in der UI |
| Timeout/Retry | Ein Retry bei Verbindungsfehler nach 5 Sekunden |
| Verbindungsmanagement | Pro Aktion: Verbinden -> Aktion -> Trennen |
| FTP-Pfad | Benutzer gibt Pfad manuell ein |
| sources.json Schema | Vollstaendig mit host, port, username, password, path, secure |
| Standardwerte | Keine Voreinstellungen, alle Felder leer |
| Verbindungstest | Eigener "Verbindung testen"-Button (generischer Endpunkt `POST /api/sources/:type/test`) |
| Passive/Active FTP | Immer Passive Mode |
| UI-Layout | USB und FRITZ!Box untereinander im gleichen "Dateiquellen"-Tab |
| Fehleranzeige | Detailliert mit Hilfetext (Verbindung/Login/Pfad-spezifisch) |

## 3. Implementierung

### 3.1 FritzboxFileSource

**Datei:** `src/sources/fritzboxFileSource.js`

Implementiert `FileSource` (aus Epic 4) fuer FRITZ!Box NAS ueber FTP:

```javascript
import { FileSource } from './fileSource.js';
import * as ftp from 'basic-ftp';

export class FritzboxFileSource extends FileSource {
  constructor(config) {
    // config: { host, port, username, password, path, secure }
    // password ist Base64-kodiert gespeichert, wird beim Verbinden dekodiert
  }
}
```

**Verbindungsaufbau (interne Hilfsmethode `_connect()`):**

1. Neuen `ftp.Client()` erstellen
2. Timeout setzen (10 Sekunden)
3. `client.access()` aufrufen mit:
   - `host`: aus config
   - `port`: aus config (Standard: 21)
   - `user`: aus config
   - `password`: Base64-dekodiert aus config
   - `secure`: aus config (true = FTPS versuchen, Fallback auf FTP)
   - `secureOptions: { rejectUnauthorized: false }` (FRITZ!Box nutzt selbstsignierte Zertifikate)
4. Passive Mode ist Standard bei `basic-ftp`
5. Bei Fehler: 5 Sekunden warten, einmal erneut versuchen
6. Client zurueckgeben (Caller ist verantwortlich fuer `client.close()`)

**`isAvailable()`:**

1. `_connect()` aufrufen
2. Bei Erfolg: `client.close()`, return `true`
3. Bei Fehler: return `false`

**`listFiles()`:**

1. `_connect()`
2. `client.cd(config.path)` -- in den konfigurierten Pfad wechseln
3. `client.list()` -- Verzeichnisinhalt auflisten
4. Filtern nach Endung `.xlsx`, `.xls`, `.numbers`
5. Fuer jede Datei: `{ name, path, size, modified }` zurueckgeben
6. `client.close()`

**`readFile(filePath)`:**

1. `_connect()`
2. `client.downloadTo(writableStream, filePath)` -- Datei in Buffer herunterladen
3. `client.close()`
4. Buffer zurueckgeben

**`getChecksum(filePath)`:**

1. `readFile(filePath)` aufrufen
2. `crypto.createHash('md5').update(buffer).digest('hex')` berechnen
3. Hash-String zurueckgeben

**`testConnection()`:**

Neue Methode (nicht im FileSource-Interface, spezifisch fuer Quellen mit Zugangsdaten):

1. `_connect()` aufrufen
2. `client.cd(config.path)` versuchen
3. `client.close()`
4. Bei Erfolg: `{ success: true, message: "Verbindung erfolgreich. Pfad existiert." }`
5. Bei Login-Fehler (530): `{ success: false, message: "Anmeldung fehlgeschlagen. Bitte Benutzername und Passwort pruefen." }`
6. Bei Verbindungsfehler (ECONNREFUSED): `{ success: false, message: "Verbindung fehlgeschlagen. Bitte pruefen Sie: 1) Ist die FRITZ!Box unter {host} erreichbar? 2) Ist FTP in der FRITZ!Box unter Internet > Freigaben > FTP aktiviert?" }`
7. Bei Pfad-Fehler (550): `{ success: false, message: "Pfad '{path}' nicht gefunden auf der FRITZ!Box. Bitte pruefen Sie den Pfad (z.B. FRITZ.NAS/Heizung)." }`
8. Bei sonstigem Fehler: `{ success: false, message: "Unbekannter Fehler: {error.message}" }`

**`getType()`:** return `'fritzbox'`

**`getConfig()`:** return config-Objekt (ohne dekodiertes Passwort)

### 3.2 Base64-Kodierung der Zugangsdaten

**Hilfsfunktionen** (in `fritzboxFileSource.js` oder als Utility):

```javascript
function encodeCredential(plain) {
  return Buffer.from(plain, 'utf-8').toString('base64');
}

function decodeCredential(encoded) {
  return Buffer.from(encoded, 'base64').toString('utf-8');
}
```

- `PUT /api/sources/fritzbox` erhaelt Klartext-Passwort vom Frontend
- Server kodiert vor dem Speichern in `sources.json`
- `FritzboxFileSource` dekodiert intern beim Verbindungsaufbau
- `GET /api/sources` gibt das Passwort NIE zurueck (weder kodiert noch im Klartext) -- Feld wird durch `"********"` ersetzt oder weggelassen

### 3.3 sources.json Erweiterung

**Datei:** `sources.json` (bestehende Datei aus Epic 4)

```json
{
  "usb": {
    "enabled": false,
    "mountPoint": "",
    "subFolder": "",
    "lastChecked": null,
    "files": {}
  },
  "fritzbox": {
    "enabled": false,
    "host": "",
    "port": 21,
    "username": "",
    "password": "",
    "path": "",
    "secure": true,
    "lastChecked": null,
    "files": {}
  }
}
```

**Felder (FRITZ!Box-spezifisch):**

| Feld | Typ | Beschreibung |
|---|---|---|
| `enabled` | boolean | Ob die Quelle aktiv ist |
| `host` | string | IP-Adresse oder Hostname der FRITZ!Box |
| `port` | number | FTP-Port (Standard: 21) |
| `username` | string | FRITZ!Box-Benutzername |
| `password` | string | Base64-kodiertes Passwort |
| `path` | string | Pfad auf dem NAS (z.B. `FRITZ.NAS/Heizung`) |
| `secure` | boolean | FTPS versuchen (true = FTPS mit Fallback auf FTP) |
| `lastChecked` | string\|null | ISO-8601 Zeitstempel der letzten Pruefung |
| `files` | object | Zuletzt gesehene Dateien mit MD5-Hashes |

### 3.4 FileSourceManager-Anpassungen

**Datei:** `src/sources/fileSourceManager.js` (bestehend aus Epic 4)

Minimale Aenderungen:

1. `FritzboxFileSource` importieren und registrieren
2. `testSource(type)` Methode hinzufuegen -- delegiert an `source.testConnection()` falls vorhanden
3. Bei `updateSourceConfig('fritzbox', config)`: Passwort Base64-kodieren vor dem Speichern

### 3.5 REST API

#### Bestehende Endpunkte (aus Epic 4, funktionieren bereits fuer `:type = "fritzbox"`)

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/api/sources` | Alle Quellen auflisten (inkl. FRITZ!Box) |
| `PUT` | `/api/sources/fritzbox` | FRITZ!Box konfigurieren |
| `POST` | `/api/sources/fritzbox/scan` | Manueller Scan |
| `GET` | `/api/sources/fritzbox/files` | Gefundene Dateien |
| `POST` | `/api/sources/fritzbox/import` | Datei importieren |

#### Neuer Endpunkt

##### `POST /api/sources/:type/test`

Verbindungstest fuer eine konfigurierte Quelle.

**Response (Erfolg):**
```json
{
  "success": true,
  "message": "Verbindung erfolgreich. Pfad existiert."
}
```

**Response (Fehler):**
```json
{
  "success": false,
  "error": "Anmeldung fehlgeschlagen. Bitte Benutzername und Passwort pruefen."
}
```

**Validierung bei `PUT /api/sources/fritzbox`:**
- `host` darf nicht leer sein wenn `enabled: true`
- `username` darf nicht leer sein wenn `enabled: true`
- `password` darf nicht leer sein wenn `enabled: true`
- `port` muss eine Zahl > 0 sein (Standard: 21)

**Passwort-Handling bei `GET /api/sources`:**
- FRITZ!Box-Passwort wird NICHT im Response zurueckgegeben
- Stattdessen: `"password": "********"` wenn ein Passwort gesetzt ist, oder `"password": ""` wenn leer
- Frontend erkennt `"********"` und sendet diesen Wert beim Speichern NICHT zurueck (nur wenn Benutzer ein neues Passwort eingibt)

**Passwort-Handling bei `PUT /api/sources/fritzbox`:**
- Wenn `password === "********"`: bestehendes Passwort beibehalten, nicht ueberschreiben
- Wenn `password` ein anderer Wert: Base64-kodieren und speichern

### 3.6 Frontend -- FRITZ!Box-Sektion im "Dateiquellen"-Tab

Erweiterung des bestehenden "Dateiquellen"-Tabs (`public/index.html`, `public/app.js`) um eine FRITZ!Box-Sektion unterhalb der USB-Sektion.

**Layout:**

```
+----------------------------------------------------------+
| FRITZ!Box NAS                             [Aktiviert: O]  |
|                                                           |
| Host:       [                    ]                        |
| Port:       [21                  ]                        |
| Benutzer:   [                    ]                        |
| Passwort:   [********           ]                        |
| Pfad:       [                    ]                        |
|                                                           |
| Hinweis: Zugangsdaten werden kodiert auf der CCU          |
| gespeichert. FTP-Zugang muss in der FRITZ!Box unter       |
| Internet > Freigaben > FTP aktiviert sein.                |
|                                                           |
| [Speichern]  [Verbindung testen]  [Jetzt pruefen]        |
|                                                           |
| Gefundene Dateien:                                        |
| +------------------------------------------------------+ |
| | Datei                  | Groesse | Geaendert | Aktion | |
| |------------------------|---------|-----------|--------| |
| | Heizplan.xlsx          | 12 KB   | 19.03.26  |[Import]| |
| +------------------------------------------------------+ |
|                                                           |
| Zuletzt geprueft: --                                      |
| Status: Nicht konfiguriert                                |
+----------------------------------------------------------+
```

**Verhalten:**

- "Aktiviert"-Toggle ruft `PUT /api/sources/fritzbox` auf
- "Speichern" sendet Konfiguration an `PUT /api/sources/fritzbox`
  - Passwort-Feld: Wenn unveraendert (`********`), wird `********` gesendet -- Server behaelt bestehendes Passwort
  - Wenn Benutzer neues Passwort eingibt: Klartext wird gesendet, Server kodiert
- "Verbindung testen" ruft `POST /api/sources/fritzbox/test` auf
  - Ergebnis wird als Erfolgs-/Fehlermeldung unterhalb der Buttons angezeigt
  - Waehrend des Tests: Button disabled + Ladeindikator
- "Jetzt pruefen" ruft `POST /api/sources/fritzbox/scan` auf und aktualisiert die Dateiliste
- "Importieren" ruft `POST /api/sources/fritzbox/import` auf
- Status zeigt:
  - "Nicht konfiguriert" wenn Host/Zugangsdaten fehlen
  - "Verbunden" / "Nicht erreichbar" basierend auf letztem Test/Scan
  - Detaillierte Fehlermeldung bei Problemen

**Fehlermeldungen (deutsch):**

| FTP-Fehler | Angezeigte Meldung |
|---|---|
| ECONNREFUSED | "Verbindung fehlgeschlagen. Bitte pruefen Sie: 1) Ist die FRITZ!Box unter {host} erreichbar? 2) Ist FTP in der FRITZ!Box unter Internet > Freigaben > FTP aktiviert?" |
| 530 Login incorrect | "Anmeldung fehlgeschlagen. Bitte Benutzername und Passwort pruefen." |
| ETIMEDOUT | "Zeitueberschreitung. Die FRITZ!Box unter {host} antwortet nicht." |
| 550 Path not found | "Pfad '{path}' nicht gefunden auf der FRITZ!Box. Bitte pruefen Sie den Pfad (z.B. FRITZ.NAS/Heizung)." |
| Sonstiges | "Unbekannter Fehler: {error.message}" |

## 4. Tests

### 4.1 Unit-Tests FritzboxFileSource

**Datei:** `tests/unit/fritzboxFileSource.test.js`

FTP-Verbindung wird gemockt (kein echter FTP-Server in Unit-Tests):

1. **getType** -- gibt 'fritzbox' zurueck
2. **getConfig** -- gibt Konfiguration ohne dekodiertes Passwort zurueck
3. **_connect** -- baut Verbindung mit korrekten Parametern auf (Host, Port, User, dekodiertes Passwort, secure)
4. **_connect** -- Retry nach Verbindungsfehler (einmal nach 5 Sekunden)
5. **_connect** -- Fehler nach zweitem fehlgeschlagenem Versuch
6. **isAvailable** -- true bei erfolgreicher Verbindung
7. **isAvailable** -- false bei Verbindungsfehler
8. **listFiles** -- filtert .xlsx und .numbers aus FTP-Listing
9. **listFiles** -- ignoriert Verzeichnisse und andere Dateitypen
10. **listFiles** -- leeres Verzeichnis gibt leeres Array zurueck
11. **readFile** -- laedt Datei als Buffer herunter
12. **getChecksum** -- berechnet korrekten MD5-Hash
13. **testConnection** -- Erfolgsmeldung bei gueltigem Login + Pfad
14. **testConnection** -- Login-Fehlermeldung bei 530
15. **testConnection** -- Verbindungs-Fehlermeldung bei ECONNREFUSED
16. **testConnection** -- Pfad-Fehlermeldung bei 550

### 4.2 Unit-Tests Base64-Kodierung

**Datei:** `tests/unit/fritzboxFileSource.test.js` (gleiche Datei)

1. **encodeCredential** -- kodiert Klartext korrekt
2. **decodeCredential** -- dekodiert Base64 korrekt
3. **Roundtrip** -- encode(decode(x)) === x fuer verschiedene Sonderzeichen

### 4.3 Unit-Tests FileSourceManager-Erweiterung

**Datei:** Bestehende `tests/unit/fileSourceManager.test.js` erweitern

1. **registerSource** -- FritzboxFileSource kann registriert werden
2. **testSource** -- delegiert an testConnection() der Quelle
3. **testSource** -- Fehler wenn Quelle keinen testConnection hat
4. **updateSourceConfig fritzbox** -- Passwort wird Base64-kodiert gespeichert
5. **updateSourceConfig fritzbox** -- `********` behaelt bestehendes Passwort

### 4.4 Integrationstests REST API

**Datei:** `tests/integration/sources-api.test.js` (bestehende Datei erweitern)

1. **GET /api/sources** -- enthaelt fritzbox-Eintrag mit maskiertem Passwort
2. **PUT /api/sources/fritzbox** -- speichert FRITZ!Box-Konfiguration
3. **PUT /api/sources/fritzbox** -- Validierungsfehler bei leerem Host + enabled
4. **PUT /api/sources/fritzbox** -- Passwort `********` behaelt bestehendes Passwort
5. **POST /api/sources/fritzbox/test** -- Verbindungstest (mit gemocktem FTP)
6. **POST /api/sources/fritzbox/scan** -- Scan (mit gemocktem FTP)
7. **POST /api/sources/fritzbox/import** -- Import erstellt/aktualisiert Zeitplan

## 5. Abhaengigkeiten

**npm-Paket:** `basic-ftp` (hinzufuegen zu `package.json`)

**Voraussetzungen:**
- Epic 4 muss abgeschlossen sein (FileSourceManager, FileSource-Basisklasse, sources.json, "Dateiquellen"-Tab, REST API Endpunkte)
- Epic 3 (Numbers-Parser) fuer .numbers-Import

## 6. Aenderungsumfang

```
Neu:
  src/sources/fritzboxFileSource.js         -- FTP-basierte FileSource-Implementierung
  tests/unit/fritzboxFileSource.test.js     -- Unit-Tests

Geaendert:
  package.json                              -- basic-ftp Abhaengigkeit
  sources.json                              -- fritzbox-Eintrag hinzufuegen
  src/sources/fileSourceManager.js          -- FritzboxFileSource registrieren, testSource() Methode
  server.js                                 -- POST /api/sources/:type/test Endpunkt, Passwort-Handling
  public/index.html                         -- FRITZ!Box-Sektion im Dateiquellen-Tab
  public/app.js                             -- FRITZ!Box-UI-Logik
  public/style.css                          -- Styling (falls noetig)
  tests/unit/fileSourceManager.test.js      -- Erweiterte Tests
  tests/integration/sources-api.test.js     -- Erweiterte API-Tests
```

## 7. Akzeptanzkriterien

1. Eine .xlsx/.numbers-Datei auf der FRITZ!Box NAS wird nach manuellem Scan in der UI aufgelistet
2. Benutzer kann Datei auswaehlen und importieren -- Zeitplan wird erstellt
3. "Verbindung testen"-Button zeigt Erfolg oder hilfreiche Fehlermeldung
4. Zugangsdaten werden Base64-kodiert in `sources.json` gespeichert
5. Passwort wird in der API-Response nicht zurueckgegeben
6. Verbindungsfehler (FRITZ!Box nicht erreichbar, falsches Passwort, falscher Pfad) werden mit verstaendlichen deutschen Fehlermeldungen angezeigt
7. Re-Import einer geaenderten Datei aktualisiert den bestehenden Zeitplan
8. `npm test` besteht mit allen neuen und bestehenden Tests
9. FTP nutzt Passive Mode und versucht FTPS mit Fallback auf FTP
10. Bestehende USB-Funktionalitaet ist nicht beeintraechtigt

## 8. Offene Risiken

- **FRITZ!Box FTP-Aktivierung:** FTP ist auf der FRITZ!Box standardmaessig deaktiviert. Der Benutzer muss es manuell aktivieren (Internet > Freigaben > FTP). Dies wird in der UI durch einen Hinweis kommuniziert.
- **FTPS-Kompatibilitaet:** Nicht alle FRITZ!Box-Modelle unterstuetzen FTPS. Das selbstsignierte Zertifikat der FRITZ!Box erfordert `rejectUnauthorized: false`, was die TLS-Sicherheit reduziert.
- **Grosse Dateien:** `getChecksum()` laedt die gesamte Datei herunter um den MD5-Hash zu berechnen. Bei sehr grossen Dateien koennte das langsam sein. Fuer typische Heizplan-Spreadsheets (< 1 MB) ist das kein Problem.
- **FRITZ!Box-Firmware-Updates:** AVM koennte das FTP-Verhalten in Firmware-Updates aendern. Das `basic-ftp`-Paket abstrahiert die meisten FTP-Eigenheiten.
- **CCU3 Netzwerk:** Die CCU3 muss die FRITZ!Box ueber das Netzwerk erreichen koennen. In den meisten Setups ist das der Fall (beide im gleichen LAN).
