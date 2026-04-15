# Epic 5: FRITZ!Box NAS als Dateiquelle -- Brainstorming

## Runde 1: Zugriffsmethode und Protokoll

### Frage 1.1: Primaeres Zugriffsprotokoll zur FRITZ!Box

Die FRITZ!Box bietet mehrere Moeglichkeiten auf das NAS zuzugreifen. Welches Protokoll sollen wir primaer verwenden?

```
Optionen:

FTP (Port 21)
  + Einfach zu implementieren (z.B. npm-Paket `basic-ftp`)
  + Auf CCU3 keine Systemabhaengigkeiten noetig
  + FRITZ!Box bietet FTP standardmaessig an (muss in der FRITZ!Box aktiviert werden)
  - Unverschluesselt (Klartext-Passwort im Netzwerk)
  - Manche FRITZ!Box-Modelle bieten FTPS (FTP ueber TLS)

FTPS (FTP ueber TLS)
  + Verschluesselt
  + `basic-ftp` unterstuetzt FTPS
  - Nicht alle FRITZ!Box-Modelle unterstuetzen FTPS
  - Selbstsignierte Zertifikate der FRITZ!Box erfordern rejectUnauthorized: false

SMB/CIFS
  + Standard-Netzwerkfreigabe-Protokoll
  + FRITZ!Box bietet SMB-Freigabe an
  - Auf CCU3 muesste `cifs-utils` oder `smbclient` installiert sein
  - Komplexere Implementierung (mount-Befehl oder npm-Paket)
  - Systemabhaengigkeiten auf CCU3 unklar

WebDAV (via FRITZ!Box-Webinterface)
  + HTTP-basiert, keine speziellen Systemabhaengigkeiten
  - FRITZ!Box bietet kein natives WebDAV
  - Muesste ueber TR-064/HTTP-Scraping nachgebaut werden -- fragil
```

- [x] FTP mit optionalem FTPS-Upgrade (Empfohlen) -- `basic-ftp` probiert FTPS, faellt auf FTP zurueck
- [ ] Nur FTPS (erzwungen) -- sicherer, aber weniger kompatibel
- [ ] SMB/CIFS ueber Systembefehl (`mount.cifs` / `smbclient`)
- [ ] FTP primaer + SMB als konfigurierbarer Fallback

---

### Frage 1.2: FTP-Bibliothek

Falls wir FTP/FTPS verwenden: Welche npm-Bibliothek?

```
basic-ftp (npm: basic-ftp)
  + Aktiv gepflegt, ~2M Downloads/Woche
  + Unterstuetzt FTP, FTPS, FTPS-implicit
  + Promise-basierte API
  + Keine nativen Abhaengigkeiten (rein JS)

ftp (npm: ftp)
  - Veraltet, letztes Update 2014
  - Callback-basierte API

jsftp (npm: jsftp)
  + Promise-basiert
  - Weniger Downloads, kein FTPS-Support
```

- [x] `basic-ftp` (Empfohlen)
- [ ] `jsftp`
- [ ] Eigene Implementierung ueber Node.js `net`/`tls`

---

### Frage 1.3: Authentifizierung -- Umgang mit Zugangsdaten

Die FRITZ!Box erfordert Benutzername + Passwort fuer den FTP-Zugang. Wie speichern wir diese?

- [ ] Klartext in `sources.json` mit deutlichem Hinweis in der UI (Empfohlen) -- einfach, konsistent mit der Roadmap-Entscheidung
- [x] Base64-kodiert in `sources.json` (Pseudo-Sicherheit, aber verhindert versehentliches Mitlesen)
- [ ] Umgebungsvariablen (`FRITZBOX_USER`, `FRITZBOX_PASS`)
- [ ] Eigene Datei `credentials.json` mit restriktiven Dateiberechtigungen

---

### Frage 1.4: Verbindungs-Timeout und Retry-Verhalten

FTP-Verbindungen koennen instabil sein (FRITZ!Box im WLAN, Netzwerkprobleme). Wie robust soll die Verbindungslogik sein?

- [ ] Einfach: Ein Versuch, bei Fehler sofort abbrechen mit Fehlermeldung (Empfohlen)
- [x] Ein Retry: Bei Verbindungsfehler einmal erneut versuchen nach 5 Sekunden
- [ ] Konfigurierbares Retry mit Backoff (1s, 5s, 15s)

