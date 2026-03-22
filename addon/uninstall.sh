#!/bin/sh
# Deinstallationsskript für Homematic IP Addon

ADDON_DIR="/usr/local/addons/my-homematic-addon"
PID_FILE="/var/run/my-homematic-addon.pid"

echo "Deinstalliere Homematic IP Addon..."

# Stoppe Addon falls es läuft
if [ -f "/etc/init.d/my-homematic-addon" ]; then
    echo "Stoppe Addon..."
    /etc/init.d/my-homematic-addon stop 2>/dev/null || true
    sleep 2
fi

# Entferne Init-Skript und Service-Registrierung
if [ -f "/etc/init.d/my-homematic-addon" ]; then
    echo "Entferne Init-Skript..."
    
    # Entferne Service-Registrierung
    if command -v update-rc.d >/dev/null 2>&1; then
        update-rc.d -f my-homematic-addon remove 2>/dev/null || true
    elif command -v systemctl >/dev/null 2>&1; then
        systemctl disable my-homematic-addon 2>/dev/null || true
    fi
    
    # Entferne Init-Skript
    rm -f /etc/init.d/my-homematic-addon
fi

# Entferne Addon-Verzeichnis
if [ -d "$ADDON_DIR" ]; then
    echo "Entferne Addon-Verzeichnis..."
    rm -rf $ADDON_DIR
fi

# Bereinige Logs und PID-Dateien
echo "Bereinige Logs und PID-Dateien..."
rm -f /var/log/my-homematic-addon.log
rm -f /var/run/my-homematic-addon.pid

# Prüfe ob noch Prozesse laufen
if pgrep -f "my-homematic-addon" >/dev/null 2>&1; then
    echo "WARNUNG: Es laufen noch Prozesse. Beende sie..."
    pkill -f "my-homematic-addon" 2>/dev/null || true
    sleep 2
    pkill -9 -f "my-homematic-addon" 2>/dev/null || true
fi

echo ""
echo "=========================================="
echo "Deinstallation abgeschlossen!"
echo "=========================================="
echo "Alle Dateien und Konfigurationen wurden entfernt."
echo "=========================================="

