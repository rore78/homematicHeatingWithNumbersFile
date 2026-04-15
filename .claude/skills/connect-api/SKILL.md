---
name: connect-api
description: Reference for the Homematic IP Connect API (WebSocket plugin API for HCU). Use when implementing, debugging, or extending Connect API integration -- device control, plugin messaging, authentication, features, or system events.
argument-hint: [topic] e.g. "auth", "thermostat", "events", "features", "device-control"
---

# Homematic IP Connect API Reference

Du bist ein Experte fuer die Homematic IP Connect API v1.0.0. Diese Skill-Datei ist deine Referenz fuer Implementierung, Debugging und Erweiterung der Connect-API-Integration.

## Ueberblick

Die Connect API ist eine **WebSocket-basierte Plugin-API** (NICHT REST) fuer die Kommunikation mit der Home Control Unit (HCU). Plugins koennen:

- Drittanbieter-Geraete ins HmIP-System einbinden
- Bestehende HmIP-Geraete, Gruppen und Systemfunktionen steuern und ueberwachen

**Wichtig:** Diese API unterscheidet sich grundlegend von der bestehenden Cloud-API (`CloudClient` in `src/cloud/cloudClient.js`), die REST/axios ueber `ps1.homematic.com:6969` nutzt. Die Connect API laeuft lokal ueber WebSocket.

**Voraussetzung:** HCU-Firmware >= 1.4.7

## Input

Der Benutzer fragt nach: `$ARGUMENTS`

Moegliche Themen:

- **auth** -- Authentifizierung und Token-Management
- **messages** -- Nachrichten-Typen und Envelope-Format
- **features** -- Geraete-Features (Temperatur, Schalter, Dimmer, etc.)
- **device-types** -- Geraetetypen und deren Features
- **device-control** -- Geraetesteuerung ueber System-Requests
- **heating** -- Heizungssteuerung (Gruppen, Profile, Abwesenheit)
- **events** -- System-Events empfangen und verarbeiten
- **errors** -- Fehlercodes und Fehlerbehandlung
- **container** -- Containerisierung und Deployment auf der HCU

## Verbindung & Authentifizierung

### Verbindungs-URLs

| Kontext                          | URL                                                                      |
| -------------------------------- | ------------------------------------------------------------------------ |
| Remote-Plugin (LAN)              | `wss://hcu1-XXXX.local:9001`                                             |
| Installiertes Plugin (Container) | `wss://host.containers.internal:9001`                                    |
| Auth-Token anfordern             | `POST https://hcu1-XXXX.local:6969/hmip/auth/requestConnectApiAuthToken` |
| Auth-Token bestaetigen           | `POST https://hcu1-XXXX.local:6969/hmip/auth/confirmConnectApiAuthToken` |

XXXX = letzte 4 Ziffern der SGTIN (auf der HCU-Unterseite). Selbstsigniertes Zertifikat.

### Authentifizierungs-Ablauf (3 Schritte)

**Schritt 1:** Aktivierungsschluessel generieren ueber die HCUweb Developer-Mode-Seite.

**Schritt 2:** Auth-Token anfordern

```http
POST https://hcu1-XXXX.local:6969/hmip/auth/requestConnectApiAuthToken
Header: VERSION: 12
Body: {
  "activationKey": "ABCDEF",
  "pluginId": "de.doe.jane.plugin.example",
  "friendlyName": { "en": "Example Plugin", "de": "Beispiel-Plugin" }
}
Response: { "authToken": "B23FB0DC7FDAA140..." }
```

**Schritt 3:** Auth-Token bestaetigen

```http
POST https://hcu1-XXXX.local:6969/hmip/auth/confirmConnectApiAuthToken
Header: VERSION: 12
Body: { "activationKey": "ABCDEF", "authToken": "B23FB0DC7FDAA140..." }
Response: { "clientId": "9fa276c2-b410-456d-bfde-4202918e8ce4" }
```

### WebSocket-Verbindungs-Header

| Header               | Pflicht | Beschreibung                                                             |
| -------------------- | ------- | ------------------------------------------------------------------------ |
| `authtoken`          | ja      | Autorisierungs-Token (Hex-String)                                        |
| `plugin-id`          | ja      | Eindeutige Plugin-ID (Reverse-Domain, z.B. `de.doe.jane.plugin.example`) |
| `hmip-system-events` | nein    | `true` fuer HmIP-System-Events                                           |

## Nachrichten-Envelope (PluginMessage)

Jede WebSocket-Nachricht (beide Richtungen) nutzt dieses Format:

```json
{
  "pluginId": "de.doe.jane.plugin.example",
  "id": "38967997-e1b3-463f-8dc4-f889bb5d10a2",
  "type": "PLUGIN_STATE_REQUEST",
  "body": {}
}
```

