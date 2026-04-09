# Epic 6: Heizprofil-Steuerung auf Geraeten -- Brainstorming

## Kontext

Aktuell kennt das Addon nur **direkte Temperatursteuerung**: Ein Zeitplan-Eintrag setzt eine Zieltemperatur (z.B. 21°C) auf dem Thermostat. Die "Heizprofil"-Spalte (Komfort, Nacht, etc.) ist nur ein Addon-internes Mapping auf feste Temperaturen -- sie aendert nichts am Wochenprogramm des Geraets.

Epic 6 fuehrt eine zweite Steuerungsart ein: **Heizprofil-Aktivierung auf dem Geraet**. HmIP-Thermostate (eTRV, WTH) haben bis zu 3 Wochenprogramme (Profil 1-3) mit je 13 Zeitfenstern pro Tag. Statt eine Temperatur direkt zu setzen, soll das Addon ein bestimmtes Wochenprogramm auf dem Thermostat aktivieren koennen.

---

## Runde 1: Grundlagen und XML-RPC-Schnittstelle

### Frage 1.1: Welche Art von Heizprofil-Steuerung soll unterstuetzt werden?

HmIP-Thermostate kennen verschiedene Steuerungsebenen:

```
Ebene 1: ACTIVE_PROFILE setzen (Profil 1, 2 oder 3 aktivieren)
  + Einfach: Ein setValue-Aufruf genuegt
  + Benutzer konfiguriert die Profile einmalig in der CCU-Oberflaeche
  + Addon wechselt nur zwischen vordefinierten Profilen
  - Benutzer muss Profile vorher manuell auf der CCU einrichten

Ebene 2: Wochenprogramm ueberschreiben (putParamset mit Zeitfenstern)
  + Volle Kontrolle: Addon definiert die Wochenprogramme komplett
  + Kein manuelles Setup auf der CCU noetig
  - Komplex: 7 Tage x 13 Zeitfenster = 91 Eintraege pro Profil
  - Ueberschreibt moeglicherweise vom Benutzer eingerichtete Programme
  - Erfordert detailliertes Tabellen-Schema fuer Wochenprogramme

Ebene 3: SET_POINT_MODE aendern (Auto/Manu/Party)
  + Nuetzlich als Ergaenzung (z.B. "schalte auf Manuell bei Sondertermin")
  + Einfacher setValue-Aufruf
  - Allein nicht ausreichend fuer Profilsteuerung
```

- [x] Nur Ebene 1: ACTIVE_PROFILE wechseln (Empfohlen)
- [ ] Ebene 1 + 3: Profil wechseln + Modus setzen (Auto/Manu)
- [ ] Ebene 1 + 2: Profil wechseln + Programme schreiben
- [ ] Alle drei Ebenen

---

### Frage 1.2: XML-RPC Parameterstruktur -- Wie werden Heizprofile angesprochen?

Auf HmIP-Thermostaten werden Heizprofile ueber verschiedene XML-RPC-Parameter gesteuert. Die relevanten Parameter sind:

```
Kanal 1 (HEATING_CLIMATECONTROL_TRANSCEIVER):
  ACTIVE_PROFILE          -- Integer (1, 2 oder 3): Aktives Wochenprogramm
  SET_POINT_MODE          -- Integer: 0=Auto, 1=Manuell, 2=Party
  SET_POINT_TEMPERATURE   -- Float: Direkte Zieltemperatur
  PARTY_MODE_SUBMIT       -- String: Party-Modus mit Endzeit

Wochenprogramm-Parameter (via getParamset/putParamset auf Kanal 1):
  P1_ENDTIME_MONDAY_1     -- Integer (Minuten seit Mitternacht, max 1440)
  P1_TEMPERATURE_MONDAY_1 -- Float (Temperatur fuer dieses Zeitfenster)
  P1_ENDTIME_MONDAY_2     -- Integer
  P1_TEMPERATURE_MONDAY_2 -- Float
  ... bis P1_ENDTIME_MONDAY_13 / P1_TEMPERATURE_MONDAY_13
  ... fuer alle Wochentage (MONDAY bis SUNDAY)
  ... fuer alle Profile (P1_, P2_, P3_)
```

**Wichtig:** Das Setzen von `ACTIVE_PROFILE` erfordert, dass der Thermostat im **Auto-Modus** ist (`SET_POINT_MODE = 0`). Im manuellen Modus wird das Wochenprogramm ignoriert.

Soll das Addon beim Profil-Wechsel automatisch in den Auto-Modus schalten?

