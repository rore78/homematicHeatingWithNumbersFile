# System Architecture

## Overview

my-homematic-addon is a three-tier Node.js application that controls Homematic IP smart home devices through either the Homematic IP Cloud API or a local CCU (Central Control Unit) via XML-RPC. It provides a web interface for uploading Excel-based heating schedules, managing device areas, and integrating external file sources (USB, FRITZ!Box NAS, iCloud Drive) with automatic polling and push-based import.

## Component Architecture

```mermaid
graph TB
    subgraph "Frontend (public/)"
        UI["index.html + app.js + style.css"]
    end

    subgraph "Express Server (server.js)"
        API["REST API<br/>30+ Endpoints"]
        MW["Middleware<br/>CORS, JSON, Multer"]
    end

    subgraph "Backend Modules (src/)"
        Addon["HomematicIPAddon<br/>src/index.js"]
        Config["Config<br/>src/config/config.js"]
        DC["DeviceController<br/>src/devices/deviceController.js"]
        CC["CloudClient<br/>src/cloud/cloudClient.js"]
        LC["LocalClient<br/>src/local/localClient.js"]
        SM["ScheduleManager<br/>src/scheduler/scheduleManager.js"]
        HP["HeatingProfile<br/>src/scheduler/heatingProfile.js"]
        AM["AreaManager<br/>src/areas/areaManager.js"]
        SP["SpreadsheetParser<br/>src/parser/spreadsheetParser.js"]
        FSM["FileSourceManager<br/>src/sources/fileSourceManager.js"]
        USB["UsbFileSource<br/>src/sources/usbFileSource.js"]
        FTP["FritzboxFileSource<br/>src/sources/fritzboxFileSource.js"]
        IC["IcloudFileSource<br/>src/sources/icloudFileSource.js"]
        PM["PushManager<br/>src/sources/pushManager.js"]
        PE["PollingEngine<br/>src/polling/pollingEngine.js"]
        LOG["Logger<br/>src/utils/logger.js"]
    end

    subgraph "External Systems"
        Cloud["Homematic IP Cloud<br/>ps1.homematic.com:6969"]
        CCU["Local CCU<br/>XML-RPC Port 2001"]
        Fritz["FRITZ!Box NAS<br/>FTP"]
        iCloud["iCloud Drive<br/>Python Bridge"]
        USBDev["USB Storage"]
    end

    subgraph "Persistence (JSON files)"
        SchFiles["schedules/*.json"]
        AreasFile["areas.json"]
        SourcesFile["sources.json"]
        PushFile["push-config.json"]
        PollFile["polling-status.json"]
    end

    UI -- "Fetch API" --> API
    API --> MW
    API --> Addon
    API --> SM
    API --> AM
    API --> HP
    API --> SP
    API --> FSM
    API --> PM
    API --> PE
    Addon --> Config
    Addon --> DC
    DC --> CC
    DC --> LC
    CC -- "HTTPS/axios" --> Cloud
    LC -- "XML-RPC" --> CCU
    FSM --> USB
    FSM --> FTP
    FSM --> IC
    USB --> USBDev
    FTP -- "basic-ftp" --> Fritz
    IC -- "Python/pyicloud" --> iCloud
    PE --> FSM
    PE --> SM
    SM --> SchFiles
    AM --> AreasFile
    FSM --> SourcesFile
    PM --> PushFile
    PE --> PollFile
    SM --> HP
    SM --> AM
```

## Module Dependency Graph

```mermaid
graph TD
    server["server.js"]
    index["HomematicIPAddon<br/>src/index.js"]
    config["Config<br/>src/config/config.js"]
    cloud["CloudClient<br/>src/cloud/cloudClient.js"]
    local["LocalClient<br/>src/local/localClient.js"]
    dc["DeviceController<br/>src/devices/deviceController.js"]
    sm["ScheduleManager<br/>src/scheduler/scheduleManager.js"]
    hp["HeatingProfile<br/>src/scheduler/heatingProfile.js"]
    am["AreaManager<br/>src/areas/areaManager.js"]
    sp["SpreadsheetParser<br/>src/parser/spreadsheetParser.js"]
    fsm["FileSourceManager<br/>src/sources/fileSourceManager.js"]
    usb["UsbFileSource<br/>src/sources/usbFileSource.js"]
    ftp["FritzboxFileSource<br/>src/sources/fritzboxFileSource.js"]
    ic["IcloudFileSource<br/>src/sources/icloudFileSource.js"]
    pm["PushManager<br/>src/sources/pushManager.js"]
    pe["PollingEngine<br/>src/polling/pollingEngine.js"]
    log["Logger<br/>src/utils/logger.js"]

    server --> index
    server --> sm
    server --> am
    server --> hp
    server --> sp
    server --> fsm
    server --> usb
    server --> ftp
    server --> ic
    server --> pm
    server --> pe
    server --> log

    index --> config
    index --> cloud
    index --> local
    index --> dc

    dc --> cloud
    dc --> local

    sm --> hp
    sm --> am

    fsm --> sp
    pe --> fsm
    pe --> sm
```

