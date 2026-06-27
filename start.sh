#!/bin/bash
# OpenFirehouse — start both servers
# Run this from the OpenFirehouse folder: bash start.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Kill anything still holding port 3005 or 5173
echo "Clearing ports..."
lsof -ti:3005 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
sleep 1

echo "Starting OpenFirehouse API server..."
node --no-warnings "$SCRIPT_DIR/server/src/index.js" &
API_PID=$!

echo "Starting OpenFirehouse client..."
cd "$SCRIPT_DIR/client" && npm run dev &
CLIENT_PID=$!

echo ""
echo "---------------------------------------"
echo "  API:    http://localhost:3005"
echo "  App:    http://localhost:5173"
echo "---------------------------------------"
echo "Press Ctrl+C to stop both servers."
echo ""

# Stop both when Ctrl+C is pressed
trap "kill $API_PID $CLIENT_PID 2>/dev/null; exit" INT
wait
