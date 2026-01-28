import PyInstaller.__main__
import os

if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.abspath(__file__))
    ffmpeg_bin = os.path.join(base_dir, 'bin', 'ffmpeg.exe')
    run_server_script = os.path.join(base_dir, 'run_server.py')
    
    PyInstaller.__main__.run([
        run_server_script,
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
        '--hidden-import=whitenoise.middleware',
        '--hidden-import=pymongo',
        '--hidden-import=musicbrainzngs',
        '--hidden-import=importer.cd_metadata',
        f'--add-binary={ffmpeg_bin};.',
    ])
