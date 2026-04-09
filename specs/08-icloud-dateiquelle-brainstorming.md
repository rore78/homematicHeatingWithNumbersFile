# Epic 8: iCloud als Dateiquelle (Experimentell) -- Brainstorming

## Kontext

Das Addon kann bereits Dateien von USB-Laufwerken (Epic 4) und FRITZ!Box NAS via FTP (Epic 5) lesen, gesteuert durch die Polling Engine (Epic 7). Alle Dateiquellen implementieren das `FileSource`-Interface (`listFiles()`, `readFile()`, `getChecksum()`, `isAvailable()`, `getType()`, `getConfig()`).

Epic 8 ist die **komplexeste und fragilste** Dateiquellen-Integration: Zugriff auf Tabellendateien in iCloud Drive. Die Herausforderung liegt in Apples geschlossenem Oekosystem -- es gibt keine offizielle API fuer Drittanbieter, 2FA ist obligatorisch, und Session-Tokens koennen jederzeit ablaufen.

### Die drei im Roadmap genannten Ansaetze:

```
Ansatz A: Apple-ID + App-spezifisches Passwort + iCloud Web-Session
  Die CCU3 meldet sich wie ein Browser bei icloud.com an und greift auf Drive zu.
  + Vollautomatisch nach Setup
  + Fuegt sich in die Polling Engine ein
  - Apple aendert die Web-API regelmaessig (undokumentiert)
  - 2FA-Handling komplex (Session-Token, Trust-Token, Re-Auth)
  - Abhaengig von inoffiziellen Reverse-Engineering-Bibliotheken
  - Apple koennte den Zugang jederzeit blockieren

Ansatz B: WebDAV-Endpunkt
  Apple bot frueher WebDAV-Zugang zu iCloud Drive an.
  + Standard-Protokoll, einfach zu implementieren
  - Apple hat WebDAV-Zugang seit ~2022 effektiv deaktiviert
  - Funktioniert nicht mehr zuverlaessig
  - Keine Zukunftssicherheit

Ansatz C: Push-Relay (iOS-Kurzbefehl / Sync-Agent)
  Ein Apple-Geraet (iPhone/Mac) sendet die Datei per HTTP an den Addon-Endpunkt.
  + Umgeht alle iCloud-API-Probleme
  + Zuverlaessig: Apple-eigene Mechanismen fuer Dateizugriff
  + Keine Abhaengigkeit von undokumentierten APIs
  - Benutzer braucht ein Apple-Geraet das den Kurzbefehl ausfuehrt
  - Nicht vollautomatisch (Kurzbefehl muss getriggert werden)
  - Erfordert Netzwerkzugang vom Apple-Geraet zur CCU3
```

---

## Runde 1: Grundsatzentscheidung -- Welcher Ansatz?

### Frage 1.1: Welcher Ansatz soll implementiert werden?

Dies ist die wichtigste Entscheidung fuer Epic 8. Sie bestimmt Komplexitaet, Zuverlaessigkeit und Benutzererlebnis.

```
Option A: Nur iCloud Web-Session (direkter Zugriff)
  Implementierung einer IcloudFileSource die sich via Web-Session bei iCloud anmeldet.
  + Passt perfekt ins FileSource/Polling-Pattern
  + Vollautomatisch
  - Hohe Komplexitaet, fragil
  - Bibliotheken wie "icloud-js" oder Python "pyicloud" sind inoffiziell
  - Node.js-Optionen auf CCU3 (ARM) begrenzt
  - Apple kann jederzeit brechen

Option B: Nur Push-Relay (Kurzbefehl schickt Datei)
  Kein iCloud-Zugriff von der CCU3. Stattdessen ein HTTP-Endpunkt
  der Dateien entgegennimmt + iOS-Kurzbefehl der die Datei sendet.
  + Einfach, robust, zuverlaessig
  + Nutzt Apple-eigene Mechanismen (Kurzbefehle haben vollen iCloud-Zugriff)
  + Kein 2FA-Problem, keine Session-Tokens
  + Funktioniert auch mit anderen Push-Quellen (Hazel auf Mac, cron-Script, etc.)
  - Nicht voll automatisch (Kurzbefehl muss getriggert werden)
  - Benutzer muss Kurzbefehl einrichten

Option C: Push-Relay als Primaerloesung + iCloud Web-Session als experimenteller Zusatz
  Push-Relay wird als stabile Loesung implementiert.
  iCloud Web-Session wird als zusaetzliche experimentelle Option angeboten.
  + Benutzer hat eine zuverlaessige Option
  + Wer es braucht kann die experimentelle Web-Session nutzen
  - Doppelter Implementierungsaufwand

Option D: Nur Push-Relay + Kurzbefehl-Automatisierung (iOS-Automation)
  Wie Option B, aber der Kurzbefehl wird als iOS-Automation eingerichtet
  die automatisch laeuft (z.B. "Wenn Datei in iCloud-Ordner geaendert wird"
  oder zeitgesteuert alle X Stunden).
  + So automatisch wie moeglich ohne iCloud-API
  + Robust und zuverlaessig
  + iOS-Automationen koennen im Hintergrund laufen
  - Limitiert auf iOS-Automations-Trigger (Uhrzeit, Standort, NFC, etc.)
  - "Datei geaendert" ist kein Standard-Trigger in iOS-Automationen
  - Benutzer muss Automation einrichten
```

