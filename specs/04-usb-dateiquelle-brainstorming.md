# Epic 4: USB-Laufwerk als Dateiquelle -- Brainstorming

## Runde 1: Grundlegende Architektur

### Frage 1.1: FileSourceManager -- Wo lebt die Abstraktion?

Das Epic fuehrt den `FileSourceManager` ein, der ein einheitliches Interface fuer alle Dateiquellen bereitstellt (USB jetzt, FRITZ!Box und iCloud spaeter). Wo soll das leben?

```
src/
  sources/
    fileSourceManager.js      -- Orchestriert alle Quellen
    fileSource.js             -- Basis-Interface/Klasse
    usbFileSource.js          -- USB-Implementierung
    (fritzboxFileSource.js)   -- Epic 5
    (icloudFileSource.js)     -- Epic 8
```

- [x] `src/sources/` wie oben beschrieben (Empfohlen)
- [ ] `src/filesources/` mit gleicher Struktur
- [ ] `src/polling/` zusammen mit der spaeteren Polling Engine
- [ ] Anderer Vorschlag

---

### Frage 1.2: FileSource Interface -- Welche Methoden?

Die Roadmap nennt `listFiles()`, `readFile()`, `getChecksum()`. Brauchen wir mehr?

```javascript
// Moegliches Interface:
class FileSource {
  async listFiles()              // -> Array<{ name, path, size, modified }>
  async readFile(filePath)       // -> Buffer (Dateiinhalt)
  async getChecksum(filePath)    // -> string (MD5 oder SHA256)
  async isAvailable()            // -> boolean (Quelle erreichbar?)
  getType()                      // -> string ('usb', 'fritzbox', 'icloud')
  getConfig()                    // -> object (aktuelle Konfiguration)
}
```

- [x] Genau diese 6 Methoden (Empfohlen)
- [ ] Nur die 3 aus der Roadmap (listFiles, readFile, getChecksum)
- [ ] Mehr Methoden (bitte angeben)

---

### Frage 1.3: USB-Erkennung auf der CCU3 -- Ansatz?

Auf der CCU3 (embedded Linux, Buildroot-basiert) werden USB-Sticks typischerweise unter `/media/usb0`, `/media/usb1` etc. gemountet. Die Frage ist, wie wir USB-Laufwerke erkennen.

- [x] Mount-Punkte scannen (`/media/usb*`, `/dev/sd*`) + `mount`-Befehl parsen (Empfohlen)
- [ ] Fester konfigurierbarer Pfad (Benutzer gibt den Pfad in der UI an)
- [ ] Beides: Auto-Scan mit manuellem Override in der Konfiguration
- [ ] udev-Events abfangen (erfordert Systemintegration)

---

### Frage 1.4: Wann wird geparst? Polling vs. Event-basiert?

Die Roadmap sagt "stuendliches Polling". In Epic 4 brauchen wir einen Mechanismus, die Polling Engine kommt aber erst in Epic 7. Wie viel Polling bauen wir jetzt schon?

- [ ] Minimales Polling: Einfacher `setInterval` in Epic 4, spaeter durch Polling Engine ersetzt
- [x] Nur manueller Trigger: "Jetzt pruefen"-Button in der UI + API-Endpunkt, kein automatisches Polling bis Epic 7 (Empfohlen)
- [ ] Volles Polling schon jetzt (vorgezogen aus Epic 7)
- [ ] File-Watcher mit `fs.watch()` statt Polling

---

### Frage 1.5: Wie soll die Zuordnung Datei -> Zeitplan funktionieren?

Wenn eine USB-Datei gefunden wird: Soll sie automatisch einen Zeitplan erstellen, oder muss der Benutzer das bestaetigen?

- [ ] Voll-automatisch: Datei gefunden -> parsen -> Zeitplan erstellen/aktualisieren
- [x] Halb-automatisch: Dateien auflisten in der UI, Benutzer waehlt "Importieren" (Empfohlen)
- [ ] Nur manuell: USB ist nur ein alternativer Upload-Pfad, Benutzer muss Datei waehlen und hochladen

