# Epic 4: USB-Laufwerk als Dateiquelle -- Spezifikation

## 1. Ziel

Das Addon erkennt und liest Tabellendateien (.xlsx, .numbers) von einem an der CCU3 angeschlossenen USB-Stick. Dabei wird eine `FileSourceManager`-Abstraktion eingefuehrt, die in spaeteren Epics auch fuer FRITZ!Box NAS (Epic 5) und iCloud (Epic 8) verwendet wird.

## 2. Entscheidungen aus dem Brainstorming

| Thema | Entscheidung |
|---|---|
| Verzeichnisstruktur | `src/sources/` mit fileSourceManager.js, fileSource.js, usbFileSource.js |
| Interface-Methoden | 6 Methoden: listFiles, readFile, getChecksum, isAvailable, getType, getConfig |
| USB-Erkennung | Mount-Punkte scannen (`/media/usb*`) + `mount`-Befehl parsen |
| Polling | Kein automatisches Polling in Epic 4; nur manueller "Jetzt pruefen"-Button (Polling Engine kommt in Epic 7) |
| Import-Modus | Halb-automatisch: Dateien auflisten, Benutzer waehlt "Importieren" |
| Dateifilter | Kein Standard-Unterordner; Benutzer muss Pfad immer angeben |
| Mehrere Dateien | Alle auflisten, Benutzer waehlt einzeln |
| Zeitplan-Update | Bestehenden Zeitplan aktualisieren (match ueber Dateiname + Quelltyp) |
| Persistenz | `sources.json` -- ein Objekt pro Quellentyp (flache Struktur) |
| Checksum | MD5 |
| REST API | 5 neue Endpunkte |
| USB-Entfernung | Graceful Error, importierte Zeitplaene bleiben erhalten |
| Entwicklung/Test | Beliebiger lokaler Ordner als "USB-Mount" konfigurierbar |
| UI-Integration | Neuer Tab/Bereich "Dateiquellen" |
| Herkunfts-Tracking | `source`-Objekt im Zeitplan-Schema |
| Rueckwaertskompatibilitaet | Fehlendes `source`-Feld = implizit `type: "upload"` |

## 3. Implementierung

### 3.1 FileSource Basis-Klasse

**Datei:** `src/sources/fileSource.js`

Abstrakte Basis-Klasse die das Interface definiert:

```javascript
export class FileSource {
  async listFiles() {
    // -> Array<{ name, path, size, modified }>
    // Alle .xlsx und .numbers Dateien im konfigurierten Pfad
    throw new Error('Nicht implementiert');
  }

  async readFile(filePath) {
    // -> Buffer (Dateiinhalt)
    throw new Error('Nicht implementiert');
  }

  async getChecksum(filePath) {
    // -> string (MD5-Hash)
    throw new Error('Nicht implementiert');
  }

  async isAvailable() {
    // -> boolean (Quelle erreichbar/gemountet?)
    throw new Error('Nicht implementiert');
  }

  getType() {
    // -> string ('usb', 'fritzbox', 'icloud')
    throw new Error('Nicht implementiert');
  }

  getConfig() {
    // -> object (aktuelle Konfiguration)
    throw new Error('Nicht implementiert');
  }
}
```

### 3.2 UsbFileSource

**Datei:** `src/sources/usbFileSource.js`

Implementiert `FileSource` fuer USB-Laufwerke:

```javascript
export class UsbFileSource extends FileSource {
  constructor(config) {
    // config: { mountPoint: string, subFolder: string }
  }
}
```

**USB-Erkennung (`isAvailable()`):**

1. Pruefen ob `config.mountPoint` existiert und ein Verzeichnis ist
2. Falls `autoDetect: true`: Mount-Punkte scannen (`/media/usb0`, `/media/usb1`, ...) und `mount`-Befehl parsen
3. Rueckgabe `true` wenn mindestens ein gueltiger Mount-Punkt gefunden

**Dateisuche (`listFiles()`):**

1. Pfad zusammensetzen: `mountPoint` + `subFolder`
2. Verzeichnis lesen (nicht-rekursiv)
3. Filtern nach Endung `.xlsx`, `.xls`, `.numbers`
4. Fuer jede Datei: `{ name, path, size, modified }` zurueckgeben

**Checksum (`getChecksum()`):**

- `crypto.createHash('md5')` ueber den Dateiinhalt (Stream-basiert fuer grosse Dateien)

**Fehlerbehandlung:**

- Wenn Mount-Punkt nicht existiert: `Fehler: USB-Laufwerk nicht gefunden unter {mountPoint}`
- Wenn Verzeichnis leer: Leeres Array zurueckgeben (kein Fehler)
- Wenn Datei waehrend Lesevorgang verschwindet: `Fehler: Datei nicht mehr verfuegbar (USB-Stick entfernt?)`

