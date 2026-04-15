# Epic 6: Heizprofil-Steuerung auf Geraeten -- Spezifikation

## 1. Ziel

Neben der bestehenden direkten Temperatursteuerung auch Heizprofile (Wochenprogramme) direkt auf HmIP-Thermostaten aktivieren koennen. Ein Zeitplan-Eintrag kann entweder eine Temperatur setzen (bestehend) oder ein Geraete-Heizprofil (1, 2 oder 3) auf dem Thermostat aktivieren (neu).

## 2. Entscheidungen aus dem Brainstorming

| Thema                      | Entscheidung                                                         |
| -------------------------- | -------------------------------------------------------------------- |
| Steuerungsebene            | Nur Ebene 1: ACTIVE_PROFILE wechseln (kein Wochenprogramm schreiben) |
| Auto-Modus                 | Immer Auto-Modus setzen wenn ein Profil aktiviert wird               |
| XML-RPC Kanal              | Kanalauswahl konfigurierbar                                          |
| Cloud API                  | Beides versuchen: Cloud + Local, mit Fallback-Logik                  |
| Datenmodell                | Expliziter `controlMode` + `deviceProfile` im Zeitplan-Eintrag       |
| Rueckwaertskompatibilitaet | Fehlender `controlMode` = implizit "temperature", keine Migration    |
| Tabellen-Schema            | "Heizprofil"-Spalte ueberladen mit "Geraeteprofil:N" Syntax          |
| Konflikt Temp + Profil     | Geraeteprofil hat Vorrang, Temperatur wird ignoriert                 |
| DeviceController           | Separate `setHeatingProfile()` Methode                               |
| Profil auslesen            | `getHeatingProfile()` implementieren                                 |
| checkAndExecute            | Switch-Case fuer Steuerungsmodus                                     |
| Zeitfenster-Ende           | Auf Profil 1 (Standard) zuruecksetzen                                |
| UI-Anzeige                 | Kombinierte "Steuerung"-Spalte mit Icon                              |

## 3. Implementierung

### 3.1 LocalClient-Erweiterung

**Datei:** `src/local/localClient.js`

Zwei neue Methoden:

```javascript
async setHeatingProfile(deviceId, profileNumber) {
  // 1. Auto-Modus setzen (Voraussetzung fuer Profilsteuerung)
  await this.setValue(deviceId, 'SET_POINT_MODE', 0);
  // 2. Profil aktivieren (1, 2 oder 3)
  await this.setValue(deviceId, 'ACTIVE_PROFILE', profileNumber);
  return true;
}

async getHeatingProfile(deviceId) {
  const activeProfile = await this.getValue(deviceId, 'ACTIVE_PROFILE');
  const mode = await this.getValue(deviceId, 'SET_POINT_MODE');
  return {
    activeProfile,  // 1, 2 oder 3
    mode            // 0=Auto, 1=Manuell, 2=Party
  };
}
```

**Kanal-Adressierung:**

Die deviceId muss den richtigen Kanal enthalten. HmIP-Thermostate verwenden Kanal 1 fuer `HEATING_CLIMATECONTROL_TRANSCEIVER`. Die Kanal-Adressierung ist konfigurierbar:

- Wenn die deviceId bereits einen Kanal enthaelt (z.B. `HmIP-eTRV-12345:1`): unveraendert verwenden
- Wenn die deviceId keinen Kanal enthaelt: Der Kanal wird vom DeviceController angehaengt (Standard `:1`, konfigurierbar)

Die Kanalauswahl wird in der `setHeatingProfile()`-Methode des DeviceControllers gehandhabt, nicht im LocalClient selbst.

### 3.2 CloudClient-Erweiterung

**Datei:** `src/cloud/cloudClient.js`

Zwei neue Methoden:

```javascript
async setHeatingProfile(deviceId, profileNumber) {
  // Auto-Modus setzen
  await this.setDeviceData(deviceId, 1, 'SET_POINT_MODE', 0);
  // Profil aktivieren
  return await this.setDeviceData(deviceId, 1, 'ACTIVE_PROFILE', profileNumber);
}

async getHeatingProfile(deviceId) {
  // Geraetestatus aus getCurrentState extrahieren
  const state = await this.getCurrentState();
  const device = state.devices[deviceId];
  if (!device) throw new Error(`Geraet ${deviceId} nicht gefunden.`);

  // Kanal 1 (HEATING_CLIMATECONTROL_TRANSCEIVER) auslesen
  const channel = device.functionalChannels['1'];
  return {
    activeProfile: channel?.activeProfile ?? null,
    mode: channel?.setPointMode ?? null
  };
}
```