- [x] Option A: Nur iCloud Web-Session
- [ ] Option B: Nur Push-Relay (Empfohlen)
- [ ] Option C: Push-Relay + experimentelle Web-Session
- [ ] Option D: Push-Relay + Kurzbefehl-Automatisierung

---

### Frage 1.2: Soll der Push-Endpunkt generisch oder iCloud-spezifisch sein?

Unabhaengig vom Ansatz brauchen wir wahrscheinlich einen HTTP-Endpunkt der Dateien entgegennimmt. Wie generisch soll dieser sein?

```
Option A: Generischer Push-Endpunkt fuer beliebige Quellen
  POST /api/sources/push/upload
  Akzeptiert jede .xlsx/.numbers-Datei von jeder Quelle.
  + Wiederverwendbar: Nicht nur iCloud, sondern jede externe Automatisierung
  + Hazel auf Mac, cron-Jobs, andere Sync-Tools koennen alle denselben Endpunkt nutzen
  + Einfaches Interface: Datei hochladen, fertig

Option B: iCloud-spezifischer Endpunkt
  POST /api/sources/icloud/upload
  Speziell fuer iCloud-Push, mit iCloud-spezifischer Logik.
  - Weniger wiederverwendbar
  - Die Datei kommt ja nicht "von iCloud" sondern von einem Apple-Geraet

Option C: Bestehenden Upload-Endpunkt erweitern
  POST /api/upload bereits existiert (fuer manuellen Browser-Upload).
  Diesen um Auto-Import-Logik erweitern.
  + Kein neuer Endpunkt
  - Vermischt manuellen Upload mit automatisiertem Push
  - Bestehender Endpunkt gibt nur geparste Daten zurueck, erstellt keinen Zeitplan
```

- [x] Option A: Generischer Push-Endpunkt (Empfohlen)
- [ ] Option B: iCloud-spezifischer Endpunkt
- [ ] Option C: Bestehenden Upload erweitern

---

### Frage 1.3: Wie soll der Push-Endpunkt authentifiziert werden?

Der Push-Endpunkt ist aus dem Netzwerk erreichbar. Ohne Schutz koennte jeder Dateien einschleusen.

```
Option A: API-Key (Bearer Token)
  Server generiert einen zufaelligen API-Key bei Einrichtung.
  Kurzbefehl sendet: Authorization: Bearer <key>
  + Einfach, bewaehrt
  + Leicht in iOS-Kurzbefehl einzubinden
  + Key kann in der UI regeneriert werden

Option B: Shared Secret als Query-Parameter
  POST /api/sources/push/upload?secret=abc123
  + Noch einfacher im Kurzbefehl einzurichten (nur URL aendern)
  - Secret in URL ist weniger sicher (Logs, Browser-History)
  - Aber: Nur im lokalen Netzwerk, kein Internet-Facing

Option C: Kein Schutz (nur lokales Netzwerk)
  + Einfachste Loesung
  - Unsicher: Jedes Geraet im LAN kann Dateien einschleusen
  - Kein Best Practice
```

- [x] Option A: API-Key als Bearer Token (Empfohlen)
- [ ] Option B: Shared Secret als Query-Parameter
- [ ] Option C: Kein Schutz

---

## Runde 2: iCloud Web-Session -- Technologie und Authentifizierung