---

### Frage 1.5: FTP-Verbindungsmanagement

Soll die FTP-Verbindung persistent gehalten werden oder pro Aktion neu aufgebaut?

- [x] Pro Aktion: Verbinden -> Aktion -> Trennen (Empfohlen) -- einfacher, robuster bei langen Pausen zwischen Aktionen
- [ ] Persistent mit Keepalive und automatischem Reconnect
- [ ] Connection Pool (Overkill fuer diesen Anwendungsfall)

---

## Runde 2: FTP-Details und sources.json-Erweiterung

### Frage 2.1: FTP-Pfadstruktur auf der FRITZ!Box

Das FRITZ!Box NAS hat eine feste Verzeichnisstruktur. Der FTP-Root zeigt typischerweise:

```
/
  FRITZ.NAS/              -- Interner Speicher der FRITZ!Box
    Musik/
    Bilder/
    Dokumente/
    ...
  USB-Stick/              -- Name des angeschlossenen USB-Sticks
    ...
  Festplatte/             -- Falls externe Festplatte angeschlossen
    ...
```

Soll der Benutzer den kompletten FTP-Pfad angeben, oder bieten wir einen Browse-Mechanismus?

- [x] Benutzer gibt Pfad manuell ein, z.B. `FRITZ.NAS/Heizung/` (Empfohlen) -- konsistent mit USB-Epic, einfach
- [ ] Browse-Button: FTP-Verzeichnisse auflisten und navigierbar in der UI darstellen
- [ ] Beides: Manuell eingeben + Browse als Hilfe

---

### Frage 2.2: sources.json Erweiterung fuer FRITZ!Box

Vorschlag fuer die FRITZ!Box-Konfiguration in `sources.json` (neben dem bestehenden `usb`-Eintrag):

```json
{
  "usb": { ... },
  "fritzbox": {
    "enabled": false,
    "host": "192.168.178.1",
    "port": 21,
    "username": "",
    "password": "",
    "path": "FRITZ.NAS/Heizung",
    "secure": true,
    "lastChecked": null,
    "files": {}
  }
}
```

Hinweis: `username` und `password` werden Base64-kodiert gespeichert (Entscheidung aus Frage 1.3).

- [x] Schema wie oben (Empfohlen)
- [ ] Ohne `port` und `secure` (weniger Optionen, FRITZ!Box ist immer Port 21)
- [ ] Anderer Vorschlag

---

### Frage 2.3: FRITZ!Box-Standardwerte

Sollen wir FRITZ!Box-typische Standardwerte vorbelegen?

```
Host:     192.168.178.1    (Standard-IP der FRITZ!Box)
Port:     21               (Standard-FTP-Port)
Username: (leer)           (FRITZ!Box-Benutzer variiert)
Pfad:     FRITZ.NAS/       (Root des internen Speichers)
```

- [ ] Ja, Host und Port vorbelegen wie oben (Empfohlen) -- die meisten Nutzer aendern die FRITZ!Box-IP nicht
- [x] Nein, alle Felder leer lassen -- Benutzer muss alles selbst eintragen
- [ ] Nur Port vorbelegen, Host leer lassen

---

### Frage 2.4: Verbindungstest in der UI

Soll die UI einen expliziten "Verbindung testen"-Button anbieten, bevor man speichert/scannt?

- [x] Ja, eigener "Verbindung testen"-Button der FTP-Login prueft und Ergebnis anzeigt (Empfohlen)
- [ ] Nein, der "Jetzt pruefen"-Button (Scan) reicht -- zeigt Fehler bei fehlgeschlagener Verbindung
- [ ] Automatischer Test beim Speichern der Konfiguration

---

### Frage 2.5: Passive vs. Active FTP

FRITZ!Box und Netzwerk-Setups funktionieren unterschiedlich mit Active vs. Passive FTP. `basic-ftp` unterstuetzt beides.

- [x] Immer Passive Mode (Empfohlen) -- funktioniert zuverlaessiger hinter NAT/Firewalls, Standard bei `basic-ftp`
- [ ] Konfigurierbar (Passive/Active) in der UI
- [ ] Active Mode als Standard

---

## Runde 3: Frontend, API und Abschluss

