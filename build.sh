#!/usr/bin/env bash
set -e

echo "Setting up Python environment..."
export PYTHONUSERBASE=/opt/render/project/src/.python
mkdir -p $PYTHONUSERBASE

echo "Installing Python dependencies..."
pip3 install --user --no-cache-dir numpy pandas scipy

echo "Verifying Python packages..."
python3 -c "import numpy; import pandas; import scipy; print('Python packages OK')"

echo "Installing Node dependencies..."
export NODE_ENV=development
export NPM_CONFIG_PRODUCTION=false
npm ci --include=dev

echo "Building frontend..."
npm run build

echo "Build complete!"
