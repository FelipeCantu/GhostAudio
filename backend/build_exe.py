import PyInstaller.__main__
import os

if __name__ == '__main__':
    PyInstaller.__main__.run([
        'run_server.py',
        '--name=ghost_backend',
        '--onefile',
        '--windowed',  # Hide console window? Maybe keep it for debug for now, or use --noconsole later
        # We need to collect static files if we serve them, but for API backend mostly just code
        # We might need hidden imports depending on what PyInstaller misses
        '--hidden-import=rest_framework',
        '--hidden-import=rest_framework_simplejwt',
        '--hidden-import=importer.apps',
        '--hidden-import=corsheaders',
        '--hidden-import=whitenoise',
        '--hidden-import=pymongo',
        # Add data files if needed (e.g., templates, though this is API only mostly)
        # '--add-data=templates;templates', 
    ])
