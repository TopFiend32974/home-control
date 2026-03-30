#!/bin/bash

# Configuration
SERVICE_NAME="home-media-agent"
AGENT_PATH="/home/jamiedean/Documents/projects/home-control/media-devices/agent.ts"
ENV_FILE="/home/jamiedean/Documents/projects/home-control/.env"

show_help() {
    echo "Usage: sudo $0 [COMMAND] [ARGS]"
    echo ""
    echo "Commands:"
    echo "  install          Install/Update the systemd service"
    echo "  ip <new_ip>      Change the Hub IP and restart the service"
    echo "  status           Show current service status"
    echo "  logs             Show live service logs (journal)"
    echo "  restart          Restart the service"
    echo "  stop             Stop the service"
}

# Check for root
if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run as root (sudo)"
  exit 1
fi

case "$1" in
    install)
        # Extract IP from .env or ask
        if [ -f "$ENV_FILE" ]; then
            HUB_IP=$(grep -oP '^HOST_IP=\K.*' "$ENV_FILE")
        fi
        
        if [ -z "$HUB_IP" ]; then
            read -p "Enter Hub IP (default 127.0.0.1): " HUB_IP
            HUB_IP=${HUB_IP:-127.0.0.1}
        fi

        HUB_URL="ws://$HUB_IP:3000"
        echo "Installing service pointing to $HUB_URL..."

        cat <<EOF > /etc/systemd/system/$SERVICE_NAME.service
[Unit]
Description=Home Media Control Agent
After=network.target

[Service]
Type=simple
User=$(logname)
WorkingDirectory=$(dirname "$AGENT_PATH")
Environment="HUB_URL=$HUB_URL"
ExecStart=$(which bun) run "$AGENT_PATH"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

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
        
        NEW_URL="ws://$2:3000"
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