## Connection Mode Strategy

The addon supports three connection modes configured via `HOMEMATIC_MODE` environment variable or constructor parameter:

```mermaid
flowchart TD
    Start["Config.getMode()"] --> CheckMode{"config.mode?"}

    CheckMode -- "'cloud'" --> HasCloud{"hasCloudConfig()?<br/>SGTIN or authToken set?"}
    HasCloud -- "yes" --> ReturnCloud["return 'cloud'"]
    HasCloud -- "no" --> ReturnNull1["return null"]

    CheckMode -- "'local'" --> HasLocal{"hasLocalConfig()?<br/>host set?"}
    HasLocal -- "yes" --> ReturnLocal["return 'local'"]
    HasLocal -- "no" --> ReturnNull2["return null"]

    CheckMode -- "'auto' (default)" --> AutoCloud{"hasCloudConfig()?"}
    AutoCloud -- "yes" --> ReturnCloud2["return 'cloud'"]
    AutoCloud -- "no" --> AutoLocal{"hasLocalConfig()?"}
    AutoLocal -- "yes" --> ReturnLocal2["return 'local'"]
    AutoLocal -- "no" --> ReturnNull3["return null"]
```

In auto mode, cloud is preferred over local when both configurations are available.

## Device Abstraction Layer

DeviceController provides a unified interface over both CloudClient and LocalClient. It detects the client type via `instanceof` and normalizes device data to a common format:

```mermaid
classDiagram
    class DeviceController {
        -client: CloudClient | LocalClient
        -isCloud: boolean
        -isLocal: boolean
        +getDevices() Array
        +getDevice(deviceId) object
        +getDeviceState(deviceId) object
        +setSwitchState(deviceId, on) boolean
        +setDimLevel(deviceId, level) boolean
        +setTemperature(deviceId, temperature) boolean
        +setHeatingProfile(deviceId, profileNumber) boolean
        +getHeatingProfile(deviceId) object
        +setParameter(deviceId, param, value) boolean
        +getParameter(deviceId, param) any
        -_normalizeDevices(devices) Array
        -_normalizeDevice(device) object
        -_resolveChannelId(deviceId, channel) string
    }

    class CloudClient {
        -apiUrl: string
        -clientAuthToken: string
        +authenticate() string
        +getDevices() Array
        +getDevice(deviceId) object
        +setDeviceData(deviceId, channelId, param, value) object
        +setSwitchState(deviceId, on) object
        +setDimLevel(deviceId, level) object
        +setTemperature(deviceId, temperature) object
    }

    class LocalClient {
        -host: string
        -port: number
        -client: xmlrpc.Client
        +connect() boolean
        +getDevices() Array
        +getDevice(deviceId) object
        +getValue(deviceId, param) any
        +setValue(deviceId, param, value) boolean
        +setSwitchState(deviceId, on) boolean
        +setDimLevel(deviceId, level) boolean
        +setTemperature(deviceId, temperature) boolean
        +getDeviceState(deviceId) object
    }

    DeviceController --> CloudClient : uses (cloud mode)
    DeviceController --> LocalClient : uses (local mode)
```

**Normalization mapping:**

| Normalized Field | Cloud Source                    | Local (CCU) Source              |
| ---------------- | ------------------------------- | ------------------------------- |
| `id`             | `device.id`                     | `device.ADDRESS` or `device.ID` |
| `name`           | `device.label` or `device.name` | `device.NAME`                   |
| `type`           | `device.type`                   | `device.TYPE`                   |
| `model`          | `device.modelType`              | `device.TYPE`                   |
| `firmware`       | `device.firmwareVersion`        | `device.FIRMWARE`               |
| `channels`       | `device.functionalChannels`     | `[]` (not available)            |

## File Source Architecture

The addon supports importing heating schedules from multiple external file sources:

