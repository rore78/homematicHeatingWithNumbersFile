# Epic 2: Verifiziertes CCU3-Deployment -- Spezifikation

## Ziel

Sicherstellen, dass das Addon auf einer echten CCU3 (Firmware 3.75+) installiert, startet und korrekt laeuft. Am Ende dieses Epics kann ein Benutzer das tar.gz ueber die CCU3-Weboberfläche installieren und einen Heizungs-Zeitplan auf einem realen HmIP-eTRV-Thermostat ausfuehren.

## Voraussetzungen

- Epic 1 (Foundation) abgeschlossen
- CCU3 mit aktueller Firmware (3.75+)
- SSH-Zugang + Web-UI zur CCU3
- Mindestens ein HmIP-eTRV (Heizkoerperthermostat) an der CCU3 angelernt
- "Node.js fuer CCU"-Addon muss auf der CCU3 installiert werden (Voraussetzung, nicht Teil dieses Epics)

---

## 1. Build-Script ueberarbeiten (package-addon.sh)

### 1.1 node_modules vorgebundelt

Das Build-Script wird erweitert, um `node_modules/` ins tar.gz zu packen:

```bash
# Ablauf in package-addon.sh:
1. npm ci --production          # Saubere Installation nur Prod-Dependencies
2. Alles in build/ kopieren (wie bisher)
3. node_modules/ nach build/ kopieren
4. tar.gz erstellen
```

**Begruendung:** Kein Internet und kein npm auf der CCU3 noetig. Alle Abhaengigkeiten (`axios`, `express`, `multer`, `cors`, `xlsx`, `xmlrpc`, `uuid`, `ws`) sind pure JavaScript -- kein Cross-Compilation-Problem zwischen macOS (ARM64/x86_64) und CCU3 (armv7l).

### 1.2 Archiv-Struktur (flach)

Dateien liegen direkt im Archiv-Root (kein Wrapper-Verzeichnis):

```
my-homematic-addon-1.0.0.tar.gz
├── src/
├── public/
├── node_modules/
├── server.js
├── package.json
├── install.sh
├── uninstall.sh
├── addon.conf
├── schedules/
└── uploads/
```

### 1.3 Pruefung nativer Abhaengigkeiten

Im Build-Script eine Warnung einbauen, falls `.node`-Dateien (native Binaries) in node_modules gefunden werden:

```bash
NATIVE_COUNT=$(find build/node_modules -name "*.node" 2>/dev/null | wc -l)
if [ "$NATIVE_COUNT" -gt 0 ]; then
    echo "WARNUNG: $NATIVE_COUNT native Module gefunden. Diese funktionieren moeglicherweise nicht auf CCU3 (ARM)."
    find build/node_modules -name "*.node"
fi
```

---

## 2. install.sh ueberarbeiten

### 2.1 Aenderungen gegenueber aktuellem Stand

| Aspekt           | Aktuell                            | Neu                                       |
| ---------------- | ---------------------------------- | ----------------------------------------- |
| node_modules     | `npm install --production` auf CCU | Vorgebundelt, kein npm noetig             |
| Verbindungsmodus | Nicht gesetzt (auto)               | `HOMEMATIC_MODE=local` in `.env`          |
| Port             | 3000 (hardcoded)                   | 8080 (Default, konfigurierbar via `.env`) |
| CCU-Host         | Nicht gesetzt                      | `HOMEMATIC_CCU_HOST=localhost` in `.env`  |
| Node.js-Pruefung | Vorhanden                          | Beibehalten + Versionspruefung >= 18      |

### 2.2 .env-Datei Generierung

`install.sh` erzeugt bei der Installation eine `.env`-Datei im Addon-Verzeichnis:

```env
# Generiert bei Installation -- anpassbar
HOMEMATIC_MODE=local
HOMEMATIC_CCU_HOST=localhost
HOMEMATIC_CCU_PORT=2001
PORT=8080
LOG_LEVEL=info
```

Falls eine `.env` bereits existiert (Update-Szenario), wird sie **nicht ueberschrieben**, sondern nur fehlende Variablen ergaenzt.

### 2.3 npm install entfernen

Der `npm install --production` Aufruf wird aus `install.sh` entfernt, da node_modules vorgebundelt sind. Stattdessen nur eine Pruefung:

