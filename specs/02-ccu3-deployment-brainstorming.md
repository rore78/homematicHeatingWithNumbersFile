# Epic 2: Verifiziertes CCU3-Deployment -- Brainstorming

## Runde 1: Hardware-Umgebung und Grundvoraussetzungen

### Frage 1.1: CCU3-Hardware und Firmware

Welche CCU3-Version und Firmware hast du?

- [X] **CCU3 mit aktueller Firmware (3.75+)** -- Neueste stabile Version, beste Kompatibilitaet.
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

