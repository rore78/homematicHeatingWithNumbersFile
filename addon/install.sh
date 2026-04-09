#!/bin/sh
# Installationsskript fuer Homematic IP Addon

ADDON_DIR="/usr/local/addons/my-homematic-addon"
TMP_DIR="/tmp/addon"

# Pruefe ob Node.js verfuegbar ist
if ! command -v node >/dev/null 2>&1; then
    echo "FEHLER: Node.js ist nicht installiert!"
    echo "Bitte zuerst das 'Node.js fuer CCU'-Addon installieren."
    exit 1
fi

# Pruefe Node.js Version >= 18
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_MAJOR" -lt 18 ]; then
    echo "FEHLER: Node.js >= 18 erforderlich (gefunden: ${NODE_VERSION:-nicht installiert})"
    echo "Bitte zuerst das 'Node.js fuer CCU'-Addon installieren."
    exit 1
fi

NODE_BIN=$(which node)

echo "Installiere Homematic IP Addon..."
echo "Addon-Verzeichnis: $ADDON_DIR"
echo "Node.js: $NODE_BIN (v$NODE_VERSION)"

# Erstelle Addon-Verzeichnis
mkdir -p $ADDON_DIR

# Kopiere alle Dateien
if [ -d "$TMP_DIR" ]; then
    echo "Kopiere Dateien..."
    cp -r $TMP_DIR/* $ADDON_DIR/
else
    echo "WARNUNG: $TMP_DIR nicht gefunden. Verwende aktuelles Verzeichnis."
    SCRIPT_DIR=$(dirname "$0")
    cp -r $SCRIPT_DIR/* $ADDON_DIR/ 2>/dev/null || true
fi

# Pruefe ob node_modules vorhanden (vorgebundelt im tar.gz)
if [ ! -d "$ADDON_DIR/node_modules" ]; then
    echo "FEHLER: node_modules nicht gefunden. Paket ist beschaedigt."
    exit 1
fi

# Erstelle notwendige Verzeichnisse
mkdir -p $ADDON_DIR/uploads
mkdir -p $ADDON_DIR/schedules

# Setze Berechtigungen
chmod +x $ADDON_DIR/server.js 2>/dev/null || true
chmod +x $ADDON_DIR/src/index.js 2>/dev/null || true

# Generiere .env-Datei (nur fehlende Variablen ergaenzen)
ENV_FILE="$ADDON_DIR/.env"
add_env_if_missing() {
    KEY="$1"
    VALUE="$2"
    if [ -f "$ENV_FILE" ] && grep -q "^${KEY}=" "$ENV_FILE"; then
        return
    fi
    echo "${KEY}=${VALUE}" >> "$ENV_FILE"
}

if [ ! -f "$ENV_FILE" ]; then
    echo "# Generiert bei Installation -- anpassbar" > "$ENV_FILE"
fi

add_env_if_missing "HOMEMATIC_MODE" "local"
add_env_if_missing "HOMEMATIC_CCU_HOST" "localhost"
add_env_if_missing "HOMEMATIC_CCU_PORT" "2001"
add_env_if_missing "PORT" "8080"
add_env_if_missing "LOG_LEVEL" "info"

echo ".env-Datei konfiguriert: $ENV_FILE"

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
# Description:       Node.js Addon fuer Homematic IP Geraetesteuerung
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
        echo "Addon laeuft bereits (PID: $(cat $PID_FILE))"
        exit 0
    fi

    echo "Starte my-homematic-addon..."
    cd $ADDON_DIR

    # Setze Umgebungsvariablen falls vorhanden
    if [ -f "$ADDON_DIR/.env" ]; then
        export $(cat $ADDON_DIR/.env | grep -v '^#' | xargs)
    fi

    # Port ueber Umgebungsvariable (Standard: 8080)
    export PORT=${PORT:-8080}

    # Starte als Hintergrundprozess
    nohup $NODE_BIN server.js >> $LOG_FILE 2>&1 &
    echo $! > $PID_FILE

    sleep 2
    if kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        echo "Addon gestartet (PID: $(cat $PID_FILE), Port: $PORT)"
    else
        echo "FEHLER: Addon konnte nicht gestartet werden. Pruefe Logs: $LOG_FILE"
        rm -f $PID_FILE
        exit 1
    fi
    ;;
  stop)
    if [ ! -f "$PID_FILE" ]; then
        echo "Addon laeuft nicht (keine PID-Datei gefunden)"
        exit 0
    fi

    PID=$(cat $PID_FILE)
    if ! kill -0 $PID 2>/dev/null; then
        echo "Addon laeuft nicht (Prozess nicht gefunden)"
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
        echo "Addon laeuft (PID: $(cat $PID_FILE))"
        exit 0
    else
        echo "Addon laeuft nicht"
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
echo "Konfiguration:     $ADDON_DIR/.env"
echo "Log-Datei:         /var/log/my-homematic-addon.log"
echo "PID-Datei:         /var/run/my-homematic-addon.pid"
echo ""
echo "Befehle:"
echo "  Start:   /etc/init.d/my-homematic-addon start"
echo "  Stop:    /etc/init.d/my-homematic-addon stop"
echo "  Restart: /etc/init.d/my-homematic-addon restart"
echo "  Status:  /etc/init.d/my-homematic-addon status"
echo ""
echo "Web-Interface: http://[CCU-IP]:8080"
echo "Health-Check:  http://[CCU-IP]:8080/api/health"
echo "=========================================="