### Frage 3.1: UI-Layout fuer FRITZ!Box im "Dateiquellen"-Tab

Der "Dateiquellen"-Tab aus Epic 4 zeigt bereits die USB-Konfiguration. Wie soll die FRITZ!Box-Sektion daneben aussehen?

```
+----------------------------------------------------------+
| Dateiquellen                                              |
+----------------------------------------------------------+
| USB-Laufwerk                              [Aktiviert: O]  |
| (... bestehende USB-Konfiguration ...)                    |
+----------------------------------------------------------+
| FRITZ!Box NAS                             [Aktiviert: O]  |
|                                                           |
| Host:       [                    ]                        |
| Port:       [21                  ]                        |
| Benutzer:   [                    ]                        |
| Passwort:   [********           ]                        |
| Pfad:       [                    ]                        |
|                                                           |
| Hinweis: Zugangsdaten werden kodiert auf der CCU          |
| gespeichert. FTP-Zugang muss in der FRITZ!Box unter       |
| Internet > Freigaben > FTP aktiviert sein.                |
|                                                           |
| [Speichern]  [Verbindung testen]  [Jetzt pruefen]        |
|                                                           |
| Gefundene Dateien:                                        |
| +------------------------------------------------------+ |
| | Datei                  | Groesse | Geaendert | Aktion | |
| |------------------------|---------|-----------|--------| |
| | Heizplan.xlsx          | 12 KB   | 19.03.26  |[Import]| |
| +------------------------------------------------------+ |
|                                                           |
| Zuletzt geprueft: --                                      |
| Status: Nicht konfiguriert                                |
+----------------------------------------------------------+
```

- [x] Layout wie oben -- USB und FRITZ!Box untereinander im gleichen Tab (Empfohlen)
- [ ] Eigene Sub-Tabs innerhalb von "Dateiquellen" (ein Tab pro Quelle)
- [ ] Accordion/Aufklappbar -- eine Sektion pro Quelle, zuklappbar

---

### Frage 3.2: REST API -- Neue Endpunkte oder bestehende wiederverwenden?

Epic 4 definiert bereits generische Endpunkte (`/api/sources/:type/scan`, etc.). Die FRITZ!Box-Quelle braucht zusaetzlich einen Verbindungstest. Wie umsetzen?

```
Bestehende Endpunkte (aus Epic 4, funktionieren bereits fuer :type = "fritzbox"):
  GET  /api/sources                     -- Alle Quellen auflisten
  PUT  /api/sources/fritzbox            -- FRITZ!Box konfigurieren
  POST /api/sources/fritzbox/scan       -- Manueller Scan
  GET  /api/sources/fritzbox/files      -- Gefundene Dateien
  POST /api/sources/fritzbox/import     -- Datei importieren

Neuer Endpunkt:
  POST /api/sources/fritzbox/test       -- Verbindungstest
```

- [x] Ein neuer Endpunkt `POST /api/sources/:type/test` -- generisch fuer alle Quellen (Empfohlen)
- [ ] Nur fuer FRITZ!Box: `POST /api/sources/fritzbox/test`
- [ ] Kein eigener Endpunkt -- Verbindungstest als Teil von `PUT /api/sources/fritzbox` (beim Speichern testen)

---

### Frage 3.3: Fehleranzeige bei FTP-Problemen

FTP kann aus verschiedenen Gruenden fehlschlagen (falsche Zugangsdaten, FRITZ!Box nicht erreichbar, FTP nicht aktiviert, falscher Pfad). Wie detailliert sollen Fehlermeldungen sein?

- [x] Detailliert mit Hilfetext (Empfohlen) -- z.B. "Verbindung fehlgeschlagen. Bitte pruefen Sie: 1) Ist die FRITZ!Box unter 192.168.178.1 erreichbar? 2) Ist FTP in der FRITZ!Box aktiviert?"
- [ ] Nur technische Fehlermeldung weiterreichen (z.B. "ECONNREFUSED", "530 Login incorrect")
- [ ] Fehlerkategorien mit festem Hilfetext (Verbindung/Login/Pfad/Unbekannt)

---

### Frage 3.4: Sollen wir noch weitere Aspekte besprechen?

- [ ] Ja, ich habe noch Fragen oder Themen
- [x] Nein, das reicht -- bitte die Spezifikation schreiben (Empfohlen)

---
