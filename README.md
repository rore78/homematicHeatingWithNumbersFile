# Homematic IP Addon

Ein Node.js-basiertes Addon zur Steuerung von Homematic IP Geräten über Cloud- oder lokale CCU-Verbindung.

## Features

- ✅ Unterstützung für Homematic IP Cloud API
- ✅ Unterstützung für lokale CCU-Verbindung (XML-RPC)
- ✅ Automatische Erkennung des Verbindungsmodus
- ✅ Einfache API für Gerätesteuerung
- ✅ Unterstützung für Schalter, Dimmer, Thermostate und mehr
- ✅ Konfiguration über Umgebungsvariablen oder Config-Datei
- ✅ **Web-Interface für Heizungssteuerung mit Excel/Numbers-Upload**
- ✅ **Zeitplan-Verwaltung mit Datum/Zeit-basierten Zeiträumen**
- ✅ **Bereichs-Management (Areas) für mehrere Geräte**
- ✅ **Heizprofile (Komfort, Nacht, Abwesenheit, etc.)**

## Installation

```bash
npm install
```

## Abhängigkeiten

- Node.js >= 14.0.0
- axios - für HTTP-Requests
- ws - für WebSocket-Verbindungen
- xmlrpc - für XML-RPC Kommunikation mit lokaler CCU
- express - Web-Server für Upload-Interface
- multer - File-Upload Handling
- cors - CORS-Unterstützung
- xlsx - Excel-Datei Parsing
- uuid - Eindeutige IDs für Zeitpläne

## Konfiguration

### Cloud-Verbindung

Für die Cloud-Verbindung benötigst du:

- Access Point SGTIN (Seriennummer deines Homematic IP Access Points)
- Optional: Auth Token (wird automatisch generiert wenn SGTIN vorhanden)

**Umgebungsvariablen:**

```bash
export HOMEMATIC_MODE=cloud
export HOMEMATIC_IP_ACCESS_POINT_SGTIN=YOUR_SGTIN
export HOMEMATIC_IP_AUTH_TOKEN=YOUR_TOKEN  # Optional
```

**Code:**

```javascript
import { Config } from "./src/index.js";

const config = new Config({
  mode: "cloud",
  cloud: {
    accessPointSGTIN: "YOUR_ACCESS_POINT_SGTIN",
  },
});
```

### Lokale CCU-Verbindung

Für die lokale Verbindung benötigst du:

- IP-Adresse deiner CCU
- Port (Standard: 2001)
- Optional: Benutzername und Passwort

**Umgebungsvariablen:**

```bash
export HOMEMATIC_MODE=local
export HOMEMATIC_CCU_HOST=192.168.1.100
export HOMEMATIC_CCU_PORT=2001
export HOMEMATIC_CCU_USERNAME=admin  # Optional
export HOMEMATIC_CCU_PASSWORD=secret  # Optional
```

**Code:**

```javascript
const config = new Config({
  mode: "local",
  local: {
    host: "192.168.1.100",
    port: 2001,
  },
});
```

### Auto-Detection

Das Addon kann automatisch den besten Verbindungsmodus wählen:

```javascript
const config = new Config({
  mode: "auto", // oder weglassen
  cloud: { accessPointSGTIN: "..." },
  local: { host: "192.168.1.100" },
});
```

## Verwendung

### Grundlegende Verwendung

```javascript
import HomematicIPAddon, { Config } from "./src/index.js";

// Konfiguration erstellen
const config = new Config({
  mode: "cloud",
  cloud: {
    accessPointSGTIN: "YOUR_SGTIN",
  },
});

// Addon initialisieren
const addon = new HomematicIPAddon(config);
await addon.initialize();

// Alle Geräte abrufen
const devices = await addon.getDevices();
console.log(`Gefundene Geräte: ${devices.length}`);

// Gerät einschalten
await addon.setSwitchState("DEVICE_ID", true);

// Dimmer auf 50% setzen
await addon.setDimLevel("DEVICE_ID", 0.5);

// Thermostat-Temperatur setzen
await addon.setTemperature("DEVICE_ID", 21.5);
```

### Erweiterte Verwendung

```javascript
// Gerätestatus abrufen
const state = await addon.getDeviceState("DEVICE_ID");

// Benutzerdefinierten Parameter setzen
await addon.setParameter("DEVICE_ID", "PARAMETER_NAME", value);

// Parameter abrufen
const value = await addon.getParameter("DEVICE_ID", "PARAMETER_NAME");

// Direkten Zugriff auf Client (für erweiterte Funktionen)
const client = addon.getClient();
```

## API-Referenz

### HomematicIPAddon

Hauptklasse für die Gerätesteuerung.

#### Methoden

- `async initialize()` - Initialisiert das Addon und stellt Verbindung her
- `async getDevices()` - Ruft alle Geräte ab
- `async getDevice(deviceId)` - Ruft ein spezifisches Gerät ab
- `async getDeviceState(deviceId)` - Ruft den Status eines Geräts ab
- `async setSwitchState(deviceId, on)` - Schaltet ein Gerät ein/aus
- `async setDimLevel(deviceId, level)` - Setzt Helligkeit (0-1.0 oder 0-100)
- `async setTemperature(deviceId, temperature)` - Setzt Thermostat-Temperatur
- `async setParameter(deviceId, parameter, value)` - Setzt benutzerdefinierten Parameter
- `async getParameter(deviceId, parameter)` - Ruft Parameter ab
- `getMode()` - Gibt den aktuellen Verbindungsmodus zurück ('cloud' oder 'local')
- `getClient()` - Gibt den Client zurück (für erweiterte Nutzung)