**Hinweis:** Die Cloud API Unterstuetzung fuer `ACTIVE_PROFILE` und `SET_POINT_MODE` ist nicht offiziell dokumentiert. Wenn der Cloud-Aufruf fehlschlaegt, wird ein deutlicher Fehler geloggt mit dem Hinweis, dass Profilsteuerung moeglicherweise nur ueber die lokale Verbindung (XML-RPC) funktioniert.

### 3.3 DeviceController-Erweiterung

**Datei:** `src/devices/deviceController.js`

Zwei neue Methoden mit Dual-Client-Abstraktion:

```javascript
async setHeatingProfile(deviceId, profileNumber, options = {}) {
  const { channel = '1' } = options;

  // Profilnummer validieren
  if (![1, 2, 3].includes(profileNumber)) {
    throw new Error(`Ungueltiges Geraeteprofil: ${profileNumber}. Erlaubt: 1, 2 oder 3.`);
  }

  // Kanal anhaengen wenn noetig
  const targetId = this._resolveChannelId(deviceId, channel);

  if (this.isCloud) {
    return await this.client.setHeatingProfile(deviceId, profileNumber);
  } else {
    return await this.client.setHeatingProfile(targetId, profileNumber);
  }
}

async getHeatingProfile(deviceId, options = {}) {
  const { channel = '1' } = options;
  const targetId = this._resolveChannelId(deviceId, channel);

  if (this.isCloud) {
    return await this.client.getHeatingProfile(deviceId);
  } else {
    return await this.client.getHeatingProfile(targetId);
  }
}

// Hilfsmethode: Kanal an deviceId anhaengen falls nicht vorhanden
_resolveChannelId(deviceId, channel) {
  if (deviceId.includes(':')) return deviceId;
  return `${deviceId}:${channel}`;
}
```

**Channel-Parameter:** Der Default-Kanal ist `1` (Standard fuer HmIP-Thermostate). Kann bei Bedarf ueber `options.channel` ueberschrieben werden.

### 3.4 Zeitplan-Datenmodell Erweiterung

Jeder Zeitplan-Eintrag (`schedules/{uuid}.json`) erhaelt zwei neue optionale Felder:

```javascript
{
  "startDateTime": "2026-01-15T08:00:00.000Z",
  "endDateTime": "2026-01-15T22:00:00.000Z",
  "temperature": 21,               // Nur relevant bei controlMode "temperature"
  "profile": "Komfort",            // Addon-Profil (bestehendes Verhalten)
  "deviceProfile": 2,              // NEU: Geraete-Profil (1, 2 oder 3)
  "controlMode": "temperature",    // NEU: "temperature" | "deviceProfile"
  "notes": null
}
```

**Felder:**

| Feld            | Typ          | Beschreibung                                                               |
| --------------- | ------------ | -------------------------------------------------------------------------- |
| `controlMode`   | string       | `"temperature"` (Standard) oder `"deviceProfile"`                          |
| `deviceProfile` | number\|null | Geraete-Profilnummer: 1, 2 oder 3 (nur bei `controlMode: "deviceProfile"`) |

**Rueckwaertskompatibilitaet:** Bestehende Zeitplan-Eintraege ohne `controlMode`-Feld werden als `controlMode: "temperature"` interpretiert. Keine Migration noetig.

### 3.5 SpreadsheetParser-Erweiterung

**Datei:** `src/parser/spreadsheetParser.js`

Die bestehende "Heizprofil"-Spalte wird erweitert, um Geraeteprofile zu erkennen:

**Erkennung von Geraeteprofilen in der "Heizprofil"-Spalte:**

