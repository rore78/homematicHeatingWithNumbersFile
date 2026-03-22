#!/bin/bash
# Verpackt das Addon für die CCU-Installation

ADDON_NAME="my-homematic-addon"
VERSION="1.0.0"
BUILD_DIR="build"
ADDON_DIR="$BUILD_DIR/addon"
PROJECT_ROOT=$(dirname "$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")")

# Fallback für macOS (readlink -f funktioniert nicht)
if [ ! -d "$PROJECT_ROOT/src" ]; then
    PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fi

echo "Verpacke Homematic IP Addon..."
echo "Projekt-Root: $PROJECT_ROOT"

# Erstelle Build-Verzeichnis
rm -rf $BUILD_DIR
mkdir -p $ADDON_DIR

echo "Kopiere Projektdateien..."

# Kopiere alle notwendigen Dateien
cp -r "$PROJECT_ROOT/src" "$ADDON_DIR/" 2>/dev/null || echo "WARNUNG: src/ nicht gefunden"
cp -r "$PROJECT_ROOT/public" "$ADDON_DIR/" 2>/dev/null || echo "WARNUNG: public/ nicht gefunden"
cp "$PROJECT_ROOT/server.js" "$ADDON_DIR/" 2>/dev/null || echo "WARNUNG: server.js nicht gefunden"
cp "$PROJECT_ROOT/package.json" "$ADDON_DIR/" 2>/dev/null || echo "WARNUNG: package.json nicht gefunden"
cp "$PROJECT_ROOT/README.md" "$ADDON_DIR/" 2>/dev/null || echo "WARNUNG: README.md nicht gefunden"

# Erstelle leere Verzeichnisse (werden bei Installation erstellt)
mkdir -p "$ADDON_DIR/schedules"
mkdir -p "$ADDON_DIR/uploads"

# Kopiere Installationsdateien aus addon/ Verzeichnis
echo "Kopiere Installationsdateien..."
cp "$PROJECT_ROOT/addon/install.sh" "$ADDON_DIR/" 2>/dev/null || echo "WARNUNG: install.sh nicht gefunden"
cp "$PROJECT_ROOT/addon/uninstall.sh" "$ADDON_DIR/" 2>/dev/null || echo "WARNUNG: uninstall.sh nicht gefunden"
cp "$PROJECT_ROOT/addon/addon.conf" "$ADDON_DIR/" 2>/dev/null || echo "WARNUNG: addon.conf nicht gefunden"
cp "$PROJECT_ROOT/addon/install.conf" "$ADDON_DIR/" 2>/dev/null || cp "$PROJECT_ROOT/addon/addon.conf" "$ADDON_DIR/install.conf" 2>/dev/null || echo "WARNUNG: install.conf nicht gefunden"

# Setze Ausführungsrechte für Skripte
chmod +x "$ADDON_DIR/install.sh" 2>/dev/null || true
chmod +x "$ADDON_DIR/uninstall.sh" 2>/dev/null || true

# Erstelle .gitkeep für leere Verzeichnisse (optional)
touch "$ADDON_DIR/schedules/.gitkeep" 2>/dev/null || true
touch "$ADDON_DIR/uploads/.gitkeep" 2>/dev/null || true

# Erstelle tar.gz - WICHTIG: Dateien müssen direkt im Root sein, nicht in addon/ Unterverzeichnis
echo "Erstelle tar.gz Archiv..."
cd "$ADDON_DIR"
tar -czf "../${ADDON_NAME}-${VERSION}.tar.gz" .
cd "$PROJECT_ROOT"

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "Addon erfolgreich verpackt!"
    echo "=========================================="
    echo "Datei: $BUILD_DIR/${ADDON_NAME}-${VERSION}.tar.gz"
    echo "Größe: $(du -h "$BUILD_DIR/${ADDON_NAME}-${VERSION}.tar.gz" | cut -f1)"
    echo ""
    echo "Struktur im Archiv:"
    tar -tzf "$BUILD_DIR/${ADDON_NAME}-${VERSION}.tar.gz" | head -10
    echo "..."
    echo ""
    echo "Installation auf CCU:"
    echo "1. Über die CCU-Weboberfläche:"
    echo "   Addons → Addon hinzufügen → Datei auswählen"
    echo ""
    echo "2. Oder per SSH:"
    echo "   scp $BUILD_DIR/${ADDON_NAME}-${VERSION}.tar.gz root@[CCU-IP]:/tmp/"
    echo "   ssh root@[CCU-IP]"
    echo "   cd /tmp && tar -xzf ${ADDON_NAME}-${VERSION}.tar.gz"
    echo "   ./install.sh"
    echo "=========================================="
else
    echo "FEHLER: Verpackung fehlgeschlagen!"
    exit 1
fi