### Frage 2.1: Welche Bibliothek/Technologie fuer den iCloud-Zugriff?

Die CCU3 hat Node.js (ARM) und moeglicherweise Python. Es gibt verschiedene Ansaetze um auf iCloud Drive zuzugreifen:

```
Option A: icloud-js (Node.js, npm-Paket "icloud-js" oder "apple-icloud")
  Inoffizielle Node.js-Bibliothek die die iCloud Web-API nutzt.
  + Bleibt im Node.js-Oekosystem -- kein Python noetig
  + Direkter Import im bestehenden Code
  - Wenige Maintainer, koennte verwaist werden
  - iCloud Web-API ist undokumentiert und aendert sich
  - Muss auf ARM/CCU3 funktionieren (keine nativen Abhaengigkeiten)

Option B: pyicloud via child_process (Python-Bridge)
  Python-Bibliothek "pyicloud" -- am weitesten verbreitet und aktiv gepflegt.
  Node.js ruft Python-Script via child_process auf.
  + Aktivste Community, schnellste Anpassung bei Apple-Aenderungen
  + Bewaehrt (seit 2014, tausende Nutzer)
  + Unterstuetzt 2FA, Session-Caching, Drive-Zugriff
  - Python muss auf CCU3 verfuegbar sein (oder mitgeliefert werden)
  - Zusaetzliche Abhaengigkeit und Komplexitaet
  - Inter-Process-Kommunikation noetig

Option C: Eigene Implementierung (HTTP-Requests an iCloud Web-API)
  Direkter Zugriff auf Apples undokumentierte Web-Endpoints via fetch/axios.
  + Keine externe Abhaengigkeit
  + Volle Kontrolle
  - Enorm aufwaendig: Login, 2FA, Session-Management, Drive-API
  - Muss bei jeder Apple-Aenderung angepasst werden
  - Keine Community die Fixes liefert

Option D: Hybrid -- eigener minimaler Client basierend auf pyicloud-Dokumentation
  Nachbau der essentiellen pyicloud-Logik in Node.js, fokussiert nur auf:
  Login → 2FA → Session → Drive-Ordner listen → Datei herunterladen
  + Kein Python noetig
  + Schlanker als vollstaendige Bibliothek
  - Gleiche Fragilität wie Option C
  - Weniger getestet als pyicloud
```

- [ ] Option A: icloud-js (Node.js npm-Paket)
- [x] Option B: pyicloud via Python-Bridge (Empfohlen)
- [ ] Option C: Eigene Implementierung
- [ ] Option D: Hybrid -- minimaler Node.js-Client

---

### Frage 2.2: Wie soll die Zwei-Faktor-Authentifizierung gehandhabt werden?

Apple erfordert 2FA fuer alle Apple-IDs. Der initiale Login sendet einen 6-stelligen Code an ein vertrauenswuerdiges Geraet (iPhone/Mac). Danach kann ein Session/Trust-Token gespeichert werden.

```
Option A: Einmaliger 2FA-Setup in der Web-UI
  1. Benutzer gibt Apple-ID + App-spezifisches Passwort in der UI ein
  2. Server startet Login → Apple sendet 2FA-Code ans iPhone
  3. Benutzer gibt 2FA-Code in der UI ein
  4. Server verifiziert → Session-Token wird gespeichert
  5. Polling nutzt den gespeicherten Token (kein erneuter 2FA-Code)
  6. Token-Refresh automatisch im Hintergrund

  Flow in der UI:
  ┌────────────────────────────────────────────────────┐
  │ iCloud Drive (Experimentell)                        │
  │                                                     │
  │ Schritt 1: Anmelden                                 │
  │ Apple-ID:  [                          ]              │
  │ Passwort:  [                          ]              │
  │ (App-spezifisches Passwort empfohlen)               │
  │                                    [Anmelden]        │
  │                                                     │
  │ Schritt 2: Zwei-Faktor-Code                         │
  │ Ein Code wurde an Ihre Apple-Geraete gesendet.      │
  │ 2FA-Code:  [______]      [Bestaetigen]              │
  │                                                     │
  │ Schritt 3: Verbunden ✓                              │
  │ Session gueltig bis: ~22.04.2026                    │
  │ iCloud-Pfad: [/Heizung              ]               │
  └────────────────────────────────────────────────────┘

  + Benutzerfreundlich
  + Standard-Ansatz fuer iCloud-Integration
  - Erfordert Multi-Schritt-UI-Flow
  - Token kann ablaufen → Re-Auth noetig

Option B: App-spezifisches Passwort ohne 2FA-Prompt
  Apple bietet "App-spezifische Passwoerter" (appleid.apple.com).
  Falls die iCloud-API damit ohne 2FA-Code funktioniert:
  + Kein 2FA-Code in der UI noetig
  + Einmal einrichten, laeuft dauerhaft
  - Nicht alle iCloud-APIs akzeptieren App-spezifische Passwoerter
  - Drive-Zugriff erfordert moeglicherweise trotzdem 2FA

Option C: Nur Session-Token manuell eintragen
  Benutzer generiert den Token extern (z.B. auf einem Mac) und kopiert ihn in die UI.
  + Einfachste Server-Implementierung
  - Schlechte UX: Benutzer muss wissen was ein Token ist
  - Token-Refresh muss manuell erfolgen
```

