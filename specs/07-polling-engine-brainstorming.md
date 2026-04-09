# Epic 7: Stuendliche Polling Engine -- Brainstorming

## Kontext

Aktuell hat das Addon **kein automatisches Polling**. Dateiquellen (USB, spaeter FRITZ!Box NAS) werden nur manuell ueber die Web-UI gescannt und importiert (POST `/api/sources/:type/scan` + `/api/sources/:type/import`). Der FileSourceManager speichert bereits Pruefsummen (MD5) pro Datei in `sources.json`, aber es gibt keinen Mechanismus der diese automatisch prueft.

Das Addon hat zwei bestehende Loops:
- **60-Sekunden-Loop** im ScheduleManager: Prueft ob Zeitplaene ausgefuehrt werden muessen (`checkAndExecute()`)
- **Kein Dateiquellen-Loop**: Dateiquellen werden nur bei manueller Aktion gescannt

Epic 7 fuehrt eine **zentrale Polling Engine** ein, die alle konfigurierten und aktivierten Dateiquellen periodisch prueft, Aenderungen per Pruefsummenvergleich erkennt und Zeitplaene automatisch aktualisiert.

### Bestehende Infrastruktur die genutzt werden kann:
- `FileSourceManager.scanSource(type)` -- scannt eine Quelle und cached Ergebnisse
- `FileSourceManager.importFile(type, fileName, scheduleManager)` -- importiert/aktualisiert einen Zeitplan
- `FileSource.getChecksum(filePath)` -- MD5-Pruefsumme pro Datei
- `sources.json` -- speichert `lastChecked` und `files` mit Pruefsummen pro Quelle
- `Logger` -- zentrales Logging-Utility

---

## Runde 1: Architektur und Grundkonzept

### Frage 1.1: Wo soll die Polling Engine leben?

Die Engine braucht Zugriff auf FileSourceManager und ScheduleManager. Optionen:

```
Option A: Eigene Klasse (src/polling/pollingEngine.js)
  + Klare Trennung: Polling-Logik ist unabhaengig von Source- und Schedule-Management
  + Testbar: Kann isoliert mit gemockten Abhhaengigkeiten getestet werden
  + Konfigurierbar: Eigenes Start/Stop-Interface
  - Neues Modul das in server.js verdrahtet werden muss

Option B: In FileSourceManager integriert
  + Kein neues Modul, weniger Dateien
  + FileSourceManager hat bereits Zugriff auf Sources und Scan-Logik
  - Blaecht den Manager auf -- er uebernimmt dann auch Scheduling-Verantwortung
  - Braucht trotzdem Referenz zum ScheduleManager fuer Auto-Import

Option C: In server.js als Middleware/Timer
  + Einfachste Loesung -- ein setInterval im Server
  - Keine Testbarkeit, keine klare Abstraktion
  - Schlecht erweiterbar
```

- [x] Option A: Eigene Klasse `PollingEngine` (Empfohlen)
- [ ] Option B: In FileSourceManager integrieren
- [ ] Option C: Timer direkt in server.js

---

### Frage 1.2: Polling-Strategie -- Wie soll der Zyklus ablaufen?

```
Strategie 1: Sequenziell
  Quelle 1 scannen → importieren → Quelle 2 scannen → importieren → ...
  + Einfach, vorhersagbar
  + Kein Ressourcen-Wettbewerb (wichtig fuer CCU3 mit begrenztem RAM)
  - Langsamer bei vielen Quellen

Strategie 2: Parallel (Promise.allSettled)
  Alle Quellen gleichzeitig scannen → alle Ergebnisse importieren
  + Schneller bei mehreren Quellen
  - CCU3 hat begrenzte Ressourcen (512MB RAM, ARM-Prozessor)
  - Netzwerk-Quellen (FRITZ!Box, iCloud) koennten gleichzeitig Verbindungen oeffnen

Strategie 3: Sequenziell mit Prioritaet
  Quellen nach Typ priorisieren (z.B. USB zuerst, dann Netzwerk)
  + Wie Strategie 1, aber lokale Quellen werden bevorzugt
  - Zusaetzliche Komplexitaet ohne klaren Nutzen bei 2-3 Quellen
```

- [x] Strategie 1: Sequenziell, eine Quelle nach der anderen (Empfohlen)
- [ ] Strategie 2: Parallel mit Promise.allSettled
- [ ] Strategie 3: Sequenziell mit Prioritaet