| Feld       | Typ               | Pflicht | Beschreibung                                            |
| ---------- | ----------------- | ------- | ------------------------------------------------------- |
| `id`       | String            | ja      | Nachrichten-ID fuer Request/Response-Korrelation (UUID) |
| `pluginId` | String            | ja      | Eindeutige Plugin-Kennung                               |
| `type`     | PluginMessageType | ja      | Bestimmt das Body-Schema                                |
| `body`     | Object            | nein    | Nutzlast gemaess Nachrichtentyp                         |

## Nachrichten: Plugin → HCU (12 Typen)

| Typ                           | Beschreibung                                      | Body-Felder                                                                                     |
| ----------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `CONFIG_TEMPLATE_RESPONSE`    | Konfig-Template mit Parametern/Einschraenkungen   | `properties` (Map), `groups` (Map)                                                              |
| `CONFIG_UPDATE_RESPONSE`      | Status eines Konfig-Updates                       | `status` (APPLIED/FAILED/PENDING), `message`                                                    |
| `CONTROL_RESPONSE`            | Ergebnis einer Geraetesteuerung                   | `deviceId`, `success`, `error`                                                                  |
| `CREATE_USER_MESSAGE_REQUEST` | Benutzer-Nachricht in der App erstellen           | `userMessageId`, `messageCategory`, `title` (Map), `message` (Map), `behaviorType`, `timestamp` |
| `DELETE_USER_MESSAGE_REQUEST` | Benutzer-Nachricht loeschen                       | `userMessageId`                                                                                 |
| `DISCOVER_RESPONSE`           | Entdeckte Geraete fuer Inklusion                  | `success`, `devices` (Set), `error`                                                             |
| `HMIP_SYSTEM_REQUEST`         | HmIP-System steuern                               | `path` (String), `body` (Object)                                                                |
| `LIST_USER_MESSAGES_REQUEST`  | Plugin-Nachrichten auflisten                      | leer                                                                                            |
| `PLUGIN_STATE_RESPONSE`       | Plugin-Status melden                              | `pluginReadinessStatus` (READY/ERROR/CONFIG_REQUIRED), `friendlyName` (Map)                     |
| `STATUS_EVENT`                | Geraete-Status-Update (partiell, fire-and-forget) | `deviceId`, `features` (Set)                                                                    |
| `STATUS_RESPONSE`             | Vollstaendiger Geraete-Status                     | `devices` (Set), `success`, `error`                                                             |
| `SYSTEM_INFO_REQUEST`         | System-Info anfordern                             | leer                                                                                            |

## Nachrichten: HCU → Plugin (16 Typen)

| Typ                            | Beschreibung                                      | Body-Felder                            |
| ------------------------------ | ------------------------------------------------- | -------------------------------------- |
| `CONFIG_TEMPLATE_REQUEST`      | Konfig-Template anfordern (Antwort innerhalb 10s) | `languageCode`                         |
| `CONFIG_UPDATE_REQUEST`        | Konfig-Werte vom Benutzer                         | `languageCode`, `properties` (Map)     |
| `CONTROL_REQUEST`              | Geraet steuern                                    | `deviceId`, `features` (Set)           |
| `CREATE_USER_MESSAGE_RESPONSE` | Ergebnis der Nachrichten-Erstellung               | `success`, `userMessageId`, `error`    |
| `DELETE_USER_MESSAGE_RESPONSE` | Ergebnis der Nachrichten-Loeschung                | `success`, `userMessageId`, `error`    |
| `DISCOVER_REQUEST`             | Geraete-Erkennung starten                         | leer                                   |
| `ERROR_RESPONSE`               | Fehler bei Nachrichtenverarbeitung                | `error`, `originalMessage`             |
| `EXCLUSION_EVENT`              | Geraete aus dem System entfernt                   | `deviceIds` (Set)                      |
| `HMIP_SYSTEM_EVENT`            | System-Status-Update (Push)                       | `eventTransaction`                     |
| `HMIP_SYSTEM_RESPONSE`         | Antwort auf System-Request                        | `code` (int), `body`                   |
| `INCLUSION_EVENT`              | Aktuell eingebundene Geraete                      | `deviceIds` (Set)                      |
| `LIST_USER_MESSAGES_RESPONSE`  | Liste der Plugin-Nachrichten                      | `userMessageMap` (Map)                 |
| `PLUGIN_STATE_REQUEST`         | Plugin-Status abfragen                            | leer                                   |
| `STATUS_REQUEST`               | Geraete-Status abfragen                           | `deviceIds` (Set, optional)            |
| `SYSTEM_INFO_RESPONSE`         | System-Info                                       | `ipAddress`, `isOnlineMode`, `success` |
| `USER_MESSAGE_ACK_EVENT`       | Benutzer hat Nachricht bestaetigt                 | `ackType` (OK/YES/NO), `userMessageId` |

## Geraetetypen (DeviceType) -- 19 Archetypen