- [x] Ja, immer Auto-Modus setzen wenn ein Profil aktiviert wird (Empfohlen)
- [ ] Nein, nur Profil wechseln -- Benutzer muss Auto-Modus selbst sicherstellen
- [ ] Konfigurierbar: Option in der UI ob Auto-Modus erzwungen wird

---

### Frage 1.3: Auf welchem XML-RPC-Kanal operieren wir?

HmIP-Thermostate haben mehrere Kanaele. Fuer die Heizungssteuerung ist Kanal 1 relevant (`HEATING_CLIMATECONTROL_TRANSCEIVER`). Aktuell setzt der LocalClient Temperaturen direkt auf der deviceId (ohne expliziten Kanal).

```javascript
// Aktuell (localClient.js):
setValue(deviceId, "SET_TEMPERATURE", temperature)

// Fuer Profilsteuerung muesste es sein:
setValue(deviceId + ":1", "ACTIVE_PROFILE", profileNumber)
// oder
setValue(deviceId, "ACTIVE_PROFILE", profileNumber)  // falls deviceId bereits den Kanal enthaelt
```

Wie adressiert die aktuelle Implementierung Kanaele? Muessen wir das anpassen?

- [ ] Device-ID enthaelt bereits Kanal (z.B. "HmIP-eTRV:1") -- kein Umbau noetig
- [ ] Device-ID ist ohne Kanal -- wir muessen ":1" anhaengen fuer Profilbefehle (Empfohlen)
- [x] Kanalauswahl sollte konfigurierbar sein

---

### Frage 1.4: Unterstuetzung der Cloud API fuer Heizprofile

Die Cloud API (`ps1.homematic.com:6969`) nutzt `setDeviceData(deviceId, channelId, parameter, value)`. Theoretisch koennte man damit ebenfalls `ACTIVE_PROFILE` setzen.

```
Cloud API: setDeviceData(deviceId, 0, "ACTIVE_PROFILE", 1)
  ? Unklar ob die Cloud API diesen Parameter unterstuetzt
  ? Channel-ID 0 oder 1?
  ? Kein offizieller Dokumentationshinweis
```

- [ ] Nur Local (XML-RPC) unterstuetzen -- Profilsteuerung braucht direkten CCU-Zugriff (Empfohlen)
- [x] Beides versuchen: Cloud + Local, mit Fallback-Logik
- [ ] Cloud priorisieren, da bestehende Architektur Cloud bevorzugt

---

## Runde 2: Datenmodell und Zeitplan-Integration

### Frage 2.1: Steuerungsmodus im Zeitplan-Datenmodell

Aktuell hat jeder Zeitplan-Eintrag `temperature` (Zahl) und `profile` (Addon-Profilname oder null). Wie erweitern wir das Datenmodell fuer die neue Steuerungsart?

```javascript
// Vorschlag A: Neues Feld "controlMode"
{
  "startDateTime": "2026-01-15T08:00:00.000Z",
  "endDateTime": "2026-01-15T22:00:00.000Z",
  "temperature": 21,              // Nur relevant bei controlMode "temperature"
  "profile": "Komfort",           // Addon-Profil (bestehendes Verhalten)
  "deviceProfile": 2,             // NEU: Geraete-Profil (1, 2 oder 3)
  "controlMode": "temperature",   // NEU: "temperature" | "deviceProfile"
  "notes": null
}
```

```javascript
// Vorschlag B: "profile"-Feld ueberladen
{
  "startDateTime": "2026-01-15T08:00:00.000Z",
  "endDateTime": "2026-01-15T22:00:00.000Z",
  "temperature": 21,
  "profile": "Geraeteprofil:2",   // Spezielle Syntax fuer Geraete-Profil
  "notes": null
}
```

```javascript
// Vorschlag C: Separate Felder, impliziter Modus
{
  "startDateTime": "2026-01-15T08:00:00.000Z",
  "endDateTime": "2026-01-15T22:00:00.000Z",
  "temperature": 21,              // Falls gesetzt: direkte Temperatur
  "profile": "Komfort",           // Addon-Profil (optional)
  "deviceProfile": 2,             // Falls gesetzt: Geraete-Profil aktivieren
  "notes": null
  // Logik: deviceProfile hat Vorrang vor temperature
}
```

- [x] Vorschlag A: Expliziter controlMode (Empfohlen) -- klar, erweiterbar, keine Mehrdeutigkeit
- [ ] Vorschlag B: Ueberladenes profile-Feld -- kompakt, aber fragile Konvention
- [ ] Vorschlag C: Impliziter Modus ueber Feldpraesenz -- weniger Felder, aber Vorrangregeln noetig