### 3.3 FileSourceManager

**Datei:** `src/sources/fileSourceManager.js`

Orchestriert alle registrierten Dateiquellen und verwaltet die Persistenz:

```javascript
export class FileSourceManager {
  constructor(sourcesFilePath) {
    // Standard: './sources.json'
    this.sources = new Map();  // type -> FileSource-Instanz
  }

  async loadConfig()                          // sources.json lesen
  async saveConfig()                          // sources.json schreiben
  registerSource(fileSource)                  // FileSource-Instanz registrieren
  getSource(type)                             // -> FileSource | null
  getAllSources()                             // -> Array<{ type, enabled, config }>
  async updateSourceConfig(type, config)      // Konfiguration aendern + speichern
  async scanSource(type)                      // -> Array<{ name, path, size, modified }>
  async importFile(type, fileName, scheduleMgr) // Datei importieren -> Zeitplan
}
```

**Import-Logik (`importFile()`):**

1. `readFile()` auf der Quelle aufrufen
2. Datei temporaer in `uploads/` speichern
3. `SpreadsheetParser.parse()` aufrufen (aus Epic 3)
4. Pruefen ob ein Zeitplan mit gleicher `source.fileName` + `source.type` existiert
5. Falls ja: Zeitplan aktualisieren (`ScheduleManager.updateSchedule()`)
6. Falls nein: Neuen Zeitplan erstellen (`ScheduleManager.createSchedule()`)
7. `source`-Objekt im Zeitplan setzen (siehe 3.5)
8. Temporaere Datei loeschen

### 3.4 sources.json Schema

**Datei:** `sources.json` (im Projektverzeichnis, neben `areas.json`)

```json
{
  "usb": {
    "enabled": false,
    "mountPoint": "",
    "subFolder": "",
    "lastChecked": null,
    "files": {}
  }
}
```

**Felder:**

| Feld | Typ | Beschreibung |
|---|---|---|
| `enabled` | boolean | Ob die Quelle aktiv ist |
| `mountPoint` | string | Pfad zum USB-Mount-Punkt (Benutzer muss angeben) |
| `subFolder` | string | Optionaler Unterordner auf dem Stick |
| `lastChecked` | string\|null | ISO-8601 Zeitstempel der letzten Pruefung |
| `files` | object | Zuletzt gesehene Dateien mit MD5-Hashes: `{ "Heizplan.xlsx": "abc123..." }` |

Spaetere Epics fuegen weitere Schluessel hinzu (`fritzbox`, `icloud`).

### 3.5 Zeitplan-Schema Erweiterung

Bestehende Zeitplan-Objekte (`schedules/{uuid}.json`) erhalten ein optionales `source`-Feld:

```javascript
{
  id: "uuid",
  name: "Heizplan-Winter",
  source: {                              // NEU -- optional
    type: "usb",                         // "upload" | "usb" | "fritzbox" | "icloud"
    fileName: "Heizplan-Winter.xlsx",
    lastChecksum: "abc123...",
    importedAt: "2026-03-22T10:00:00Z"
  },
  areas: [...],
  createdAt: "...",
  updatedAt: "...",
  active: true
}
```

**Rueckwaertskompatibilitaet:** Fehlendes `source`-Feld wird als `type: "upload"` interpretiert. Keine Migration bestehender Zeitplaene noetig.

**ScheduleManager-Anpassungen:**

- `createSchedule()` akzeptiert optionales `source`-Objekt
- `updateSchedule()` aktualisiert `source.lastChecksum` und `source.importedAt`
- Neue Methode `findScheduleBySource(type, fileName)` -- sucht Zeitplan anhand Quelltyp und Dateiname

### 3.6 REST API Endpunkte

Alle neuen Endpunkte in `server.js`:

#### `GET /api/sources`

Alle konfigurierten Quellen auflisten.

**Response:**
```json
{
  "success": true,
  "data": {
    "usb": {
      "enabled": false,
      "mountPoint": "",
      "subFolder": "",
      "lastChecked": null,
      "available": false
    }
  }
}
```

`available` wird live ueber `isAvailable()` ermittelt, nicht aus sources.json.

#### `PUT /api/sources/:type`

Quelle konfigurieren.

**Request Body:**
```json
{
  "enabled": true,
  "mountPoint": "/media/usb0",
  "subFolder": "Heizplaene"
}
```

**Response:**
```json
{
  "success": true,
  "message": "USB-Dateiquelle aktualisiert."
}
```

**Validierung:**
- `type` muss `usb` sein (spaeter auch `fritzbox`, `icloud`)
- `mountPoint` darf nicht leer sein wenn `enabled: true`

#### `POST /api/sources/:type/scan`

Manuellen Scan ausloesen ("Jetzt pruefen"-Button).

