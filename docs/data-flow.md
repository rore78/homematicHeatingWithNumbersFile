# Data Flow & Workflows

## 1. Excel/Numbers Upload Workflow

When a user uploads a spreadsheet, the following sequence occurs:

```mermaid
sequenceDiagram
    participant User as Browser (app.js)
    participant Multer as Multer Middleware
    participant Server as server.js
    participant Parser as ExcelParser
    participant XLSX as xlsx Library
    participant FS as File System

    User->>Multer: POST /api/upload (multipart/form-data)
    Note over Multer: Validates file type (.xlsx/.xls/.numbers)<br/>Enforces 10 MB limit
    Multer->>FS: Save to uploads/ with unique filename
    Multer->>Server: req.file.path

    alt .numbers file
        Server->>Parser: NumbersParser.parse(filePath)
        Note over Parser: Delegates to ExcelParser<br/>(Numbers native format not supported)
    else .xlsx / .xls file
        Server->>Parser: ExcelParser.parse(filePath)
    end

    Parser->>XLSX: XLSX.readFile(filePath)
    XLSX-->>Parser: workbook
    Parser->>XLSX: XLSX.utils.sheet_to_json(sheet, {defval: null})
    XLSX-->>Parser: raw row objects

    Parser->>Parser: detectColumns(firstRow)
    Parser->>Parser: parseRow() for each row
    Note over Parser: Parse dates, validate temps (0-30C)

    Parser-->>Server: normalized data[]
    Server->>FS: fs.unlinkSync(filePath)
    Server-->>User: {success, data, count}
```

### Column Auto-Detection

The parser performs case-insensitive matching against the column headers in the first row of the spreadsheet. At minimum, **Bereich**, **Startdatum**, and **Enddatum** must be found.

| Internal Field | Accepted Column Names |
|---------------|----------------------|
| `area` | bereich, area, zone, raum |
| `startDateTime` | startdatum, start datetime, startzeit, start time, start, von, beginn |
| `endDateTime` | enddatum, end datetime, endzeit, end time, end, bis, ende |
| `temperature` | temperatur, temperature, temp, C, celsius |
| `profile` | heizprofil, profil, profile, heating profile |
| `notes` | zusatzinfo, notes, notiz, bemerkung, info, information |

### Date Parsing Logic

The parser attempts multiple formats in order of priority:

```mermaid
flowchart TD
    Input["Input value"] --> IsDate{"instanceof Date?"}
    IsDate -- "yes" --> ReturnDate["Return as-is"]
    IsDate -- "no" --> IsNumber{"typeof number?"}

    IsNumber -- "yes" --> ExcelSerial["Convert Excel serial number<br/>(days since 1899-12-30)"]
    ExcelSerial --> ValidSerial{"Valid date?"}
    ValidSerial -- "yes" --> ReturnConverted["Return converted date"]
    ValidSerial -- "no" --> ToString["Convert to string"]

    IsNumber -- "no" --> ToString
    ToString --> ISOMatch{"Matches YYYY-MM-DD HH:MM<br/>or YYYY-MM-DDTHH:MM?"}
    ISOMatch -- "yes" --> ReturnISO["Return parsed ISO date"]
    ISOMatch -- "no" --> DEMatch{"Matches DD.MM.YYYY HH:MM?"}
    DEMatch -- "yes" --> ReturnDE["Return parsed German date"]
    DEMatch -- "no" --> Fallback["Date.parse(string)"]
    Fallback --> ValidFallback{"Valid date?"}
    ValidFallback -- "yes" --> ReturnFallback["Return parsed date"]
    ValidFallback -- "no" --> Error["Throw error:<br/>ungultiges Format"]
```

### Temperature Validation

- Must be a valid number
- Must be between 0 and 30 C
- Parsed via `parseFloat()`

---

## 2. Schedule Creation Workflow

After uploading and parsing, the user creates a schedule from the parsed data:

```mermaid
sequenceDiagram
    participant User as Browser
    participant Server as server.js
    participant SM as ScheduleManager
    participant AM as AreaManager
    participant HP as HeatingProfile
    participant FS as File System

    User->>Server: POST /api/schedule {name, data[]}
    Server->>SM: createSchedule(name, data)

    loop For each row in data
        SM->>AM: resolveDevices(row.area)
        alt Area exists in areas.json
            AM-->>SM: area.deviceIds[]
        else Contains comma
            AM-->>SM: split by comma -> deviceId[]
        else Single value
            AM-->>SM: [row.area] (as device ID)
        end

        opt row.profile is set
            SM->>HP: getTemperature(row.profile, row.temperature)
            alt Profile found (Komfort/Nacht/Abwesenheit/Reduziert)
                HP-->>SM: profile.temperature
            else Profile not found
                HP-->>SM: use row.temperature as fallback
            end
        end

        SM->>SM: Group by area, add time slot
    end

    SM->>SM: Generate UUID v4
    SM->>FS: Write schedules/{uuid}.json
    SM-->>Server: schedule object
    Server-->>User: {success, schedule}
```

