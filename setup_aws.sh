#!/usr/bin/env bash

# =============================================================================
# SolarCRM - AWS Ubuntu Automated Setup & Deployment Script
# =============================================================================
# Run this on your AWS Ubuntu EC2 instance to set up the environment,
# configure environment variables, and launch the application containers.
#
# Usage: sudo chmod +x setup_aws.sh && sudo ./setup_aws.sh
# =============================================================================

set -euo pipefail

# Color Codes
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

echo -e ""
echo -e "${CYAN}====================================================================${NC}"
echo -e "${CYAN}        SolarCRM - AWS Ubuntu Deployment Automation Script         ${NC}"
echo -e "${CYAN}====================================================================${NC}"
echo -e ""

# 1. Root / Sudo Check
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}[✗] This script must be run as root or with sudo.${NC}"
    echo -e "    Please run: ${WHITE}sudo ./setup_aws.sh${NC}"
    exit 1
fi

# 2. OS Check (Ubuntu / Debian preferred)
if [ -f /etc/os-release ]; then
    OS_NAME=$(grep -oP '(?<=^NAME=")[^"]*' /etc/os-release || echo "Unknown")
    echo -e "  [${GREEN}✓${NC}] Operating System detected: ${WHITE}${OS_NAME}${NC}"
else
    echo -e "  [${YELLOW}!${NC}] Could not detect OS. Proceeding anyway, assuming Ubuntu/Debian compatibility..."
fi

# 3. Check / Install System-wide requirements
echo -e ""
echo -e "${CYAN}--------------------------------------------------------------------${NC}"
echo -e "  [1/4] System Setup & Dependency Check"
echo -e "${CYAN}--------------------------------------------------------------------${NC}"

# Check if Docker is installed
if ! command -v docker &>/dev/null; then
    echo -e "  [${YELLOW}!${NC}] Docker is not installed on this system."
    echo -e "      We will trigger the system hardening and Docker setup script..."
    echo -e "      This will install Docker, configure UFW firewall, setup Fail2ban,"
    echo -e "      and create a 'deploy' user."
    echo -e ""
    read -p "  Would you like to run the server setup script now? (y/n): " RUN_SETUP
    if [[ "$RUN_SETUP" =~ ^[Yy]$ ]]; then
        if [ -f "infrastructure/scripts/setup-server.sh" ]; then
            chmod +x infrastructure/scripts/setup-server.sh
            ./infrastructure/scripts/setup-server.sh
        else
            echo -e "${RED}[✗] Setup script 'infrastructure/scripts/setup-server.sh' not found.${NC}"
            exit 1
        fi
    else
        echo -e "${RED}[✗] Docker is required to deploy. Exiting.${NC}"
        exit 1
    fi
else
    echo -e "  [${GREEN}✓${NC}] Docker is already installed: $(docker --version)"
fi

# Check if Docker Compose command is available
if ! docker compose version &>/dev/null; then
    echo -e "  [${YELLOW}!${NC}] Docker Compose V2 is not available."
    echo -e "      Installing docker-compose-plugin..."
    apt-get update -qq && apt-get install -y -qq docker-compose-plugin
fi
echo -e "  [${GREEN}✓${NC}] Docker Compose is available: $(docker compose version)"

# 4. Configure Production Environment Variables
echo -e ""
echo -e "${CYAN}--------------------------------------------------------------------${NC}"
echo -e "  [2/4] Production Environment Configuration"
echo -e "${CYAN}--------------------------------------------------------------------${NC}"

ENV_FILE="infrastructure/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo -e "  [${YELLOW}!${NC}] Production env file (${ENV_FILE}) not found."
    echo -e "      Creating environment file from template..."
    
    # We copy the file if it exists, or generate basic contents
    if [ -f "infrastructure/.env.example" ]; then
        cp infrastructure/.env.example "$ENV_FILE"
    elif [ -f ".env.example" ]; then
        cp .env.example "$ENV_FILE"
    else
        echo -e "${RED}[✗] No environment template file found. Exiting.${NC}"
        exit 1
    fi
    echo -e "  [${GREEN}✓${NC}] Environment file created: ${WHITE}${ENV_FILE}${NC}"
else
    echo -e "  [${GREEN}✓${NC}] Existing environment file found: ${WHITE}${ENV_FILE}${NC}"
fi

