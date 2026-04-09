# Benutzerhandbuch -- Homematic IP Heizungssteuerung

## Inhaltsverzeichnis

1. [Einfuehrung](#einfuehrung)
2. [Installation](#installation)
3. [Erste Schritte](#erste-schritte)
4. [Web-Oberflaeche](#web-oberflaeche)
5. [Bereiche verwalten](#bereiche-verwalten)
6. [Heizplan per Datei-Upload](#heizplan-per-datei-upload)
7. [Zeitplaene verwalten](#zeitplaene-verwalten)
8. [Heizprofile](#heizprofile)
9. [Dateiquellen](#dateiquellen)
10. [Polling (automatische Pruefung)](#polling-automatische-pruefung)
11. [Push-Endpunkt](#push-endpunkt)
12. [Health-Check und Status](#health-check-und-status)
13. [Fehlerbehebung](#fehlerbehebung)

---

## Einfuehrung

Thermo-Flow ist ein Addon fuer die CCU3, das die zeitgesteuerte Steuerung von Homematic IP Heizkoerperthermostaten ermoeglicht. Heizplaene werden als Excel- oder Numbers-Dateien erstellt und koennen ueber verschiedene Wege importiert werden:

- **Manueller Upload** ueber die Web-Oberflaeche
- **USB-Stick** -- Datei auf USB-Stick speichern und automatisch importieren
- **FRITZ!Box NAS** -- Datei auf dem NAS der FRITZ!Box ablegen
- **iCloud Drive** -- Datei in iCloud Drive speichern
- **Push-Endpunkt** -- Datei per HTTP-Request hochladen (z.B. per Shortcut/Automation)

Das Addon unterstuetzt zwei Betriebsmodi fuer die Kommunikation mit den Geraeten:
- **Lokal** (Standard auf CCU3): Direkte Steuerung ueber XML-RPC
- **Cloud**: Steuerung ueber die Homematic IP Cloud API

---

## Installation

### Voraussetzungen

- CCU3 mit Firmware 3.75 oder neuer
- "Node.js fuer CCU"-Addon installiert (Node.js >= 18)

### Installation ueber CCU Web-UI

1. Neuestes Release herunterladen: `my-homematic-addon-X.X.X.tar.gz`
2. CCU3-Weboberflaeche oeffnen
3. Navigieren zu **Einstellungen** -> **Systemsteuerung** -> **Zusatzsoftware**
4. **Datei waehlen** -> tar.gz-Datei auswaehlen -> **Installieren**
5. Warten bis "Installation erfolgreich" erscheint
6. Web-UI des Addons oeffnen: `http://[CCU-IP]:8080`

### Installation per SSH

```bash
scp my-homematic-addon-1.0.0.tar.gz root@[CCU-IP]:/tmp/
ssh root@[CCU-IP]
cd /tmp && mkdir -p addon && cd addon
tar -xzf ../my-homematic-addon-1.0.0.tar.gz
./install.sh
```

### Konfiguration

Die Konfiguration liegt in `/usr/local/addons/my-homematic-addon/.env`:

| Variable               | Beschreibung                    | Standard    |
| ---------------------- | ------------------------------- | ----------- |
| `PORT`                 | Web-UI Port                     | 8080        |
| `LOG_LEVEL`            | Log-Detailgrad                  | info        |
| `HOMEMATIC_MODE`       | Verbindungsmodus (local/cloud)  | local       |
| `HOMEMATIC_CCU_HOST`   | CCU-Adresse                     | localhost   |
| `HOMEMATIC_CCU_PORT`   | XML-RPC Port                    | 2001        |

Fuer den Cloud-Modus zusaetzlich:

| Variable                          | Beschreibung              |
| --------------------------------- | ------------------------- |
| `HOMEMATIC_IP_ACCESS_POINT_SGTIN` | Access Point Seriennummer |
| `HOMEMATIC_IP_AUTH_TOKEN`         | Authentifizierungs-Token  |

Nach Aenderungen den Service neu starten:

```bash
/etc/init.d/my-homematic-addon restart
```

---

## Erste Schritte

Nach der Installation ist das Web-Interface unter `http://[CCU-IP]:8080` erreichbar.

**Empfohlene Reihenfolge:**

1. **Bereiche anlegen** -- Definieren Sie Bereiche (z.B. "Wohnzimmer") und ordnen Sie Geraete-IDs zu
2. **Heizplan erstellen** -- Erstellen Sie eine Excel-Datei mit Ihrem Heizplan
3. **Heizplan hochladen** -- Laden Sie die Datei ueber die Web-Oberflaeche hoch
4. **Zeitplan aktivieren** -- Aktivieren Sie den erstellten Zeitplan

---

## Web-Oberflaeche

Die Web-Oberflaeche gliedert sich in folgende Bereiche:

### Datei-Upload

Der obere Bereich zeigt einen Drag-and-Drop-Bereich fuer Datei-Uploads. Unterstuetzte Formate:
- Excel (.xlsx, .xls)
- Apple Numbers (.numbers)
- Maximale Dateigroesse: 10 MB

### Vorschau

Nach dem Upload erscheint eine Vorschau der erkannten Daten mit:
- Bereich, Start- und Enddatum
- Steuerungsart (Temperatur oder Geraeteprofil)
- Zusatzinformationen

Hier vergeben Sie einen Namen und erstellen den Zeitplan.

### Bereiche

Verwaltung der Bereiche (Areas) mit Zuordnung von Geraete-IDs.

### Dateiquellen

Konfiguration externer Dateiquellen (USB, FRITZ!Box, iCloud) und Polling-Einstellungen.

### Zeitplaene

Uebersicht aller Zeitplaene mit Aktivieren/Deaktivieren/Loeschen.

---

## Bereiche verwalten

Bereiche fassen mehrere Thermostate zu einer logischen Einheit zusammen. Ein Heizplan referenziert Bereiche statt einzelner Geraete-IDs.

### Bereich erstellen

1. Im Abschnitt **Bereiche** den Namen eingeben (z.B. "Wohnzimmer")
2. Geraete-IDs kommagetrennt eingeben (z.B. `000A1234567890, 000A1234567891`)
3. **Speichern** klicken

Die Geraete-IDs finden Sie unter **Geraete** oder in der CCU-Weboberflaeche.

### Bereich loeschen

Klicken Sie auf den **Loeschen**-Button neben dem Bereich.

### Bereiche in Heizplaenen

Wenn in der Excel-Datei ein Bereichsname steht (z.B. "Wohnzimmer"), werden automatisch alle zugeordneten Geraete angesteuert. Alternativ koennen auch direkt Geraete-IDs (kommagetrennt) in der Spalte "Bereich" stehen.

---

## Heizplan per Datei-Upload

### Excel/Numbers-Format

Erstellen Sie eine Tabelle mit folgenden Spalten:

| Spalte          | Pflicht | Beschreibung                               | Beispiel                |
| --------------- | ------- | ------------------------------------------ | ----------------------- |
| **Bereich**     | Ja      | Bereichsname oder Geraete-IDs             | "Wohnzimmer"            |
| **Startdatum**  | Ja      | Beginn des Zeitfensters                    | 15.01.2025 08:00        |
| **Enddatum**    | Ja      | Ende des Zeitfensters                      | 15.01.2025 22:00        |
| **Temperatur**  | Nein*   | Ziel-Temperatur in Grad Celsius (0-30)     | 21                      |
| **Heizprofil**  | Nein*   | Profilname oder Geraeteprofil              | "Komfort"               |
| **Zusatzinfo**  | Nein    | Beliebiger Kommentar                       | "Konferenzraum belegt"  |

*Entweder Temperatur oder Heizprofil sollte angegeben werden.

### Spaltenbezeichnungen

Der Parser erkennt verschiedene Spaltenbezeichnungen automatisch:

| Spalte       | Akzeptierte Namen                                          |
| ------------ | ---------------------------------------------------------- |
| Bereich      | Bereich, Area, Zone, Raum                                  |
| Startdatum   | Startdatum, Start DateTime, Startzeit, Start, Von, Beginn  |
| Enddatum     | Enddatum, End DateTime, Endzeit, End, Bis, Ende            |
| Temperatur   | Temperatur, Temperature, Temp, C, Celsius                  |
| Heizprofil   | Heizprofil, Profil, Profile, Heating Profile               |
| Zusatzinfo   | Zusatzinfo, Veranstaltung, Notes, Notiz, Bemerkung, Info   |

### Datumsformate

Folgende Formate werden unterstuetzt:
- **Deutsch:** `DD.MM.YYYY HH:MM` (z.B. `15.01.2025 08:00`)
- **ISO:** `YYYY-MM-DD HH:MM` (z.B. `2025-01-15 08:00`)
- **ISO mit T:** `YYYY-MM-DDTHH:MM` (z.B. `2025-01-15T08:00`)
- **Excel-Seriennummern** werden automatisch konvertiert
- Separate Datums- und Zeitspalten werden automatisch kombiniert

### Steuerungsmodi

Es gibt zwei Steuerungsmodi:

**1. Temperatursteuerung (Standard)**

In der Spalte "Temperatur" einen Wert zwischen 0 und 30 Grad angeben. Optional kann ein vordefiniertes Heizprofil (Komfort, Nacht, etc.) verwendet werden.

**2. Geraeteprofilsteuerung**

In der Spalte "Heizprofil" den Wert `Geraeteprofil:N` angeben (N = 1, 2 oder 3). Das aktiviert direkt eines der drei auf dem Thermostat hinterlegten Profile.

Beispiel:

| Bereich     | Startdatum       | Enddatum         | Heizprofil       |
| ----------- | ---------------- | ---------------- | ---------------- |
| Wohnzimmer  | 15.01.2025 08:00 | 15.01.2025 22:00 | Geraeteprofil:2  |

### Upload-Vorgang

1. Datei per Drag-and-Drop oder Klick in den Upload-Bereich ziehen
2. Die erkannten Daten werden in einer Vorschau-Tabelle angezeigt
3. Einen Namen fuer den Zeitplan vergeben
4. **Zeitplan erstellen** klicken
5. Der Zeitplan erscheint in der Zeitplan-Liste (noch inaktiv)

---

## Zeitplaene verwalten

### Zeitplan aktivieren

Klicken Sie auf **Aktivieren** neben dem Zeitplan. Der Zeitplan wird sofort ausgefuehrt und dann alle 60 Sekunden geprueft.

### Zeitplan deaktivieren

Klicken Sie auf **Deaktivieren**. Die Thermostate bleiben auf der zuletzt gesetzten Temperatur.

### Zeitplan loeschen

Klicken Sie auf **Loeschen**. Der Zeitplan und die zugehoerige Datei werden entfernt.

### Ausfuehrungslogik

- Alle 60 Sekunden prueft der Scheduler alle aktiven Zeitplaene
- Liegt die aktuelle Uhrzeit innerhalb eines Zeitfensters, wird die Temperatur/das Profil gesetzt
- Bei der Geraeteprofilsteuerung wird nach Ende des Zeitfensters automatisch auf Profil 1 zurueckgesetzt
- Fehler bei einzelnen Geraeten stoppen nicht die Ausfuehrung fuer andere Geraete

---

## Heizprofile

Das System bietet vier vordefinierte Heizprofile:

| Profil      | Temperatur | Beschreibung               |
| ----------- | ---------- | -------------------------- |
| Komfort     | 21.0 C     | Komfortable Raumtemperatur |
| Nacht       | 17.0 C     | Nachtabsenkung             |
| Abwesenheit | 16.0 C     | Temperatur bei Abwesenheit |
| Reduziert   | 19.0 C     | Reduzierte Temperatur      |

Wenn in der Excel-Datei ein Profilname in der Spalte "Heizprofil" steht, wird automatisch die zugehoerige Temperatur verwendet. Ein zusaetzlicher Wert in der Spalte "Temperatur" wird in diesem Fall ignoriert.

---

## Dateiquellen

Dateiquellen ermoeglichen den automatischen Import von Heizplaenen aus externen Speicherorten.

### USB-Dateiquelle

Importiert Heizplaene von einem angeschlossenen USB-Stick.

**Konfiguration:**

1. Im Abschnitt **Dateiquellen** -> **USB** die Felder ausfuellen:
   - **Mount-Punkt:** Pfad zum USB-Stick (z.B. `/media/usb0`)
   - **Unterordner:** Optionaler Unterordner (z.B. `heizplaene`)
2. **Speichern** klicken
3. **Scannen** klicken um Dateien zu finden
4. Gewuenschte Datei **Importieren**

### FRITZ!Box NAS

Importiert Heizplaene vom NAS-Speicher einer FRITZ!Box ueber FTP.

**Voraussetzungen:**
- FTP-Zugang auf der FRITZ!Box aktiviert (unter Heimnetz -> Speicher (NAS))
- FTP-Benutzer eingerichtet

**Konfiguration:**

1. Im Abschnitt **Dateiquellen** -> **FRITZ!Box** die Felder ausfuellen:
   - **Host:** IP-Adresse oder Hostname der FRITZ!Box (z.B. `fritz.box`)
   - **Port:** FTP-Port (Standard: 21)
   - **Benutzername:** FTP-Benutzername
   - **Passwort:** FTP-Passwort
   - **Pfad:** Ordner auf dem NAS (z.B. `/FRITZ/NAS/Heizplan`)
   - **Sicher (FTPS):** Verschluesselte Verbindung (empfohlen)
2. **Speichern** klicken
3. **Verbindung testen** klicken um die Verbindung zu pruefen
4. **Scannen** klicken um Dateien zu finden
5. Gewuenschte Datei **Importieren**

### iCloud Drive

Importiert Heizplaene aus iCloud Drive.

**Voraussetzungen:**
- Python 3 muss auf der CCU installiert sein
- `pyicloud`-Bibliothek: `pip install pyicloud`

**Konfiguration:**

1. Im Abschnitt **Dateiquellen** -> **iCloud** auf **Anmelden** klicken
2. Apple-ID und Passwort eingeben
3. Bei aktivierter Zwei-Faktor-Authentifizierung den Code eingeben
4. Nach erfolgreicher Anmeldung den Ordner-Pfad konfigurieren (z.B. `/Heizplan`)
5. **Scannen** klicken um Dateien zu finden
6. Gewuenschte Datei **Importieren**

**Hinweis:** Die iCloud-Session kann ablaufen und erfordert dann eine erneute Anmeldung.

### Aenderungserkennung

Beim Import wird eine Pruefsumme (MD5) der Datei gespeichert. Wird die gleiche Datei erneut importiert (z.B. durch Polling), erkennt das System ob sich die Datei geaendert hat:

- **Geaendert:** Der bestehende Zeitplan wird automatisch aktualisiert
- **Unveraendert:** Kein Import notwendig

---

## Polling (automatische Pruefung)

Das Polling prueft automatisch alle aktivierten Dateiquellen in regelmaessigen Abstaenden auf neue oder geaenderte Dateien.

### Konfiguration

1. Im Abschnitt **Dateiquellen** -> **Polling** das Polling aktivieren
2. Intervall waehlen: 15, 30, 60, 120 oder 360 Minuten
3. **Speichern** klicken

### Funktionsweise

- Das Polling prueft alle aktivierten Dateiquellen
- Bei geaenderten Dateien (andere Pruefsumme) wird automatisch importiert
- Das Polling-Log zeigt die letzten Aktionen an
- Nach 5 aufeinanderfolgenden Fehlern wird eine Quelle automatisch deaktiviert
- Ueber **Alle pruefen** kann manuell ein Pruefzyklus ausgeloest werden

### Polling-Log

Das Log zeigt Eintraege folgender Typen:

| Typ             | Bedeutung                                  |
| --------------- | ------------------------------------------ |
| `import`        | Datei wurde erfolgreich importiert         |
| `change`        | Aenderung erkannt, Import durchgefuehrt    |
| `error`         | Fehler beim Zugriff auf die Quelle         |
| `disabled`      | Quelle automatisch deaktiviert (zu viele Fehler) |
| `source_missing`| Quelle nicht verfuegbar                    |

---

## Push-Endpunkt

Der Push-Endpunkt ermoeglicht den Import von Heizplaenen per HTTP-Request. Dies eignet sich fuer Automatisierungen (z.B. Apple Shortcuts, Home Assistant, Skripte).

### Aktivierung

1. Im Abschnitt **Dateiquellen** -> **Push** den Endpunkt aktivieren
2. Den angezeigten **API-Key** notieren
3. Der Endpunkt ist: `POST http://[CCU-IP]:8080/api/push/upload`

### Verwendung

Die Datei wird als `multipart/form-data` mit Bearer-Token-Authentifizierung hochgeladen:

```bash
curl -X POST http://[CCU-IP]:8080/api/push/upload \
  -H "Authorization: Bearer DEIN_API_KEY" \
  -F "file=@heizplan.xlsx"
```

### API-Key erneuern

Klicken Sie auf **Key erneuern** um einen neuen API-Key zu generieren. Der alte Key wird sofort ungueltig.

### Apple Shortcut Beispiel

1. Shortcut erstellen
2. Aktion "URL-Inhalt abrufen" hinzufuegen
3. URL: `http://[CCU-IP]:8080/api/push/upload`
4. Methode: POST
5. Header hinzufuegen: `Authorization` = `Bearer DEIN_API_KEY`
6. Anfrage-Inhalt: Datei
7. Datei aus iCloud Drive oder anderem Speicherort waehlen

---

## Health-Check und Status

Der Health-Check-Endpunkt gibt den aktuellen Systemstatus zurueck:

```bash
curl http://[CCU-IP]:8080/api/health
```

Antwort:

```json
{
  "status": "ok",
  "uptime": 3600,
  "timestamp": "2025-01-15T12:00:00.000Z",
  "mode": "local",
  "ccuVerbunden": true,
  "aktiveZeitplaene": 2
}
```

| Feld                | Beschreibung                                    |
| ------------------- | ----------------------------------------------- |
| `status`            | Immer "ok"                                      |
| `uptime`            | Laufzeit in Sekunden                            |
| `mode`              | Verbindungsmodus (local/cloud)                  |
| `ccuVerbunden`      | CCU-Verbindung aktiv                            |
| `aktiveZeitplaene`  | Anzahl aktiver Zeitplaene                       |
| `ccuFehler`         | Fehlermeldung (nur bei Verbindungsproblemen)     |

---

## Fehlerbehebung

### Service-Befehle

```bash
# Status pruefen
ssh root@[CCU-IP] /etc/init.d/my-homematic-addon status

# Logs ansehen
ssh root@[CCU-IP] tail -f /var/log/my-homematic-addon.log

# Service neu starten
ssh root@[CCU-IP] /etc/init.d/my-homematic-addon restart

# Health-Check
curl http://[CCU-IP]:8080/api/health
```

### Haeufige Probleme

| Problem | Loesung |
| ------- | ------- |
| Web-UI nicht erreichbar | Port pruefen (Standard 8080), Service-Status pruefen |
| "Addon nicht initialisiert" | `.env`-Datei pruefen, insbesondere `HOMEMATIC_MODE` und CCU-Einstellungen |
| Keine Geraete gefunden | CCU-Verbindung pruefen: IP-Adresse, Port 2001, XML-RPC aktiv? |
| Zeitplan wird nicht ausgefuehrt | Ist der Zeitplan aktiviert? Liegt die aktuelle Zeit im Zeitfenster? |
| Upload schlaegt fehl | Dateiformat pruefen (.xlsx, .xls, .numbers), Dateigroesse < 10 MB? |
| Spalten nicht erkannt | Spaltennamen pruefen (siehe Tabelle oben), erste Zeile muss Ueberschriften enthalten |
| FRITZ!Box Verbindung fehlgeschlagen | FTP auf FRITZ!Box aktiviert? Benutzername/Passwort korrekt? Pfad existiert? |
| iCloud "Python nicht verfuegbar" | Python 3 und pyicloud installieren: `pip install pyicloud` |
| iCloud 2FA-Fehler | Erneut anmelden, Code zeitnah eingeben |
| Polling importiert nicht | Quellentyp aktiviert? Datei geaendert (neue Pruefsumme)? Polling-Log pruefen |
| Push "Ungueltiger API-Key" | API-Key korrekt? Push-Endpunkt aktiviert? |

### Log-Level erhoehen

Fuer detailliertere Fehlersuche den Log-Level auf `debug` setzen:

```bash
# In .env aendern:
LOG_LEVEL=debug

# Service neu starten:
/etc/init.d/my-homematic-addon restart

# Logs beobachten:
tail -f /var/log/my-homematic-addon.log
```

### Deinstallation

Ueber die CCU-Weboberflaeche unter **Einstellungen** -> **Systemsteuerung** -> **Zusatzsoftware** oder per SSH:

```bash
ssh root@[CCU-IP] /usr/local/addons/my-homematic-addon/uninstall.sh
```

Dies stoppt den Service, entfernt alle Dateien und deregistriert den Systemdienst.
