# System Architecture

## Overview

my-homematic-addon is a three-tier Node.js application that controls Homematic IP smart home devices through either the Homematic IP Cloud API or a local CCU (Central Control Unit) via XML-RPC. It provides a web interface for uploading Excel-based heating schedules and managing device areas.

## Component Architecture

```mermaid
graph TB
    subgraph "Frontend (public/)"
        UI["index.html + app.js + style.css"]
    end

    subgraph "Express Server (server.js)"
        API["REST API<br/>14 Endpoints"]
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
        EP["ExcelParser<br/>src/parser/excelParser.js"]
        NP["NumbersParser<br/>src/parser/numbersParser.js"]
    end

    subgraph "External Systems"
        Cloud["Homematic IP Cloud<br/>ps1.homematic.com:6969"]
        CCU["Local CCU<br/>XML-RPC Port 2001"]
    end

    subgraph "Persistence (JSON files)"
        SchFiles["schedules/*.json"]
        AreasFile["areas.json"]
    end

    UI -- "Fetch API" --> API
    API --> MW
    API --> Addon
    API --> SM
    API --> AM
    API --> HP
    API --> EP
    API --> NP
    Addon --> Config
    Addon --> DC
    DC --> CC
    DC --> LC
    CC -- "HTTPS/axios" --> Cloud
    LC -- "XML-RPC" --> CCU
    SM --> SchFiles
    AM --> AreasFile
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
    ep["ExcelParser<br/>src/parser/excelParser.js"]
    np["NumbersParser<br/>src/parser/numbersParser.js"]

    server --> index
    server --> sm
    server --> am
    server --> hp
    server --> ep
    server --> np

    index --> config
    index --> cloud
    index --> local
    index --> dc

    dc --> cloud
    dc --> local

    sm --> hp
    sm --> am
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
        +setParameter(deviceId, param, value) boolean
        +getParameter(deviceId, param) any
        -_normalizeDevices(devices) Array
        -_normalizeDevice(device) object
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

| Normalized Field | Cloud Source | Local (CCU) Source |
|-----------------|-------------|-------------------|
| `id` | `device.id` | `device.ADDRESS` or `device.ID` |
| `name` | `device.label` or `device.name` | `device.NAME` |
| `type` | `device.type` | `device.TYPE` |
| `model` | `device.modelType` | `device.TYPE` |
| `firmware` | `device.firmwareVersion` | `device.FIRMWARE` |
| `channels` | `device.functionalChannels` | `[]` (not available) |

## Data Persistence

The addon uses a file-based persistence model with no database:

| Data | Storage | Format |
|------|---------|--------|
| Heating schedules | `schedules/{uuid}.json` | One JSON file per schedule |
| Area definitions | `areas.json` | Single JSON file, keyed by area name |
| Uploaded files | `uploads/` | Temporary -- deleted after parsing |

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
│   └── parser/
│       ├── excelParser.js          # Excel file parser (.xlsx/.xls)
│       └── numbersParser.js        # Apple Numbers file wrapper
├── public/
│   ├── index.html                  # Web UI (upload, areas, schedules)
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
├── schedules/                      # Runtime: schedule JSON files
├── uploads/                        # Runtime: temporary uploaded files
├── build/                          # Build output (tar.gz)
└── package.json                    # Dependencies and scripts
```
