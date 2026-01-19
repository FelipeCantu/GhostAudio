#!/usr/bin/env bash
# exit on error
set -o errexit

# Change directory to the folder where this script is located (backend)
cd "$(dirname "$0")"

pip install -r requirements.txt

# Collect static files
python manage.py collectstatic --no-input

# Apply database migrations
python manage.py migrate