---

### Frage 1.3: Was passiert bei erkannter Aenderung?

Wenn eine Datei eine neue Pruefsumme hat, soll:

```
Option A: Automatisch importieren (Vollautomatik)
  Datei wird sofort geparst und der Zeitplan aktualisiert
  + Benutzer muss nichts tun
  + Aenderungen landen schnell im System
  - Fehlerhafte Dateien koennten bestehende Zeitplaene kaputtmachen
  - Keine Moeglichkeit die Aenderung vorher zu pruefen

Option B: Automatisch importieren mit Benachrichtigung
  Wie A, aber die Web-UI zeigt an dass ein Auto-Import stattfand
  + Vollautomatik mit Transparenz
  + Benutzer sieht was passiert ist
  - Kaputtmachen-Risiko bleibt

Option C: Nur erkennen, Benutzer muss importieren
  Engine erkennt die Aenderung und markiert sie in der UI
  Benutzer klickt "Importieren" in der Web-UI
  + Sicher: Kein unerwartetes Ueberschreiben
  - Widerspricht dem Ziel "automatisch aktualisieren"
  - Benutzer muss aktiv werden
```

- [x] Option A: Vollautomatik -- sofort importieren
- [ ] Option B: Automatisch importieren + UI-Benachrichtigung (Empfohlen)
- [ ] Option C: Nur erkennen, manueller Import

---

### Frage 1.4: Soll das Polling-Intervall konfigurierbar sein?

Der Roadmap sagt "stuendlich" als Standard. Optionen:

```
Option A: Fest 1 Stunde, nicht konfigurierbar
  + Einfach, kein UI-Element noetig
  - Unflexibel

Option B: Konfigurierbar ueber UI mit Vorauswahl
  Dropdown: 15 Min / 30 Min / 1 Stunde / 2 Stunden / 6 Stunden
  + Flexibel fuer verschiedene Anwendungsfaelle
  + Begrenzte Auswahl verhindert zu aggressive Werte

Option C: Frei eingebbar (Minuten)
  + Maximale Flexibilitaet
  - Benutzer koennte 1 Minute einstellen → Ressourcenprobleme auf CCU3
```

- [ ] Option A: Fest 1 Stunde
- [x] Option B: Dropdown mit Vorauswahl (Empfohlen)
- [ ] Option C: Frei eingebbar

---

## Runde 2: Fehlerbehandlung, Status-Tracking und Logging

### Frage 2.1: Wie sollen Polling-Fehler behandelt werden?

Netzwerk-Quellen (FRITZ!Box, iCloud) koennen zeitweise nicht erreichbar sein. USB-Sticks koennen entfernt werden. Wie reagiert die Engine?

```
Option A: Fehler loggen und beim naechsten Zyklus erneut versuchen
  + Einfach, robust
  + Temporaere Fehler loesen sich von selbst
  - Keine Eskalation bei dauerhaften Problemen

Option B: Fehler loggen + Zaehler, nach N Fehlschlaegen Quelle deaktivieren
  Beispiel: Nach 3 aufeinanderfolgenden Fehlern → Quelle als "fehlerhaft" markieren
  + Verhindert sinnloses Polling einer kaputten Quelle
  + Benutzer sieht in der UI dass etwas nicht stimmt
  - Automatisches Deaktivieren koennte verwirrend sein
  - Benutzer muss manuell reaktivieren

Option C: Fehler loggen + Zaehler, aber nie automatisch deaktivieren
  Fehler-Count und letzte Fehlermeldung werden in der UI angezeigt
  + Polling laeuft immer weiter (selbstheilend bei temporaeren Problemen)
  + Benutzer sieht den Fehlerstatus
  - Sinnloses Polling wenn z.B. USB-Stick dauerhaft entfernt wurde
```

- [ ] Option A: Nur loggen, immer weiter versuchen
- [x] Option B: Nach N Fehlern Quelle deaktivieren
- [ ] Option C: Fehler zaehlen und anzeigen, nie deaktivieren (Empfohlen)

---

### Frage 2.2: Welche Status-Informationen sollen pro Quelle gespeichert werden?

Die Web-UI soll den Polling-Status anzeigen. Welche Daten brauchen wir?

