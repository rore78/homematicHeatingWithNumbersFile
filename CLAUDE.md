# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run server       # Start Express web server on port 3000
npm run start        # Run addon directly (src/index.js, programmatic use)
npm run example      # Run examples/basic-usage.js

# Build deployable CCU addon package
./addon/package-addon.sh   # Creates build/my-homematic-addon-1.0.0.tar.gz
```

No test framework is configured. No linter or formatter is set up.

## Architecture

This is a Node.js ES Module project (`"type": "module"`) for controlling Homematic IP smart home devices. It supports two connection modes:

- **Cloud**: REST API via axios to `ps1.homematic.com:6969` (Bearer token auth)
- **Local**: XML-RPC via `xmlrpc` to CCU on port 2001

### Key Design Pattern: Dual-Client Abstraction

`DeviceController` (`src/devices/deviceController.js`) wraps both `CloudClient` and `LocalClient` behind a unified interface. It detects the client type via `instanceof` and normalizes device data from both formats into a common structure. The cloud and local clients use different field names (e.g., `device.id` vs `device.ADDRESS`, `SET_POINT_TEMPERATURE` vs `SET_TEMPERATURE`).

### Entry Points

- **`server.js`** — Express web server with 14 REST endpoints, serves the frontend, orchestrates all modules. This is the main runtime entry point.
- **`src/index.js`** — `HomematicIPAddon` class that composes Config → Client → DeviceController. Exported for programmatic use.

### Module Relationships

`server.js` imports and wires together all modules:

- `HomematicIPAddon` + `Config` for device access
- `ScheduleManager` for schedule CRUD + 60-second execution loop
- `AreaManager` for mapping area names to device IDs (persisted in `areas.json`)
- `ExcelParser` / `NumbersParser` for spreadsheet upload parsing
- `HeatingProfile` for predefined temperature profiles (Komfort=21°, Nacht=17°, Abwesenheit=16°, Reduziert=19°)

`ScheduleManager` internally uses `AreaManager` (to resolve area names → device IDs) and `HeatingProfile` (to resolve profile names → temperatures).

### Connection Mode Resolution

`Config.getMode()` determines the mode: explicit `cloud`/`local` checks config availability, `auto` (default) prefers cloud over local. Config reads from constructor params, then falls back to `HOMEMATIC_*` environment variables.

### Persistence

File-based, no database:

- `schedules/{uuid}.json` — one file per schedule
- `areas.json` — all area definitions
- `uploads/` — temporary (deleted after parsing)

### Frontend

Vanilla HTML/CSS/JS in `public/` — no framework, no build step. Uses Fetch API to communicate with the Express backend.

## Language

The codebase uses German for user-facing strings, error messages, comments, and JSDoc. All API error responses are in German. Maintain this convention.
