import os
import sys
from pathlib import Path
import logging

# Fix SSL certificates for bundled exe
if getattr(sys, 'frozen', False):
    # Running as bundled exe - set SSL cert path
    bundle_dir = sys._MEIPASS
    cacert_path = os.path.join(bundle_dir, 'certifi', 'cacert.pem')
    if os.path.exists(cacert_path):
        os.environ['SSL_CERT_FILE'] = cacert_path
        os.environ['REQUESTS_CA_BUNDLE'] = cacert_path

# Set up file logging
log_file = Path.home() / 'ghost_backend_debug.log'
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file, mode='w'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

logger.info("=" * 50)
logger.info("Ghost Backend Starting...")
logger.info(f"Log file: {log_file}")
logger.info("=" * 50)

print("=" * 50)
print("Ghost Backend Starting...")
print(f"Logs: {log_file}")
print("=" * 50)

try:
    from waitress import serve
    from django.core.wsgi import get_wsgi_application

    # Add the project directory to the sys.path
    BASE_DIR = Path(__file__).resolve().parent
    sys.path.append(str(BASE_DIR))

    logger.info(f"BASE_DIR: {BASE_DIR}")
    logger.info(f"Python path: {sys.path}")

    # Set the Django settings module
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    logger.info(f"Settings module: {os.environ.get('DJANGO_SETTINGS_MODULE')}")

    if __name__ == '__main__':
        logger.info("Initializing Django application...")
        try:
            # Initialize Django (get_wsgi_application calls django.setup() internally)
            application = get_wsgi_application()
            logger.info("Django initialized successfully!")

            # Run migrations to ensure database is ready
            from django.core.management import call_command
            logger.info("Running database migrations...")
            call_command('migrate', '--noinput', verbosity=0)
            logger.info("Migrations complete")

        except Exception as django_error:
            logger.error(f"Django initialization failed: {django_error}", exc_info=True)
            raise

        logger.info("Starting Waitress server on http://127.0.0.1:8000...")
        logger.info("=" * 50)
        print("Backend ready! Check logs at: " + str(log_file))

        try:
            serve(
            application,
            host='127.0.0.1',
            port=8000,
            send_bytes=0,        # Disable output buffering — required for SSE streaming
            channel_timeout=3600, # 1 hour timeout — allows long CD rips to complete
            threads=8,            # Handle concurrent requests during active streaming
        )
        except Exception as serve_error:
            logger.error(f"Waitress server failed: {serve_error}", exc_info=True)
            raise

except Exception as e:
    logger.error(f"FATAL ERROR: {e}", exc_info=True)
    print(f"FATAL ERROR: {e}")
    import traceback
    traceback.print_exc()
    with open(log_file, 'a') as f:
        f.write(f"\nFATAL ERROR: {e}\n")
        traceback.print_exc(file=f)
    print(f"\nLogs saved to: {log_file}")
    print("Press Enter to exit...")
    input()
