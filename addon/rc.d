#!/bin/sh
# RC-Skript fuer my-homematic-addon auf CCU3

ADDON_ID="my-homematic-addon"
ADDON_DIR="/usr/local/addons/${ADDON_ID}"
PID_FILE="/var/run/${ADDON_ID}.pid"
LOG_FILE="/var/log/${ADDON_ID}.log"
NODE_BIN=""

# Finde Node.js
find_node() {
    for p in /usr/local/addons/node/bin/node /usr/bin/node /usr/local/bin/node; do
        if [ -x "$p" ]; then
            NODE_BIN="$p"
            return 0
        fi
    done
    NODE_BIN=$(which node 2>/dev/null)
    if [ -z "$NODE_BIN" ]; then
        echo "FEHLER: Node.js nicht gefunden!"
        return 1
    fi
}

start() {
    find_node || exit 1

    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "${ADDON_ID} laeuft bereits (PID: $(cat "$PID_FILE"))"
        return 0
    fi

    echo "Starte ${ADDON_ID}..."
    cd "${ADDON_DIR}" || exit 1

    # Lade .env falls vorhanden
    if [ -f "${ADDON_DIR}/.env" ]; then
        export $(grep -v '^#' "${ADDON_DIR}/.env" | xargs)
    fi

    export PORT=${PORT:-8080}

    nohup "$NODE_BIN" server.js >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"

    sleep 2
    if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "${ADDON_ID} gestartet (PID: $(cat "$PID_FILE"), Port: $PORT)"
    else
        echo "FEHLER: ${ADDON_ID} konnte nicht gestartet werden. Siehe $LOG_FILE"
        rm -f "$PID_FILE"
        exit 1
    fi
}

stop() {
    if [ ! -f "$PID_FILE" ]; then
        echo "${ADDON_ID} laeuft nicht"
        return 0
    fi

    PID=$(cat "$PID_FILE")
    if ! kill -0 "$PID" 2>/dev/null; then
        echo "${ADDON_ID} laeuft nicht (Prozess nicht gefunden)"
        rm -f "$PID_FILE"
        return 0
    fi

    echo "Stoppe ${ADDON_ID} (PID: $PID)..."
    kill "$PID"

    for i in 1 2 3 4 5; do
        if ! kill -0 "$PID" 2>/dev/null; then
            break
        fi
        sleep 1
    done

    if kill -0 "$PID" 2>/dev/null; then
        kill -9 "$PID"
    fi

    rm -f "$PID_FILE"
    echo "${ADDON_ID} gestoppt"
}

info() {
    echo "Info: <b>Homematic IP Heizungssteuerung</b><br>"
    echo "Info: <a href='/addons/my-homematic-addon/'>Web-Interface oeffnen</a>"
    echo "Name: Upload Heizungssteuerung IP Addon"
    echo "Version: 1.0.0"
    echo "Operations: restart"
    echo "Config-Url: /addons/my-homematic-addon/"
    echo "Update: /addons/my-homematic-addon/"
}

case "$1" in
    start)   start ;;
    stop)    stop ;;
    restart) stop; sleep 2; start ;;
    info)    info ;;
    status)
        if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
            echo "${ADDON_ID} laeuft (PID: $(cat "$PID_FILE"))"
            exit 0
        else
            echo "${ADDON_ID} laeuft nicht"
            exit 1
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|info}"
        exit 1
        ;;
esac
exit 0
