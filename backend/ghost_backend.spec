# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['C:\\Users\\Felipe\\Documents\\projects\\GhostRepo\\backend\\run_server.py'],
    pathex=[],
    binaries=[('C:\\Users\\Felipe\\Documents\\projects\\GhostRepo\\backend\\bin\\ffmpeg.exe', '.')],
    datas=[('db.sqlite3', '.'), ('config', 'config'), ('C:\\Users\\Felipe\\Documents\\projects\\GhostRepo\\backend\\venv\\Lib\\site-packages\\certifi\\cacert.pem', 'certifi')],
    hiddenimports=['rest_framework', 'rest_framework_simplejwt', 'rest_framework_simplejwt.tokens', 'rest_framework_simplejwt.views', 'importer.apps', 'importer.models', 'importer.serializers', 'importer.services', 'corsheaders', 'whitenoise', 'whitenoise.middleware', 'pymongo', 'musicbrainzngs', 'importer.cd_metadata', 'waitress', 'config.settings', 'config.wsgi', 'config.urls'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='ghost_backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