```mermaid
classDiagram
    class FileSource {
        <<abstract>>
        +getType() string
        +getConfig() object
        +updateConfig(config) void
        +isAvailable() boolean
        +listFiles() Array
        +readFile(filePath) Buffer
        +getChecksum(filePath) string
    }

    class UsbFileSource {
        -mountPoint: string
        -subFolder: string
        +getType() "usb"
        +isAvailable() boolean
        +listFiles() Array
    }

    class FritzboxFileSource {
        -host: string
        -port: number
        -username: string
        -password: string
        +getType() "fritzbox"
        +testConnection() object
        +isAvailable() boolean
    }

    class IcloudFileSource {
        -appleId: string
        -path: string
        +getType() "icloud"
        +login(appleId, password) object
        +verify2fa(code) object
        +getAuthState() string
        +logout() void
    }

    class FileSourceManager {
        -sources: Map
        -config: object
        +registerSource(source) void
        +getAllSources() Array
        +updateSourceConfig(type, config) void
        +testSource(type) object
        +scanSource(type) Array
        +importFile(type, fileName, sm) object
    }

    class PollingEngine {
        -fileSourceManager: FileSourceManager
        -scheduleManager: ScheduleManager
        +start() void
        +stop() void
        +pollCycle() void
        +triggerPoll(type) object
        +updateConfig(config) void
        +getStatus() object
        +getLog(limit) Array
    }

    class PushManager {
        -config: object
        +enable() void
        +disable() void
        +validateApiKey(key) boolean
        +handleUpload(path, name, sm) object
        +regenerateKey() string
    }

    FileSource <|-- UsbFileSource
    FileSource <|-- FritzboxFileSource
    FileSource <|-- IcloudFileSource
    FileSourceManager --> FileSource : manages
    FileSourceManager --> SpreadsheetParser : uses
    PollingEngine --> FileSourceManager : polls
    PollingEngine --> ScheduleManager : imports to
    PushManager --> SpreadsheetParser : uses
    PushManager --> ScheduleManager : imports to
```

## Data Persistence

The addon uses a file-based persistence model with no database:

| Data                 | Storage                 | Format                               |
| -------------------- | ----------------------- | ------------------------------------ |
| Heating schedules    | `schedules/{uuid}.json` | One JSON file per schedule           |
| Area definitions     | `areas.json`            | Single JSON file, keyed by area name |
| Source configuration | `sources.json`          | All file source configs              |
| Push configuration   | `push-config.json`      | Push endpoint config + API key       |
| Polling status       | `polling-status.json`   | Polling engine state + log           |
| Uploaded files       | `uploads/`              | Temporary -- deleted after parsing   |

## Directory Structure

```
my-homematic-addon/
├── src/
│   ├── index.js                    # HomematicIPAddon main class + exports
│   ├── config/
│   │   └── config.js               # Config management (cloud/local/auto)
│   ├── cloud/
│   │   └── cloudClient.js          # Homematic IP Cloud API client
│   ├── local/
│   │   └── localClient.js          # CCU XML-RPC client
│   ├── devices/
│   │   └── deviceController.js     # Unified device abstraction layer
│   ├── scheduler/
│   │   ├── scheduleManager.js      # Schedule CRUD + 60s execution loop
│   │   └── heatingProfile.js       # Predefined heating profiles
│   ├── areas/
│   │   └── areaManager.js          # Area/zone management
│   ├── parser/
│   │   └── spreadsheetParser.js    # Unified Excel/Numbers parser
│   ├── sources/
│   │   ├── fileSource.js           # Abstract base class for file sources
│   │   ├── fileSourceManager.js    # Source registry + import logic
│   │   ├── usbFileSource.js        # USB storage source
│   │   ├── fritzboxFileSource.js   # FRITZ!Box NAS via FTP
│   │   ├── icloudFileSource.js     # iCloud Drive via Python bridge
│   │   └── pushManager.js          # HTTP push endpoint
│   ├── polling/
│   │   └── pollingEngine.js        # Automatic file source polling
│   └── utils/
│       └── logger.js               # Structured logging utility
├── scripts/
│   └── icloud_bridge.py            # Python bridge for iCloud Drive access
├── public/
│   ├── index.html                  # Web UI (upload, areas, schedules, sources)
│   ├── app.js                      # Frontend logic (drag-drop, API calls)
│   └── style.css                   # Responsive styling
├── server.js                       # Express server + REST API
├── examples/
│   └── basic-usage.js              # Cloud/local/auto usage examples
├── addon/
│   ├── install.sh                  # CCU installation script
│   ├── uninstall.sh                # CCU uninstallation script
│   ├── addon.conf                  # Addon metadata
│   ├── install.conf                # Installation config
│   └── package-addon.sh            # Build packaging script
├── docs/                           # Documentation
├── specs/                          # Specifications and progress tracking
├── tests/                          # Unit and integration tests
├── schedules/                      # Runtime: schedule JSON files
├── uploads/                        # Runtime: temporary uploaded files
├── build/                          # Build output (tar.gz)
└── package.json                    # Dependencies and scripts
```
