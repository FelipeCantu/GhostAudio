# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['C:\\Users\\Felipe\\Documents\\projects\\GhostRepo\\backend\\run_server.py'],
    pathex=[],
    binaries=[('C:\\Users\\Felipe\\Documents\\projects\\GhostRepo\\backend\\bin\\ffmpeg.exe', '.')],
    datas=[],
    hiddenimports=['rest_framework', 'rest_framework_simplejwt', 'importer.apps', 'corsheaders', 'whitenoise', 'whitenoise.middleware', 'pymongo', 'musicbrainzngs', 'importer.cd_metadata'],
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
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