- [x] Option A: 2FA-Setup-Flow in der Web-UI (Empfohlen)
- [ ] Option B: App-spezifisches Passwort ohne 2FA
- [ ] Option C: Manueller Token-Eintrag

---

### Frage 2.3: Wie sollen Session-Tokens gespeichert und aktualisiert werden?

Nach erfolgreicher 2FA-Authentifizierung hat der Server ein Session-Token (und ggf. ein Trust-Token). Diese muessen persistent gespeichert werden.

```
Option A: In sources.json (wie FRITZ!Box-Zugangsdaten)
  Tokens werden Base64-kodiert in sources.json unter "icloud" gespeichert.
  + Konsistent mit FRITZ!Box-Passwort-Speicherung
  + Eine Datei fuer alle Quellen-Konfiguration
  - Tokens sind groesser als ein Passwort
  - sources.json wird bei jedem Config-Save geschrieben

Option B: Eigene Datei icloud-session.json
  Dedizierte Datei nur fuer iCloud-Session-Daten.
  + Klare Trennung: Config vs. Session
  + Token-Refresh aendert nicht die Quellen-Config
  + Kann unabhaengig geloescht werden (Reset)
  - Zusaetzliche Datei

Option C: Cookies-Datei (wie pyicloud es intern macht)
  pyicloud speichert Cookies/Session in einem Verzeichnis.
  Falls Python-Bridge: pyicloud verwaltet das selbst.
  + Automatisch wenn pyicloud genutzt wird
  + Bewaehrter Mechanismus
  - Nur relevant bei Python-Bridge-Ansatz
  - Weniger Kontrolle ueber das Format
```

- [ ] Option A: In sources.json
- [x] Option B: Eigene icloud-session.json (Empfohlen)
- [ ] Option C: Cookies-Datei (pyicloud-verwaltet)

---

### Frage 2.4: Was passiert wenn der Session-Token ablaeuft?

Apple-Session-Tokens haben eine begrenzte Lebensdauer (typisch: 30-90 Tage). Danach ist Re-Authentifizierung mit erneutem 2FA-Code noetig.

```
Option A: Automatisch erkennen + UI-Warnung
  Polling Engine erkennt "Session abgelaufen"-Fehler.
  iCloud-Quelle wird als "Re-Authentifizierung noetig" markiert.
  Benutzer muss in die UI und erneut 2FA durchfuehren.
  + Klar und transparent
  + Kein Versuch den Token automatisch zu erneuern (was ohne 2FA nicht geht)

Option B: Proaktiv vor Ablauf warnen
  Server prueft Token-Alter und warnt z.B. 7 Tage vor erwartetem Ablauf.
  + Benutzer kann vorsorglich re-authentifizieren
  - Token-Lebensdauer ist nicht genau vorhersagbar

Option C: Kombination aus A und B
  Proaktive Warnung + Erkennung bei tatsaechlichem Ablauf.
  + Bestmoegliche UX
  - Mehr Implementierungsaufwand
```

- [x] Option A: Erkennen + UI-Warnung (Empfohlen)
- [ ] Option B: Proaktiv vor Ablauf warnen
- [ ] Option C: Kombination aus A und B

---

## Runde 3: Python-Bridge, Push-Endpunkt und Dual-Modus

### Frage 3.1: Wie soll die Python-Bridge (pyicloud) architektonisch funktionieren?

