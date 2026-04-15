# Epic 9: HCU Connect API Plugin -- Brainstorming

## Kontext

Das Addon wurde bisher als CCU3-Addon (tar.gz + update_script + XML-RPC) entwickelt. Der Benutzer hat jedoch eine **HCU (Home Control Unit)** -- die neuere Homematic IP Hardware. Die HCU unterstuetzt **keine** CCU3-tar.gz-Addons. Stattdessen nutzt sie Docker-basierte Plugins mit der **Connect API** (WebSocket auf Port 9001).

### Ist-Zustand

| Komponente  | Aktuell                        | HCU-Anforderung                             |
| ----------- | ------------------------------ | ------------------------------------------- |
| Paketformat | tar.gz + update_script         | Docker-Container (linux/arm64)              |
| Lokale API  | XML-RPC (Port 2001)            | WebSocket Connect API (Port 9001)           |
| Cloud API   | REST/axios (ps1.homematic.com) | Nicht betroffen                             |
| Deployment  | CCU3 Zusatzsoftware            | HCU Plugin-System                           |
| Auth lokal  | Keine (CCU3 lokal ohne Auth)   | Auth-Token + Plugin-ID via WebSocket-Header |

### API-Dokumentation

Vollstaendige Referenz: `docs/connect-api-documentation-1.0.0.html`
Claude-Skill-Referenz: `.claude/skills/connect-api/SKILL.md`

---

## Runde 1: Architektur & Strategie

### Frage 1.1: Soll die CCU3-Unterstuetzung erhalten bleiben?

Das Addon unterstuetzt aktuell zwei Modi (Cloud + Local/CCU3). Die HCU waere ein dritter Modus.

- [ ] **Tri-Mode: Cloud + CCU3 + HCU** (Empfohlen) -- Alle drei Verbindungsmodi bleiben erhalten. Ein neuer `ConnectApiClient` wird neben `CloudClient` und `LocalClient` implementiert. `Config.getMode()` wird um `hcu` erweitert. Maximal kompatibel, bewaehrte Architektur.
- [x] **Nur HCU + Cloud** -- CCU3/XML-RPC-Support entfernen und durch die Connect API ersetzen. Einfacher, aber bricht bestehende CCU3-Installationen.
- [ ] **Nur HCU** -- Reines Connect API Plugin. Cloud- und CCU3-Support entfernen. Minimaler Code, aber stark eingeschraenkt.

### Frage 1.2: Wie soll der ConnectApiClient implementiert werden?

Die Connect API nutzt WebSocket (bidirektional) statt Request/Response (HTTP). Das aendert das Kommunikationsmuster grundlegend.

- [ ] **Eigene Klasse `ConnectApiClient`** (Empfohlen) -- Neue Datei `src/connect/connectApiClient.js` die das gleiche Interface wie `CloudClient`/`LocalClient` exponiert (`getDevices()`, `setTemperature()`, etc.), intern aber WebSocket + PluginMessage-Envelope nutzt. `DeviceController` erkennt den Client-Typ und normalisiert die Daten.
- [x] **Adapter-Pattern** -- Generisches `HmipClient`-Interface definieren, alle drei Clients implementieren es. Mehr Refactoring, aber sauberere Architektur.
- [ ] **Direktintegration** -- Connect API direkt in `DeviceController` integrieren ohne eigene Client-Klasse. Schneller, aber unuebersichtlich.

### Frage 1.3: Wie wird das Plugin auf die HCU deployed?

Die HCU erwartet Docker-Container mit spezifischem Base-Image und Metadaten-LABEL.

- [ ] **Dockerfile + Build-Script** (Empfohlen) -- Neues `Dockerfile` fuer `linux/arm64` mit Base-Image `ghcr.io/homematicip/alpine-node-simple:0.0.1`. Neues Build-Script `addon/package-hcu-plugin.sh` das den Docker-Container baut. Das bestehende `package-addon.sh` fuer CCU3 bleibt erhalten.
- [x] **Nur Dockerfile** -- Ersetze das CCU3-Build-Script komplett durch Docker-basiertes Deployment. Einfacher, aber CCU3-Support geht verloren.
- [ ] **Multi-Stage Dockerfile** -- Ein einzelnes Dockerfile das sowohl fuer lokale Entwicklung als auch fuer HCU-Deployment genutzt wird (z.B. mit Build-Target-Argument).