---

### Frage 1.6: Persistenz der Dateiquellen-Konfiguration

Wo speichern wir die Konfiguration fuer USB-Quellen (Pfad, aktiviert/deaktiviert, etc.)?

- [x] Eigene Datei `sources.json` neben `areas.json` und `schedules/` (Empfohlen)
- [ ] In der bestehenden Config-Klasse (Umgebungsvariablen / Konstruktor-Params)
- [ ] In einer neuen Datei `config.json` die spaeter auch andere Einstellungen aufnimmt

---

## Runde 2: Detailfragen USB-Implementierung

### Frage 2.1: Checksum-Algorithmus fuer Aenderungserkennung

Welchen Hash-Algorithmus fuer `getChecksum()`?

- [x] MD5 -- schnell, reicht fuer Aenderungserkennung (kein Sicherheitskontext) (Empfohlen)
- [ ] SHA256 -- sicherer, aber langsamer bei grossen Dateien
- [ ] Kein Hash, nur `mtime` + `size` vergleichen (schnellste Option)

---

### Frage 2.2: Dateifilter -- Welche Dateien auf dem USB-Stick beachten?

Soll nur in einem bestimmten Ordner gesucht werden, oder ueberall auf dem Stick?

- [ ] Konfigurierbarer Unterordner (Standard: `/Heizung/`), nur dort suchen (Empfohlen)
- [ ] Root des USB-Sticks, nur `.xlsx` und `.numbers` Dateien
- [ ] Rekursiv den gesamten Stick durchsuchen
- [x] Kein Standard-Unterordner, Benutzer muss Pfad immer angeben

---

### Frage 2.3: Was passiert bei mehreren Dateien auf dem USB-Stick?

Wenn der Benutzer z.B. `Heizplan-Winter.xlsx` und `Heizplan-Sommer.numbers` auf dem Stick hat:

- [x] Alle gefundenen Dateien auflisten, Benutzer waehlt einzeln welche importiert werden (Empfohlen)
- [ ] Alle Dateien automatisch als separate Zeitplaene importieren
- [ ] Nur die neueste Datei beruecksichtigen
- [ ] Dateien zu einem einzigen Zeitplan zusammenfuehren

---

### Frage 2.4: Zeitplan-Update vs. Neuanlage

Wenn eine bereits importierte Datei sich aendert (gleicher Dateiname, neuer Inhalt):

- [x] Bestehenden Zeitplan aktualisieren (match ueber Dateiname + Quelltyp) (Empfohlen)
- [ ] Alten Zeitplan loeschen, neuen anlegen
- [ ] Neuen Zeitplan anlegen, alten beibehalten (Benutzer raeumt auf)
- [ ] Benutzer fragen (Dialog in der UI)

---

### Frage 2.5: sources.json Schema

Wie soll die Konfigurationsdatei aussehen?

```json
// Vorschlag A:
{
  "sources": [
    {
      "id": "uuid",
      "type": "usb",
      "enabled": true,
      "config": {
        "mountPoint": "/media/usb0",
        "subFolder": "Heizung",
        "autoDetect": true
      },
      "lastChecked": "2026-03-22T10:00:00Z",
      "lastFileHash": { "Heizplan.xlsx": "abc123..." }
    }
  ]
}
```

```json
// Vorschlag B (flacher):
{
  "usb": {
    "enabled": true,
    "mountPoint": "/media/usb0",
    "subFolder": "Heizung",
    "lastChecked": null,
    "files": {}
  }
}
```

- [ ] Vorschlag A: Array von Quellen mit UUID (flexibler, mehrere USB-Sticks moeglich)
- [x] Vorschlag B: Ein Objekt pro Quellentyp (einfacher, ein USB-Stick reicht) (Empfohlen)

---

### Frage 2.6: REST API Endpunkte

Welche neuen Endpunkte braucht die API?

