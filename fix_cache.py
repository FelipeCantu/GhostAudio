import glob
import os
import subprocess

cache_dir = r"C:\Users\Felipe\AppData\Local\electron-builder\Cache\winCodeSign"
seven_zip = r"c:\Users\Felipe\Documents\projects\GhostRepo\music-app\node_modules\7zip-bin\win\x64\7za.exe"

archives = glob.glob(os.path.join(cache_dir, "*.7z"))
print(f"Found {len(archives)} archives.")

for archive in archives:
    dirname = archive[:-3] # remove .7z
    if not os.path.exists(dirname):
        os.makedirs(dirname)
    
    print(f"Extracting {archive} to {dirname}...")
    subprocess.run([seven_zip, "x", archive, f"-o{dirname}", "-aoa", "-y"], check=False)
    print("Done.")