### Frage 1.4: Wie soll die Authentifizierung ablaufen?

Die Connect API hat einen 3-Schritt-Auth-Flow (Aktivierungsschluessel → Token → Bestaetigung). Installierte Plugins lesen den Token aus `/TOKEN`.

- [x] **Automatisch fuer installierte Plugins, manueller Setup fuer Remote** (Empfohlen) -- Im Container: Token aus `/TOKEN` lesen (automatisch von der HCU bereitgestellt). Fuer Remote-Entwicklung: Auth-Flow in der Web-UI implementieren (Aktivierungsschluessel eingeben, Token anfordern/bestaetigen, Token speichern).
- [ ] **Nur Container-Auth** -- Nur den installierten Modus unterstuetzen (Token aus `/TOKEN`). Einfacher, aber erschwert die Entwicklung.
- [ ] **Konfigurationsdatei** -- Token manuell in `.env` oder Config-Datei eintragen. Einfachster Ansatz, aber schlechte UX.

---

## Runde 2: Plugin-Lebenszyklus & Features

### Frage 2.1: Welche Plugin-Nachrichten muessen implementiert werden?

Die Connect API hat 28 Nachrichtentypen. Nicht alle sind fuer dieses Addon relevant.

- [x] **Minimaler Satz fuer Heizungssteuerung** (Empfohlen) -- Nur die Nachrichten implementieren die das Addon braucht: `PLUGIN_STATE_REQUEST/RESPONSE` (Pflicht), `HMIP_SYSTEM_REQUEST/RESPONSE` (Geraetesteuerung), `HMIP_SYSTEM_EVENT` (Status-Updates), `CONFIG_TEMPLATE_REQUEST/RESPONSE` + `CONFIG_UPDATE_REQUEST/RESPONSE` (Plugin-Konfiguration in der HCU-UI). Kein Device-Discovery/Inclusion (wir steuern nur bestehende HmIP-Geraete).
- [ ] **Vollstaendige Implementierung** -- Alle 28 Nachrichtentypen implementieren, einschliesslich Device-Discovery, User-Messages, etc. Maximale Flexibilitaet, aber viel Aufwand fuer nicht benoetigte Features.
- [ ] **Absolutes Minimum** -- Nur `PLUGIN_STATE` + `HMIP_SYSTEM_REQUEST`. Keine Events, keine Plugin-Konfiguration. Schnell implementiert, aber keine Live-Updates und keine Konfiguration ueber die HCU-UI.

### Frage 2.2: Soll die Plugin-Konfiguration ueber die HCU-UI erfolgen?

Die Connect API unterstuetzt ein Konfigurations-Template (PropertyTemplate/GroupTemplate) das in der HCU-Web-UI angezeigt wird.

- [x] **Ja, Basiskonfiguration ueber HCU-UI** (Empfohlen) -- Folgende Einstellungen ueber die HCU-UI konfigurierbar machen: Dateiquellen-Pfade, Polling-Intervall, Standard-Temperaturprofile. Die eigene Web-UI (`public/`) bleibt zusaetzlich fuer erweiterte Funktionen (Zeitplan-Upload, Bereiche verwalten). PropertyType: STRING, INTEGER, BOOLEAN.
- [ ] **Nein, nur eigene Web-UI** -- Gesamte Konfiguration ueber die eigene Express-Web-UI. Die HCU zeigt nur einen Link zur Web-UI. Einfacher, aber weniger HCU-nativ.
- [ ] **Vollstaendig ueber HCU-UI** -- Alle Konfigurationen ueber die HCU-UI, eigene Web-UI nur fuer Monitoring. Maximale Integration, aber PropertyTemplates sind eingeschraenkt (kein File-Upload, keine komplexen UIs).

### Frage 2.3: Sollen System-Events empfangen werden?

Mit `hmip-system-events: true` Header empfaengt das Plugin Push-Events bei Geraete-/Gruppensteuerung.

