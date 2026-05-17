#!/bin/bash

# =============================================================================
# SolarCRM - One-Click Linux/Ubuntu Startup Script
# =============================================================================
# Run this from the project root: chmod +x start.sh && ./start.sh
# =============================================================================

# Color codes
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

echo -e ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Starting Doctor Electric CRM (Linux)${NC}"
echo -e "${CYAN}========================================${NC}"
echo -e ""

# Function to check and kill processes on a port
clear_port() {
  local port=$1
  # Find PID using lsof or fuser
  local pid=$(lsof -t -i:"$port" 2>/dev/null)
  if [ -z "$pid" ]; then
    pid=$(fuser "$port"/tcp 2>/dev/null)
  fi

  if [ -n "$pid" ]; then
    echo -e "  [${YELLOW}*${NC}] Port $port is in use by process $pid. Clearing..."
    kill -9 $pid 2>/dev/null
    sleep 1
  fi
}

# Clear ports 3000 and 4000
clear_port 4000
clear_port 3000

# Verify Node.js and npm are installed
if ! command -v node &> /dev/null; then
  echo -e "  [${RED}✗${NC}] Node.js is not installed. Please install it first:"
  echo -e "      sudo apt update && sudo apt install -y nodejs npm"
  exit 1
fi

# Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo -e "  [${YELLOW}!${NC}] Root node_modules not found. Installing dependencies..."
  npm install
fi

if [ ! -d "infrastructure/backend/node_modules" ]; then
  echo -e "  [${YELLOW}!${NC}] Backend node_modules not found. Installing..."
  npm --prefix infrastructure/backend install
fi

# Build backend if build files do not exist
if [ ! -d "infrastructure/backend/dist" ]; then
  echo -e "  [${YELLOW}!${NC}] Building backend typescript..."
  npm run backend:build
fi

echo -e ""
echo -e "  [${GREEN}1/2${NC}] Starting Backend API on http://localhost:4000 ..."
npm run backend:dev > backend.log 2>&1 &
BACKEND_PID=$!

sleep 2

echo -e "  [${GREEN}2/2${NC}] Starting Frontend on http://localhost:3000 ..."
npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!

# Trap Ctrl+C (SIGINT) and exit signals to cleanly kill background processes on termination
cleanup() {
  echo -e ""
  echo -e "${YELLOW}Shutting down processes gracefully...${NC}"
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  # Double check port cleanup
  clear_port 4000
  clear_port 3000
  echo -e "${GREEN}✓ Done. System clean.${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

echo -e ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  App is starting up!${NC}"
echo -e "${WHITE}  Open URL:  http://localhost:3000${NC}"
echo -e ""
echo -e "  Default Admin Account:"
echo -e "  Email:     ${WHITE}admin@solarcrm.local${NC}"
echo -e "  Password:  ${WHITE}admin12345${NC}"
echo -e "${CYAN}========================================${NC}"
echo -e "  Logs are saved in ${WHITE}backend.log${NC} and ${WHITE}frontend.log${NC}"
echo -e "  Press ${YELLOW}Ctrl+C${NC} to shut down."
echo -e ""

# Keep script running to monitor logs or wait for Ctrl+C
wait
