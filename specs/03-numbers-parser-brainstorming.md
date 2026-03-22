# Epic 3: Nativer Apple Numbers Parser -- Brainstorming

## Runde 1: Technologie-Auswahl und Grundansatz

### Frage 1.1: Parsing-Ansatz

Apple Numbers Dateien (.numbers) sind ZIP-Archive mit Protobuf-codierten .iwa-Dateien (kein XML wie bei .xlsx). Es gibt keine stabile, gut gewartete Node.js-Bibliothek dafuer. Welchen Ansatz sollen wir waehlen?

```
Ansatz A: Python-Bridge
  Node.js  -->  child_process.execFile('python3')  -->  numbers-parser (PyPI)
  + Bewiesene, gut gewartete Python-Library
  + Korrekte Ergebnisse
  - Python muss auf CCU3 verfuegbar sein (NICHT standardmaessig vorhanden!)
  - Zusaetzliche Abhaengigkeit, Deployment-Komplexitaet
  - ~50-100 MB Python-Installation auf der CCU3

Ansatz B: xlsx-Bibliothek (aktuell)
  XLSX.readFile('datei.numbers')  -->  Hoffnung dass es klappt
  + Kein Aufwand, xlsx behauptet .numbers-Support
  - xlsx-Library hat nur EXPERIMENTELLEN .numbers-Support
  - Bricht bei neueren Numbers-Versionen oft ab
  - Unzuverlaessig, genau deshalb ist der Stub entstanden

Ansatz C: Eigener Protobuf-Reader
  .numbers (ZIP) --> entpacken --> .iwa Dateien --> Protobuf decode --> Tabellendaten
  + Keine externen Abhaengigkeiten
  + Volle Kontrolle
  - Hochkomplex, Apple-Format ist nicht dokumentiert
  - Wochen an Reverse-Engineering-Aufwand
  - Fragil bei Apple-Format-Aenderungen

Ansatz D: numbers-parser npm-Paket
  npm install numbers-parser --> parse('datei.numbers')
  + Reine Node.js-Loesung, einfache Integration
  - Paket existiert NICHT auf npm (Stand 2025)
  - Keine zuverlaessige Alternative gefunden

Ansatz E: Konvertierung via LibreOffice CLI
  libreoffice --headless --convert-to xlsx datei.numbers --> ExcelParser
  + Bewaehrte Konvertierung
  - LibreOffice auf CCU3 installieren = unrealistisch (~500 MB)
  - Nur fuer Server/Desktop-Umgebungen sinnvoll
```

- [ ] **Ansatz A: Python-Bridge** -- Zuverlaessigste Loesung, aber Python auf CCU3 noetig. Muesste als Voraussetzung dokumentiert werden oder Python mitgeliefert werden.
- [x] **Ansatz B: xlsx-Library nutzen** (Empfohlen) -- Einfachste Loesung. Die xlsx-Library (SheetJS) hat experimentellen .numbers-Support. Wir testen ob es fuer unsere Beispieldatei funktioniert und dokumentieren Einschraenkungen. Fallback: Export-Hinweis.
- [ ] **Ansatz C: Eigener Protobuf-Reader** -- Zu aufwendig und fragil. Nicht empfohlen.
- [ ] **Ansatz D: Konvertierung vorschalten** -- User konvertiert vorher zu .xlsx (z.B. in Numbers "Exportieren als Excel"). Kein nativer Parser, aber zuverlaessig. Schlechteste UX.

### Frage 1.2: Verhalten bei Parse-Fehler

Was soll passieren wenn eine .numbers-Datei nicht geparst werden kann?

- [x] **Fehler + Export-Hinweis** (Empfohlen) -- Fehlermeldung "Die Numbers-Datei konnte nicht gelesen werden. Bitte exportiere die Datei als Excel (.xlsx) in Apple Numbers (Ablage > Exportieren > Excel)." -- Gibt dem Benutzer einen klaren Workaround.
- [ ] **Nur Fehlermeldung** -- Generischer Fehler ohne Hilfestellung.
- [ ] **Automatische Konvertierung versuchen** -- Versucht die Datei mit verschiedenen Methoden zu lesen. Aufwaendiger.

### Frage 1.3: Kompatibilitaetsumfang

Welche .numbers-Versionen und Features muessen unterstuetzt werden?

- [x] **Nur einfache Tabellen** (Empfohlen) -- Eine einzelne Tabelle pro Sheet, einfache Zellen mit Text/Zahlen/Datum. Keine Formeln, keine mehreren Tabellen pro Sheet, keine verschachtelten Strukturen. Das deckt unseren Anwendungsfall (Heizungszeitplaene) vollstaendig ab.
- [ ] **Erweitert** -- Mehrere Tabellen pro Sheet, einfache Formeln (berechnete Werte lesen). Deutlich komplexer.
- [ ] **Umfassend** -- Volle Numbers-Kompatibilitaet. Unrealistisch ohne Apple-Bibliotheken.

### Frage 1.4: Test-Strategie fuer Numbers-Parser

Wie testen wir den Parser?