```
GET  /api/sources                    -- Alle konfigurierten Quellen auflisten
PUT  /api/sources/:type              -- Quelle konfigurieren (z.B. PUT /api/sources/usb)
POST /api/sources/:type/scan         -- Manueller Scan ausloesen
GET  /api/sources/:type/files        -- Gefundene Dateien auflisten
POST /api/sources/:type/import       -- Datei importieren (Body: { fileName })
```

- [x] Genau diese 5 Endpunkte (Empfohlen)
- [ ] Weniger (welche weglassen?)
- [ ] Mehr (welche hinzufuegen?)

---

### Frage 2.7: Fehlerbehandlung bei USB-Entfernung

Wenn der USB-Stick waehrend eines Scans oder Imports entfernt wird:

- [x] Graceful Error: Fehlermeldung in der UI, bereits importierte Zeitplaene bleiben erhalten (Empfohlen)
- [ ] Zeitplaene die von diesem USB stammen werden als "offline" markiert
- [ ] Zeitplaene werden geloescht wenn die Quelle verschwindet

---

### Frage 2.8: Entwicklung und Testen ohne CCU3-Hardware

Fuer die Entwicklung auf macOS brauchen wir einen Weg, USB-Quellen zu testen. Ansatz?

- [x] Beliebigen lokalen Ordner als "USB-Mount" konfigurierbar machen (Empfohlen)
- [ ] Mock-FileSource fuer Tests, echte USB-Erkennung nur auf CCU3
- [ ] Docker-Container mit gemounteten Volumes

---

## Runde 3: Frontend, Tracking und Zeitplan-Integration

### Frage 3.1: UI-Integration -- Wo in der bestehenden Oberflaeche?

Die aktuelle Web-UI hat Bereiche fuer Upload, Zeitplaene und Areas. Wo kommt die Dateiquellen-Konfiguration hin?

- [x] Neuer Tab/Bereich "Dateiquellen" in der bestehenden Seitennavigation (Empfohlen)
- [ ] Unter dem bestehenden Upload-Bereich als zusaetzliche Option
- [ ] Eigene Seite unter /sources (separates HTML)
- [ ] Einstellungs-Modal/Dialog

---

### Frage 3.2: Herkunfts-Tracking im Zeitplan

Wenn ein Zeitplan von einer USB-Datei stammt, soll das im Zeitplan-Objekt gespeichert werden? Das ist wichtig fuer Update-Erkennung (Frage 2.4).

Vorschlag -- Zeitplan-Schema erweitern:

```javascript
{
  id: "uuid",
  name: "Heizplan-Winter",
  source: {                          // NEU
    type: "usb",                     // "upload" | "usb" | "fritzbox" | "icloud"
    fileName: "Heizplan-Winter.xlsx",
    lastChecksum: "abc123...",
    importedAt: "2026-03-22T10:00:00Z"
  },
  areas: [...],
  // ...
}
```

- [x] Ja, `source`-Objekt wie oben im Zeitplan speichern (Empfohlen)
- [ ] Nein, Herkunft nur in sources.json tracken, nicht im Zeitplan
- [ ] Einfacher: Nur `sourceType` und `sourceFileName` als flache Felder

---

### Frage 3.3: Rueckwaertskompatibilitaet bestehender Zeitplaene

Bestehende Zeitplaene (ueber Upload erstellt) haben kein `source`-Feld. Wie damit umgehen?

- [x] Fehlendes `source`-Feld bedeutet implizit `type: "upload"`, keine Migration noetig (Empfohlen)
- [ ] Einmalige Migration: Allen bestehenden Zeitplaenen `source: { type: "upload" }` hinzufuegen
- [ ] Neues Feld ignorieren, nur fuer neue Zeitplaene verwenden

---

### Frage 3.4: Sollen wir noch weitere Aspekte besprechen?

- [ ] Ja, ich habe noch Fragen oder Themen
- [x] Nein, das reicht -- bitte die Spezifikation schreiben (Empfohlen)

---