```javascript
// Syntax: "Geraeteprofil:N" wobei N = 1, 2 oder 3
// Auch akzeptiert: "Geräteprofil:N", "GP:N", "Profil:N"
function parseProfileValue(value) {
  if (!value || typeof value !== "string")
    return { controlMode: "temperature", deviceProfile: null };

  const trimmed = value.trim();

  // Geraeteprofil-Erkennung
  const deviceProfileMatch = trimmed.match(
    /^(?:Ger[aä]teprofil|GP|Profil):(\d)$/i,
  );
  if (deviceProfileMatch) {
    const num = parseInt(deviceProfileMatch[1], 10);
    if (num >= 1 && num <= 3) {
      return { controlMode: "deviceProfile", deviceProfile: num };
    }
    throw new Error(`Ungueltiges Geraeteprofil: ${num}. Erlaubt: 1, 2 oder 3.`);
  }

  // Addon-Profil (bestehendes Verhalten: "Komfort", "Nacht", etc.)
  return { controlMode: "temperature", deviceProfile: null };
}
```

**Anpassung von `normalizeData()`:**

Die normalisierte Ausgabe erhaelt die neuen Felder:

```javascript
{
  area: "Wohnzimmer",
  startDateTime: "2026-01-15T08:00:00.000Z",
  endDateTime: "2026-01-15T22:00:00.000Z",
  temperature: 21,            // null bei controlMode "deviceProfile"
  profile: "Komfort",         // Addon-Profil oder null
  deviceProfile: null,        // 1, 2, 3 oder null
  controlMode: "temperature", // "temperature" oder "deviceProfile"
  notes: null
}
```

**Konflikt-Regel:** Wenn die "Heizprofil"-Spalte ein Geraeteprofil enthaelt (`Geraeteprofil:2`) und gleichzeitig eine Temperatur angegeben ist, hat das Geraeteprofil Vorrang. Die Temperatur wird ignoriert, `controlMode` wird auf `"deviceProfile"` gesetzt.

**Validierung:**

- Bei `controlMode: "deviceProfile"`: `temperature` darf null sein (kein Pflichtfeld)
- Bei `controlMode: "temperature"`: `temperature` muss gesetzt sein (bestehende Validierung)
- `deviceProfile` muss 1, 2 oder 3 sein wenn angegeben

### 3.6 ScheduleManager-Erweiterung

**Datei:** `src/scheduler/scheduleManager.js`

**Anpassung von `createSchedule()`:**

Die neuen Felder `controlMode` und `deviceProfile` werden aus den geparsten Daten uebernommen:

```javascript
// In der Schleife die Zeitplan-Eintraege aufbaut:
const scheduleItem = {
  startDateTime: row.startDateTime,
  endDateTime: row.endDateTime,
  temperature: row.temperature,
  profile: row.profile,
  deviceProfile: row.deviceProfile ?? null, // NEU
  controlMode: row.controlMode ?? "temperature", // NEU
  notes: row.notes,
};
```

**Anpassung von `checkAndExecute()`:**

```javascript
for (const scheduleItem of area.schedule) {
  if (isWithinTimeWindow(scheduleItem, now)) {
    for (const deviceId of area.devices) {
      switch (scheduleItem.controlMode) {
        case "deviceProfile":
          await this.deviceController.setHeatingProfile(
            deviceId,
            scheduleItem.deviceProfile,
          );
          break;
        case "temperature":
        default:
          const temp = this.heatingProfile.getTemperature(
            scheduleItem.profile,
            scheduleItem.temperature,
          );
          await this.deviceController.setTemperature(deviceId, temp);
          break;
      }
    }
  }
}
```

**Profil-Zuruecksetzung am Zeitfenster-Ende:**

Wenn ein `deviceProfile`-Zeitfenster endet und kein naechstes Zeitfenster aktiv ist, wird Profil 1 (Standard) aktiviert. Dafuer brauchen wir eine Erkennung ob ein Zeitfenster gerade geendet hat:

```javascript
// Neue Logik in checkAndExecute():
for (const scheduleItem of area.schedule) {
  if (scheduleItem.controlMode === "deviceProfile") {
    const justEnded = hasJustEnded(scheduleItem, now, lastCheckTime);
    const noActiveWindow = !area.schedule.some((item) =>
      isWithinTimeWindow(item, now),
    );

    if (justEnded && noActiveWindow) {
      for (const deviceId of area.devices) {
        await this.deviceController.setHeatingProfile(deviceId, 1);
      }
    }
  }
}

// Hilfsfunktion:
function hasJustEnded(scheduleItem, now, lastCheckTime) {
  const end = new Date(scheduleItem.endDateTime);
  return end > lastCheckTime && end <= now;
}
```