- [x] **Beispieldatei + Snapshot** (Empfohlen) -- Die vorhandene `examples/HmIP-Sondertermine.numbers` als Testfixture verwenden. Erwartete Ausgabe manuell verifizieren und als Snapshot/Referenzdaten im Test hinterlegen. Zusaetzlich eine aequivalente .xlsx-Datei erstellen und pruefen dass beide Parser die gleiche normalisierte Ausgabe liefern.
- [ ] **Nur Unit-Tests** -- Nur interne Funktionen testen (Protobuf-Decoding, Zellwert-Extraktion), nicht die Gesamtpipeline.
- [ ] **Property-based Testing** -- Generierte Testdaten. Overkill fuer diesen Anwendungsfall.

---

## Runde 2: Architektur und Integration

### Frage 2.1: Verhaeltnis NumbersParser zu ExcelParser

Da wir die xlsx-Library fuer beide Formate nutzen (`XLSX.readFile()` kann sowohl .xlsx als auch .numbers lesen), stellt sich die Frage: Brauchen wir ueberhaupt zwei separate Parser-Klassen?

```
Variante A: Ein Parser fuer alles
  SpreadsheetParser
  ├── parse(filePath)        // XLSX.readFile() -- funktioniert fuer .xlsx UND .numbers
  ├── normalizeData(data)
  ├── detectColumns(row)
  └── parseRow(row, map)

Variante B: Zwei Parser, gemeinsame Basis (aktuell)
  ExcelParser                    NumbersParser
  ├── parse(filePath)            ├── parse(filePath)   // delegiert an xlsx
  ├── normalizeData(data)        └── (eigene Fehlerbehandlung)
  ├── detectColumns(row)
  └── parseRow(row, map)

Variante C: NumbersParser erbt/delegiert an ExcelParser
  ExcelParser                    NumbersParser extends ExcelParser
  ├── parse(filePath)            ├── parse(filePath)   // Override: try super.parse(),
  ├── normalizeData(data)        │                     // catch + hilfreiche Fehlermeldung
  └── ...                        └── (keine eigene Logik)
```

- [x] **Variante A: Ein SpreadsheetParser** (Empfohlen) -- Da `XLSX.readFile()` beide Formate unterstuetzt, ist eine Klasse am einfachsten. Die Dateierkennung passiert in `server.js` (Auswahl des Parsers nach Extension) -- die koennte vereinfacht werden. Weniger Code, weniger Wartung.
- [ ] **Variante C: NumbersParser erbt von ExcelParser** -- Minimale Aenderung am bestehenden Code. NumbersParser ueberschreibt nur `parse()` mit spezifischer Fehlerbehandlung fuer .numbers. server.js bleibt wie es ist.
- [ ] **Variante B: Zwei separate Parser beibehalten** -- Wie aktuell, aber NumbersParser bekommt eine echte Implementierung. Maximale Trennung, aber Code-Duplikation.

### Frage 2.2: xlsx-Library Version

Die aktuelle Abhaengigkeit ist `xlsx` Version `^0.18.5`. Dies ist die letzte **Community Edition** von SheetJS. Die neuere Version heisst `xlsx` ab 0.20+ und hat eine geaenderte Lizenz (nicht mehr Apache 2.0). Der .numbers-Support wurde in neueren Versionen verbessert.

- [ ] **Bei ^0.18.5 bleiben** (Empfohlen) -- Testen ob unsere Beispieldatei damit funktioniert. Wenn ja, kein Upgrade noetig. Apache-2.0-Lizenz bleibt erhalten. Kein Risiko durch Lizenzwechsel.
- [x] **Upgrade auf neueste xlsx-Version** -- Besserer .numbers-Support, aber Lizenzaenderung beachten. SheetJS Community Edition vs Pro.
- [ ] **Zu anderer Library wechseln (z.B. ExcelJS)** -- ExcelJS unterstuetzt KEIN .numbers. Waere ein Rueckschritt.

### Frage 2.3: Umgang mit mehreren Sheets/Tabellen

Eine .numbers-Datei kann mehrere Sheets ("Blaetter") enthalten. Der aktuelle ExcelParser nimmt immer das erste Sheet. Soll das fuer .numbers genauso sein?

- [x] **Immer erstes Sheet** (Empfohlen) -- Konsistentes Verhalten mit ExcelParser. Einfach, vorhersagbar. Der Benutzer muss seine Zeitplandaten im ersten Sheet haben.
- [ ] **Sheet-Auswahl per Name** -- Sucht nach einem Sheet mit Name "Zeitplan", "Heizung", o.ae. Fallback auf erstes Sheet.
- [ ] **Alle Sheets zusammenfuehren** -- Liest alle Sheets und kombiniert die Daten. Komplexer, unklar ob sinnvoll.

### Frage 2.4: Aequivalente Excel-Testdatei

Fuer den Test-Vergleich (Numbers vs Excel sollen gleiche Ausgabe liefern) brauchen wir eine .xlsx-Datei mit identischem Inhalt wie `HmIP-Sondertermine.numbers`. Wie erstellen wir diese?

- [ ] **Manuell in Numbers exportieren** (Empfohlen) -- Du oeffnest `HmIP-Sondertermine.numbers` in Apple Numbers und exportierst als Excel. Die resultierende .xlsx-Datei wird als `examples/HmIP-Sondertermine.xlsx` eingecheckt.
- [x] **Programmatisch erzeugen** -- Ein Script erstellt die .xlsx-Datei mit den gleichen Daten. Aufwaendiger, aber reproduzierbar.
- [ ] **Bereits vorhanden?** -- Pruefen ob es schon eine .xlsx-Variante gibt.