**Response:**
```json
{
  "success": true,
  "data": {
    "files": [
      { "name": "Heizplan-Winter.xlsx", "path": "/media/usb0/Heizplaene/Heizplan-Winter.xlsx", "size": 15234, "modified": "2026-03-20T14:30:00Z" },
      { "name": "Sondertermine.numbers", "path": "/media/usb0/Heizplaene/Sondertermine.numbers", "size": 8912, "modified": "2026-03-18T09:00:00Z" }
    ],
    "checkedAt": "2026-03-22T10:00:00Z"
  }
}
```

**Fehler wenn Quelle nicht verfuegbar:**
```json
{
  "success": false,
  "error": "USB-Laufwerk nicht gefunden unter /media/usb0"
}
```

#### `GET /api/sources/:type/files`

Gefundene Dateien auflisten (aus Cache des letzten Scans, ohne neuen Scan).

**Response:** Gleiche Struktur wie scan, aber aus dem letzten Ergebnis. Falls noch nie gescannt: leeres `files`-Array.

#### `POST /api/sources/:type/import`

Datei importieren und Zeitplan erstellen/aktualisieren.

**Request Body:**
```json
{
  "fileName": "Heizplan-Winter.xlsx"
}
```

**Response (neuer Zeitplan):**
```json
{
  "success": true,
  "message": "Zeitplan 'Heizplan-Winter' erstellt.",
  "data": {
    "scheduleId": "uuid",
    "action": "created",
    "entries": 12
  }
}
```

**Response (aktualisierter Zeitplan):**
```json
{
  "success": true,
  "message": "Zeitplan 'Heizplan-Winter' aktualisiert.",
  "data": {
    "scheduleId": "uuid",
    "action": "updated",
    "entries": 14
  }
}
```

### 3.7 Frontend -- Neuer "Dateiquellen"-Bereich

Neuer Tab "Dateiquellen" in der bestehenden Web-UI (`public/index.html`, `public/app.js`).

**Aufbau:**

```
+----------------------------------------------------------+
| Dateiquellen                                              |
+----------------------------------------------------------+
| USB-Laufwerk                              [Aktiviert: O]  |
|                                                           |
| Mount-Punkt:  [/media/usb0          ]                     |
| Unterordner:  [Heizplaene           ]  (optional)         |
|                                                           |
| [Speichern]  [Jetzt pruefen]                              |
|                                                           |
| Gefundene Dateien:                                        |
| +------------------------------------------------------+ |
| | Datei                  | Groesse | Geaendert | Aktion | |
| |------------------------|---------|-----------|--------| |
| | Heizplan-Winter.xlsx   | 15 KB   | 20.03.26  | [Import]||
| | Sondertermine.numbers  | 9 KB    | 18.03.26  | [Import]||
| +------------------------------------------------------+ |
|                                                           |
| Zuletzt geprueft: 22.03.2026 10:00                        |
| Status: Verbunden                                         |
+----------------------------------------------------------+
```

**Verhalten:**

- "Aktiviert"-Toggle ruft `PUT /api/sources/usb` auf
- "Speichern" speichert Mount-Punkt und Unterordner
- "Jetzt pruefen" ruft `POST /api/sources/usb/scan` auf und aktualisiert die Dateiliste
- "Importieren" ruft `POST /api/sources/usb/import` auf
- Status zeigt "Verbunden"/"Nicht verbunden" basierend auf `available`-Feld
- Nach erfolgreichem Import: Hinweis "Zeitplan erstellt/aktualisiert" + Link zum Zeitplan

## 4. Tests

### 4.1 Unit-Tests FileSource

**Datei:** `tests/unit/fileSource.test.js`

1. **FileSource Basis-Klasse** -- alle Methoden werfen "Nicht implementiert"

### 4.2 Unit-Tests UsbFileSource

**Datei:** `tests/unit/usbFileSource.test.js`

1. **listFiles** -- findet .xlsx und .numbers in einem Test-Verzeichnis
2. **listFiles** -- ignoriert andere Dateitypen (.txt, .pdf)
3. **listFiles** -- leeres Verzeichnis gibt leeres Array zurueck
4. **readFile** -- liest Dateiinhalt als Buffer
5. **getChecksum** -- berechnet korrekten MD5-Hash
6. **getChecksum** -- gleiche Datei ergibt gleichen Hash
7. **getChecksum** -- unterschiedliche Dateien ergeben unterschiedliche Hashes
8. **isAvailable** -- true wenn Mount-Punkt existiert
9. **isAvailable** -- false wenn Mount-Punkt nicht existiert
10. **getType** -- gibt 'usb' zurueck
11. **Fehler** -- listFiles wirft Fehler wenn Pfad nicht existiert

### 4.3 Unit-Tests FileSourceManager