Node.js muss mit einem Python-Prozess kommunizieren. Verschiedene Muster:

```
Option A: Python-Script pro Aktion (child_process.execFile)
  Fuer jede Operation (login, list, download) wird ein separater Python-Prozess gestartet:
    node → execFile("python3", ["icloud_bridge.py", "--action", "list", ...])
  Ergebnis via stdout (JSON).

  + Einfach: Kein persistenter Prozess, kein IPC
  + Jeder Aufruf ist isoliert (kein State-Problem)
  + Debugging einfach (Script einzeln testbar)
  - Langsamer: Python-Start + pyicloud-Init bei jedem Aufruf
  - Session-Handling: pyicloud muss Session-Datei bei jedem Start laden
  - Mehrere Sekunden pro Aufruf

Option B: Langlebiger Python-Daemon mit JSON-RPC
  Ein Python-Prozess laeuft dauerhaft und kommuniziert via stdin/stdout oder Socket.
  Node.js sendet JSON-RPC-Befehle, Python antwortet.

  + Schnell: pyicloud wird einmal initialisiert, Session bleibt im Speicher
  + Effizient bei haeufigen Aufrufen
  - Komplex: Prozess-Lifecycle-Management, Crash-Recovery, IPC-Protokoll
  - Zusaetzlicher Ressourcenverbrauch auf CCU3

Option C: Python-Script pro Aktion mit Session-Cache-Verzeichnis
  Wie Option A, aber pyicloud nutzt ein persistentes Cookie-Verzeichnis.
  Session wird automatisch wiederhergestellt ohne erneuten Login.
    node → execFile("python3", ["icloud_bridge.py", "--action", "list",
                     "--session-dir", "/var/addon/icloud-session/"])

  + Einfach wie A, aber mit Session-Persistenz
  + pyicloud unterstuetzt Session-Verzeichnisse nativ
  + Kein langlebiger Prozess noetig
  - Etwas langsamer als B (Python-Start), aber akzeptabel bei stuendlichem Polling
```

- [ ] Option A: Script pro Aktion (einfach, langsam)
- [ ] Option B: Langlebiger Daemon (schnell, komplex)
- [x] Option C: Script pro Aktion mit Session-Cache (Empfohlen)

---

### Frage 3.2: Wie soll das Python-Bridge-Script aufgebaut sein?

Das Python-Script ist die Schnittstelle zwischen Node.js und pyicloud. Welche Operationen soll es unterstuetzen?

```
Vorgeschlagene Operationen (ein Script, verschiedene --action Parameter):

icloud_bridge.py --action login --apple-id X --password Y --session-dir Z
  → Startet Login, gibt {"status": "2fa_required"} oder {"status": "ok"} zurueck

icloud_bridge.py --action verify-2fa --code 123456 --session-dir Z
  → Verifiziert 2FA-Code, speichert Session
  → {"status": "ok", "session_valid": true}

icloud_bridge.py --action list --path "/Heizung" --session-dir Z
  → Listet Dateien im iCloud-Drive-Ordner
  → {"files": [{"name": "plan.xlsx", "size": 5000, "modified": "..."}]}

icloud_bridge.py --action download --path "/Heizung/plan.xlsx" --output /tmp/file.xlsx --session-dir Z
  → Laedt Datei herunter, speichert unter --output
  → {"status": "ok", "path": "/tmp/file.xlsx", "size": 5000}

icloud_bridge.py --action status --session-dir Z
  → Prueft ob Session noch gueltig ist
  → {"status": "ok", "authenticated": true} oder {"status": "reauth_required"}
```

- [x] Genau diese 5 Operationen (Empfohlen)
- [ ] Weniger: Nur login, list, download (status und verify-2fa als Teil von login)
- [ ] Mehr: Zusaetzlich checksum, validate-path, etc.

---

### Frage 3.3: Push-Endpunkt -- Wie soll er sich ins FileSource-System integrieren?

Du hast dich fuer einen generischen Push-Endpunkt mit API-Key entschieden. Dieser existiert parallel zur iCloud-Quelle. Wie integriert er sich?

