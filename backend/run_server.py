import os
import sys
from pathlib import Path
from waitress import serve
from django.core.wsgi import get_wsgi_application

# Add the project directory to the sys.path
BASE_DIR = Path(__file__).resolve().parent
sys.path.append(str(BASE_DIR))

# Set the Django settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

if __name__ == '__main__':
    application = get_wsgi_application()
    print("Starting Waitress server on http://127.0.0.1:8000...")
    serve(application, host='127.0.0.1', port=8000)