| Typ                         | Pflicht-Features     | Optionale Features                                                                                                                                        |
| --------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `THERMOSTAT`                | SetPointTemperature  | Humidity, ActualTemperature, Maintenance, CO2Concentration                                                                                                |
| `CLIMATE_SENSOR`            | (keine)              | Storm, SunshineDuration, Humidity, ActualTemperature, Illumination, WindSpeed, Sunshine, Maintenance, WindDirection, CO2Concentration, Raining, RainCount |
| `SWITCH`                    | SwitchState          | OnTime, Maintenance                                                                                                                                       |
| `LIGHT`                     | SwitchState          | ColorTemperature, Color, OnTime, Dimming, Maintenance                                                                                                     |
| `WINDOW_COVERING`           | ShutterLevel         | SlatsLevel, ShutterDirection, Maintenance                                                                                                                 |
| `CONTACT_SENSOR`            | ContactSensorState   | Maintenance                                                                                                                                               |
| `SMOKE_ALARM`               | SmokeAlarm           | Maintenance                                                                                                                                               |
| `WATER_SENSOR`              | WaterlevelDetected   | MoistureDetected, Maintenance                                                                                                                             |
| `OCCUPANCY_SENSOR`          | PresenceDetected     | Maintenance                                                                                                                                               |
| `ENERGY_METER`              | CurrentPower         | Maintenance, EnergyCounter                                                                                                                                |
| `INVERTER`                  | CurrentPower         | Maintenance, EnergyCounter                                                                                                                                |
| `BATTERY`                   | BatteryState         | Maintenance, CurrentPower, EnergyCounter                                                                                                                  |
| `VEHICLE`                   | BatteryState         | Maintenance, VehicleRange                                                                                                                                 |
| `HEAT_PUMP`                 | ClimateOperationMode | CoolingTemperatureOffset, PresenceMode, HotWaterBoost, HeatingTemperatureOffset, Maintenance, SupplyTemperature                                           |
| `HVAC`                      | CurrentPower         | Maintenance, EnergyCounter                                                                                                                                |
| `EV_CHARGER`                | CurrentPower         | Maintenance, EnergyCounter                                                                                                                                |
| `GRID_CONNECTION_POINT`     | CurrentPower         | Maintenance, EnergyCounter                                                                                                                                |
| `PARTICULATE_MATTER_SENSOR` | (keine)              | ParticulateMassOne, ActualTemperature, ParticulateMassTwoPointFive, Humidity, ParticulateTypicalSize, Maintenance, ParticulateMassTen                     |
| `SWITCH_INPUT`              | (keine)              | Maintenance                                                                                                                                               |

## Feature-Schemas (40 Features)

Jedes Feature hat ein `type`-Feld, das dem Feature-Namen entspricht.

### Wichtigste Features fuer Heizungssteuerung

| Feature               | Felder                | Typ     | Bereich               |
| --------------------- | --------------------- | ------- | --------------------- |
| `setPointTemperature` | `setPointTemperature` | Double  | 5-30 °C               |
| `actualTemperature`   | `actualTemperature`   | Double  | -50 bis 60 °C         |
| `humidity`            | `humidity`            | Integer | 0-100 %rh             |
| `switchState`         | `on`                  | Boolean |                       |
| `dimming`             | `dimLevel`            | Double  | 0-1                   |
| `shutterLevel`        | `shutterLevel`        | Double  | 0-1 (1 = geschlossen) |
| `slatsLevel`          | `slatsLevel`          | Double  | 0-1                   |

### Weitere Features

