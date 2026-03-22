# Epic 1: Foundation -- Browser-Testplan

## Voraussetzungen

1. Node.js >= 18 installiert
2. `npm install` erfolgreich ausgefuehrt
3. Keine laufende Instanz auf Port 3000

## Test 1: npm test -- Alle Tests bestehen

```bash
npm test
```

**Erwartetes Ergebnis:**
- 6 Testdateien bestehen
- 89 Tests bestehen
- Keine Fehler

## Test 2: npm run lint -- Keine Fehler

```bash
npm run lint
```

**Erwartetes Ergebnis:**
- Keine Fehler (0 errors)
- Warnungen sind akzeptabel

## Test 3: npm run format:check -- Konsistenter Code-Stil

```bash
npm run format:check
```

**Erwartetes Ergebnis:**
- "All matched files use Prettier code style!"

## Test 4: npm run test:coverage -- Coverage-Ziele erreicht

```bash
npm run test:coverage
```

**Erwartetes Ergebnis:**
- ExcelParser: >= 80% Statements
- ScheduleManager: >= 80% Statements
- HeatingProfile: >= 80% Statements
- AreaManager: >= 80% Statements
- Config: >= 80% Statements

## Test 5: Web-UI Upload-Funktionalitaet

1. Server starten: `npm run server`
2. Browser oeffnen: `http://localhost:3000`
3. Pruefen: Seite laedt ohne Fehler
4. Excel-Datei (.xlsx) mit korrektem Schema hochladen
5. Pruefen: Daten werden in der Vorschau-Tabelle angezeigt

**Erwartetes Ergebnis:**
- Seite laedt, Upload funktioniert, geparste Daten werden angezeigt

## Test 6: Web-UI Fehlerbehandlung

1. Server starten: `npm run server`
2. Versuchen eine .txt Datei hochzuladen

**Erwartetes Ergebnis:**
- Fehlermeldung wird angezeigt (nur Excel/Numbers erlaubt)

## Test 7: Vitest Watch-Modus

```bash
npm run test:watch
```

1. Tests laufen durch
2. Eine Testdatei aendern (z.B. einen Test-String anpassen)
3. Pruefen: Tests werden automatisch erneut ausgefuehrt

**Erwartetes Ergebnis:**
- Watch-Modus erkennt Aenderungen und fuehrt Tests erneut aus

## Test 8: ESLint Fix-Modus

```bash
npm run lint:fix
```

**Erwartetes Ergebnis:**
- Keine Aenderungen (Code ist bereits sauber) oder automatische Korrekturen

## Test 9: Prettier Format-Modus

```bash
npm run format
```

**Erwartetes Ergebnis:**
- Alle Dateien sind formatiert, keine Aenderungen noetig

## Zusammenfassung

| Test | Beschreibung | Typ |
|------|-------------|-----|
| 1 | npm test | Automatisch |
| 2 | npm run lint | Automatisch |
| 3 | npm run format:check | Automatisch |
| 4 | npm run test:coverage | Automatisch |
| 5 | Web-UI Upload | Manuell/Browser |
| 6 | Web-UI Fehlerbehandlung | Manuell/Browser |
| 7 | Vitest Watch-Modus | Manuell/Terminal |
| 8 | ESLint Fix | Automatisch |
| 9 | Prettier Format | Automatisch |