```
Option A: PushFileSource als eigene FileSource-Implementierung
  Eine neue FileSource die "empfangene" Dateien verwaltet.
  + Passt ins bestehende System (FileSourceManager, Polling Engine)
  + push-Dateien erscheinen in der gleichen UI wie USB/FRITZ!Box-Dateien
  + Polling Engine kann Push-Quelle scannen (pruefen ob neue Dateien da sind)
  - FileSource-Interface passt nicht perfekt: listFiles() listet lokale Kopien,
    nicht Remote-Dateien. isAvailable() ist immer true.

Option B: Eigenstaendiger Import-Endpunkt ohne FileSource
  POST /api/push/upload nimmt die Datei entgegen, parst sie sofort
  und erstellt/aktualisiert den Zeitplan. Keine FileSource-Abstraktion.
  + Einfacher: Keine kuenstliche Anpassung an das FileSource-Interface
  + Datei kommt rein → wird sofort verarbeitet (kein Polling noetig)
  - Nicht in der Dateiquellen-UI sichtbar
  - Kein einheitliches Management

Option C: Hybrid -- Push-Endpunkt erstellt Dateien die PushFileSource verwaltet
  Push-Endpunkt speichert empfangene Dateien in einem lokalen Verzeichnis.
  PushFileSource hat listFiles() ueber dieses Verzeichnis.
  Polling Engine erkennt neue Dateien dort.
  + Saubere Trennung: Empfang vs. Verarbeitung
  + Push-Dateien sind wie lokale Dateien behandelbar
  - Doppelte Speicherung (empfangene Datei + importierter Zeitplan)
```

- [ ] Option A: PushFileSource als FileSource
- [x] Option B: Eigenstaendiger Import-Endpunkt (Empfohlen)
- [ ] Option C: Hybrid mit lokalem Verzeichnis

---

### Frage 3.4: Soll Python auf der CCU3 als Voraussetzung gelten oder mitgeliefert werden?

pyicloud braucht Python 3.x. Die CCU3 hat standardmaessig kein Python.

```
Option A: Python als Voraussetzung -- Benutzer muss es installieren
  Addon prueft beim Start ob python3 verfuegbar ist.
  Falls nicht: iCloud-Quelle wird als "nicht verfuegbar" markiert mit
  Hinweis "Python 3 wird benoetigt. Bitte CUxD oder ein Python-Addon installieren."
  + Einfach fuer uns: Kein Bundling noetig
  + Behaelt die Addon-Groesse klein
  - Benutzer muss selbst Python installieren
  - Nicht alle CCU3-Benutzer wissen wie

Option B: Python + pyicloud im Addon-Paket mitliefern
  Das tar.gz enthaelt eine minimale Python-Distribution + pyicloud.
  + Zero-Setup fuer den Benutzer
  - Groesseres Addon-Paket (50-100 MB statt ~5 MB)
  - Python fuer ARM cross-kompilieren ist aufwaendig
  - Sicherheitsupdates fuer Python muessen wir selbst liefern

Option C: Python als optionale Abhaengigkeit -- graceful degradation
  Addon funktioniert ohne Python (USB + FRITZ!Box funktionieren).
  Wenn Python vorhanden: iCloud-Quelle wird freigeschaltet.
  Wenn nicht: iCloud-Tab zeigt "Python 3 + pyicloud nicht gefunden" mit Installationsanleitung.
  + Bestes aus beiden Welten
  + Addon bleibt schlank
  + iCloud ist ohnehin "experimentell"
  - Benutzer der iCloud will muss selbst Python installieren
```

- [ ] Option A: Python als Voraussetzung
- [ ] Option B: Python mitliefern
- [x] Option C: Optionale Abhaengigkeit mit graceful degradation (Empfohlen)

---

## Runde 4: UI, API-Key und Fallback-Push

### Frage 4.1: Wie soll die iCloud-Sektion in der Web-UI aufgebaut sein?

Die iCloud-Quelle hat mehrere Zustaende (nicht konfiguriert, Python fehlt, Login noetig, 2FA-Pending, verbunden, Session abgelaufen). Der UI-Flow ist komplexer als bei USB/FRITZ!Box.