- [x] **Ja, fuer Live-Status-Updates** (Empfohlen) -- Events empfangen um den lokalen Geraetestatus aktuell zu halten, ohne staendig `getSystemState` abfragen zu muessen. Relevant fuer: `DEVICE_CHANGED` (Temperatur-Aenderungen), `GROUP_CHANGED` (Heizgruppen-Status). Reduziert Last und verbessert Reaktionszeit.
- [ ] **Nein, nur Polling** -- Systemstatus nur bei Bedarf abfragen (z.B. vor jeder Zeitplan-Ausfuehrung). Einfacher zu implementieren, aber hoehere Latenz und mehr Netzwerkverkehr.

### Frage 2.4: Welche HmIP System Requests werden benoetigt?

Fuer die Heizungssteuerung gibt es relevante Endpunkte unter verschiedenen Pfaden.

- [x] **Heizungssteuerung + Home-Status** (Empfohlen) -- `/hmip/home/getSystemState` (Initialer Systemstatus), `/hmip/group/heating/setSetPointTemperature` (Temperatur setzen), `/hmip/group/heating/setBoost` (Boost-Modus), `/hmip/group/heating/setActiveProfile` (Heizprofil aktivieren), `/hmip/group/heating/setControlMode` (Auto/Manuell), `/hmip/home/heating/activateAbsencePermanent` + `deactivateAbsence` (Abwesenheit). Optional: `/hmip/device/control/setSwitchState` fuer Schaltaktoren.
- [ ] **Nur Temperatur** -- Nur `getSystemState` + `setSetPointTemperature`. Minimal, aber deckt den Hauptanwendungsfall ab.
- [ ] **Alles** -- Alle 101 System-Request-Endpunkte mappen. Enormer Aufwand, nicht noetig fuer das Addon.

---

## Runde 3: Deployment & Integration

### Frage 3.1: Wie soll die eigene Web-UI erreichbar sein?

Im Docker-Container muss der Express-Server auf einem erlaubten Port laufen (>1024, nicht reserviert).

- [ ] **Port 8080 im Container, Reverse-Proxy ueber HCU** (Empfohlen) -- Express-Server laeuft auf Port 8080 im Container. Der Container exponiert Port 8080. Die HCU leitet Anfragen an `/addons/my-homematic-addon/` per Reverse-Proxy weiter (konfiguriert via `update_script`/Docker-Setup). Nutzer greifen ueber die HCU-URL zu.
- [ ] **Eigener Port direkt** -- Express-Server auf eigenem Port (z.B. 8080) direkt erreichbar. Nutzer muessen `http://hcu-ip:8080` aufrufen. Einfacher, aber nicht in die HCU-UI integriert.
- [x] **Nur HCU-UI** -- Keine eigene Web-UI im Container. Gesamte Interaktion ueber die HCU-Plugin-Konfiguration. Stark eingeschraenkt.

### Frage 3.2: Wie sollen persistente Daten gespeichert werden?

Im Docker-Container ist nur `/data` persistent (gemountet von der HCU).

- [x] **Alles in /data** (Empfohlen) -- Zeitplaene (`/data/schedules/`), Bereiche (`/data/areas.json`), Konfiguration (`/data/.env`), Uploads (`/data/uploads/`). Ueberlebt Container-Updates. Bestehende Pfade im Code per Umgebungsvariable konfigurierbar machen.
- [ ] **Mischung** -- Nur Konfiguration in `/data`, Zeitplaene und Bereiche im Container-Filesystem. Einfacher zu implementieren, aber Daten gehen bei Container-Update verloren.

### Frage 3.3: Welches Basis-Image und Build-Strategie?

- [x] **Alpine Node.js (offizielles HCU-Image)** (Empfohlen) -- `ghcr.io/homematicip/alpine-node-simple:0.0.1` wie in der Connect API Doku empfohlen. Garantiert Kompatibilitaet mit der HCU. Multi-Stage Build: Stage 1 fuer `npm ci --production`, Stage 2 kopiert nur die benoetigten Dateien.
- [ ] **Eigenes Node.js Alpine Image** -- `node:20-alpine` als Basis. Mehr Kontrolle ueber Node.js-Version, aber moeglicherweise Kompatibilitaetsprobleme mit der HCU.

### Frage 3.4: Soll es noch weitere Fragen geben, oder sind alle Aspekte abgedeckt?

- [x] **Alles klar, schreibe die Spezifikation** -- Alle Entscheidungen sind getroffen.
- [ ] **Weitere Fragen** -- Ich habe noch offene Punkte (bitte als Kommentar angeben).