**`lastCheckTime`:** Der Zeitpunkt des letzten `checkAndExecute()`-Laufs muss gespeichert werden (als Instanzvariable im ScheduleManager).

### 3.7 HeatingProfile-Erweiterung

**Datei:** `src/scheduler/heatingProfile.js`

Minimale Aenderung -- neue Methode zur Validierung:

```javascript
static isDeviceProfile(value) {
  // Prueft ob ein Wert ein Geraeteprofil-String ist (z.B. "Geraeteprofil:2")
  return /^(?:Ger[aä]teprofil|GP|Profil):(\d)$/i.test(value);
}
```

### 3.8 REST API Anpassungen

**Datei:** `server.js`

#### Bestehende Endpunkte anpassen

**`GET /api/schedules`** und **`GET /api/schedules/:id`:**

- Die neuen Felder `controlMode` und `deviceProfile` werden automatisch in der Antwort enthalten (da sie in der JSON-Datei stehen)

**`POST /api/upload`:**

- Der Parser liefert jetzt `controlMode` und `deviceProfile` -- diese werden an `createSchedule()` weitergegeben

#### Neuer Endpunkt

##### `GET /api/devices/:id/heating-profile`

Aktuelles Heizprofil eines Geraets auslesen.

**Response:**

```json
{
  "success": true,
  "data": {
    "activeProfile": 2,
    "mode": 0,
    "modeLabel": "Auto"
  }
}
```

**`modeLabel`-Mapping:**

- `0` -> `"Auto"`
- `1` -> `"Manuell"`
- `2` -> `"Party"`

**Fehler wenn Geraet kein Thermostat:**

```json
{
  "success": false,
  "error": "Geraet unterstuetzt keine Heizprofilsteuerung."
}
```

##### `POST /api/devices/:id/heating-profile`

Heizprofil auf einem Geraet setzen (manueller Trigger ausserhalb von Zeitplaenen).

**Request Body:**

```json
{
  "profileNumber": 2
}
```

**Response:**

```json
{
  "success": true,
  "message": "Geraeteprofil 2 aktiviert auf Geraet {id}."
}
```

**Validierung:**

- `profileNumber` muss 1, 2 oder 3 sein
- Fehlermeldung auf Deutsch wenn ungueltig

### 3.9 Frontend-Anpassungen

**Dateien:** `public/index.html`, `public/app.js`, `public/style.css`

#### Zeitplan-Uebersicht

Die Zeitplan-Tabelle erhaelt eine kombinierte "Steuerung"-Spalte statt der bisherigen "Temperatur"-Spalte:

```
+-------------------------------------------------------------------+
| Zeitplan: Winterheizung                                           |
+-------------------------------------------------------------------+
| Bereich    | Von              | Bis              | Steuerung       |
|------------|------------------|------------------|-----------------|
| Wohnzimmer | 15.01.26 08:00   | 15.01.26 22:00   | Temp. 21°C      |
| Wohnzimmer | 15.01.26 22:00   | 16.01.26 08:00   | Profil 2        |
| Kueche     | 15.01.26 08:00   | 15.01.26 20:00   | Komfort (21°C)  |
+-------------------------------------------------------------------+
```

**Anzeigelogik:**

- `controlMode: "temperature"` + `profile`: `"Komfort (21°C)"`
- `controlMode: "temperature"` ohne `profile`: `"Temp. 21°C"`
- `controlMode: "deviceProfile"`: `"Profil {N}"`

#### Geraete-Detailansicht (optional, wenn vorhanden)

Falls die UI eine Geraete-Detailansicht hat, dort das aktive Heizprofil und den Modus anzeigen:

```
Aktives Heizprofil: Profil 2 (Auto-Modus)
[Profil 1] [Profil 2] [Profil 3]
```

Buttons rufen `POST /api/devices/:id/heating-profile` auf.

## 4. Tests

### 4.1 Unit-Tests DeviceController

**Datei:** `tests/unit/deviceController.test.js` (bestehende Datei erweitern)