| Feature                       | Felder                                                                   | Typ        | Einheit                           |
| ----------------------------- | ------------------------------------------------------------------------ | ---------- | --------------------------------- |
| `batteryState`                | `batteryLevel`, `batteryCapacity`                                        | Double     | 0-1 (%), Wh                       |
| `climateOperationMode`        | `climateOperationMode`                                                   | Enum       | AUTO/COOLING/HEATING              |
| `co2`                         | `co2`                                                                    | Double     | ppm (>=0)                         |
| `color`                       | `hue`, `saturationLevel`                                                 | Int/Double | 0-361 / 0-1                       |
| `colorTemperature`            | `colorTemperature`, `minimalColorTemperature`, `maximumColorTemperature` | Integer    | Kelvin                            |
| `contactSensorState`          | `triggered`                                                              | Boolean    |                                   |
| `coolingTemperatureOffset`    | `coolingTemperatureOffset`                                               | Double     | -50 bis 50 °C                     |
| `currentPower`                | `currentPower`                                                           | Double     | Watt (kann negativ sein)          |
| `energyCounter`               | `in`, `out`                                                              | Double     | kWh                               |
| `heatingTemperatureOffset`    | `heatingTemperatureOffset`                                               | Double     | -50 bis 50 °C                     |
| `hotWaterBoost`               | `on`                                                                     | Boolean    |                                   |
| `illumination`                | `illumination`                                                           | Double     | 0-20000 Lux                       |
| `maintenance`                 | `lowBat`, `sabotage`, `unreach`                                          | Boolean    |                                   |
| `moistureDetected`            | `moistureDetected`                                                       | Boolean    |                                   |
| `onTime`                      | `onTime`                                                                 | Double     | Sekunden                          |
| `presenceDetected`            | `presenceDetected`                                                       | Boolean    |                                   |
| `presenceMode`                | `presenceMode`                                                           | Enum       | AWAY/DEFAULT/HOME/NORMAL/VACATION |
| `rainCount`                   | `rainCounter`, `todayRainCounter`, `yesterdayRainCounter`                | Double     | mm                                |
| `raining`                     | `raining`                                                                | Boolean    |                                   |
| `shutterDirection`            | `shutterDirection`                                                       | Enum       | DARKER/LIGHTER                    |
| `smokeAlarm`                  | `smokeAlarm`                                                             | Boolean    |                                   |
| `storm`                       | `storm`                                                                  | Boolean    |                                   |
| `sunshine`                    | `sunshine`                                                               | Boolean    |                                   |
| `sunshineDuration`            | `sunshineDuration`, `todaySunshineDuration`, `yesterdaySunshineDuration` | Integer    | Stunden                           |
| `supplyTemperature`           | `supplyTemperature`                                                      | Double     | -50 bis 60 °C                     |
| `vehicleRange`                | `travelRange`                                                            | Double     | km                                |
| `waterlevelDetected`          | `waterlevelDetected`                                                     | Boolean    |                                   |
| `windDirection`               | `windDirection`                                                          | Double     | 0-359 Grad                        |
| `windSpeed`                   | `windSpeed`                                                              | Double     | 0-400 km/h                        |
| `particulateMassOne`          | `particulateMassConcentrationOne`                                        | Double     | ug/m3                             |
| `particulateMassTwoPointFive` | `particulateMassConcentrationTwoPointFive`                               | Double     | ug/m3                             |
| `particulateMassTen`          | `particulateMassConcentrationTen`                                        | Double     | ug/m3                             |
| `particulateTypicalSize`      | `particulateTypicalSize`                                                 | Double     | 0.01 um                           |

### Spezielle Sentinel-Werte (nur fuer Steuerung)

- **Double-Felder** (dimLevel, shutterLevel, slatsLevel, saturationLevel): `1.005` = letzter Wert, `1.01` = ignorieren
- **hue**: `360` = letzter Wert, `361` = ignorieren
- **colorTemperature**: `10050` = letzter Wert, `10100` = ignorieren, `10150` = dim2warm, `10200` = dynamisches Tageslicht

## HmIP System Requests

Alle als `HMIP_SYSTEM_REQUEST` Nachricht mit `path` und `body` gesendet.

### Request-Format

```json
{
  "pluginId": "...",
  "id": "<uuid>",
  "type": "HMIP_SYSTEM_REQUEST",
  "body": {
    "path": "/hmip/device/control/setSwitchState",
    "body": { "on": true, "deviceId": "3014F711A000...", "channelIndex": 1 }
  }
}
```

### Erfolgsantwort

```json
{ "type": "HMIP_SYSTEM_RESPONSE", "body": { "code": 200 } }
```

### Fehlerantwort

```json
{
  "type": "HMIP_SYSTEM_RESPONSE",
  "body": { "code": 400, "body": { "errorCode": "FEATURE_NOT_SUPPORTED" } }
}
```

### /hmip/device/control/ (48 Endpunkte)

Alle nehmen `deviceId` (String) + `channelIndex` (int) als Basis-Parameter.

#### Schalter & Dimmer

| Endpunkt                 | Zusaetzliche Parameter                                      |
| ------------------------ | ----------------------------------------------------------- |
| `setSwitchState`         | `on` (boolean)                                              |
| `setSwitchStateWithTime` | `on` (boolean), `onTime` (double, 0.1-16383s)               |
| `toggleSwitchState`      | (keine)                                                     |
| `setDimLevel`            | `dimLevel` (double, 0-1)                                    |
| `setDimLevelWithTime`    | `dimLevel` (double), `onTime` (double), `rampTime` (double) |

#### Farbe & Licht

| Endpunkt                              | Zusaetzliche Parameter                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `setColorTemperatureDimLevel`         | `colorTemperature` (int, 1000-10000 K), `dimLevel` (double)                                                     |
| `setColorTemperatureDimLevelWithTime` | + `onTime`, `rampTime`                                                                                          |
| `setHueSaturationDimLevel`            | `hue` (int, 0-359), `saturationLevel` (double, 0-1), `dimLevel` (double)                                        |
| `setHueSaturationDimLevelWithTime`    | + `onTime`, `rampTime`                                                                                          |
| `setSimpleRGBColorDimLevel`           | `simpleRGBColorState` (BLACK/BLUE/GREEN/TURQUOISE/RED/PURPLE/YELLOW/WHITE), `dimLevel`                          |
| `setSimpleRGBColorDimLevelWithTime`   | + `onTime`, `rampTime`                                                                                          |
| `setOpticalSignal`                    | `simpleRGBColorState`, `opticalSignalBehaviour` (OFF/ON/BLINKING_MIDDLE/FLASH_MIDDLE/BILLOW_MIDDLE), `dimLevel` |
| `setOpticalSignalWithTime`            | + `onTime`, `rampTime`                                                                                          |
| `startLightScene`                     | `id` (int), `dimLevel` (double)                                                                                 |

