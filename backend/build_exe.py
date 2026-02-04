import PyInstaller.__main__
import os
import certifi

if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.abspath(__file__))
    ffmpeg_bin = os.path.join(base_dir, 'bin', 'ffmpeg.exe')
    run_server_script = os.path.join(base_dir, 'run_server.py')
    # Get certifi CA bundle path for SSL
    cacert_path = certifi.where()
    
    PyInstaller.__main__.run([
        run_server_script,
        '--name=ghost_backend',
        '--onefile',
        # Removed --windowed to see console output and errors
        '--console',  # Show console for debugging
        # We need to collect static files if we serve them, but for API backend mostly just code
        # We might need hidden imports depending on what PyInstaller misses
        '--hidden-import=rest_framework',
        '--hidden-import=rest_framework_simplejwt',
        '--hidden-import=rest_framework_simplejwt.tokens',
        '--hidden-import=rest_framework_simplejwt.views',
        '--hidden-import=importer.apps',
        '--hidden-import=importer.models',
        '--hidden-import=importer.serializers',
        '--hidden-import=importer.services',
        '--hidden-import=corsheaders',
        '--hidden-import=whitenoise',
        '--hidden-import=whitenoise.middleware',
        '--hidden-import=pymongo',
        '--hidden-import=musicbrainzngs',
        '--hidden-import=importer.cd_metadata',
        '--hidden-import=waitress',
        '--hidden-import=config.settings',
        '--hidden-import=config.wsgi',
        '--hidden-import=config.urls',
        f'--add-binary={ffmpeg_bin};.',
        '--add-data=db.sqlite3;.',  # Include database
        '--add-data=config;config',  # Include config directory
        f'--add-data={cacert_path};certifi',  # Include SSL certificates
    ])