1. **setHeatingProfile** -- ruft Client.setHeatingProfile mit korrekter deviceId + Profilnummer auf
2. **setHeatingProfile** -- haengt Kanal ":1" an deviceId an wenn keiner vorhanden
3. **setHeatingProfile** -- veraendert deviceId nicht wenn Kanal bereits enthalten
4. **setHeatingProfile** -- wirft Fehler bei ungueltiger Profilnummer (0, 4, "abc")
5. **setHeatingProfile** -- konfigurierbar mit anderem Kanal (options.channel)
6. **getHeatingProfile** -- gibt activeProfile und mode zurueck
7. **\_resolveChannelId** -- haengt Kanal an wenn noetig
8. **\_resolveChannelId** -- laesst deviceId unveraendert wenn Kanal vorhanden

### 4.2 Unit-Tests LocalClient

**Datei:** `tests/unit/localClient.test.js` (bestehende Datei erweitern oder neu)

1. **setHeatingProfile** -- ruft setValue mit SET_POINT_MODE=0 und dann ACTIVE_PROFILE auf
2. **setHeatingProfile** -- Reihenfolge: erst Auto-Modus, dann Profil
3. **getHeatingProfile** -- ruft getValue fuer ACTIVE_PROFILE und SET_POINT_MODE auf

### 4.3 Unit-Tests SpreadsheetParser

**Datei:** `tests/unit/spreadsheetParser.test.js` (bestehende Datei erweitern)

1. **parseProfileValue** -- "Geraeteprofil:1" -> `{ controlMode: 'deviceProfile', deviceProfile: 1 }`
2. **parseProfileValue** -- "Geraeteprofil:3" -> `{ controlMode: 'deviceProfile', deviceProfile: 3 }`
3. **parseProfileValue** -- "GP:2" -> `{ controlMode: 'deviceProfile', deviceProfile: 2 }`
4. **parseProfileValue** -- "Profil:1" -> `{ controlMode: 'deviceProfile', deviceProfile: 1 }`
5. **parseProfileValue** -- "Geraeteprofil:4" -> Fehler (ungueltige Profilnummer)
6. **parseProfileValue** -- "Geraeteprofil:0" -> Fehler
7. **parseProfileValue** -- "Komfort" -> `{ controlMode: 'temperature', deviceProfile: null }` (unveraendert)
8. **parseProfileValue** -- null/leer -> `{ controlMode: 'temperature', deviceProfile: null }`
9. **normalizeData** -- Zeile mit Geraeteprofil hat `controlMode: "deviceProfile"` und `temperature: null`
10. **normalizeData** -- Zeile mit Temp + Geraeteprofil: Geraeteprofil hat Vorrang

### 4.4 Unit-Tests ScheduleManager

**Datei:** `tests/unit/scheduleManager.test.js` (bestehende Datei erweitern)

1. **createSchedule** -- speichert controlMode und deviceProfile im Zeitplan
2. **checkAndExecute** -- ruft setHeatingProfile bei controlMode "deviceProfile"
3. **checkAndExecute** -- ruft setTemperature bei controlMode "temperature" (bestehendes Verhalten)
4. **checkAndExecute** -- ruft setTemperature bei fehlendem controlMode (Rueckwaertskompatibilitaet)
5. **checkAndExecute** -- setzt Profil 1 zurueck wenn deviceProfile-Zeitfenster endet
6. **checkAndExecute** -- setzt nicht zurueck wenn ein anderes Zeitfenster aktiv ist

### 4.5 Unit-Tests HeatingProfile

**Datei:** `tests/unit/heatingProfile.test.js` (bestehende Datei erweitern)

1. **isDeviceProfile** -- erkennt "Geraeteprofil:2" als Geraeteprofil
2. **isDeviceProfile** -- erkennt "GP:1" als Geraeteprofil
3. **isDeviceProfile** -- erkennt "Komfort" NICHT als Geraeteprofil
4. **isDeviceProfile** -- erkennt null/leer NICHT als Geraeteprofil

### 4.6 Integrationstests REST API

**Datei:** `tests/integration/api.test.js` (bestehende Datei erweitern)

1. **GET /api/devices/:id/heating-profile** -- gibt aktives Profil zurueck
2. **POST /api/devices/:id/heating-profile** -- setzt Profil erfolgreich
3. **POST /api/devices/:id/heating-profile** -- Fehler bei ungueltiger Profilnummer
4. **POST /api/upload** -- Datei mit Geraeteprofil-Eintraegen erstellt korrekten Zeitplan