**Datei:** `tests/unit/fileSourceManager.test.js`

1. **loadConfig** -- laedt sources.json korrekt
2. **loadConfig** -- erstellt Default-Config wenn Datei fehlt
3. **saveConfig** -- schreibt sources.json
4. **registerSource** -- registriert FileSource-Instanz
5. **getSource** -- gibt registrierte Instanz zurueck
6. **getSource** -- gibt null fuer unbekannten Typ zurueck
7. **getAllSources** -- listet alle registrierten Quellen
8. **updateSourceConfig** -- aktualisiert und speichert Konfiguration
9. **scanSource** -- ruft listFiles auf registrierter Quelle auf
10. **scanSource** -- Fehler wenn Quelle nicht verfuegbar
11. **importFile** -- erstellt neuen Zeitplan bei erstem Import
12. **importFile** -- aktualisiert bestehenden Zeitplan bei Re-Import

### 4.4 Unit-Tests ScheduleManager-Erweiterung

**Datei:** Bestehende `tests/unit/scheduleManager.test.js` erweitern

1. **createSchedule mit source** -- source-Objekt wird gespeichert
2. **findScheduleBySource** -- findet Zeitplan anhand type + fileName
3. **findScheduleBySource** -- gibt null zurueck wenn nicht gefunden

### 4.5 Integrationstests REST API

**Datei:** `tests/integration/sources-api.test.js`

1. **GET /api/sources** -- gibt alle Quellen mit Status zurueck
2. **PUT /api/sources/usb** -- speichert USB-Konfiguration
3. **PUT /api/sources/usb** -- Validierungsfehler bei leerem mountPoint + enabled
4. **POST /api/sources/usb/scan** -- scannt und gibt Dateiliste zurueck
5. **POST /api/sources/usb/scan** -- Fehler wenn Quelle nicht verfuegbar
6. **POST /api/sources/usb/import** -- importiert Datei und erstellt Zeitplan
7. **POST /api/sources/usb/import** -- aktualisiert bestehenden Zeitplan bei Re-Import
8. **GET /api/sources/unknown** -- 404 fuer unbekannten Quellentyp

## 5. Aenderungsumfang

```
Neu:
  src/sources/fileSource.js              -- Basis-Klasse/Interface
  src/sources/fileSourceManager.js       -- Orchestrierung + Persistenz
  src/sources/usbFileSource.js           -- USB-Implementierung
  sources.json                           -- Default-Konfiguration
  tests/unit/fileSource.test.js          -- Basis-Klasse Tests
  tests/unit/usbFileSource.test.js       -- USB Tests
  tests/unit/fileSourceManager.test.js   -- Manager Tests
  tests/integration/sources-api.test.js  -- API Tests

Geaendert:
  server.js                              -- 5 neue API-Endpunkte + FileSourceManager-Integration
  src/scheduler/scheduleManager.js       -- source-Feld + findScheduleBySource()
  public/index.html                      -- Neuer "Dateiquellen"-Tab
  public/app.js                          -- Dateiquellen-UI-Logik
  public/style.css                       -- Styling fuer neuen Tab (falls noetig)
```

## 6. Akzeptanzkriterien

1. USB-Stick mit .xlsx/.numbers-Datei wird ueber die UI erkannt (nach manuellem Scan)
2. Benutzer kann Datei aus der Liste auswaehlen und importieren
3. Importierte Datei erzeugt einen Zeitplan mit korrektem `source`-Objekt
4. Re-Import der gleichen Datei aktualisiert den bestehenden Zeitplan
5. Entfernen des USB-Sticks verursacht keinen Absturz
6. Konfiguration (Mount-Punkt, Unterordner) ist in `sources.json` persistent
7. `npm test` besteht mit allen neuen Tests
8. Fehlermeldungen sind auf Deutsch
9. Bestehende Upload-Funktionalitaet und Zeitplaene sind nicht beeintraechtigt
10. Auf macOS testbar mit beliebigem lokalen Ordner als Mount-Punkt

## 7. Offene Risiken

- **CCU3 Mount-Pfade:** Die genauen Pfade (`/media/usb0` etc.) muessen auf echter Hardware verifiziert werden. Durch die konfigurierbaren Pfade ist dies aber kein Blocker fuer die Entwicklung.
- **Dateisystem-Berechtigungen:** Node.js-Prozess auf der CCU3 braucht Leserechte auf dem USB-Mount. Das init.d-Script aus Epic 2 muss sicherstellen, dass der Prozess mit ausreichenden Rechten laeuft.
- **SpreadsheetParser-Abhaengigkeit:** Epic 3 muss abgeschlossen sein. Falls der SpreadsheetParser noch nicht existiert, kann der bestehende ExcelParser als Ueberbrueckung verwendet werden (nur .xlsx-Import moeglich).