### Config

Konfigurationsklasse für Cloud- und Local-Einstellungen.

#### Konstruktor

```javascript
new Config(config);
```

**Parameter:**

- `config.mode` - 'cloud', 'local' oder 'auto'
- `config.cloud` - Cloud-Konfiguration
- `config.local` - Lokale CCU-Konfiguration

#### Statische Methoden

- `Config.fromFile(configPath)` - Lädt Konfiguration aus JSON-Datei

#### Methoden

- `hasCloudConfig()` - Prüft ob Cloud-Konfiguration vorhanden
- `hasLocalConfig()` - Prüft ob lokale Konfiguration vorhanden
- `getMode()` - Bestimmt den zu verwendenden Modus
- `validate()` - Validiert die Konfiguration

## Beispiele

Siehe `examples/basic-usage.js` für vollständige Beispiele:

- Cloud-Verbindung
- Lokale CCU-Verbindung
- Auto-Detection
- Verwendung von Umgebungsvariablen

Beispiele ausführen:

```bash
npm run example
```

## Web-Interface für Heizungssteuerung

Das Addon bietet ein Web-Interface zum Hochladen von Excel/Numbers-Dateien für die Heizungssteuerung.

### Server starten

```bash
npm run server
```

Das Web-Interface ist dann unter `http://localhost:3000` verfügbar.

### Excel/Numbers Datei-Format

Die hochgeladene Datei sollte folgende Spalten enthalten:

| Spalte                               | Beschreibung                                   | Beispiel                                       |
| ------------------------------------ | ---------------------------------------------- | ---------------------------------------------- |
| **Bereich** (oder Area)              | Bereichsname oder Geräte-IDs (kommagetrennt)   | "Wohnzimmer" oder "DEVICE_1,DEVICE_2"          |
| **Startdatum** (oder Start DateTime) | Format: YYYY-MM-DD HH:MM oder DD.MM.YYYY HH:MM | "2024-01-15 08:00"                             |
| **Enddatum** (oder End DateTime)     | Format: YYYY-MM-DD HH:MM oder DD.MM.YYYY HH:MM | "2024-01-20 22:00"                             |
| **Temperatur** (oder Temp)           | Temperatur in °C                               | 21.0                                           |
| **Heizprofil** (optional)            | Vordefiniertes Profil                          | "Komfort", "Nacht", "Abwesenheit", "Reduziert" |
| **Zusatzinfo** (optional)            | Text-Informationen                             | "Hauptwohnbereich"                             |

### API-Endpoints

- `GET /` - Web-Interface
- `POST /api/upload` - Datei hochladen
- `POST /api/schedule` - Zeitplan erstellen
- `GET /api/schedules` - Alle Zeitpläne
- `POST /api/schedules/:id/activate` - Zeitplan aktivieren
- `POST /api/schedules/:id/deactivate` - Zeitplan deaktivieren
- `DELETE /api/schedules/:id` - Zeitplan löschen
- `GET /api/areas` - Alle Bereiche
- `POST /api/areas` - Bereich erstellen
- `DELETE /api/areas/:name` - Bereich löschen
- `GET /api/profiles` - Alle Heizprofile
- `GET /api/devices` - Alle Geräte

## Fehlerbehandlung

Alle Methoden werfen Fehler bei Problemen. Verwende try-catch für Fehlerbehandlung:

```javascript
try {
  await addon.setSwitchState("DEVICE_ID", true);
} catch (error) {
  console.error("Fehler:", error.message);
}
```

## Unterstützte Gerätetypen

- Schalter (Switches)
- Dimmer
- Thermostate
- Sensoren
- Aktoren
- Weitere Homematic IP kompatible Geräte

## Entwicklung

### Projektstruktur

```
my-homematic-addon/
├── src/
│   ├── index.js              # Haupt-Einstiegspunkt
│   ├── config/
│   │   └── config.js         # Konfigurationsverwaltung
│   ├── cloud/
│   │   └── cloudClient.js    # Cloud Client
│   ├── local/
│   │   └── localClient.js    # Lokaler CCU Client
│   └── devices/
│       └── deviceController.js  # Gerätesteuerung
├── examples/
│   └── basic-usage.js        # Beispiele
└── package.json
```

## Lizenz

MIT

## Unterstützung

Bei Problemen oder Fragen:

1. Prüfe die Konfiguration
2. Stelle sicher, dass deine CCU/Cloud erreichbar ist
3. Prüfe die Fehlermeldungen für detaillierte Informationen

## Bekannte Einschränkungen

- Cloud API: Die genaue API-Struktur kann je nach Homematic IP Version variieren
- Lokale CCU: Erfordert XML-RPC Zugriff auf die CCU
- Authentifizierung: Cloud-Authentifizierung kann sich ändern

## Changelog

### Version 1.1.0

- Web-Interface für Heizungssteuerung
- Excel/Numbers Datei-Upload
- Zeitplan-Verwaltung mit Datum/Zeit
- Bereichs-Management
- Heizprofile

### Version 1.0.0

- Erste Version
- Cloud- und Local-Unterstützung
- Grundlegende Gerätesteuerung