## 5. Aenderungsumfang

```
Geaendert:
  src/local/localClient.js           -- setHeatingProfile(), getHeatingProfile()
  src/cloud/cloudClient.js           -- setHeatingProfile(), getHeatingProfile()
  src/devices/deviceController.js    -- setHeatingProfile(), getHeatingProfile(), _resolveChannelId()
  src/parser/spreadsheetParser.js    -- parseProfileValue(), normalizeData() Erweiterung
  src/scheduler/scheduleManager.js   -- checkAndExecute() Switch-Case, Profil-Zuruecksetzung, lastCheckTime
  src/scheduler/heatingProfile.js    -- isDeviceProfile() statische Methode
  server.js                          -- 2 neue Endpunkte (GET/POST heating-profile)
  public/index.html                  -- Zeitplan-Tabelle "Steuerung"-Spalte
  public/app.js                      -- Anzeige-Logik fuer controlMode
  public/style.css                   -- Styling fuer Steuerungs-Anzeige (falls noetig)

Tests (erweitert):
  tests/unit/deviceController.test.js
  tests/unit/spreadsheetParser.test.js
  tests/unit/scheduleManager.test.js
  tests/unit/heatingProfile.test.js
  tests/integration/api.test.js

Keine neuen Dateien noetig.
```

## 6. Akzeptanzkriterien

1. Ein Zeitplan-Eintrag mit `Geraeteprofil:2` in der "Heizprofil"-Spalte aktiviert Profil 2 auf dem Thermostat
2. Beim Profil-Wechsel wird automatisch der Auto-Modus gesetzt
3. Bestehende Zeitplaene (ohne `controlMode`) funktionieren unveraendert
4. Die Kanal-Adressierung ist konfigurierbar (Standard: Kanal 1)
5. Cloud und Local Client unterstuetzen Profilsteuerung (Cloud mit Fallback/Warnung falls nicht unterstuetzt)
6. Die "Heizprofil"-Spalte akzeptiert sowohl Addon-Profile ("Komfort") als auch Geraeteprofile ("Geraeteprofil:2")
7. Bei gleichzeitiger Angabe von Temperatur und Geraeteprofil hat das Geraeteprofil Vorrang
8. Am Ende eines Geraeteprofil-Zeitfensters wird auf Profil 1 zurueckgesetzt
9. Die Zeitplan-Uebersicht zeigt den Steuerungsmodus klar an
10. `GET /api/devices/:id/heating-profile` gibt das aktive Profil und den Modus zurueck
11. `npm test` besteht mit allen neuen und bestehenden Tests
12. Fehlermeldungen sind auf Deutsch

## 7. Offene Risiken

- **Cloud API Unterstuetzung:** Es ist unklar ob die HmIP Cloud API `ACTIVE_PROFILE` und `SET_POINT_MODE` unterstuetzt. Falls nicht, funktioniert Profilsteuerung nur ueber die lokale XML-RPC-Verbindung. Der Code muss einen deutlichen Fehler loggen wenn der Cloud-Aufruf fehlschlaegt.
- **Kanal-Adressierung:** Die genaue Kanal-Struktur kann zwischen HmIP-Geraetetypen variieren (eTRV vs. WTH vs. FALMOT). Die konfigurierbare Kanalauswahl ist der Sicherheitsmechanismus dafuer. Testen auf realer Hardware ist erforderlich.
- **Profil-Zuruecksetzung:** Die `hasJustEnded()`-Logik haengt davon ab, dass `checkAndExecute()` regelmaessig laeuft (alle 60 Sekunden). Bei laengeren Ausfaellen koennte ein Zeitfenster-Ende verpasst werden. In der Praxis ist das akzeptabel, da der naechste Lauf die Situation korrigiert.
- **60-Sekunden-Intervall:** Das wiederholte Setzen von `SET_POINT_MODE` und `ACTIVE_PROFILE` alle 60 Sekunden waehrend eines aktiven Zeitfensters ist technisch redundant. Eine Optimierung (nur einmal setzen, Status merken) waere moeglich, ist aber fuer Epic 6 nicht im Scope -- konsistent mit dem bestehenden Verhalten bei Temperatursteuerung.
