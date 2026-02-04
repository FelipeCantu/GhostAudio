import os
import subprocess
import shutil
import logging
from pathlib import Path
import sys
import time
import threading
from datetime import datetime

from . import cd_metadata

logger = logging.getLogger(__name__)

class CDRipper:
    def __init__(self, output_dir):
        self.output_dir = Path(output_dir).resolve()
        self.output_dir.mkdir(parents=True, exist_ok=True)
        # Check for ffmpeg
        self.ffmpeg = shutil.which('ffmpeg')
        
        self.debug_log = []
        
        def log_debug(msg):
            print(msg)  # Print to console for immediate visibility
            self.debug_log.append(msg)
            try:
                log_path = Path(os.path.expanduser('~')) / 'ghost_app_debug.log'
                with open(log_path, 'a') as f:
                    f.write(f"{msg}\n")
            except Exception:
                pass

        log_debug(f"\n[{datetime.now()}] Initializing CDRipper")
        log_debug(f"Is Bundled: {getattr(sys, 'frozen', False)}")
        if hasattr(sys, '_MEIPASS'):
             log_debug(f"MEIPASS: {sys._MEIPASS}")

        # If not found in PATH, check if we are running in a PyInstaller bundle
        if not self.ffmpeg and hasattr(sys, '_MEIPASS'):
            # PyInstaller one-file mode extracts to sys._MEIPASS
            # We used --add-binary="bin/ffmpeg.exe;." so it should be at root of _MEIPASS
            bundled_paths = [
                Path(sys._MEIPASS) / 'ffmpeg.exe',
                Path(sys._MEIPASS) / 'bin' / 'ffmpeg.exe',
            ]
            
            for p in bundled_paths:
                log_debug(f"Checking {p} (exists: {p.exists()})")
                if p.exists():
                    self.ffmpeg = str(p)
                    break
        
        # If still not found, check local bin (for dev mode) or CWD
        if not self.ffmpeg:
            local_paths = [
                 Path(__file__).resolve().parent.parent / 'bin' / 'ffmpeg.exe',
                 Path(os.getcwd()) / 'ffmpeg.exe',
                 Path(os.getcwd()) / 'bin' / 'ffmpeg.exe'
            ]
            for p in local_paths:
                exists = p.exists() if p else False
                log_debug(f"Checking local {p} (exists: {exists})")
                if exists:
                    self.ffmpeg = str(p)
                    break

        log_debug(f"Final Ffmpeg Path: {self.ffmpeg}")


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

    def rip_whole_cd(self, drive_letter, output_image_path, progress_callback=None, total_duration_ms=0):
        """Rip the entire CD to a single WAV file with real-time progress monitoring"""
        if not self.ffmpeg:
            logger.warning("ffmpeg not found, simulating full rip.")
            output_image_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_image_path, 'wb') as f:
                f.write(b'RIFF....WAVEfmt ... data....')
            return True

        output_image_path.parent.mkdir(parents=True, exist_ok=True)
        drive = drive_letter.rstrip('\\').rstrip(':') + ':'

        # Calculate expected file size: 44100 Hz * 2 bytes * 2 channels * duration_seconds
        # Default to 45 minutes if unknown
        duration_seconds = (total_duration_ms / 1000) if total_duration_ms else 2700
        expected_size = int(44100 * 2 * 2 * duration_seconds)

        cmd = [
            self.ffmpeg, '-y',
            '-f', 'libcdio',
            '-i', drive,
            '-acodec', 'pcm_s16le',
            '-ar', '44100',
            '-ac', '2',
            str(output_image_path)
        ]

        logger.info(f"Ripping whole CD image: {' '.join(cmd)}")
        logger.info(f"Expected size: {expected_size / 1024 / 1024:.1f} MB, duration: {duration_seconds:.0f}s")

        try:
            # Start ffmpeg as non-blocking subprocess
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

            # Monitor file size for progress
            last_percent = -1
            while process.poll() is None:
                time.sleep(2)  # Check every 2 seconds
                try:
                    if output_image_path.exists():
                        current_size = output_image_path.stat().st_size
                        percent = min(int((current_size / expected_size) * 100), 99)

                        if percent != last_percent and progress_callback:
                            elapsed_mb = current_size / 1024 / 1024
                            total_mb = expected_size / 1024 / 1024
                            progress_callback(
                                "reading",
                                percent,
                                100,
                                f"Reading CD: {elapsed_mb:.0f} MB / {total_mb:.0f} MB ({percent}%)"
                            )
                            last_percent = percent
                except Exception as e:
                    logger.debug(f"Progress check error: {e}")

            # Process finished, check result
            stdout, stderr = process.communicate()
            if process.returncode != 0:
                logger.error(f"Full rip failed: {stderr.decode() if stderr else 'unknown error'}")
                raise subprocess.CalledProcessError(process.returncode, cmd)

            return True

        except subprocess.TimeoutExpired:
            logger.error("Full rip timed out")
            process.kill()
            return False
        except Exception as e:
            logger.error(f"Full rip error: {e}")
            return False

    def split_track_from_image(self, image_path, start_seconds, duration_seconds, output_filename, track_num):
        """Extract a track from the big wav image using ffmpeg (disk-to-disk is fast)"""
        if not self.ffmpeg:
            # Simulate
            with open(output_filename, 'wb') as f:
                f.write(b'Simulated Track Content')
            return

        try:
            output_filename.parent.mkdir(parents=True, exist_ok=True)
            
            # Input is the file now, not the CD drive
            # -ss before -i is for fast seek (input seeking), but for WAV it's fine either way often.
            # However, for accuracy after ripping, we want precise cutting.
            
            cmd = [
                self.ffmpeg, '-y',
                '-i', str(image_path),
                '-ss', str(start_seconds),
                '-t', str(duration_seconds),
                '-acodec', 'copy', # Copy codec to avoid re-encoding (FAST)
                str(output_filename)
            ]
            
            logger.info(f"Splitting track {track_num}: start={start_seconds}, dur={duration_seconds}")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            
            if result.returncode != 0:
                logger.error(f"Split error for track {track_num}: {result.stderr}")
                raise subprocess.CalledProcessError(result.returncode, cmd)

        except Exception as e:
            logger.error(f"Failed to split track {track_num}: {e}")
            # Fallback: create empty file or error placeholder
            with open(output_filename, 'wb') as f:
                f.write(b'Error Splitting')

    def _rip_track_from_cd(self, drive_letter, track_number, output_filename):
        """Rip a single track from an audio CD on Windows using ffmpeg (Fallback)"""
        if not self.ffmpeg:
            logger.warning("ffmpeg not found, simulating rip for demo.")
            with open(output_filename, 'wb') as f:
                f.write(b'Simulated Audio Content')
            return

        try:
            output_filename.parent.mkdir(parents=True, exist_ok=True)
            drive = drive_letter.rstrip('\\').rstrip(':') + ':'
            
            # Get track timing from TOC for precise rip
            toc = cd_metadata.get_drive_toc(drive_letter)
            if toc:
                first, last, lead_out, offsets = toc
                if track_number <= len(offsets) and track_number >= 1:
                    start_sectors = offsets[track_number - 1]
                    if track_number < len(offsets):
                        end_sectors = offsets[track_number]
                    else:
                        end_sectors = lead_out

                    start_time = start_sectors / 75.0
                    duration = (end_sectors - start_sectors) / 75.0

                    cmd = [
                        self.ffmpeg, '-y',
                        '-f', 'libcdio',
                        '-i', drive,
                        '-ss', str(start_time),
                        '-t', str(duration),
                        '-acodec', 'pcm_s16le',
                        '-ar', '44100',
                        '-ac', '2',
                        str(output_filename)
                    ]
                    
                    logger.info(f"Fallback ripping track {track_number}: {' '.join(cmd)}")
                    subprocess.run(cmd, check=True, timeout=300)
                    return

            # Ultimate fallback if TOC fails
            logger.warning("Could not get TOC for fallback, trying direct track mapping")
            subprocess.run([
                self.ffmpeg, '-y', '-f', 'libcdio', '-i', drive,
                '-map', f'0:{track_number - 1}',
                str(output_filename)
            ], check=True, timeout=300)

        except Exception as e:
            logger.error(f"Failed to rip track {track_number} (fallback): {e}")
            with open(output_filename, 'wb') as f:
                f.write(b'Error Ripping')
        
    def rip_cd(self, drive_path, metadata=None, progress_callback=None):
        """Rip the CD, optionally using metadata to organize files

        Args:
            drive_path: Path to the CD drive
            metadata: Optional metadata dict with artist, album, tracks
            progress_callback: Optional callable(stage, current, total, message) for progress updates
        """
        results = []

        def report_progress(stage, current, total, message):
            if progress_callback:
                progress_callback(stage, current, total, message)
            logger.info(f"[Progress] {stage}: {current}/{total} - {message}")

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

        # Optimization: Rip whole CD first if we have multiple tracks and we have TOC
        # If we only have 1 track to rip, maybe single rip is fine, but consistency is key.
        toc = cd_metadata.get_drive_toc(drive_path)
        total_tracks = len(tracks_to_rip)

        should_use_bulk_rip = toc is not None and len(tracks_to_rip) > 1 and self.ffmpeg is not None

        # Temp image path
        temp_image = output_base / "temp_full_image.wav"

        # Calculate total duration from metadata
        total_duration_ms = 0
        if metadata and 'tracks' in metadata:
            for track in metadata['tracks']:
                total_duration_ms += int(track.get('duration_ms', 0))

        bulk_rip_success = False
        if should_use_bulk_rip:
            logger.info("Starting Bulk Rip Strategy...")
            report_progress("reading", 0, 100, "Starting CD read...")
            bulk_rip_success = self.rip_whole_cd(
                drive_path,
                temp_image,
                progress_callback=progress_callback,
                total_duration_ms=total_duration_ms
            )
            if bulk_rip_success:
                report_progress("processing", 100, 100, "CD read complete. Extracting tracks...")

        if bulk_rip_success and toc:
             first, last, lead_out, offsets = toc

             for idx, track in enumerate(tracks_to_rip):
                try:
                    num = int(track['track_number'])
                    # TOC is 0-indexed for tracks in the tuple offsets usually?
                    # The get_drive_toc returns a list of sectors. offset[0] is Track 1.
                    
                    if num <= len(offsets) and num >= 1:
                        start_sectors = offsets[num - 1]
                        if num < len(offsets):
                             end_sectors = offsets[num]
                        else:
                             end_sectors = lead_out
                        
                        start_time = start_sectors / 75.0
                        duration = (end_sectors - start_sectors) / 75.0
                        
                        title = self._sanitize_filename(track.get('title', f'Track {num}'))
                        filename = output_base / f"{num:02d} - {title}.wav"

                        report_progress("extracting", idx + 1, total_tracks, f"Extracting: {title}")
                        self.split_track_from_image(temp_image, start_time, duration, filename, num)
                        results.append(str(filename))
                    else:
                        logger.warning(f"Track {num} not in TOC offsets range")
                except Exception as e:
                     logger.error(f"Error splitting track {track}: {e}")
                     
             # Signup
             try:
                 os.remove(temp_image)
             except:
                 pass
                 
        else:
             # Fallback to individual ripping (or if bulk failed)
             logger.info("Using legacy individual track ripping...")
             for idx, track in enumerate(tracks_to_rip):
                try:
                    num = int(track['track_number'])
                    title = self._sanitize_filename(track.get('title', f'Track {num}'))
                    filename = output_base / f"{num:02d} - {title}.wav"

                    report_progress("ripping", idx + 1, total_tracks, f"Ripping: {title}")
                    self._rip_track_from_cd(drive_path, num, filename)
                    results.append(str(filename))
                except Exception as e:
                    logger.error(f"Error processing track {track}: {e}")

        report_progress("complete", total_tracks, total_tracks, "Import complete!")
        return results

    def _sanitize_filename(self, name):
        keep = (' ', '.', '_', '-')
        return "".join(c for c in name if c.isalnum() or c in keep).strip()
