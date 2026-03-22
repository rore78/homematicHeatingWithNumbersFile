# Epic 2: Verifiziertes CCU3-Deployment -- Brainstorming

## Runde 1: Hardware-Umgebung und Grundvoraussetzungen

### Frage 1.1: CCU3-Hardware und Firmware

Welche CCU3-Version und Firmware hast du?

- [x] **CCU3 mit aktueller Firmware (3.75+)** -- Neueste stabile Version, beste Kompatibilitaet.
- [ ] **CCU3 mit aelterer Firmware** -- Bitte Version angeben.
- [ ] **RaspberryMatic** -- Community-Distribution auf Raspberry Pi. Aehnlich aber nicht identisch mit original CCU3.
- [ ] **Noch keine Hardware vorhanden** -- Muss noch beschafft/eingerichtet werden.

### Frage 1.2: Node.js auf der CCU3

Das Addon benoetigt Node.js >= 18. Wie ist der Stand?

- [ ] **"Node.js fuer CCU"-Addon bereits installiert** -- Bitte Version pruefen mit `node --version` auf der CCU.
- [x] **Noch nicht installiert** -- Muss als Voraussetzung installiert werden. Verfuegbar ueber das RedMatic-Projekt oder als separates CCU-Addon.
- [ ] **Unsicher** -- Muss geprueft werden.

### Frage 1.3: Netzwerk-Zugang zur CCU3

Wie greifst du auf die CCU3 zu?

- [x] **SSH + Web-UI** (Empfohlen als Minimum) -- SSH fuer Installation/Debugging, Web-UI fuer Addon-Management. Standard-Setup.
- [ ] **Nur Web-UI** -- Kein SSH-Zugang. Installation nur ueber "Zusatzsoftware"-Upload moeglich. Debugging eingeschraenkt.

### Frage 1.4: Vorhandene Homematic IP-Geraete

Welche HmIP-Thermostat-Geraete hast du zum Testen?

- [x] **HmIP-eTRV (Heizkoerperthermostat)** -- Direkt am Heizkoerper, haeufigster Typ.
- [ ] **HmIP-WTH (Wandthermostat)** -- Wandmontage, misst Raumtemperatur.
- [ ] **HmIP-BWTH (Wandthermostat mit Feuchte)** -- Wie WTH, zusaetzlich Luftfeuchtigkeit.
- [ ] **Andere** -- Bitte angeben.

### Frage 1.5: Verbindungsmodus fuer CCU3-Betrieb

Auf der CCU3 selbst macht Cloud-Zugriff wenig Sinn (die CCU hat ja lokalen XML-RPC). Sollen wir den Modus fuer CCU3-Deployment fest auf `local` setzen?

- [x] **Ja, Standard `local` auf CCU3** (Empfohlen) -- `install.sh` setzt `HOMEMATIC_MODE=local` in der `.env`-Datei. XML-RPC auf `localhost:2001` -- kein Internet noetig, minimale Latenz.
- [ ] **Auto beibehalten** -- Der bestehende Auto-Modus bleibt. Benutzer kann manuell konfigurieren.
- [ ] **Beides anbieten, ueber Web-UI konfigurierbar** -- Settings-Seite in der Web-UI wo der Modus gewaehlt werden kann.

---

## Runde 2: Packaging und node_modules-Strategie

### Frage 2.1: node_modules Bundling

Das ist die zentrale technische Frage: `npm install --production` auf der CCU3 braucht Internet, dauert lange und kann auf der ARM-Plattform bei nativen Modulen fehlschlagen. Strategie?