---

### Frage 2.2: Rueckwaertskompatibilitaet bestehender Zeitplaene

Bestehende Zeitplaene haben kein `controlMode`- oder `deviceProfile`-Feld. Wie damit umgehen?

- [x] Fehlender controlMode bedeutet implizit "temperature" -- keine Migration (Empfohlen)
- [ ] Einmalige Migration: Allen bestehenden Eintraegen `controlMode: "temperature"` hinzufuegen
- [ ] Neues Schema nur fuer neu erstellte Zeitplaene

---

### Frage 2.3: Tabellen-Schema -- Wie gibt der Benutzer den Steuerungsmodus an?

In der Tabelle (Excel/Numbers) muss der Benutzer angeben koennen, ob ein Eintrag eine Temperatur setzen oder ein Geraete-Profil aktivieren soll. Wie?

```
Option A: Bestehende "Heizprofil"-Spalte erweitern
| Bereich  | Start            | Ende             | Temp | Heizprofil      |
|----------|------------------|------------------|------|-----------------|
| Wohnzimmer | 2026-01-15 08:00 | 2026-01-15 22:00 | 21   | Komfort         |  <-- Addon-Profil (wie bisher)
| Wohnzimmer | 2026-01-15 22:00 | 2026-01-16 08:00 |      | Geraeteprofil:2 |  <-- NEU: Geraete-Profil 2
| Wohnzimmer | 2026-03-01 08:00 | 2026-03-01 22:00 | 19   |                 |  <-- Direkte Temperatur

Option B: Neue Spalte "Steuerungsart"
| Bereich  | Start            | Ende             | Temp | Heizprofil | Steuerungsart   |
|----------|------------------|------------------|------|------------|-----------------|
| Wohnzimmer | 2026-01-15 08:00 | 2026-01-15 22:00 | 21   | Komfort    | Temperatur      |
| Wohnzimmer | 2026-01-15 22:00 | 2026-01-16 08:00 |      |            | Geraeteprofil:2 |

Option C: Neue Spalte "Geraeteprofil" (separate Spalte fuer Profilnummer)
| Bereich  | Start            | Ende             | Temp | Heizprofil | Geraeteprofil |
|----------|------------------|------------------|------|------------|---------------|
| Wohnzimmer | 2026-01-15 08:00 | 2026-01-15 22:00 | 21   | Komfort    |               |
| Wohnzimmer | 2026-01-15 22:00 | 2026-01-16 08:00 |      |            | 2             |
```

- [X] Option A: "Heizprofil"-Spalte ueberladen mit "Geraeteprofil:N" Syntax (Empfohlen) -- keine neue Spalte, kompatibel
- [ ] Option B: Neue Spalte "Steuerungsart"
- [ ] Option C: Neue separate Spalte "Geraeteprofil"

---

### Frage 2.4: Was passiert wenn Temperatur UND Geraeteprofil angegeben sind?

Ein Benutzer koennte versehentlich beides ausfuellen:

```
| Bereich    | Temp | Heizprofil      |
|------------|------|-----------------|
| Wohnzimmer | 21   | Geraeteprofil:2 |
```

- [x] Geraeteprofil hat Vorrang, Temperatur wird ignoriert (Empfohlen) -- klare Regel, Profil ist "staerker"
- [ ] Fehlermeldung: Beides gleichzeitig ist nicht erlaubt
- [ ] Temperatur hat Vorrang (Profil wird ignoriert)

---

## Runde 3: DeviceController-Erweiterung und Umsetzungsdetails

### Frage 3.1: Neue Methode im DeviceController

Wie soll die neue Methode heissen und was soll sie tun?

```javascript
// Vorschlag A: Separate Methode
async setHeatingProfile(deviceId, profileNumber) {
  // 1. SET_POINT_MODE auf 0 (Auto) setzen
  // 2. ACTIVE_PROFILE auf profileNumber setzen
}

// Vorschlag B: Erweiterte setTemperature mit Modus-Parameter
async setTemperature(deviceId, temperature, { mode: 'direct' | 'profile' })

// Vorschlag C: Generische Methode
async controlHeating(deviceId, { mode, temperature, profileNumber })
```

- [x] Vorschlag A: Separate `setHeatingProfile()` Methode (Empfohlen) -- klar getrennt, einfach
- [ ] Vorschlag B: Bestehende Methode erweitern
- [ ] Vorschlag C: Generische Methode fuer alles

---

### Frage 3.2: Brauchen wir eine Methode zum Auslesen der aktuellen Geraete-Profile?