#### Rolllaeden & Beschattung

| Endpunkt                     | Zusaetzliche Parameter                                           |
| ---------------------------- | ---------------------------------------------------------------- |
| `setShutterLevel`            | `shutterLevel` (double, 0-1)                                     |
| `setSlatsLevel`              | `slatsLevel` (double), `shutterLevel` (double)                   |
| `setPrimaryShadingLevel`     | `primaryShadingLevel` (double)                                   |
| `setSecondaryShadingLevel`   | `primaryShadingLevel` (double), `secondaryShadingLevel` (double) |
| `setFavoriteShadingPosition` | (keine)                                                          |
| `toggleShadingState`         | (keine)                                                          |
| `stop`                       | (keine)                                                          |

#### Tueren & Schliesser

| Endpunkt                             | Zusaetzliche Parameter                                                |
| ------------------------------------ | --------------------------------------------------------------------- |
| `sendDoorCommand`                    | `doorCommand` (OPEN/STOP/CLOSE/PARTIAL_OPEN)                          |
| `setDoorLockActive`                  | `doorLockActive` (boolean)                                            |
| `setDoorLockActiveWithAuthorization` | `doorLockActive` (boolean), `authorizationPin` (String)               |
| `setLockState`                       | `targetLockState` (LOCKED/UNLOCKED/OPEN), `authorizationPin` (String) |
| `pullLatch`                          | `authorizationPin` (String)                                           |
| `toggleGarageDoorState`              | (keine)                                                               |

#### Lueftung & Bewaesserung

| Endpunkt                         | Zusaetzliche Parameter                          |
| -------------------------------- | ----------------------------------------------- |
| `setVentilationLevel`            | `ventilationLevel` (double, 0-1)                |
| `setVentilationLevelWithTime`    | + `ventilationTime`                             |
| `setVentilationState`            | `ventilationState` (NO_VENTILATION/VENTILATION) |
| `setVentilationStateWithTime`    | + `ventilationTime`                             |
| `toggleVentilationState`         | (keine)                                         |
| `setWateringSwitchState`         | `wateringActive` (boolean)                      |
| `setWateringSwitchStateWithTime` | + `wateringTime`                                |
| `toggleWateringState`            | (keine)                                         |

#### Sonstige

| Endpunkt                          | Zusaetzliche Parameter                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `acknowledgeFrostProtectionError` | (keine)                                                                                                           |
| `resetBlocking`                   | (keine)                                                                                                           |
| `resetEnergyCounter`              | (keine)                                                                                                           |
| `resetPassageCounter`             | (keine)                                                                                                           |
| `resetWaterVolume`                | (keine)                                                                                                           |
| `setIdentify`                     | (keine)                                                                                                           |
| `setIdentifyOem`                  | (keine)                                                                                                           |
| `setMotionDetectionActive`        | `motionDetectionActive` (boolean)                                                                                 |
| `setSoundFileVolumeLevel`         | `soundFile` (INTERNAL_SOUNDFILE/SOUNDFILE_001-252/RANDOM_SOUNDFILE/OLD_VALUE/DO_NOT_CARE), `volumeLevel` (double) |
| `setSoundFileVolumeLevelWithTime` | + `onTime`, `rampTime`                                                                                            |
| `setSwitchStateForIdentify`       | `on` (boolean)                                                                                                    |
| `startImpulse`                    | (keine)                                                                                                           |
| `toggleCameraNightVision`         | (keine)                                                                                                           |

### /hmip/group/heating/ (8 Endpunkte)

| Endpunkt                 | Parameter                                                                     |
| ------------------------ | ----------------------------------------------------------------------------- |
| `setSetPointTemperature` | `setPointTemperature` (double, 5-30), `groupId` (String)                      |
| `setBoost`               | `boost` (boolean), `groupId`                                                  |
| `setControlMode`         | `controlMode` (AUTOMATIC/MANUAL/ECO), `groupId`                               |
| `setActiveProfile`       | `profileIndex` (PROFILE_1 bis PROFILE_6), `groupId`                           |
| `activatePartyMode`      | `temperature` (double, 5-30), `endTime` (String, yyyy_MM_dd HH:mm), `groupId` |
| `setHotWaterState`       | `on` (boolean), `groupId`                                                     |
| `setHotWaterOnTime`      | `onTime` (double), `groupId`                                                  |
| `setHotWaterProfileMode` | `profileMode` (AUTOMATIC/MANUAL), `groupId`                                   |