```bash
if [ ! -d "$ADDON_DIR/node_modules" ]; then
    echo "FEHLER: node_modules nicht gefunden. Paket ist beschaedigt."
    exit 1
fi
```

### 2.4 Node.js Versionspruefung

```bash
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_MAJOR" -lt 18 ]; then
    echo "FEHLER: Node.js >= 18 erforderlich (gefunden: ${NODE_VERSION:-nicht installiert})"
    echo "Bitte zuerst das 'Node.js fuer CCU'-Addon installieren."
    exit 1
fi
```

---

## 3. init.d-Service anpassen

### 3.1 Port-Aenderung

Der Default-Port aendert sich von 3000 auf 8080. Das init.d-Script liest den Port aus der `.env`-Datei.

### 3.2 Logging

Weiterhin Ausgabe nach `/var/log/my-homematic-addon.log`. Die Log-Rotation wird im Addon selbst implementiert (siehe Abschnitt 5).

### 3.3 Service-Befehle

Keine Aenderungen an Start/Stop/Restart/Status -- das aktuelle Schema bleibt.

---

## 4. Default-Port auf 8080 aendern

### 4.1 server.js

```javascript
const PORT = process.env.PORT || 8080; // war: 3000
```

### 4.2 Alle Stellen aktualisieren

- `server.js`: Port-Default
- `addon/install.sh`: init.d-Script, Ausgabe-URL
- `README.md`: Dokumentation
- `public/` Frontend: Falls der Port irgendwo hardcoded ist (unwahrscheinlich, da relative URLs)

---

## 5. Logger-Modul implementieren

### 5.1 Neues Modul: src/utils/logger.js

Ein einfaches Logger-Modul mit 4 Stufen:

```javascript
// Log-Level: debug < info < warn < error
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

class Logger {
  constructor(level = process.env.LOG_LEVEL || "info") {
    this.level = LEVELS[level] ?? LEVELS.info;
  }

  debug(message, ...args) {
    this._log("DEBUG", 0, message, ...args);
  }
  info(message, ...args) {
    this._log("INFO", 1, message, ...args);
  }
  warn(message, ...args) {
    this._log("WARN", 2, message, ...args);
  }
  error(message, ...args) {
    this._log("ERROR", 3, message, ...args);
  }

  _log(label, level, message, ...args) {
    if (level < this.level) return;
    const timestamp = new Date().toISOString();
    const output = level >= 2 ? console.error : console.log;
    output(`[${timestamp}] [${label}] ${message}`, ...args);
  }
}

export default new Logger();
```

**Konfiguration:** Ueber Umgebungsvariable `LOG_LEVEL` (debug/info/warn/error). Default: `info`.

### 5.2 Log-Rotation

Einfache Rotation beim Start des Addons in `server.js`:

```javascript
// Beim Start: Logdatei pruefen, wenn > 5 MB die aeltere Haelfte abschneiden
// (Nur relevant auf CCU3, wo stdout nach Logdatei umgeleitet wird)
```

Alternativ: Eine logrotate-Config-Datei ins Addon packen die bei der Installation nach `/etc/logrotate.d/` kopiert wird (falls logrotate auf CCU3 verfuegbar):

```
/var/log/my-homematic-addon.log {
    size 5M
    rotate 2
    compress
    missingok
    notifempty
}
```

### 5.3 Bestehende console.log-Aufrufe ersetzen

Alle `console.log`/`console.error`-Aufrufe in der Codebase durch `logger.info`/`logger.error`/etc. ersetzen.

---

## 6. Health-Check-Endpunkt

### 6.1 Neuer Endpunkt: GET /api/health

In `server.js` hinzufuegen:

```javascript
app.get("/api/health", async (req, res) => {
  const health = {
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    mode: addon.getMode(),
    ccuVerbunden: false,
    aktiveZeitplaene: 0,
  };

  try {
    // Verbindungstest zur CCU
    await addon.getDevices();
    health.ccuVerbunden = true;
  } catch (error) {
    health.ccuVerbunden = false;
    health.ccuFehler = error.message;
  }

  health.aktiveZeitplaene = scheduleManager.getActiveCount();

  const statusCode = health.ccuVerbunden ? 200 : 503;
  res.status(statusCode).json(health);
});
```