- [x] **Vorgebundelt im tar.gz** (Empfohlen) -- `node_modules/` wird auf dem Entwicklungsrechner installiert (mit `--production`) und ins tar.gz gepackt. Vorteile: Kein Internet auf CCU noetig, schnelle Installation, keine Build-Fehler. Nachteil: Groesseres Archiv (~5-15 MB statt ~50 KB). **Achtung:** Native Module (z.B. `xmlrpc` nutzt intern nur JS, `xlsx` ist reines JS) -- unsere Abhaengigkeiten sind alle pure JS, daher kein Cross-Compilation-Problem.
- [ ] **npm install auf der CCU3** -- Wie bisher in `install.sh`. Braucht Internet und npm auf der CCU. Risiko: Fehler durch fehlende Build-Tools oder Netzwerkprobleme.
- [ ] **Hybrid: Vorgebundelt + npm install als Fallback** -- tar.gz enthaelt node_modules, aber install.sh prueft ob es funktioniert und macht bei Bedarf ein `npm install`.

### Frage 2.2: Cross-Platform Kompatibilitaet

Die CCU3 laeuft auf ARM (armv7l). Unser Entwicklungsrechner ist macOS/x86_64 oder ARM64. Wie gehen wir mit plattformspezifischen Abhaengigkeiten um?

- [x] **Pruefung: Alle Deps sind pure JS** (Empfohlen) -- Wir pruefen einmalig, dass keine native Abhaengigkeit existiert (`axios`, `express`, `multer`, `cors`, `xlsx`, `xmlrpc`, `uuid`, `ws` -- alle pure JS). Dann ist Cross-Platform kein Problem und wir bundlen einfach vom Dev-Rechner.
- [ ] **Docker-Build fuer ARM** -- Ein Docker-Container mit ARM-Emulation baut die node_modules. Overkill wenn alle Deps pure JS sind, aber zukunftssicher.
- [ ] **CI/CD Pipeline** -- GitHub Actions o.ae. baut das tar.gz auf einer ARM-Umgebung.

### Frage 2.3: Archiv-Struktur

Das aktuelle `package-addon.sh` packt alles auf Root-Level ins tar.gz. Die CCU3 erwartet ein bestimmtes Format fuer "Zusatzsoftware"-Upload. Was ist das korrekte Format?

```
Variante A: Flach (aktuell)
my-homematic-addon-1.0.0.tar.gz
├── src/
├── public/
├── node_modules/     (neu)
├── server.js
├── package.json
├── install.sh
├── uninstall.sh
└── addon.conf

Variante B: Mit Wrapper-Verzeichnis
my-homematic-addon-1.0.0.tar.gz
└── my-homematic-addon/
    ├── src/
    ├── public/
    ├── node_modules/
    ├── server.js
    ├── package.json
    ├── install.sh
    ├── uninstall.sh
    └── addon.conf
```

- [x] **Variante A: Flach** (Empfohlen) -- Die meisten CCU-Addons packen Dateien direkt ins Archiv-Root. Die CCU extrahiert in ein temporaeres Verzeichnis und ruft dann `install.sh` auf. Das install.sh kopiert dann nach `/usr/local/addons/my-homematic-addon/`.
- [ ] **Variante B: Mit Wrapper** -- Manche Addons nutzen ein Wrapper-Verzeichnis. Muesste im `install.sh` beruecksichtigt werden.
- [ ] **Unsicher, muss getestet werden** -- Beides ausprobieren und schauen was die CCU3 akzeptiert.

---

## Runde 3: Service-Management, Logging und Port

### Frage 3.1: Port-Wahl

Aktuell laeuft der Server auf Port 3000. Auf der CCU3 koennten andere Dienste diesen Port nutzen (z.B. RedMatic/Node-RED nutzt auch 1880 oder 3000).

- [ ] **Port 8080** (Empfohlen) -- Seltener belegt, ueber 1024 (kein root noetig). Standard-Alternativ-HTTP-Port.
- [ ] **Port 3000 beibehalten** -- Wie bisher. Einfach, aber Kollisionsgefahr mit RedMatic.
- [x] **Konfigurierbarer Port mit Default 8080** -- Default 8080, aber ueber `.env` oder Web-UI aenderbar.
- [ ] **Hoher Port (z.B. 48080)** -- Minimale Kollisionsgefahr, aber schwerer zu merken.

### Frage 3.2: Logging-Strategie

Das aktuelle init.d-Script leitet alles nach `/var/log/my-homematic-addon.log`. Reicht das?

