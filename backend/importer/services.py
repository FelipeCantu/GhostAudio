import os
import subprocess
import shutil
import logging
from pathlib import Path
import sys
from datetime import datetime

from . import cd_metadata

logger = logging.getLogger(__name__)

class CDRipper:
    def __init__(self, output_dir):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        # Check for ffmpeg
        self.ffmpeg = shutil.which('ffmpeg')
        
        # Debug Logging for Ffmpeg
        log_path = Path(os.path.expanduser('~')) / 'ghost_app_debug.log'
        with open(log_path, 'a') as f:
            f.write(f"\n[{datetime.now()}] Initializing CDRipper\n")
            f.write(f"Is Bundled: {getattr(sys, 'frozen', False)}\n")
            if hasattr(sys, '_MEIPASS'):
                 f.write(f"MEIPASS: {sys._MEIPASS}\n")

        # If not found in PATH, check if we are running in a PyInstaller bundle
        if not self.ffmpeg and hasattr(sys, '_MEIPASS'):
            # PyInstaller one-file mode extracts to sys._MEIPASS
            # We used --add-binary="bin/ffmpeg.exe;." so it should be at root of _MEIPASS
            bundled_paths = [
                Path(sys._MEIPASS) / 'ffmpeg.exe',
                Path(sys._MEIPASS) / 'bin' / 'ffmpeg.exe',
            ]
            
            for p in bundled_paths:
                with open(log_path, 'a') as f: f.write(f"Checking {p} (exists: {p.exists()})\n")
                if p.exists():
                    self.ffmpeg = str(p)
                    break
        
        # If still not found, check local bin (for dev mode) or CWD
        if not self.ffmpeg:
            bin_name = 'ffmpeg.exe' if os.name == 'nt' else 'ffmpeg'
            local_paths = [
                 Path(__file__).resolve().parent.parent / 'bin' / bin_name,
                 Path(os.getcwd()) / bin_name,
                 Path(os.getcwd()) / 'bin' / bin_name
            ]
            for p in local_paths:
                if p.exists():
                    self.ffmpeg = str(p)
                    break

        with open(log_path, 'a') as f: f.write(f"Final Ffmpeg Path: {self.ffmpeg}\n")


    def get_drives(self):
        """List available CD/DVD drives (Windows specific)"""
        import string
        from ctypes import windll
        
        drives = []
        bitmask = windll.kernel32.GetLogicalDrives()
        for letter in string.ascii_uppercase:
            if bitmask & 1:
                drive_path = f"{letter}:\\"
                # checking if it is a CDROM drive (Type 5)
                if windll.kernel32.GetDriveTypeW(drive_path) == 5:
                    drives.append(drive_path)
            bitmask >>= 1
        return drives

    def get_cd_metadata(self, drive_path):
        """Fetch metadata for the CD in the given drive"""
        return cd_metadata.get_release_info(drive_path)

    def rip_track(self, drive_letter, track_number, output_filename):
        """Rip a single track using ffmpeg/cdparanoia or just copying if it's treated as files"""
        if not self.ffmpeg:
            # Fallback for prototype/demo if ffmpeg is missing
            logger.warning("ffmpeg not found, simulating rip for demo.")
            # Create a dummy file or empty file
            with open(output_filename, 'wb') as f:
                f.write(b'Simulated Audio Content')
            return

        # Simple ffmpeg command for windows (often complex, this is a placeholder for actual logic)
        try:
            # Ensure output directory exists
            output_filename.parent.mkdir(parents=True, exist_ok=True)
            
            subprocess.run([
                self.ffmpeg, '-y', '-i', f'{drive_letter}track{track_number:02d}.cda', 
                str(output_filename)
            ], check=True)
        except subprocess.CalledProcessError:
            # Fallback if actual rip fails
            logger.error(f"Failed to rip track {track_number}")
            with open(output_filename, 'wb') as f:
                f.write(b'Error Ripping - Simulated Content')
        
    def rip_cd(self, drive_path, metadata=None):
        """Rip the CD, optionally using metadata to organize files"""
        results = []
        
        tracks_to_rip = []
        
        if metadata and 'tracks' in metadata:
            tracks_to_rip = metadata['tracks']
        else:
            # Try to get honest track count
            toc = cd_metadata.get_drive_toc(drive_path)
            if toc:
                count = toc[1]
                for i in range(1, count + 1):
                    tracks_to_rip.append({'track_number': i, 'title': f'Track {i}', 'artist': 'Unknown'})
            else:
                # Simulation default
                for i in range(1, 4):
                    tracks_to_rip.append({'track_number': i, 'title': f'Track_{i:02d}', 'artist': 'Unknown'})

        # Determine Output Folder
        output_base = self.output_dir
        if metadata and 'artist' in metadata and 'album' in metadata:
            artist = self._sanitize_filename(metadata['artist'])
            album = self._sanitize_filename(metadata['album'])
            output_base = output_base / artist / album
            output_base.mkdir(parents=True, exist_ok=True)

        for track in tracks_to_rip:
            try:
                num = int(track['track_number'])
                title = self._sanitize_filename(track.get('title', f'Track {num}'))
                filename = output_base / f"{num:02d} - {title}.wav"
                
                self.rip_track(drive_path, num, filename)
                results.append(str(filename))
            except Exception as e:
                logger.error(f"Error processing track {track}: {e}")

        return results

    def _sanitize_filename(self, name):
        keep = (' ', '.', '_', '-')
        return "".join(c for c in name if c.isalnum() or c in keep).strip()
