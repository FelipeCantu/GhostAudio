from PIL import Image
import os

base_path = r"c:\Users\Felipe\Documents\projects\GhostRepo\music-app\build"
files = ["icon.png", "icon.ico"]

for f in files:
    p = os.path.join(base_path, f)
    if os.path.exists(p):
        try:
            img = Image.open(p)
            print(f"{f}: size={img.size}, format={img.format}")
            if f == "icon.ico":
                print(f"ICO sizes: {img.info.get('sizes')}")
        except Exception as e:
            print(f"{f}: Error - {e}")
    else:
        print(f"{f}: Not found")
