#!/bin/bash

# Configuration
SERVICE_NAME="home-media-agent"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_PATH="$SCRIPT_DIR/agent.ts"
AGENT_BIN_PATH="$SCRIPT_DIR/agent"
ENV_FILE="$SCRIPT_DIR/.env"
TARGET_USER="${SUDO_USER:-$(logname)}"
TARGET_UID="$(id -u "$TARGET_USER" 2>/dev/null)"
TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"

show_help() {
    echo "Usage: sudo $0 [COMMAND] [ARGS]"
    echo ""
    echo "Commands:"
    echo "  install          Install/Update the systemd service"
    echo "  ip <new_ip> [port] [tls]  Change hub address and restart (tls=true|false)"
    echo "  status           Show current service status"
    echo "  logs             Show live service logs (journal)"
    echo "  restart          Restart the service"
    echo "  stop             Stop the service"
}

resolve_hub_url() {
    local host="$1"
    local port="$2"
    local tls="$3"

    if [ "$tls" = "true" ]; then
        echo "wss://$host:$port"
    else
        echo "ws://$host:$port"
    fi
}

check_media_dependencies() {
    local missing=()

    if ! command -v playerctl >/dev/null 2>&1; then
        missing+=("playerctl")
    fi

    if ! command -v wpctl >/dev/null 2>&1; then
        missing+=("wpctl")
    fi

    if [ "${#missing[@]}" -eq 0 ]; then
        return 0
    fi

    echo "Warning: Missing media dependencies: ${missing[*]}"
    echo "Install on Fedora with:"
    echo "  sudo dnf install playerctl wireplumber"
    echo ""
    echo "The agent service can run without these, but playback/volume control will be limited."

    read -r -p "Continue install anyway? [y/N]: " continue_install
    case "${continue_install,,}" in
        y|yes) return 0 ;;
        *)
            echo "Install aborted. Install dependencies first, then rerun:"
            echo "  sudo ./agent-ctl.sh install"
            return 1
            ;;
    esac
}

# Check for root
if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run as root (sudo)"
  exit 1
fi

if [ -z "$TARGET_UID" ]; then
    echo "Error: Could not resolve target user uid for '$TARGET_USER'."
    exit 1
fi

case "$1" in
    install)
        if ! check_media_dependencies; then
            exit 1
        fi

        # Extract IP from .env or ask
        if [ -f "$ENV_FILE" ]; then
            HUB_IP=$(awk -F= '/^HOST_IP=/{print $2}' "$ENV_FILE")
            HUB_PORT=$(awk -F= '/^PORT=/{print $2}' "$ENV_FILE")
            HUB_TLS=$(awk -F= '/^TLS=/{print tolower($2)}' "$ENV_FILE")
            HUB_URL=$(awk -F= '/^HUB_URL=/{print $2}' "$ENV_FILE")
            HUB_INSECURE_TLS=$(awk -F= '/^HUB_INSECURE_TLS=/{print tolower($2)}' "$ENV_FILE")
        fi
        
        if [ -z "$HUB_IP" ]; then
            read -p "Enter Hub IP (default 127.0.0.1): " HUB_IP
            HUB_IP=${HUB_IP:-127.0.0.1}
        fi
        HUB_PORT=${HUB_PORT:-3000}
        HUB_TLS=${HUB_TLS:-false}
        HUB_INSECURE_TLS=${HUB_INSECURE_TLS:-true}
        if [ -z "$HUB_URL" ]; then
            HUB_URL=$(resolve_hub_url "$HUB_IP" "$HUB_PORT" "$HUB_TLS")
        fi
        echo "Installing service pointing to $HUB_URL..."

        if command -v bun >/dev/null 2>&1; then
            EXEC_START="$(command -v bun) run \"$AGENT_PATH\""
            echo "Using Bun runtime: $(command -v bun)"
        elif [ -x "$AGENT_BIN_PATH" ]; then
            EXEC_START="$AGENT_BIN_PATH"
            echo "Using bundled agent binary: $AGENT_BIN_PATH"
        else
            echo "Error: No bun runtime found and no bundled binary at $AGENT_BIN_PATH"
            echo "Download the latest agent package that includes the compiled binary."
            exit 1
        fi

        TLS_BYPASS_ENV=""
        if [[ "$HUB_URL" == wss://* ]] && [ "$HUB_INSECURE_TLS" = "true" ]; then
            TLS_BYPASS_ENV='Environment="NODE_TLS_REJECT_UNAUTHORIZED=0"'
            echo "Warning: TLS certificate verification is disabled for agent connection."
        fi

        cat <<EOF > /etc/systemd/system/$SERVICE_NAME.service
[Unit]
Description=Home Media Control Agent
After=network.target

[Service]
Type=simple
User=$TARGET_USER
WorkingDirectory=$SCRIPT_DIR
Environment="HOME=$TARGET_HOME"
Environment="XDG_RUNTIME_DIR=/run/user/$TARGET_UID"
Environment="DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$TARGET_UID/bus"
Environment="HUB_URL=$HUB_URL"
$TLS_BYPASS_ENV
ExecStart=/bin/bash -lc '$EXEC_START'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

        if [ ! -S "/run/user/$TARGET_UID/bus" ]; then
            echo "Warning: '/run/user/$TARGET_UID/bus' is not available right now."
            echo "Ensure user '$TARGET_USER' is logged into a desktop session, then restart the service:"
            echo "  sudo ./agent-ctl.sh restart"
        fi

        systemctl daemon-reload
        systemctl enable $SERVICE_NAME
        systemctl restart $SERVICE_NAME
        echo "Service installed and started!"
        ;;

    ip)
        if [ -z "$2" ]; then
            echo "Error: Missing IP address. Usage: sudo $0 ip 192.168.1.100"
            exit 1
        fi

        NEW_PORT="${3:-3000}"
        NEW_TLS="${4:-false}"
        NEW_URL=$(resolve_hub_url "$2" "$NEW_PORT" "$NEW_TLS")
        echo "Updating Hub IP to $2..."
        
        # Update the service file environment variable
        sed -i "s|Environment=\"HUB_URL=.*\"|Environment=\"HUB_URL=$NEW_URL\"|" /etc/systemd/system/$SERVICE_NAME.service
        
        systemctl daemon-reload
        systemctl restart $SERVICE_NAME
        echo "Service updated and restarted with new IP."
        ;;

    status)
        systemctl status $SERVICE_NAME
        ;;

    logs)
        journalctl -u $SERVICE_NAME -f
        ;;

    restart)
        systemctl restart $SERVICE_NAME
        ;;

    stop)
        systemctl stop $SERVICE_NAME
        ;;

    *)
        show_help
        ;;
esac