# Get the host's public IP
PUBLIC_IP=$(curl -s https://api.ipify.org || echo "YOUR_PUBLIC_IP")

echo -e ""
echo -e "  ⚠️  Please review and modify the values in ${WHITE}${ENV_FILE}${NC} before continuing."
echo -e "  Important variables to update:"
echo -e "    - ${YELLOW}DOMAIN${NC} (currently set in .env)"
echo -e "    - ${YELLOW}APP_URL${NC} (e.g., http://${PUBLIC_IP}:8080 or http://${PUBLIC_IP})"
echo -e "    - ${YELLOW}POSTGRES_PASSWORD${NC} (strongly recommended to change)"
echo -e "    - ${YELLOW}JWT_SECRET${NC} (strongly recommended to change)"
echo -e "    - ${YELLOW}R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY${NC} (Cloudflare R2 details)"
echo -e ""

read -p "  Have you configured your environment variables in ${ENV_FILE}? (y/n): " ENV_CONFIRMED
if [[ ! "$ENV_CONFIRMED" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}[!] Please configure the ${ENV_FILE} file and re-run this script.${NC}"
    echo -e "    You can edit it via: ${WHITE}nano ${ENV_FILE}${NC}"
    exit 0
fi

# 5. Check SSL Certs Configuration
echo -e ""
echo -e "${CYAN}--------------------------------------------------------------------${NC}"
echo -e "  [3/4] Web Server Port Configuration & SSL Cert Check"
echo -e "${CYAN}--------------------------------------------------------------------${NC}"

# Check Nginx configuration details
NGINX_CONF_DIR="infrastructure/nginx"
SSL_DIR="${NGINX_CONF_DIR}/ssl"
mkdir -p "$SSL_DIR"

echo -e "  [${GREEN}✓${NC}] Nginx directory structured."

# Check if docker-compose.yml uses port 8080 or 80
if grep -q "8080:80" infrastructure/docker-compose.yml; then
    echo -e "  [${YELLOW}!${NC}] Docker Compose Nginx is mapped to ${YELLOW}8080:80${NC}."
    echo -e "      To serve directly on the standard HTTP port (port 80) of your public IP,"
    echo -e "      we should update the mapping to ${GREEN}80:80${NC}."
    echo -e ""
    read -p "  Would you like this script to map Nginx to port 80 directly? (y/n): " MAP_PORT_80
    if [[ "$MAP_PORT_80" =~ ^[Yy]$ ]]; then
        # Replace 8080:80 with 80:80 in docker-compose.yml
        # Uses sed to update port mapping safely
        sed -i 's/"8080:80"/"80:80"/g' infrastructure/docker-compose.yml
        echo -e "  [${GREEN}✓${NC}] Updated port mapping in ${WHITE}infrastructure/docker-compose.yml${NC} to ${GREEN}80:80${NC}."
    else
        echo -e "  [${YELLOW}!${NC}] Keeping Nginx port mapping as-is (${WHITE}8080:80${NC})."
    fi
fi

# SSL Configuration warning/assistance
echo -e ""
echo -e "  SolarCRM's default production Nginx config supports SSL terminating via Cloudflare"
echo -e "  or Certbot. To avoid Nginx restart failure, please ensure that:"
echo -e "  1. If running under HTTP (port 80), Nginx will start fine."
echo -e "  2. If using Cloudflare Origin Certificates, they must be stored at:"
echo -e "     - Certificate: ${WHITE}${SSL_DIR}/origin.pem${NC}"
echo -e "     - Private Key: ${WHITE}${SSL_DIR}/origin-key.pem${NC}"
echo -e ""
echo -e "  If you don't have SSL certificates yet, Nginx will run on standard HTTP (port 80/8080)."

# Ensure directories exist
mkdir -p infrastructure/nginx/logs
mkdir -p infrastructure/backups/{daily,weekly}

# 6. Build and Launch Containers
echo -e ""
echo -e "${CYAN}--------------------------------------------------------------------${NC}"
echo -e "  [4/4] Building and Launching Containers"
echo -e "${CYAN}--------------------------------------------------------------------${NC}"

echo -e "  [${GREEN}*${NC}] Running Docker Compose build and start..."
echo -e "      This will download images, build the React frontend, compile"
echo -e "      TypeScript backend, configure Postgres, and start all services."
echo -e ""

# Run docker compose up with build flag
docker compose -f infrastructure/docker-compose.yml up -d --build

echo -e ""
echo -e "${GREEN}====================================================================${NC}"
echo -e "${GREEN}               SolarCRM Successfully Deployed!                      ${NC}"
echo -e "${GREEN}====================================================================${NC}"
echo -e ""
echo -e "  Your app should now be starting up. You can view running containers with:"
echo -e "      ${WHITE}docker compose -f infrastructure/docker-compose.yml ps${NC}"
echo -e ""
echo -e "  Public IP Access:"
echo -e "      ${WHITE}http://${PUBLIC_IP}${NC} (if port 80 mapped)"
echo -e "      ${WHITE}http://${PUBLIC_IP}:8080${NC} (if port 8080 mapped)"
echo -e ""
echo -e "  To inspect logs:"
echo -e "      ${WHITE}docker compose -f infrastructure/docker-compose.yml logs -f${NC}"
echo -e ""
echo -e "  Default Admin Account (if db is fresh):"
echo -e "      Email:    ${WHITE}admin@solarcrm.local${NC}"
echo -e "      Password: ${WHITE}admin12345${NC}"
echo -e ""
echo -e "${CYAN}====================================================================${NC}"
echo -e ""