Fuer die UI waere es hilfreich zu wissen, welches Profil aktuell auf einem Thermostat aktiv ist. Sollen wir das implementieren?

```javascript
async getHeatingProfile(deviceId) {
  // Liest ACTIVE_PROFILE und SET_POINT_MODE via XML-RPC
  return { activeProfile: 2, mode: 'auto' }
}
```

- [x] Ja, `getHeatingProfile()` implementieren (Empfohlen) -- nuetzlich fuer Status-Anzeige in der UI
- [ ] Nein, nur Setzen -- Auslesen ist Scope von Epic 6 nicht
- [ ] Spaeter, als separate Erweiterung

---

### Frage 3.3: Anpassung von checkAndExecute()

Der ScheduleManager muss fuer die neue Steuerungsart angepasst werden. Aktuell ruft er immer `setTemperature()` auf. Wie soll die Verzweigung aussehen?

```javascript
// Aktuell:
for (const scheduleItem of area.schedule) {
  if (isWithinTimeWindow(scheduleItem)) {
    const temp = resolveTemperature(scheduleItem);
    await deviceController.setTemperature(deviceId, temp);
  }
}

// NEU:
for (const scheduleItem of area.schedule) {
  if (isWithinTimeWindow(scheduleItem)) {
    if (scheduleItem.controlMode === 'deviceProfile') {
      await deviceController.setHeatingProfile(deviceId, scheduleItem.deviceProfile);
    } else {
      const temp = resolveTemperature(scheduleItem);
      await deviceController.setTemperature(deviceId, temp);
    }
  }
}
```

- [ ] Einfache if/else Verzweigung wie oben (Empfohlen) -- minimal, verstaendlich
- [ ] Strategy Pattern: Steuerungsmodus als austauschbare Strategie
- [x] Switch-Case fuer zukuenftige Erweiterbarkeit

---

### Frage 3.4: Sicherheitsmechanismus -- Was passiert am Ende eines Zeitfensters?

Bei direkter Temperatursteuerung: Wenn ein Zeitfenster endet, setzt das Addon aktuell nichts zurueck (die Temperatur bleibt).

Bei Profilsteuerung: Soll das Addon nach Ende des Zeitfensters den Modus zuruecksetzen?

```
Beispiel: 08:00-22:00 Geraeteprofil 2 (Komfort-Wochenprogramm)
          22:00-?      Was passiert? Bleibt Profil 2 aktiv?
```

- [ ] Nichts zuruecksetzen -- Profil bleibt aktiv bis naechster Eintrag kommt (Empfohlen) -- konsistent mit Temperaturverhalten
- [X] Auf Profil 1 (Standard) zuruecksetzen wenn Zeitfenster endet
- [ ] Konfigurierbares "Rueckfall-Profil" in der UI

---

### Frage 3.5: UI-Anzeige in der Zeitplan-Uebersicht

Wie soll die Zeitplan-Uebersicht im Web-Frontend den Steuerungsmodus anzeigen?

```
Vorschlag A: Icon + Text
+-------------------------------------------------------------------+
| Zeitplan: Winterheizung                                           |
+-------------------------------------------------------------------+
| Bereich    | Von              | Bis              | Steuerung       |
|------------|------------------|------------------|-----------------|
| Wohnzimmer | 15.01.26 08:00   | 15.01.26 22:00   | 🌡 21°C         |
| Wohnzimmer | 15.01.26 22:00   | 16.01.26 08:00   | 📋 Profil 2     |
| Kueche     | 15.01.26 08:00   | 15.01.26 20:00   | 🌡 Komfort(21°) |
+-------------------------------------------------------------------+

Vorschlag B: Separate Spalten
| Bereich    | Von              | Bis              | Temp  | Profil   |
|------------|------------------|------------------|-------|----------|
| Wohnzimmer | 15.01.26 08:00   | 15.01.26 22:00   | 21°C  | --       |
| Wohnzimmer | 15.01.26 22:00   | 16.01.26 08:00   | --    | Profil 2 |
```

- [x] Vorschlag A: Kombinierte "Steuerung"-Spalte mit Icon (Empfohlen)
- [ ] Vorschlag B: Separate Spalten fuer Temperatur und Geraeteprofil
- [ ] Minimal: Bestehende Anzeige beibehalten, Profil nur als Tooltip

---

### Frage 3.6: Sollen wir noch weitere Aspekte besprechen?

- [ ] Ja, ich habe noch Fragen oder Themen
- [x] Nein, das reicht -- bitte die Spezifikation schreiben (Empfohlen)

---