### 6.2 Response-Schema

```json
{
  "status": "ok",
  "uptime": 3600,
  "timestamp": "2026-03-22T10:00:00.000Z",
  "mode": "local",
  "ccuVerbunden": true,
  "aktiveZeitplaene": 2
}
```

Bei CCU-Verbindungsfehler: HTTP 503 mit `ccuVerbunden: false` und `ccuFehler`.

---

## 7. Installationsanleitung (README.md)

### 7.1 Neuer Abschnitt im README

```markdown
## Installation auf CCU3

### Voraussetzungen

1. CCU3 mit Firmware 3.75 oder neuer
2. "Node.js fuer CCU"-Addon installiert (Node.js >= 18)

### Installation

1. Neuestes Release herunterladen: `my-homematic-addon-X.X.X.tar.gz`
2. CCU3-Weboberfläche oeffnen → Einstellungen → Systemsteuerung → Zusatzsoftware
3. "Datei waehlen" → tar.gz auswaehlen → "Installieren"
4. Warten bis "Installation erfolgreich" erscheint
5. Web-UI oeffnen: http://[CCU-IP]:8080

### Konfiguration

Die Datei `/usr/local/addons/my-homematic-addon/.env` enthaelt die Konfiguration:

- `PORT` -- Web-UI Port (Standard: 8080)
- `LOG_LEVEL` -- Log-Detailgrad: debug, info, warn, error (Standard: info)
- `HOMEMATIC_MODE` -- Verbindungsmodus (Standard: local)
- `HOMEMATIC_CCU_HOST` -- CCU-Adresse (Standard: localhost)

### Troubleshooting

- Service-Status: `ssh root@[CCU-IP] /etc/init.d/my-homematic-addon status`
- Logs: `ssh root@[CCU-IP] tail -f /var/log/my-homematic-addon.log`
- Health-Check: `curl http://[CCU-IP]:8080/api/health`
- Neustart: `ssh root@[CCU-IP] /etc/init.d/my-homematic-addon restart`
```

---

## 8. Zusammenfassung der Datei-Aenderungen

| Datei                    | Aenderung                                                             |
| ------------------------ | --------------------------------------------------------------------- |
| `addon/package-addon.sh` | node_modules bundeln, Native-Module-Warnung                           |
| `addon/install.sh`       | npm install entfernen, .env generieren, Node >= 18 pruefen, Port 8080 |
| `addon/uninstall.sh`     | Pruefen ob Anpassungen noetig (wahrscheinlich ok)                     |
| `server.js`              | Default-Port 8080, Health-Endpunkt, Logger einbinden                  |
| `src/utils/logger.js`    | **Neu:** Logger-Modul mit 4 Stufen                                    |
| `src/**/*.js`            | console.log → logger.info/error/etc.                                  |
| `README.md`              | Installationsanleitung fuer CCU3                                      |
| `.env.example`           | **Neu:** Beispiel-Konfiguration                                       |

---

## 9. Verifikations-Checkliste

Alle folgenden Punkte muessen auf einer echten CCU3 bestehen:

- [ ] **Installation:** tar.gz ueber CCU3-Weboberfläche ("Zusatzsoftware") hochladen → "Installation erfolgreich"
- [ ] **Auto-Start:** CCU3 neustarten → Service startet automatisch
- [ ] **Web-UI:** `http://[CCU-IP]:8080` laedt die Oberflaeche
- [ ] **Geraete-Liste:** Unter "Geraete" werden die an der CCU3 angelernten HmIP-Thermostate angezeigt
- [ ] **End-to-End-Test:** Bereich erstellen → Excel-Datei mit Zeitplan hochladen → Zeitplan aktivieren → Temperatur wird am HmIP-eTRV gesetzt
- [ ] **Health-Check:** `GET /api/health` gibt Status mit `ccuVerbunden: true` zurueck
- [ ] **Logs:** `/var/log/my-homematic-addon.log` enthaelt sinnvolle Eintraege

---

## 10. Nicht im Scope

- Deinstallation ueber CCU3-Weboberfläche (spaeter)
- Addon-Update / Versionsmigration (spaeter)
- Cloud-Modus auf CCU3 (nicht sinnvoll)
- Automatische Tests auf CCU3-Hardware (manuelle Verifikation)
