#!/usr/bin/env bash
# ==============================================================================
# Render Native Build Script for Thanh Đường Quán POS
# ==============================================================================
set -o errexit

echo "===> [1/3] Building Frontend SPA with Vite..."
cd frontend
npm ci
npm run build
cd ..

echo "===> [2/3] Installing Backend Dependencies..."
cd backend
pip install --upgrade pip
pip install -r requirements.txt
cd ..

echo "===> [3/3] Build Completed Successfully!"
