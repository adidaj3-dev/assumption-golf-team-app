#!/usr/bin/env bash
set -e

echo "Setting up backend..."
cd backend
python -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created backend/.env — fill in your Supabase URL and service key."
fi
deactivate
cd ..

echo "Setting up frontend..."
cd frontend
npm install
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "Created frontend/.env.local — fill in your Supabase URL and anon key."
fi
cd ..

echo "Setup complete. See README.md for how to run the backend and frontend."