### /hmip/group/switching/ (15 Endpunkte)

Gleiche Endpunkte wie `/hmip/device/control/` aber mit `groupId` statt `deviceId`/`channelIndex`:
`setState`, `setDimLevel`, `setDimLevelWithTime`, `setColorTemperatureDimLevel`, `setColorTemperatureDimLevelWithTime`, `setHueSaturationDimLevel`, `setHueSaturationDimLevelWithTime`, `setPrimaryShadingLevel`, `setSecondaryShadingLevel`, `setFavoriteShadingPosition`, `setSwitchStateWithTime`, `startLightScene`, `stop`, `toggleShadingState`, `toggleSwitchState`

### /hmip/group/linked/control/ (12 Endpunkte)

`setOpticalSignalBehaviour`, `setSoundFileVolumeLevel`, `setVentilationLevel`, `setVentilationLevelWithTime`, `setVentilationState`, `setVentilationStateWithTime`, `setWateringSwitchState`, `setWateringSwitchStateWithTime`, `startNotification`, `stopNotification`, `toggleVentilationState`, `toggleWateringState`

### /hmip/group/profile/ (1 Endpunkt)

`setProfileMode` -- Profilmodus einer Profilgruppe setzen

### /hmip/home/ (4 Endpunkte)

| Endpunkt            | Beschreibung                                       |
| ------------------- | -------------------------------------------------- |
| `getSystemState`    | Vollstaendiger Systemstatus (empfohlen beim Start) |
| `getState`          | Vollstaendiger Home-Status                         |
| `getStateForClient` | Status fuer Client gefiltert (`clientId`)          |
| `checkAuthToken`    | Auth-Token validieren                              |

### /hmip/home/heating/ (9 Endpunkte)

| Endpunkt                          | Parameter                               |
| --------------------------------- | --------------------------------------- |
| `activateAbsencePermanent`        | (keine)                                 |
| `activateAbsenceWithDuration`     | `duration` (int, Minuten)               |
| `activateAbsenceWithPeriod`       | `endTime` (String, yyyy_MM_dd HH:mm)    |
| `activateAbsenceWithFuturePeriod` | `startTime`, `endTime`                  |
| `activateVacation`                | `temperature` (double, 5-30), `endTime` |
| `activateFutureVacation`          | `temperature`, `startTime`, `endTime`   |
| `deactivateAbsence`               | (keine)                                 |
| `deactivateVacation`              | (keine)                                 |
| `setCooling`                      | `cooling` (boolean)                     |

### /hmip/home/security/ (3 Endpunkte)

| Endpunkt                     | Parameter                                          |
| ---------------------------- | -------------------------------------------------- |
| `acknowledgeSafetyAlarm`     | (keine)                                            |
| `setZonesActivation`         | `zonesActivation` (Map, z.B. `{"EXTERNAL": true}`) |
| `setExtendedZonesActivation` | `zonesActivation` (Map), `ignoreLowBat` (boolean)  |

### /hmip/rule/ (1 Endpunkt)

`enableSimpleRule` -- `ruleId` (String), `enabled` (boolean)

## System Events (11 Typen)

Empfang erfordert `hmip-system-events: true` Header. Events kommen in einer `eventTransaction`:

```json
{
  "accessPointId": "...",
  "events": { "0": { "pushEventType": "DEVICE_CHANGED", "device": {...} } },
  "origin": { "originType": "...", "id": "..." }
}
```

| Event                      | Beschreibung                 | Datenfeld     |
| -------------------------- | ---------------------------- | ------------- |
| `HOME_CHANGED`             | Home-Konfiguration geaendert | `home`        |
| `DEVICE_ADDED`             | Neues Geraet hinzugefuegt    | `device`      |
| `DEVICE_CHANGED`           | Geraetestatus geaendert      | `device`      |
| `DEVICE_REMOVED`           | Geraet entfernt              | `id`          |
| `GROUP_ADDED`              | Neue Gruppe                  | `group`       |
| `GROUP_CHANGED`            | Gruppe geaendert             | `group`       |
| `GROUP_REMOVED`            | Gruppe entfernt              | `id`          |
| `CLIENT_ADDED`             | Neuer Client                 | `client`      |
| `CLIENT_CHANGED`           | Client geaendert             | `client`      |
| `CLIENT_REMOVED`           | Client entfernt              | `id`          |
| `SECURITY_JOURNAL_CHANGED` | Sicherheitsjournal           | Journal-Daten |

## Fehlercodes

### Allgemeine Fehler

