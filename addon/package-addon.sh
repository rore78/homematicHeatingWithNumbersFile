#!/bin/bash
# Verpackt das Addon fuer die CCU3-Installation als Zusatzsoftware-Plugin

ADDON_NAME="my-homematic-addon"
VERSION="1.0.0"
BUILD_DIR="build"
ADDON_DIR="$BUILD_DIR/addon"
PROJECT_ROOT=$(dirname "$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")")

# Fallback fuer macOS (readlink -f funktioniert nicht)
if [ ! -d "$PROJECT_ROOT/src" ]; then
    PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fi

echo "Verpacke Homematic IP Addon fuer CCU3..."
echo "Projekt-Root: $PROJECT_ROOT"

# Erstelle Build-Verzeichnis
rm -rf $BUILD_DIR
mkdir -p $ADDON_DIR

echo "Installiere Produktions-Abhaengigkeiten..."
cd "$PROJECT_ROOT"
npm ci --omit=dev --ignore-scripts
cd - > /dev/null

echo "Kopiere Projektdateien..."

# Kopiere Anwendungsdateien
cp -r "$PROJECT_ROOT/src" "$ADDON_DIR/" 2>/dev/null || echo "WARNUNG: src/ nicht gefunden"
cp -r "$PROJECT_ROOT/public" "$ADDON_DIR/" 2>/dev/null || echo "WARNUNG: public/ nicht gefunden"
cp -r "$PROJECT_ROOT/node_modules" "$ADDON_DIR/" 2>/dev/null || echo "WARNUNG: node_modules/ nicht gefunden"
cp "$PROJECT_ROOT/server.js" "$ADDON_DIR/" 2>/dev/null || echo "WARNUNG: server.js nicht gefunden"
cp "$PROJECT_ROOT/package.json" "$ADDON_DIR/" 2>/dev/null || echo "WARNUNG: package.json nicht gefunden"

# Erstelle leere Verzeichnisse
mkdir -p "$ADDON_DIR/schedules"
mkdir -p "$ADDON_DIR/uploads"

# Kopiere CCU3-spezifische Dateien
echo "Kopiere CCU3 Addon-Dateien..."
cp "$PROJECT_ROOT/addon/update_script" "$ADDON_DIR/" 2>/dev/null || { echo "FEHLER: update_script nicht gefunden!"; exit 1; }
cp "$PROJECT_ROOT/addon/rc.d" "$ADDON_DIR/" 2>/dev/null || { echo "FEHLER: rc.d nicht gefunden!"; exit 1; }
cp "$PROJECT_ROOT/addon/addon.conf" "$ADDON_DIR/" 2>/dev/null || echo "WARNUNG: addon.conf nicht gefunden"

# Setze Ausfuehrungsrechte
chmod +x "$ADDON_DIR/update_script"
chmod +x "$ADDON_DIR/rc.d"

# Entferne .DS_Store und andere unnoetige Dateien
find "$ADDON_DIR" -name ".DS_Store" -delete 2>/dev/null || true
find "$ADDON_DIR" -name ".gitkeep" -delete 2>/dev/null || true

# Pruefe auf native Module (Cross-Platform-Warnung)
NATIVE_COUNT=$(find "$ADDON_DIR/node_modules" -name "*.node" 2>/dev/null | wc -l | tr -d ' ')
if [ "$NATIVE_COUNT" -gt 0 ]; then
    echo ""
    echo "WARNUNG: $NATIVE_COUNT native Module gefunden. Diese funktionieren moeglicherweise nicht auf CCU3 (ARM)."
    find "$ADDON_DIR/node_modules" -name "*.node"
    echo ""
fi

# Entferne Symlinks in node_modules/.bin (CCU3/BusyBox kompatibel)
if [ -d "$ADDON_DIR/node_modules/.bin" ]; then
    rm -rf "$ADDON_DIR/node_modules/.bin"
fi

# Erstelle tar.gz - Dateien direkt im Root des Archivs
# COPYFILE_DISABLE=1 verhindert macOS ._* Extended-Attribute-Dateien im Archiv
echo "Erstelle tar.gz Archiv..."
cd "$ADDON_DIR"
COPYFILE_DISABLE=1 tar -czf "../${ADDON_NAME}-${VERSION}.tar.gz" .
cd "$PROJECT_ROOT"

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "Addon erfolgreich verpackt!"
    echo "=========================================="
    echo "Datei: $BUILD_DIR/${ADDON_NAME}-${VERSION}.tar.gz"
    echo "Groesse: $(du -h "$BUILD_DIR/${ADDON_NAME}-${VERSION}.tar.gz" | cut -f1)"
    echo ""
    echo "Struktur im Archiv:"
    tar -tzf "$BUILD_DIR/${ADDON_NAME}-${VERSION}.tar.gz" | head -20
    echo "..."
    echo ""
    echo "Installation auf CCU3:"
    echo "  CCU3-Weboberflaeche -> Einstellungen -> Systemsteuerung -> Zusatzsoftware"
    echo "  Datei waehlen -> ${ADDON_NAME}-${VERSION}.tar.gz -> Installieren"
    echo ""
    echo "Alternative per SSH:"
    echo "  scp $BUILD_DIR/${ADDON_NAME}-${VERSION}.tar.gz root@[CCU-IP]:/tmp/"
    echo "  ssh root@[CCU-IP]"
    echo "  cd /tmp && mkdir addon && cd addon && tar -xzf ../${ADDON_NAME}-${VERSION}.tar.gz && ./update_script"
    echo "=========================================="
else
    echo "FEHLER: Verpackung fehlgeschlagen!"
    exit 1
fi