### Schedule Data Structure

```json
{
  "id": "uuid-v4",
  "name": "Schedule Name",
  "areas": [
    {
      "areaName": "Wohnzimmer",
      "devices": ["DEV001", "DEV002"],
      "schedule": [
        {
          "startDateTime": "2025-01-15T08:00:00.000Z",
          "endDateTime": "2025-01-15T22:00:00.000Z",
          "temperature": 21.0,
          "profile": "Komfort",
          "notes": null
        }
      ]
    }
  ],
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp",
  "active": false
}
```

---

## 3. Schedule Execution Loop

Once activated, the ScheduleManager polls every 60 seconds:

```mermaid
flowchart TD
    Start["setInterval: every 60s"] --> CheckActive{"Any active<br/>schedules?"}
    CheckActive -- "no" --> Start

    CheckActive -- "yes" --> IterSchedules["For each active schedule"]
    IterSchedules --> IterAreas["For each area in schedule"]
    IterAreas --> IterSlots["For each time slot in area"]

    IterSlots --> TimeCheck{"now >= startDateTime<br/>AND<br/>now <= endDateTime?"}
    TimeCheck -- "no" --> NextSlot["Next time slot"]
    TimeCheck -- "yes" --> IterDevices["For each device in area"]

    IterDevices --> SetTemp["deviceController.setTemperature(deviceId, temp)"]
    SetTemp --> IsCloud{"Cloud mode?"}
    IsCloud -- "yes" --> CloudAPI["CloudClient.setDeviceData()<br/>POST to ps1.homematic.com:6969"]
    IsCloud -- "no" --> LocalRPC["LocalClient.setValue()<br/>XML-RPC to CCU:2001"]

    CloudAPI --> NextDevice["Next device"]
    LocalRPC --> NextDevice
    NextDevice --> IterDevices
    NextSlot --> IterSlots

    style SetTemp fill:#f9f,stroke:#333
```

Key behaviors:
- **Interval:** 60 seconds (`setInterval`)
- **Immediate check:** Runs once on activation (`activateSchedule()` calls `checkAndExecute()`)
- **Error handling:** Individual device errors are logged but do not stop execution of other devices
- **No deduplication:** Temperature is set every 60 seconds as long as the time slot is active

---

## 4. Area Resolution

When the ScheduleManager processes an area name from the parsed data, it uses `AreaManager.resolveDevices()`:

```
Input: "Wohnzimmer"
  -> Check areas.json: found? -> return ["DEV001", "DEV002"]
  -> Not found, contains comma? "DEV001,DEV002" -> return ["DEV001", "DEV002"]
  -> Not found, no comma -> return ["Wohnzimmer"] (treated as single device ID)
```

---

## 5. Predefined Heating Profiles

| Profile | Temperature | Description |
|---------|------------|-------------|
| Komfort | 21.0 C | Komfortable Raumtemperatur |
| Nacht | 17.0 C | Nachtabsenkung |
| Abwesenheit | 16.0 C | Temperatur bei Abwesenheit |
| Reduziert | 19.0 C | Reduzierte Temperatur |

Custom profiles can be created via `HeatingProfile.createProfile()` (temperature range: 0-30 C). Predefined profiles cannot be deleted.

---

## 6. Server Initialization Flow

```mermaid
sequenceDiagram
    participant Main as startServer()
    participant Init as initializeAddon()
    participant Config as Config
    participant Addon as HomematicIPAddon
    participant SM as ScheduleManager
    participant AM as AreaManager
    participant HP as HeatingProfile
    participant Express as app.listen()

    Main->>Init: initializeAddon()
    Init->>Config: new Config()
    Note over Config: Reads env vars or defaults
    Init->>Addon: new HomematicIPAddon(config)
    Init->>Addon: addon.initialize()
    Note over Addon: Validates config, creates client,<br/>creates DeviceController
    Init->>SM: new ScheduleManager(addon.controller)
    Note over SM: Loads schedules from disk,<br/>starts 60s interval
    Init->>AM: new AreaManager()
    Note over AM: Loads areas.json
    Init->>HP: new HeatingProfile()
    Init-->>Main: initialized = true/false

    alt Initialization failed
        Note over Main: Logs warning, continues anyway
    end

    Main->>Express: app.listen(PORT)
    Note over Express: Server running on port 3000
```

The server starts even if the addon cannot connect to the Homematic system. API endpoints that require the addon return 503 in this case.
