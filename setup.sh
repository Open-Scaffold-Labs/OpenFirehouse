#!/bin/zsh
# OpenFirehouse — one-shot PostgreSQL setup + server launcher
set -e

echo ""
echo "🚒 OpenFirehouse Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Make sure Homebrew is on PATH ────────────────────────────────────────
eval "$(/opt/homebrew/bin/brew shellenv zsh)" 2>/dev/null || true

# ── 2. Install PostgreSQL 16 if not already installed ───────────────────────
if brew list postgresql@16 &>/dev/null; then
  echo "✅ PostgreSQL 16 already installed"
else
  echo "📦 Installing PostgreSQL 16..."
  brew install postgresql@16
fi

# ── 3. Add PostgreSQL to PATH for this session ──────────────────────────────
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

# Persist to ~/.zprofile if not already there
if ! grep -q "postgresql@16" ~/.zprofile 2>/dev/null; then
  echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zprofile
  echo "✅ Added PostgreSQL to PATH in ~/.zprofile"
fi

# ── 4. Start PostgreSQL service ─────────────────────────────────────────────
echo "🔄 Starting PostgreSQL service..."
brew services start postgresql@16
sleep 3

# ── 5. Create the database (skip if it already exists) ──────────────────────
if psql -lqt | cut -d \| -f 1 | grep -qw freestation; then
  echo "✅ Database 'freestation' already exists"
else
  echo "🗄️  Creating database 'freestation'..."
  createdb freestation
  echo "✅ Database 'freestation' created"
fi

# ── 6. Install server dependencies if needed ────────────────────────────────
if [ ! -d "$(dirname "$0")/node_modules" ]; then
  echo "📦 Installing dependencies..."
  cd "$(dirname "$0")" && npm install
fi

# ── 7. Launch the server ─────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Starting OpenFirehouse server on http://localhost:3005"
echo "   (Keep this window open while using the app)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

DB_USER=$(whoami)
export DATABASE_URL="postgresql://${DB_USER}@localhost:5432/freestation"
export PORT=3005
export JWT_SECRET=change-me-in-production
export CLIENT_ORIGIN=http://localhost:5173
export NODE_ENV=development

cd "$(dirname "$0")/server" && npm run dev
