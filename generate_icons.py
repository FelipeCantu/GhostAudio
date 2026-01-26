from PIL import Image
import os

source_image = r"C:\Users\Felipe\.gemini\antigravity\brain\cd59dd8a-c613-47fc-a3c7-6e27d313e1b3\uploaded_media_1769398832988.png"
output_dir = r"C:\Users\Felipe\Documents\projects\GhostRepo\temp_icons"

if not os.path.exists(output_dir):
    os.makedirs(output_dir)

try:
    img = Image.open(source_image)
    
    # Force transparency support
    img = img.convert("RGBA")
    
    # 1. Create a high-quality square base for PNG
    # Resize to 512x512 using LANCZOS for best quality
    base_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
    base_512.save(os.path.join(output_dir, "icon.png"))
    print("Generated icon.png (512x512)")

    # 2. Create favicon.ico (Web) - Standard sizes
    # We create a list of resized images to ensure high quality for each layer
    favicon_sizes = [16, 32, 48, 64] 
    # Note: 128/256 sometimes cause issues in basic favicons, but we can include them if needed. 
    # For web favicon, usually smaller is fine.
    
    img.save(os.path.join(output_dir, "favicon.ico"), format='ICO', sizes=[(s, s) for s in favicon_sizes])
    print("Generated favicon.ico")

    # 3. Create icon.ico (Windows App) - MUST include 256x256
    # We will explicitly create the 256x256 version and use it as base or params
    win_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    
    # Saving directly with 'sizes' should work if the input is large enough.
    # We use the 512 base to strictly ensure we have enough data.
    base_512.save(os.path.join(output_dir, "icon.ico"), format='ICO', sizes=win_sizes)
    print(f"Generated icon.ico with sizes: {win_sizes}")

except Exception as e:
    print(f"Error processing image: {e}")
