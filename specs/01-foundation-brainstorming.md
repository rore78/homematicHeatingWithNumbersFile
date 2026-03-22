# Epic 1: Foundation -- Brainstorming

## Runde 1: Test-Framework und Grundsatzentscheidungen

### Frage 1.1: Test-Framework

Welches Test-Framework sollen wir verwenden?

- [x] **vitest** (Empfohlen) -- Schnell, native ES Module Unterstuetzung, Jest-kompatible API, Watch-Mode, eingebaute Coverage (v8/istanbul). Sehr gut fuer dieses Projekt da es bereits ES Modules nutzt (`"type": "module"`).
- [ ] **node:test** (Node.js built-in) -- Keine zusaetzliche Abhaengigkeit, ab Node 18 stabil. Minimalistischer, weniger Komfort-Features. Problem: CCU3 koennte noch Node 14/16 haben.
- [ ] **Jest** -- Am weitesten verbreitet, aber hat bekannte Probleme mit ES Modules (erfordert experimental flags oder Babel-Transform).

### Frage 1.2: Linting

Welches Linting-Setup?

- [x] **ESLint (flat config)** (Empfohlen) -- Neues Config-Format (eslint.config.js), zukunftssicher, funktioniert out-of-the-box mit ES Modules.
- [ ] **ESLint (legacy .eslintrc)** -- Aelteres Format, wird aber noch breit unterstuetzt.
- [ ] **Biome** -- Schneller All-in-One Linter+Formatter, aber weniger verbreitet und weniger Plugins.

### Frage 1.3: Code-Formatter

Soll ein Code-Formatter eingerichtet werden?

- [x] **Prettier** (Empfohlen) -- Standard-Formatter, integriert sich gut mit ESLint via eslint-config-prettier.
- [ ] **Kein Formatter** -- Nur Linting, kein automatisches Formatieren. Weniger Aufwand, aber inkonsistenter Code-Stil.

### Frage 1.4: Node.js Mindestversion

Aktuell steht `"engines": { "node": ">=14.0.0" }` in package.json. Vitest braucht Node >= 18. Sollen wir die Mindestversion anheben?

- [x] **Node >= 18** (Empfohlen) -- Vitest funktioniert, node:test als Alternative verfuegbar, moderne ES Module Features. Frage: Welche Node-Version laeuft auf deiner CCU3?
- [ ] **Node >= 14 beibehalten** -- Dann kein vitest moeglich, muessten auf node:test oder Jest ausweichen.

### Frage 1.5: Test-Scope / Prioritaeten

Welche Module haben die hoechste Test-Prioritaet? (Mehrfachauswahl moeglich)

- [x] **ExcelParser** (Empfohlen) -- Komplexeste reine Logik: Spaltenerkennung, 4 Datumsformate, Temperaturvalidierung. Hoechstes Bug-Risiko.
- [x] **ScheduleManager** -- CRUD + checkAndExecute Zeitfenster-Logik. Kern-Business-Logik.
- [ ] **HeatingProfile** -- Einfach aber kritisch: Profil-Lookup, Temperatur-Aufloesung.
- [ ] **AreaManager** -- CRUD + resolveDevices (Bereich vs. Komma-getrennte IDs vs. einzelne ID).
- [ ] **Config** -- Mode-Erkennung (cloud/local/auto), Validierung.
- [ ] **REST API Routen** (Integrationstests) -- Upload-Endpunkt, Zeitplan-CRUD, Bereichs-CRUD.
- [ ] **DeviceController** -- Normalisierung Cloud vs. Local Format.

---

## Runde 2: Teststruktur und Details

### Frage 2.1: Testdatei-Struktur

Wo sollen die Tests liegen?

- [x] **tests/ im Projekt-Root** (Empfohlen) -- Klare Trennung: `tests/unit/` und `tests/integration/`. Einfach in .gitignore/build-Scripts auszuschliessen. Gaengig bei Node.js-Projekten.

```
tests/
  unit/
    excelParser.test.js
    scheduleManager.test.js
    heatingProfile.test.js
    areaManager.test.js
    config.test.js
  integration/
    api.test.js
  fixtures/
    test-schedule.xlsx
    test-schedule-german-dates.xlsx
```

- [ ] **Co-located neben Source** -- `src/parser/excelParser.test.js` direkt neben der Source-Datei. Kuerze Import-Pfade, aber vermischt Source und Tests.

### Frage 2.2: Test-Fixtures fuer ExcelParser

Der ExcelParser braucht echte Excel-Dateien zum Testen. Ansatz?