| Code | Name                         | Beschreibung                   |
| ---- | ---------------------------- | ------------------------------ |
| 1000 | CONCURRENT_MODIFICATION      | Objekt gleichzeitig entfernt   |
| 1001 | UNKNOWN_REQUEST              | Ungueltiger Pfad/Request       |
| 1400 | INVALID_REQUEST              | Fehlende/ungueltige Parameter  |
| 1401 | INVALID_AUTHORIZATION        | Ungueltiger Auth-Token         |
| 1402 | INVALID_PIN                  | Falscher PIN                   |
| 1403 | FEATURE_NOT_SUPPORTED        | Feature nicht unterstuetzt     |
| 1404 | FEATURE_NOT_ENABLED          | Server-Feature nicht aktiviert |
| 1405 | NOT_ALLOWED_PLUGIN_ID        | Plugin-ID nicht erlaubt        |
| 1500 | INTERNAL_ERROR               | Interner Server-Fehler         |
| 1502 | THIRD_PARTY_SERVICE_ERROR    | Drittanbieter-Fehler           |
| 1600 | CLIENT_VERSION_NOT_SUPPORTED | API-Version nicht unterstuetzt |

### Parameter-Fehler

| Code | Name                                    |
| ---- | --------------------------------------- |
| 1601 | INVALID_PARAMETER_VALUE                 |
| 1602 | INVALID_PARAMETER_VALUE_LENGTH          |
| 1603 | INVALID_PARAMETER_SIZE                  |
| 1604 | INVALID_NUMBER_PARAMETER_VALUE          |
| 1605 | INVALID_MULTIPLE_NUMBER_PARAMETER_VALUE |

### System-Zustandsfehler

| Code | Name                                 |
| ---- | ------------------------------------ |
| 1700 | DATA_TRANSFER_IN_PROGRESS            |
| 1800 | LIVE_OTAU_IN_PROGRESS                |
| 1900 | NOT_ALLOWED_IN_OFFLINE_MODE          |
| 2002 | PENDING_DEVICE_INCLUSION_PROCESS     |
| 2003 | UNRECOGNIZED_TIMEZONE                |
| 2004 | SOLUTION_NOT_ACTIVE                  |
| 2005 | PENDING_EXTERNAL_DEVICE_DISCOVERY    |
| 2006 | NOT_ALLOWED_DURING_INITIALIZATION    |
| 2007 | NOT_ALLOWED_AFTER_INITIALIZATION     |
| 2301 | NOT_ALLOWED_DURING_ACTIVE_ALARM      |
| 2302 | NOT_ALLOWED_DURING_AP_EXCHANGE       |
| 2303 | NOT_ALLOWED_DURING_COOLING           |
| 2304 | COOLING_NOT_ENABLED                  |
| 2305 | COOLING_EXTERNALLY_CONTROLLED        |
| 2306 | NOT_ALLOWED_DURING_ABSENCE_MODE      |
| 2307 | NOT_ALLOWED_DURING_ACTIVE_PROTECTION |
| 2308 | ACCESS_POINT_NOT_CONNECTED           |
| 2309 | ACCESS_POINT_REMOTE_ACCESS_DENIED    |

### Gruppen-Fehler (3001-3011)

UNKNOWN_GROUP, NOT_HEATING_GROUP, MAXIMUM_GROUP_LIMIT_REACHED, NOT_SWITCHING_GROUP, NOT_ALARM_SWITCHING_GROUP, NOT_META_GROUP, NOT_EXTENDED_LINKED_SWITCHING_GROUP, NOT_SHUTTER_GROUP, INVALID_GROUP_TYPE, NOT_LOCK_PROFILE_GROUP, NOT_AUTO_RELOCK_PROFILE_GROUP

### Geraete-Fehler (4001-4018, 4101, 4201, 4402)

UNKNOWN_DEVICE, INVALID_ASSIGNMENT_SOURCE/TARGET/DEVICE, ASSIGNMENT_LOCKED, MAXIMUM_GLOBAL_DEVICE_LIMIT_REACHED, MAXIMUM_GROUP_DEVICE_LIMIT_REACHED, MAXIMUM_GROUP_LIMIT_FOR_DEVICE_TYPE, UPDATE_NOT_APPLICABLE, INVALID_ASSIGNMENT_TARGET_GROUP_TYPE, INVALID_ASSIGNMENT_SOLUTION_COMBINATION, INVALID_ASSIGNMENT_DEVICE_CHANNEL_TYPE, MAXIMUM_DEVICE_CHANNEL_LIMIT_USAGE_REACHED, NOT_READY_FOR_UPDATE, UPDATE_SLOT_NOT_AVAILABLE, UPDATE_FILE_NOT_AVAILABLE, DEVICE_UNREACHABLE, DEVICE_BUSY, UNKNOWN_CHANNEL, UNKNOWN_CHANNEL_GROUP, INVALID_AUTHORIZATION_PIN

### Client-Fehler (5001-5403)

UNKNOWN_CLIENT, NOT_ALLOWED_FOR_LAST_ADMIN, CLIENT_INVALID_AUTHORIZATION, CLIENT_ACCESS_DENIED, CLIENT_INVALID_RECOVERY_CODE