```
Option A: Multi-Schritt-Wizard innerhalb der Quellen-Karte
  Die iCloud-Karte zeigt je nach Zustand den passenden Schritt:

  Zustand "Python fehlt":
  ┌─────────────────────────────────────────────────────────┐
  │ iCloud Drive (Experimentell)                             │
  │                                                          │
  │ ⚠ Python 3 + pyicloud nicht gefunden.                   │
  │                                                          │
  │ iCloud-Zugriff erfordert Python 3 und das pyicloud-Paket.│
  │ Installationsanleitung:                                  │
  │ 1. Python-Addon auf der CCU3 installieren                │
  │ 2. pip3 install pyicloud                                 │
  │                                     [Erneut pruefen]     │
  └─────────────────────────────────────────────────────────┘

  Zustand "Login":
  ┌─────────────────────────────────────────────────────────┐
  │ iCloud Drive (Experimentell)              [Aktiviert: O] │
  │                                                          │
  │ Apple-ID:     [                          ]               │
  │ Passwort:     [                          ]               │
  │ iCloud-Pfad:  [/Heizung                  ]               │
  │                                                          │
  │ ℹ Verwenden Sie Ihr Apple-ID-Passwort oder ein           │
  │   app-spezifisches Passwort.                             │
  │                                                          │
  │ [Speichern]  [Anmelden]                                  │
  └─────────────────────────────────────────────────────────┘

  Zustand "2FA":
  ┌─────────────────────────────────────────────────────────┐
  │ iCloud Drive (Experimentell)                             │
  │                                                          │
  │ Ein Bestaetigungscode wurde an Ihre Apple-Geraete        │
  │ gesendet.                                                │
  │                                                          │
  │ 2FA-Code:  [______]              [Bestaetigen]           │
  │                                                          │
  │ [Abbrechen]                                              │
  └─────────────────────────────────────────────────────────┘

  Zustand "Verbunden":
  ┌─────────────────────────────────────────────────────────┐
  │ iCloud Drive (Experimentell)              [Aktiviert: x] │
  │                                                          │
  │ Apple-ID: user@icloud.com                                │
  │ Pfad: /Heizung                                           │
  │ Session: Gueltig ✓                                       │
  │                                                          │
  │ Polling-Status:                                          │
  │   Zuletzt geprueft: 22.03.2026, 14:00                   │
  │   Zuletzt geaendert: 22.03.2026, 10:30                  │
  │   Dateien: 1 (.numbers)                                  │
  │                                                          │
  │ [Jetzt pruefen]  [Abmelden]  [Dateien anzeigen]         │
  └─────────────────────────────────────────────────────────┘

  Zustand "Re-Auth noetig":
  ┌─────────────────────────────────────────────────────────┐
  │ iCloud Drive (Experimentell)              [Aktiviert: x] │
  │                                                          │
  │ ⚠ Session abgelaufen. Erneute Anmeldung erforderlich.   │
  │                                                          │
  │ [Erneut anmelden]                                        │
  └─────────────────────────────────────────────────────────┘

  + Kompakt: Alles in einer Karte
  + Benutzer sieht immer nur den relevanten Zustand
  - Viele Zustaende in einer Karte

Option B: Separater iCloud-Setup-Dialog (Modal)
  Konfiguration oeffnet einen Dialog/Modal fuer den Login-Flow.
  + Klare Trennung: Setup vs. Status
  - Modals sind auf der einfachen Vanilla-JS-UI unueblich
```

- [x] Option A: Multi-Schritt-Wizard in der Karte (Empfohlen)
- [ ] Option B: Separater Setup-Dialog

---

### Frage 4.2: Push-Endpunkt -- API-Key-Verwaltung

Der generische Push-Endpunkt braucht einen API-Key. Wie soll dieser verwaltet werden?

```
Option A: Automatisch generiert, anzeigbar in UI
  Beim ersten Aktivieren des Push-Endpunkts wird ein zufaelliger 32-Zeichen-Key generiert.
  UI zeigt den Key an (mit Copy-Button) + Regenerieren-Option.

  ┌─────────────────────────────────────────────────────────┐
  │ Push-Endpunkt (Datei-Upload via HTTP)                    │
  │                                                          │
  │ Aktiviert: [x]                                           │
  │                                                          │
  │ API-Key: a7b3c9d2e1f4...                    [Kopieren]   │
  │                                    [Neuen Key generieren] │
  │                                                          │
  │ Endpunkt: POST http://[CCU-IP]:3000/api/push/upload      │
  │ Header: Authorization: Bearer <API-Key>                  │
  │                                                          │
  │ Letzter Upload: 22.03.2026, 10:30 (Heizplan.xlsx)       │
  └─────────────────────────────────────────────────────────┘

  + Einfach fuer den Benutzer
  + Key kann in iOS-Kurzbefehl kopiert werden

Option B: Benutzer gibt eigenen Key ein
  + Benutzer hat volle Kontrolle
  - Schlechte UX: Die meisten wissen nicht was ein sicherer Key ist

Option C: Automatisch + QR-Code fuer iOS-Kurzbefehl
  Wie A, aber zusaetzlich ein QR-Code der einen iOS-Kurzbefehl-Installationslink enthaelt.
  + Einfachstes Setup fuer iOS-Benutzer
  - QR-Code-Generierung erfordert zusaetzliche Bibliothek
  - Kurzbefehl-Links sind komplex
```

