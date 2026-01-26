from PIL import Image
import os

source_image = r"C:\Users\Felipe\.gemini\antigravity\brain\cd59dd8a-c613-47fc-a3c7-6e27d313e1b3\uploaded_media_1769398832988.png"
output_dir = r"C:\Users\Felipe\Documents\projects\GhostRepo\temp_icons"

if not os.path.exists(output_dir):
    os.makedirs(output_dir)

try:
    img = Image.open(source_image)
    
    # 1. Generate favicon.ico (multi-size)
    # Standard sizes for favicon.ico: 16, 32, 48, 64, 128, 256
    icon_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    img.save(os.path.join(output_dir, "favicon.ico"), format='ICO', sizes=icon_sizes)
    print("Generated favicon.ico")

    # 2. Generate icon.png (512x512) for Electron / Manifest
    img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
    img_512.save(os.path.join(output_dir, "icon.png"))
    print("Generated icon.png")
    
    # 3. Generate icon.ico for Electron Windows Build (can be same as favicon, but kept separate for clarity)
    img.save(os.path.join(output_dir, "icon.ico"), format='ICO', sizes=icon_sizes)
    print("Generated icon.ico")

except Exception as e:
    print(f"Error processing image: {e}")