### Regel-Fehler (6001-6005)

UNKNOWN_RULE, INVALID_RULE_TYPE, INVALID_ASSIGNMENT_ACTION, INVALID_ASSIGNMENT_CONDITION, INVALID_ASSIGNMENT_TRIGGER

## Datenmodelle

### Device

```json
{
  "deviceId": "uuid",
  "deviceType": "THERMOSTAT",
  "features": [{ "type": "setPointTemperature", "setPointTemperature": 21.0 }],
  "firmwareVersion": "1.2.3",
  "friendlyName": "Wohnzimmer Thermostat",
  "modelType": "HmIP-eTRV"
}
```

### Error

```json
{ "code": "BRIDGE_OFFLINE", "message": "Bridge ist nicht erreichbar" }
```

### PropertyTemplate (fuer Plugin-Konfiguration)

```json
{
  "dataType": "STRING",
  "friendlyName": "API-Schluessel",
  "required": true,
  "description": "Der API-Schluessel fuer den Drittanbieter",
  "pattern": "^[A-Za-z0-9]{32}$",
  "minimumLength": 32,
  "maximumLength": 32,
  "groupId": "connection"
}
```

PropertyType-Enum: `BOOLEAN`, `ENUM`, `INTEGER`, `NUMBER`, `PASSWORD`, `QRCODE`, `READONLY`, `STRING`, `TYPEAHEAD`, `WEBLINK`

### GroupTemplate

```json
{
  "friendlyName": "Verbindung",
  "description": "Verbindungseinstellungen",
  "order": 1
}
```

## Containerisierung (Deployment auf HCU)

- **Plattform:** linux/arm64
- **Basis-Image:** `ghcr.io/homematicip/alpine-node-simple:0.0.1`
- **Container-Dateien:** `/TOKEN` (Auth-Token), `/CLIENTID`, `/SGTIN`, `/data` (persistenter Speicher)
- **Ports:** Duerfen > 1024 sein, ausser reserviert: 1883, 6969, 8428, 8888, 9000, 9001, 9293, 9294, 26969 (tcp), 5353, 43439 (udp)

### Docker LABEL fuer Plugin-Metadaten

```
de.eq3.hmip.plugin.metadata = {
  "pluginId": "de.doe.jane.plugin.example",
  "issuer": "Jane Doe",
  "version": "1.0.0",
  "hcuMinVersion": "1.4.7",
  "scope": "LOCAL",
  "friendlyName": { "en": "Example", "de": "Beispiel" },
  "description": { "en": "...", "de": "..." },
  "settings": {},
  "image": "<base64>",
  "changelog": { "1.0.0": { "en": "Initial", "de": "Erstversion" } },
  "logsEnabled": true
}
```

## Enum-Referenz

| Enum                       | Werte                                                                          |
| -------------------------- | ------------------------------------------------------------------------------ |
| AckType                    | OK, YES, NO                                                                    |
| BehaviorType               | ACKNOWLEDGEABLE_BY_OK, ACKNOWLEDGEABLE_BY_YES_NO, DISMISSIBLE, NOT_DISMISSIBLE |
| ClimateOperationType       | AUTO, COOLING, HEATING                                                         |
| ConfigUpdateResponseStatus | APPLIED, FAILED, PENDING                                                       |
| MessageCategory            | ERROR, INFO, WARN                                                              |
| PluginReadinessStatus      | CONFIG_REQUIRED, ERROR, READY                                                  |
| PresenceType               | AWAY, DEFAULT, HOME, NORMAL, VACATION                                          |
| ShadingDirection           | DARKER, LIGHTER                                                                |

## Anweisungen fuer die Implementierung

Wenn du Code fuer die Connect API schreibst:

1. **WebSocket verwenden** -- NICHT axios/HTTP. Nutze z.B. das `ws` npm-Paket.
2. **Selbstsigniertes Zertifikat** -- `rejectUnauthorized: false` fuer die WSS-Verbindung.
3. **Nachrichten-Korrelation** -- Jede Anfrage braucht eine UUID als `id`, die Antwort kommt mit derselben `id`.
4. **Nachrichten-Routing** -- Implementiere einen Handler fuer jeden `type`, der den Body entsprechend verarbeitet.
5. **Plugin-Lebenszyklus** -- Nach Verbindungsaufbau kommt `PLUGIN_STATE_REQUEST`. Antworte mit `PLUGIN_STATE_RESPONSE` und Status `READY`.
6. **Inklusion** -- `INCLUSION_EVENT` zeigt an, welche Geraete eingebunden sind. Antworte mit `STATUS_RESPONSE`.
7. **Fehlende Vollstaendige Doku** -- Bei Unklarheiten lies die Original-Datei: `docs/connect-api-documentation-1.0.0.html`
8. **Deutsche Sprache** -- User-facing Strings in Deutsch (Projekt-Konvention).