```
Minimal:
  - lastChecked: Zeitpunkt der letzten Pruefung
  - lastChanged: Zeitpunkt der letzten erkannten Aenderung

Standard:
  - lastChecked + lastChanged (wie Minimal)
  - lastError: Letzte Fehlermeldung (oder null)
  - lastErrorAt: Zeitpunkt des letzten Fehlers
  - consecutiveErrors: Anzahl aufeinanderfolgender Fehler

Ausfuehrlich:
  - Alles von Standard
  - history: Array der letzten N Poll-Ergebnisse (Zeitpunkt, Ergebnis, Dateien)
  - importHistory: Array der letzten Auto-Imports (Zeitpunkt, Datei, Aktion)
```

- [ ] Minimal: Nur Zeitstempel
- [x] Standard: Zeitstempel + Fehlerinfo (Empfohlen)
- [ ] Ausfuehrlich: Zeitstempel + Fehlerinfo + Historie

---

### Frage 2.3: Wo werden Polling-Status-Daten persistiert?

```
Option A: In sources.json (bestehende Datei)
  + Kein neues File, alles an einem Ort
  + lastChecked und files-Checksums sind schon dort
  - Mischung von Konfiguration und Runtime-Status

Option B: Eigene Datei polling-status.json
  + Klare Trennung: Config (sources.json) vs. Status (polling-status.json)
  + Status kann geloescht werden ohne Config zu verlieren
  - Zusaetzliche Datei-I/O

Option C: Nur im Speicher (nicht persistiert)
  + Einfach, keine Datei-I/O
  + Status ist ohnehin nur fuer die laufende UI-Anzeige relevant
  - Nach Neustart sind alle Status-Infos weg
  - "Zuletzt geprueft" geht bei Addon-Neustart verloren
```

- [ ] Option A: In sources.json erweitern (Empfohlen)
- [x] Option B: Eigene polling-status.json
- [ ] Option C: Nur im Speicher

---

### Frage 2.4: Wie soll mit geloeschten Dateien umgegangen werden?

Wenn eine Datei die vorher existierte nicht mehr gefunden wird (USB entfernt, Datei geloescht):

```
Option A: Nichts tun -- bestehender Zeitplan bleibt aktiv
  + Sicher: Zeitplaene verschwinden nicht ueberraschend
  + USB-Stick entfernen ist ein normaler Vorgang
  - "Verwaiste" Zeitplaene koennten verwirrend sein

Option B: Zeitplan als "Quelle nicht verfuegbar" markieren
  + Zeitplan bleibt aktiv, aber UI zeigt Warnung
  + Benutzer kann entscheiden was zu tun ist
  - Zusaetzlicher Status pro Zeitplan

Option C: Zeitplan deaktivieren
  + Keine verwaisten aktiven Zeitplaene
  - Ueberraschend wenn man den USB-Stick kurz abzieht
  - Koennnte gewollte Zeitplaene deaktivieren
```

- [ ] Option A: Nichts tun, Zeitplan bleibt (Empfohlen)
- [x] Option B: Zeitplan als "Quelle nicht verfuegbar" markieren
- [ ] Option C: Zeitplan deaktivieren

---

## Runde 3: Web-UI, API und "Jetzt pruefen"-Button

### Frage 3.1: Wo soll der Polling-Status in der Web-UI angezeigt werden?

Die bestehende UI hat Tabs/Bereiche fuer Zeitplaene, Bereiche und Dateiquellen. Der Polling-Status muss irgendwo sichtbar sein.

```
Option A: In der bestehenden Dateiquellen-Ansicht integriert
  Pro Quelle werden die Polling-Infos direkt angezeigt:
  ┌─────────────────────────────────────────────────────────┐
  │ USB-Laufwerk                              [Aktiviert] ✓ │
  │ Mount: /media/usb0/Heizung                               │
  │ Zuletzt geprueft: 22.03.2026, 14:00                     │
  │ Zuletzt geaendert: 22.03.2026, 10:30                    │
  │ Status: OK (2 Dateien)                                   │
  │                                    [Jetzt pruefen]       │
  ├─────────────────────────────────────────────────────────┤
  │ FRITZ!Box NAS                          [Deaktiviert] ✗  │
  │ ...                                                      │
  └─────────────────────────────────────────────────────────┘
  + Alles an einem Ort
  + Kein neuer UI-Bereich noetig

Option B: Eigener "Polling"-Tab/Bereich
  Separater Bereich der alle Quellen mit Status zeigt + globale Controls
  + Uebersichtlich wenn viele Quellen aktiv sind
  + Platz fuer globale Einstellungen (Intervall)
  - Neuer Tab in einer schon einfachen UI

Option C: Statusleiste/Banner oben auf der Seite
  Kompakte Zeile die immer sichtbar ist:
  "Polling aktiv | Naechste Pruefung: 15:00 | USB: OK | FRITZ!Box: Fehler"
  + Immer sichtbar, egal welcher Tab
  - Wenig Platz fuer Details
  - Zusaetzliches UI-Element
```