- [x] **Einfaches Logfile mit Rotation** (Empfohlen) -- Weiterhin `/var/log/my-homematic-addon.log`, aber mit einfacher Groessenbegrenzung (z.B. logrotate-Config oder manuell im Addon: wenn > 5 MB, aeltere Haelfte abschneiden). CCU3 hat begrenzten Speicher.
- [ ] **Nur stdout/stderr** -- Kein explizites Logfile. Logs nur sichtbar ueber `journalctl` oder beim manuellen Starten. Schwieriger zu debuggen.
- [ ] **Strukturiertes Logging (JSON)** -- Maschinenlesbares Format. Overkill fuer ein Addon.

### Frage 3.3: Log-Level

Soll das Addon verschiedene Log-Level unterstuetzen?

- [ ] **Einfach: INFO + ERROR** (Empfohlen) -- Zwei Stufen reichen: Normale Meldungen (Start, Zeitplan-Ausfuehrung, Polling) und Fehler. Konfigurierbar ueber Umgebungsvariable `LOG_LEVEL=debug` fuer Fehlersuche.
- [x] **Voll: DEBUG/INFO/WARN/ERROR** -- Klassische 4 Stufen. Mehr Kontrolle, aber mehr Aufwand.
- [ ] **Kein Log-Level** -- Alles loggen, immer. Am einfachsten.

### Frage 3.4: Health-Check / Status-Endpunkt

Soll das Addon einen Health-Check-Endpunkt haben?

- [x] **Ja, GET /api/health** (Empfohlen) -- Gibt Status zurueck: Addon laeuft, Verbindung zur CCU OK/nicht OK, Anzahl aktive Zeitplaene, Uptime. Nuetzlich fuer Monitoring und Debugging.
- [ ] **Nein** -- Nicht noetig, `service status` reicht.

---

## Runde 4: Installationsprozess und Verifikation

### Frage 4.1: Installationsmethode

Wie soll das Addon primaer installiert werden?

- [x] **CCU3 Web-UI ("Zusatzsoftware")** (Empfohlen) -- Standard-Weg: tar.gz ueber die CCU3-Weboberfläche hochladen. Benutzerfreundlich, kein SSH noetig.
- [ ] **SSH + manuelles Entpacken** -- Fuer Entwickler: `scp` + `tar xzf` + `./install.sh`. Schneller beim Iterieren.
- [ ] **Beides dokumentieren** -- Primaer Web-UI, SSH als Alternative fuer Entwickler.

### Frage 4.2: Verifikations-Checkliste

Was muss alles funktionieren damit Epic 2 als "fertig" gilt? (Mehrfachauswahl)

- [x] **Addon installiert sich ueber CCU3-Weboberfläche**
- [x] **Service startet automatisch nach Reboot**
- [x] **Web-UI erreichbar unter http://[CCU-IP]:[PORT]**
- [x] **Geraete werden von lokaler CCU aufgelistet**
- [x] **Bereich erstellen + Excel-Upload + Zeitplan aktivieren + Temperatur wird gesetzt**
- [ ] **Deinstallation ueber CCU3-Weboberfläche funktioniert sauber**
- [ ] **Addon-Update (neue Version drueber installieren) funktioniert**

### Frage 4.3: Dokumentation

Welche Doku soll entstehen?

- [x] **Installationsanleitung in README** (Empfohlen) -- Schritt-fuer-Schritt im bestehenden README.md: Voraussetzungen, Download, Installation, Erstkonfiguration, Troubleshooting.
- [ ] **Separate INSTALL.md** -- Eigene Datei nur fuer Installation. Hält README kompakt.
- [ ] **Wiki/Confluence** -- Externe Dokumentation.

### Frage 4.4: Gibt es noch offene Punkte, oder koennen wir zur Spezifikation uebergehen?

- [x] **Alles klar, schreibe die Spezifikation** -- Alle Entscheidungen sind getroffen.
- [ ] **Weitere Fragen** -- Bitte als Kommentar angeben.
