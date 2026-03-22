#!/bin/sh
# Installationsskript für Homematic IP Addon

ADDON_DIR="/usr/local/addons/my-homematic-addon"
TMP_DIR="/tmp/addon"

# Prüfe ob Node.js verfügbar ist
if ! command -v node >/dev/null 2>&1; then
    echo "FEHLER: Node.js ist nicht installiert!"
    echo "Bitte installiere zuerst das 'Node.js für CCU' Addon."
    exit 1
fi

NODE_BIN=$(which node)

echo "Installiere Homematic IP Addon..."
echo "Addon-Verzeichnis: $ADDON_DIR"
echo "Node.js: $NODE_BIN"

# Erstelle Addon-Verzeichnis
mkdir -p $ADDON_DIR

# Kopiere alle Dateien aus /tmp/addon
if [ -d "$TMP_DIR" ]; then
    echo "Kopiere Dateien..."
    cp -r $TMP_DIR/* $ADDON_DIR/
else
    echo "WARNUNG: $TMP_DIR nicht gefunden. Verwende aktuelles Verzeichnis."
    # Falls direkt aus dem Verzeichnis installiert wird
    SCRIPT_DIR=$(dirname "$0")
    cp -r $SCRIPT_DIR/* $ADDON_DIR/ 2>/dev/null || true
fi

# Erstelle notwendige Verzeichnisse
mkdir -p $ADDON_DIR/uploads
mkdir -p $ADDON_DIR/schedules

# Setze Berechtigungen
chmod +x $ADDON_DIR/server.js 2>/dev/null || true
chmod +x $ADDON_DIR/src/index.js 2>/dev/null || true

# Installiere Node.js Dependencies
echo "Installiere npm Dependencies..."
cd $ADDON_DIR
if [ -f "package.json" ]; then
    npm install --production --no-audit --no-fund
    if [ $? -ne 0 ]; then
        echo "WARNUNG: npm install fehlgeschlagen. Versuche es trotzdem fortzusetzen..."
    fi
else
    echo "WARNUNG: package.json nicht gefunden!"
fi

# Erstelle Init-Skript
echo "Erstelle Init-Skript..."
cat > /etc/init.d/my-homematic-addon << 'EOFSCRIPT'
#!/bin/sh
### BEGIN INIT INFO
# Provides:          my-homematic-addon
# Required-Start:    $network
# Required-Stop:     $network
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: Homematic IP Addon
# Description:       Node.js Addon für Homematic IP Gerätesteuerung
### END INIT INFO

ADDON_DIR="/usr/local/addons/my-homematic-addon"
NODE_BIN="/usr/bin/node"
PID_FILE="/var/run/my-homematic-addon.pid"
LOG_FILE="/var/log/my-homematic-addon.log"

# Finde Node.js falls nicht an Standard-Pfad
if [ ! -f "$NODE_BIN" ]; then
    NODE_BIN=$(which node 2>/dev/null)
fi

if [ -z "$NODE_BIN" ]; then
    echo "FEHLER: Node.js nicht gefunden!"
    exit 1
fi

case "$1" in
  start)
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        echo "Addon läuft bereits (PID: $(cat $PID_FILE))"
        exit 0
    fi
    
    echo "Starte my-homematic-addon..."
    cd $ADDON_DIR
    
    # Setze Umgebungsvariablen falls vorhanden
    if [ -f "$ADDON_DIR/.env" ]; then
        export $(cat $ADDON_DIR/.env | grep -v '^#' | xargs)
    fi
    
    # Port über Umgebungsvariable (Standard: 3000)
    export PORT=${PORT:-3000}
    
    # Starte als Hintergrundprozess
    nohup $NODE_BIN server.js >> $LOG_FILE 2>&1 &
    echo $! > $PID_FILE
    
    sleep 2
    if kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        echo "Addon gestartet (PID: $(cat $PID_FILE))"
    else
        echo "FEHLER: Addon konnte nicht gestartet werden. Prüfe Logs: $LOG_FILE"
        rm -f $PID_FILE
        exit 1
    fi
    ;;
  stop)
    if [ ! -f "$PID_FILE" ]; then
        echo "Addon läuft nicht (keine PID-Datei gefunden)"
        exit 0
    fi
    
    PID=$(cat $PID_FILE)
    if ! kill -0 $PID 2>/dev/null; then
        echo "Addon läuft nicht (Prozess nicht gefunden)"
        rm -f $PID_FILE
        exit 0
    fi
    
    echo "Stoppe my-homematic-addon (PID: $PID)..."
    kill $PID
    
    # Warte bis Prozess beendet ist
    for i in 1 2 3 4 5; do
        if ! kill -0 $PID 2>/dev/null; then
            break
        fi
        sleep 1
    done
    
    # Falls noch aktiv, force kill
    if kill -0 $PID 2>/dev/null; then
        echo "Force kill..."
        kill -9 $PID
    fi
    
    rm -f $PID_FILE
    echo "Addon gestoppt"
    ;;
  restart)
    $0 stop
    sleep 2
    $0 start
    ;;
  status)
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        echo "Addon läuft (PID: $(cat $PID_FILE))"
        exit 0
    else
        echo "Addon läuft nicht"
        exit 1
    fi
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
exit 0
EOFSCRIPT

chmod +x /etc/init.d/my-homematic-addon

# Registriere Service
if command -v update-rc.d >/dev/null 2>&1; then
    update-rc.d my-homematic-addon defaults
elif command -v systemctl >/dev/null 2>&1; then
    systemctl enable my-homematic-addon 2>/dev/null || true
fi

# Starte Addon
echo "Starte Addon..."
/etc/init.d/my-homematic-addon start

echo ""
echo "=========================================="
echo "Installation abgeschlossen!"
echo "=========================================="
echo "Addon-Verzeichnis: $ADDON_DIR"
echo "Log-Datei: /var/log/my-homematic-addon.log"
echo "PID-Datei: /var/run/my-homematic-addon.pid"
echo ""
echo "Befehle:"
echo "  Start:   /etc/init.d/my-homematic-addon start"
echo "  Stop:    /etc/init.d/my-homematic-addon stop"
echo "  Restart: /etc/init.d/my-homematic-addon restart"
echo "  Status:  /etc/init.d/my-homematic-addon status"
echo ""
echo "Web-Interface: http://[CCU-IP]:3000"
echo "=========================================="