- [ ] **Echte .xlsx Test-Fixtures** (Empfohlen) -- Kleine Excel-Dateien in `tests/fixtures/` die verschiedene Szenarien abdecken: Standard-Schema, deutsche Datumsformate, fehlende Spalten, ungueltige Temperaturen. Wir erstellen 3-4 Dateien.
- [x] **Programmatisch erzeugte Dateien** -- xlsx-Library im Test nutzen um Dateien on-the-fly zu erzeugen. Flexibler, aber komplexer zu warten.

### Frage 2.3: ScheduleManager-Tests -- Umgang mit Dateisystem

Der ScheduleManager liest/schreibt JSON-Dateien in `schedules/` und startet einen 60s-Timer. Wie testen?

- [x] **Temporaeres Verzeichnis + Timer-Mocking** (Empfohlen) -- Tests nutzen ein tmp-Verzeichnis fuer Schedules, vitest's `vi.useFakeTimers()` fuer den Scheduler-Intervall. So testen wir echte File-I/O ohne das Produktions-Verzeichnis zu beruehren.
- [ ] **Alles mocken** -- Dateisystem und Timer komplett mocken. Schneller, aber testet weniger reales Verhalten.

### Frage 2.4: Coverage-Ziel

Welches Coverage-Ziel fuer dieses Epic?

- [x] **Kein festes Ziel, pragmatisch** (Empfohlen) -- Fokus auf die 2 Prio-Module (ExcelParser, ScheduleManager) mit hoher Coverage dort (~80%+). Restliche Module bekommen Basis-Tests. Kein erzwungenes globales Coverage-Gate.
- [ ] **Globales Minimum (z.B. 60%)** -- Erzwungenes Minimum ueber alle Dateien. Kann zu sinnlosen Tests fuehren um die Schwelle zu erreichen.
- [ ] **80%+ ueberall** -- Hoher Anspruch, aber mehr Aufwand fuer Module die spaeter evtl. umgeschrieben werden.

### Frage 2.5: Bestehenden Code formatieren?

Soll Prettier beim Einrichten einmalig ueber den gesamten bestehenden Code laufen?

- [x] **Ja, ein grosser Format-Commit** (Empfohlen) -- Einmal alles formatieren, als eigener Commit. Danach ist der Code konsistent. Der Diff ist gross aber rein kosmetisch.
- [ ] **Nein, nur neuen Code** -- Nur neue/geaenderte Dateien werden formatiert. Vermeidet grossen Diff, aber der Code-Stil bleibt inkonsistent.

---

## Runde 3: ESLint-Regeln, Prettier-Stil und npm-Scripts

### Frage 3.1: Prettier-Stil

Welche Prettier-Einstellungen?

- [x] **Standard-Prettier** (Empfohlen) -- Keine eigene Config, Prettier-Defaults: 80 Zeichen, 2 Spaces, Semikolons, einfache Anfuehrungszeichen nur bei Bedarf. Weniger Diskussion, breit akzeptiert.
- [ ] **Angepasst: Single Quotes + Trailing Commas** -- `{ singleQuote: true, trailingComma: 'es5' }`. Passt besser zum bestehenden Code-Stil (der bereits single quotes nutzt).

### Frage 3.2: ESLint-Regelstrenge

Wie streng soll ESLint konfiguriert werden?

- [x] **eslint:recommended + wenige Extras** (Empfohlen) -- Basis-Regelwerk, faengt echte Fehler ab (no-unused-vars, no-undef, etc.) ohne uebertrieben streng zu sein. Schnell einzurichten.
- [ ] **Strenger (+ eslint-plugin-import)** -- Zusaetzlich Import-Reihenfolge, no-cycle, etc. Mehr Qualitaet, aber mehr Aufwand bei der Erstkorrektur.

### Frage 3.3: npm-Scripts

Welche Scripts sollen in package.json stehen?

- [x] **Komplett-Set** (Empfohlen):

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "lint": "eslint .",
  "lint:fix": "eslint . --fix",
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

- [ ] **Minimal** -- Nur `test` und `lint`. Weitere bei Bedarf.

### Frage 3.4: Soll es noch weitere Fragen geben, oder sind alle Aspekte abgedeckt?

- [x] **Alles klar, schreibe die Spezifikation** -- Alle Entscheidungen sind getroffen. Bitte die vollstaendige Spezifikation in `specs/01-foundation-specification.md` schreiben.
- [ ] **Weitere Fragen** -- Ich habe noch offene Punkte (bitte als Kommentar angeben).