- [x] Option A: In Dateiquellen-Ansicht integriert (Empfohlen)
- [ ] Option B: Eigener Polling-Tab
- [ ] Option C: Statusleiste oben

---

### Frage 3.2: "Jetzt pruefen"-Button -- Scope?

Der Roadmap fordert einen "Jetzt pruefen"-Button. Wie granular soll er sein?

```
Option A: Ein globaler Button -- prueft alle aktivierten Quellen
  + Einfach, ein Klick
  + Konsistent mit dem internen Polling (das auch alle Quellen prueft)
  - Kann laenger dauern wenn Netzwerk-Quellen langsam sind

Option B: Pro Quelle ein Button + ein globaler Button
  + Benutzer kann gezielt eine Quelle pruefen
  + Globaler Button fuer "alles auf einmal"
  - Mehr UI-Elemente

Option C: Nur pro Quelle ein Button
  + Gezieltes Pruefen
  - Kein "alles auf einmal" moeglich
```

- [ ] Option A: Nur globaler Button
- [x] Option B: Pro Quelle + globaler Button (Empfohlen)
- [ ] Option C: Nur pro Quelle

---

### Frage 3.3: REST API Endpunkte fuer die Polling Engine

Welche neuen API-Endpunkte brauchen wir? (Mehrfachauswahl moeglich)

```
Vorgeschlagene Endpunkte:

1. GET  /api/polling/status
   → Aktueller Polling-Status: laeuft/gestoppt, Intervall, naechste Pruefung,
     Status pro Quelle (lastChecked, lastChanged, errors)

2. POST /api/polling/trigger
   → "Jetzt pruefen" -- triggert sofortigen Poll-Zyklus fuer alle Quellen
   → Optional mit Body { "type": "usb" } fuer einzelne Quelle

3. PUT  /api/polling/config
   → Polling-Konfiguration aendern (Intervall, aktiviert/deaktiviert)
   → Body: { "enabled": true, "intervalMinutes": 60 }

4. GET  /api/polling/log
   → Letzte N Polling-Ereignisse (Erfolge, Fehler, Imports)
```

- [ ] Endpunkte 1-3 reichen (Empfohlen)
- [x] Alle 4 Endpunkte
- [ ] Nur 1 und 2 (minimal)

---

### Frage 3.4: Soll Polling beim Server-Start automatisch aktiv sein?

```
Option A: Ja, wenn mindestens eine Quelle aktiviert ist
  + "Fire and forget" -- Addon laeuft vollautomatisch nach Setup
  + Konsistent mit dem ScheduleManager der auch sofort startet
  - Koennte unerwartetes Verhalten sein nach einem Neustart

Option B: Ja, immer automatisch starten (auch ohne aktive Quellen)
  + Einfachste Logik
  - Sinnloser Timer wenn keine Quellen konfiguriert sind

Option C: Nein, muss explizit in der UI aktiviert werden
  + Benutzer hat volle Kontrolle
  - Widerspricht dem Ziel der Automatisierung
  - Nach CCU3-Neustart muss man die UI oeffnen
```

- [x] Option A: Automatisch wenn Quellen aktiv (Empfohlen)
- [ ] Option B: Immer automatisch
- [ ] Option C: Manuell aktivieren

---

## Runde 4: Detailfragen und Konfiguration

### Frage 4.1: Polling-Log -- Wieviele Eintraege und was loggen?

Du hast dich fuer den `/api/polling/log` Endpunkt entschieden. Details:

```
Option A: Ringpuffer mit 50 Eintraegen
  Jeder Poll-Zyklus erzeugt 1 Eintrag:
  { timestamp, sources: [{ type, filesFound, filesChanged, imported, error }] }
  + Uebersichtlich, nicht zu viel Daten
  + Reicht fuer ~2 Tage bei stuendlichem Polling

Option B: Ringpuffer mit 100 Eintraegen + separate Import-Events
  Poll-Eintraege UND Import-Eintraege getrennt
  + Detaillierter: Man sieht genau welche Datei wann importiert wurde
  - Mehr Komplexitaet und Speicher

Option C: Ringpuffer mit 50 Eintraegen (nur signifikante Events)
  Nur loggen wenn: Aenderung erkannt, Import durchgefuehrt, Fehler aufgetreten
  Routine-Polls ohne Aenderung werden NICHT geloggt
  + Log bleibt uebersichtlich und relevant
  + 50 Eintraege reichen laenger (nur Events, nicht jeder Zyklus)
  - Man sieht nicht ob das Polling ueberhaupt laeuft (keine "alles OK" Eintraege)
```

- [ ] Option A: 50 Eintraege, jeder Zyklus (Empfohlen)
- [ ] Option B: 100 Eintraege + separate Imports
- [x] Option C: 50 Eintraege, nur signifikante Events

---

### Frage 4.2: Wie viele aufeinanderfolgende Fehler bis zur Deaktivierung?

Du hast dich in Frage 2.1 fuer "nach N Fehlern deaktivieren" entschieden. Welcher Schwellwert?

```
Option A: 3 Fehler
  Bei stuendlichem Polling = nach 3 Stunden deaktiviert
  + Schnelle Reaktion auf dauerhaft kaputte Quellen
  - Kann bei kurzfristigen Netzwerkproblemen zu frueh deaktivieren

Option B: 5 Fehler
  Bei stuendlichem Polling = nach 5 Stunden deaktiviert
  + Guter Kompromiss: toleriert kurze Ausfaelle
  + Reagiert noch am selben Tag

Option C: 10 Fehler
  Bei stuendlichem Polling = nach 10 Stunden deaktiviert
  + Sehr tolerant
  - Dauert fast einen halben Tag bis reagiert wird
```

- [ ] Option A: 3 Fehler
- [x] Option B: 5 Fehler (Empfohlen)
- [ ] Option C: 10 Fehler

---

### Frage 4.3: Soll die Polling-Konfiguration in polling-status.json oder separat gespeichert werden?

Die Polling Engine braucht persistente Config (Intervall, enabled). Du hast dich fuer eine eigene `polling-status.json` fuer Status entschieden. Frage: Soll die Polling-Config auch dort rein?

```
Option A: Alles in polling-status.json (Config + Status)
  {
    "enabled": true,
    "intervalMinutes": 60,
    "sources": {
      "usb": {
        "lastChecked": "...",
        "lastChanged": "...",
        "consecutiveErrors": 0,
        "lastError": null
      }
    },
    "log": [...]
  }
  + Eine Datei fuer alles Polling-bezogene
  + Einfach zu laden und zu speichern

Option B: Config in sources.json, Status in polling-status.json
  sources.json: { "polling": { "enabled": true, "intervalMinutes": 60 }, "usb": {...} }
  polling-status.json: { "sources": { "usb": { "lastChecked": ... } }, "log": [...] }
  + Klare Trennung: Config gehoert zu den Quellen, Status ist transient
  - Zwei Dateien fuer Polling-Daten
```

- [x] Option A: Alles in polling-status.json (Empfohlen)
- [ ] Option B: Config in sources.json, Status in polling-status.json

---

### Frage 4.4: Soll ein laufender manueller Poll ("Jetzt pruefen") den naechsten automatischen Zyklus zuruecksetzen?

Beispiel: Polling-Intervall ist 1 Stunde. Letzter automatischer Poll war um 14:00. Benutzer klickt um 14:30 auf "Jetzt pruefen".

```
Option A: Timer zuruecksetzen -- naechster automatischer Poll um 15:30
  + Verhindert doppeltes Pruefen kurz hintereinander
  + Logisch: "Ich habe gerade geprueft, also warte ich ab jetzt wieder 1 Stunde"

Option B: Timer nicht aendern -- naechster automatischer Poll bleibt 15:00
  + Einfacher zu implementieren
  + Vorhersagbares Verhalten: Polling laeuft immer zur gleichen Zeit
  - Moeglicher doppelter Poll nach 30 Minuten (harmlos aber unnoetig)
```

- [x] Option A: Timer zuruecksetzen (Empfohlen)
- [ ] Option B: Timer nicht aendern