- [x] Option A: Automatisch generiert + Copy-Button (Empfohlen)
- [ ] Option B: Benutzer gibt Key ein
- [ ] Option C: Automatisch + QR-Code

---

### Frage 4.3: Push-Endpunkt -- Was passiert beim Upload?

Wenn eine Datei via Push-Endpunkt hochgeladen wird:

```
Option A: Sofort parsen und importieren
  Datei wird empfangen → geparst → Zeitplan erstellt/aktualisiert.
  Pruefsumme wird gespeichert um Duplikate zu vermeiden.
  Response enthaelt das Ergebnis.
  + Schnell, unmittelbares Feedback
  + Kein Zwischenschritt noetig

Option B: Speichern und beim naechsten Polling-Zyklus verarbeiten
  + Konsistent mit anderen Quellen
  - Unnoetige Verzoegerung: Datei ist schon da, warum warten?

Option C: Sofort parsen + optionaler Dry-Run
  Query-Parameter ?dryRun=true zeigt was importiert wuerde ohne zu importieren.
  + Nuetzlich zum Testen des Kurzbefehls
  + Normaler Upload importiert sofort
  - Zusaetzliche Komplexitaet
```

- [x] Option A: Sofort parsen und importieren (Empfohlen)
- [ ] Option B: Beim naechsten Polling verarbeiten
- [ ] Option C: Sofort parsen + optionaler Dry-Run

---

### Frage 4.4: Soll die UI einen iOS-Kurzbefehl-Generator/Anleitung enthalten?

Der Push-Endpunkt ist am nuetzlichsten mit einem iOS-Kurzbefehl. Wie viel Hilfe bieten wir dem Benutzer?

```
Option A: Anleitung in der UI (Text + Screenshots)
  Schritt-fuer-Schritt-Anleitung wie man den Kurzbefehl in iOS erstellt:
  1. Kurzbefehle-App oeffnen
  2. Neuen Kurzbefehl erstellen
  3. "Datei aus iCloud Drive" Aktion hinzufuegen
  4. "Inhalt von URL abrufen" (POST) Aktion hinzufuegen
  5. URL und API-Key eintragen
  + Benutzer versteht was passiert
  + Keine externe Abhaengigkeit
  - Benutzer muss es manuell nachbauen

Option B: Herunterladbarer Kurzbefehl (.shortcut-Datei)
  Server generiert eine .shortcut-Datei mit vorausgefuellter URL und API-Key.
  Benutzer oeffnet die Datei auf dem iPhone → Kurzbefehl wird installiert.
  + Ein-Klick-Setup
  + URL und API-Key sind vorausgefuellt
  - .shortcut-Dateiformat ist komplex (signierte plist)
  - Apple koennte das Format aendern

Option C: Nur Text-Anleitung (minimale Hilfe)
  Kurzer Text: "Senden Sie die Datei per HTTP POST an den oben genannten Endpunkt."
  + Minimal, kein Wartungsaufwand
  - Wenig hilfreich fuer technisch weniger versierte Benutzer

Option D: iCloud-Kurzbefehl-Link (gehosteter Kurzbefehl)
  Verlinkung auf einen oeffentlich geteilten iCloud-Kurzbefehl.
  Benutzer muss nur URL und Key anpassen.
  + Einfachstes Setup
  - Erfordert einen oeffentlichen iCloud-Link den wir pflegen muessen
  - Benutzer muss den Kurzbefehl anpassen (URL + Key)
```

- [x] Option A: Anleitung in der UI (Empfohlen)
- [ ] Option B: Herunterladbarer Kurzbefehl
- [ ] Option C: Nur minimale Text-Anleitung
- [ ] Option D: iCloud-Kurzbefehl-Link
