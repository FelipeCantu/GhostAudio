import os
import subprocess
import shutil
import logging
import tempfile
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

        # Process safety: track our own ffmpeg subprocess and cancellation
        self._current_process = None
        self._cancel_event = threading.Event()

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

    def cleanup(self):
        """Kill only our specific ffmpeg subprocess (not system-wide)."""
        proc = self._current_process
        if proc is not None:
            try:
                proc.kill()
                proc.wait(timeout=5)
                logger.info(f"Killed ffmpeg subprocess PID {proc.pid}")
            except Exception as e:
                logger.warning(f"Failed to kill ffmpeg PID {proc.pid}: {e}")
            finally:
                self._current_process = None

    def cancel(self):
        """Request cancellation of the current rip operation."""
        logger.info("Cancellation requested")
        self._cancel_event.set()
        self.cleanup()

    def rip_whole_cd(self, drive_letter, output_image_path, progress_callback=None,
                     total_duration_ms=0, toc=None, tracks_to_rip=None):
        """Rip the entire CD to a single WAV file with real-time progress monitoring.

        Reports per-track read progress based on WAV file size mapped to TOC
        sector positions so the frontend can show which track the laser is on.
        """
        if not self.ffmpeg:
            logger.warning("ffmpeg not found, simulating full rip.")
            output_image_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_image_path, 'wb') as f:
                f.write(b'RIFF....WAVEfmt ... data....')
            return True

        output_image_path.parent.mkdir(parents=True, exist_ok=True)
        drive = drive_letter.rstrip('\\').rstrip(':') + ':'

        # Kill any leftover ffmpeg from this ripper instance
        self.cleanup()

        # Remove stale temp file from any previous interrupted import
        # so the progress monitor doesn't read old data.
        for _attempt in range(3):
            try:
                if output_image_path.exists():
                    os.remove(output_image_path)
                break
            except Exception:
                time.sleep(1)

        if output_image_path.exists():
            raise RuntimeError(
                f"Cannot remove stale temp file {output_image_path}. "
                "Another process may be locking it. Close other applications and retry."
            )

        # WAV output: 44100 Hz * 2 bytes (16-bit) * 2 channels = 176400 bytes/sec
        # Plus 44-byte WAV header.
        WAV_BPS = 176400
        WAV_HEADER = 44

        # Calculate expected file size from TOC lead-out sector (ground truth)
        if toc:
            _, _, lead_out, _ = toc
            duration_seconds = lead_out / 75.0
        elif total_duration_ms:
            duration_seconds = total_duration_ms / 1000
        else:
            duration_seconds = 2700  # 45 min fallback
        expected_size = WAV_HEADER + int(WAV_BPS * duration_seconds)

        # Pre-compute per-track byte boundaries from TOC for progress mapping.
        # Use the same WAV byte rate so boundaries are consistent with expected_size.
        track_boundaries = []  # [(track_number, start_byte, end_byte), ...]
        if toc and tracks_to_rip:
            first, last, lead_out, offsets = toc
            for t in tracks_to_rip:
                num = int(t['track_number'])
                if 1 <= num <= len(offsets):
                    start_s = offsets[num - 1]
                    end_s = offsets[num] if num < len(offsets) else lead_out
                    track_boundaries.append((
                        num,
                        WAV_HEADER + int(start_s / 75.0 * WAV_BPS),
                        WAV_HEADER + int(end_s / 75.0 * WAV_BPS)
                    ))

        cmd = [
            self.ffmpeg, '-y',
            '-f', 'libcdio',
            '-speed', '0',      # Request maximum drive read speed
            '-i', drive,
            '-acodec', 'pcm_s16le',
            '-ar', '44100',
            '-ac', '2',
            str(output_image_path)
        ]

        logger.info(f"Ripping whole CD image: {' '.join(cmd)}")
        logger.info(f"Expected size: {expected_size / 1024 / 1024:.1f} MB, duration: {duration_seconds:.0f}s")

        # Use a temp file for stderr to avoid pipe buffer deadlock.
        # ffmpeg writes a large startup banner to stderr which can exceed
        # the 4KB Windows pipe buffer, blocking the process forever.
        stderr_path = str(output_image_path) + '.stderr.log'
        stderr_file = open(stderr_path, 'w')

        try:
            # Start ffmpeg as non-blocking subprocess
            process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=stderr_file)
            self._current_process = process

            # Hard timeout: kill ffmpeg if it runs more than 3× the expected duration.
            # This prevents permanent hangs on bad sectors / slow drives near end of disc.
            max_runtime = max(int(duration_seconds * 3), 600)  # at least 10 min
            start_time = time.time()

            # Stall detection: if the output file stops growing for 30s while at
            # >=99% of expected size, the drive has finished but ffmpeg is frozen
            # waiting for a "done" signal that never comes (common on Windows with libcdio).
            last_size_change_time = time.time()
            last_observed_size = 0

            # Monitor file size for progress
            last_percent = -1
            last_track_progress = {}  # track_number -> last reported percent
            while process.poll() is None:
                if self._cancel_event.is_set():
                    logger.info("Cancellation detected during CD read, killing ffmpeg")
                    process.kill()
                    process.wait(timeout=5)
                    return False
                elapsed = time.time() - start_time
                if elapsed > max_runtime:
                    logger.warning(
                        f"ffmpeg exceeded timeout ({max_runtime}s), killing and proceeding with partial rip"
                    )
                    process.kill()
                    process.wait(timeout=5)
                    break  # Fall through to check file — treat partial WAV as usable
                time.sleep(1)  # Check every second for snappier progress
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

                        # Compute per-track progress from file size
                        if track_boundaries and progress_callback:
                            for track_num, start_b, end_b in track_boundaries:
                                if current_size >= end_b:
                                    tp = 100
                                elif current_size > start_b:
                                    tp = int((current_size - start_b) / (end_b - start_b) * 100)
                                else:
                                    continue  # haven't reached this track yet
                                # Only send if value actually changed (avoid spamming)
                                if tp != last_track_progress.get(track_num, -1):
                                    last_track_progress[track_num] = tp
                                    progress_callback(
                                        "track_progress",
                                        percent, 100,
                                        f"Reading track {track_num}",
                                        track_number=track_num,
                                        track_percent=tp
                                    )
                except Exception as e:
                    logger.debug(f"Progress check error: {e}")

                # Stall detection: file at full size but not growing → ffmpeg is frozen
                try:
                    if output_image_path.exists():
                        current_size = output_image_path.stat().st_size
                        if current_size != last_observed_size:
                            last_observed_size = current_size
                            last_size_change_time = time.time()
                        elif current_size >= expected_size * 0.99:
                            stall_secs = time.time() - last_size_change_time
                            if stall_secs > 30:
                                logger.warning(
                                    f"ffmpeg stalled: file at {current_size / 1024 / 1024:.0f} MB "
                                    f"(expected {expected_size / 1024 / 1024:.0f} MB) for {stall_secs:.0f}s. "
                                    "Killing ffmpeg and proceeding with captured audio."
                                )
                                process.kill()
                                process.wait(timeout=5)
                                break
                except Exception:
                    pass

            # Process finished (or was killed by timeout/cancel), check result.
            # If the output file has meaningful content, treat it as a success so
            # the track-splitting phase can use whatever audio was captured.
            stderr_file.close()
            if process.returncode != 0:
                if output_image_path.exists() and output_image_path.stat().st_size > 1024 * 1024:
                    logger.warning(
                        f"ffmpeg exited with code {process.returncode} but partial WAV is "
                        f"{output_image_path.stat().st_size // 1024 // 1024} MB — proceeding with partial rip"
                    )
                    return True
                try:
                    with open(stderr_path) as f:
                        err_output = f.read()
                    logger.error(f"Full rip failed: {err_output[-500:]}")
                except Exception:
                    logger.error(f"Full rip failed with code {process.returncode}")
                raise subprocess.CalledProcessError(process.returncode, cmd)

            return True

        except subprocess.CalledProcessError:
            return False
        except Exception as e:
            logger.error(f"Full rip error: {e}")
            try:
                process.kill()
            except Exception:
                pass
            return False
        finally:
            self._current_process = None
            try:
                stderr_file.close()
            except Exception:
                pass
            try:
                os.remove(stderr_path)
            except Exception:
                pass

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
                        '-speed', '0',
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
                self.ffmpeg, '-y', '-f', 'libcdio', '-speed', '0', '-i', drive,
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
        # Clear cancellation state for this new rip
        self._cancel_event.clear()

        results = []

        def report_progress(stage, current, total, message, track_number=None, track_percent=None):
            if progress_callback:
                progress_callback(stage, current, total, message, track_number, track_percent)
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

        # Reconcile metadata tracks with TOC — the TOC is the ground truth for
        # what's actually on the physical disc.  If MusicBrainz matched a
        # different edition (deluxe, bonus tracks, etc.) metadata may list more
        # tracks than the disc has.  We keep the TOC-valid tracks and append any
        # TOC-only tracks that metadata missed.
        if toc:
            first, last, lead_out, offsets = toc
            toc_track_count = last  # last track number on disc

            # Tracks present in metadata keyed by track number
            meta_nums = {int(t['track_number']) for t in tracks_to_rip}

            # Warn on mismatch
            if len(tracks_to_rip) != toc_track_count:
                logger.warning(
                    f"Track count mismatch: metadata has {len(tracks_to_rip)} tracks, "
                    f"TOC has {toc_track_count}. Reconciling with TOC as ground truth."
                )

            # Remove metadata tracks that exceed the TOC (e.g. bonus tracks not on disc)
            tracks_to_rip = [
                t for t in tracks_to_rip
                if 1 <= int(t['track_number']) <= toc_track_count
            ]

            # Add any TOC tracks missing from metadata (e.g. hidden tracks)
            for i in range(1, toc_track_count + 1):
                if i not in meta_nums:
                    logger.info(f"Adding TOC track {i} missing from metadata")
                    tracks_to_rip.append({
                        'track_number': str(i),
                        'title': f'Track {i}',
                        'artist': metadata.get('artist', 'Unknown') if metadata else 'Unknown',
                        'duration_ms': 0
                    })

            # Sort by track number to keep order consistent
            tracks_to_rip.sort(key=lambda t: int(t['track_number']))
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
                total_duration_ms=total_duration_ms,
                toc=toc,
                tracks_to_rip=tracks_to_rip
            )
            if bulk_rip_success:
                report_progress("processing", 100, 100, "CD read complete. Extracting tracks...")

        if bulk_rip_success and toc:
             first, last, lead_out, offsets = toc
             failed_tracks = []  # tracks that need individual fallback

             for idx, track in enumerate(tracks_to_rip):
                if self._cancel_event.is_set():
                    report_progress("cancelled", idx, total_tracks, "Import cancelled by user")
                    break
                try:
                    num = int(track['track_number'])

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

                        report_progress("extracting", idx + 1, total_tracks, f"Extracting: {title}", track_number=num)
                        self.split_track_from_image(temp_image, start_time, duration, filename, num)

                        # Verify the extracted file is valid (not an error placeholder)
                        if filename.exists() and filename.stat().st_size > 100:
                            results.append(str(filename))
                            report_progress("track_done", idx + 1, total_tracks, f"Done: {title}", track_number=num)
                        else:
                            logger.warning(f"Track {num} extraction produced invalid file, queuing for individual rip")
                            failed_tracks.append(track)
                    else:
                        logger.warning(f"Track {num} not in TOC offsets range (offsets: {len(offsets)}), queuing for individual rip")
                        failed_tracks.append(track)
                except Exception as e:
                     logger.error(f"Error splitting track {track}: {e}")
                     failed_tracks.append(track)

             # Clean up temp image
             try:
                 os.remove(temp_image)
             except:
                 pass

             # Fallback: individually rip any tracks that failed bulk extraction
             if failed_tracks and not self._cancel_event.is_set():
                 logger.info(f"Retrying {len(failed_tracks)} failed track(s) with individual ripping...")
                 for track in failed_tracks:
                     if self._cancel_event.is_set():
                         report_progress("cancelled", 0, total_tracks, "Import cancelled by user")
                         break
                     try:
                         num = int(track['track_number'])
                         title = self._sanitize_filename(track.get('title', f'Track {num}'))
                         filename = output_base / f"{num:02d} - {title}.wav"

                         report_progress("ripping", num, total_tracks, f"Ripping (retry): {title}", track_number=num)
                         self._rip_track_from_cd(drive_path, num, filename)
                         if filename.exists() and filename.stat().st_size > 100:
                             results.append(str(filename))
                             report_progress("track_done", num, total_tracks, f"Done: {title}", track_number=num)
                         else:
                             logger.error(f"Individual rip also failed for track {num}")
                     except Exception as e:
                         logger.error(f"Error in individual fallback for track {track}: {e}")

        else:
             # Fallback to individual ripping (or if bulk failed)
             logger.info("Using legacy individual track ripping...")
             for idx, track in enumerate(tracks_to_rip):
                if self._cancel_event.is_set():
                    report_progress("cancelled", idx, total_tracks, "Import cancelled by user")
                    break
                try:
                    num = int(track['track_number'])
                    title = self._sanitize_filename(track.get('title', f'Track {num}'))
                    filename = output_base / f"{num:02d} - {title}.wav"

                    report_progress("ripping", idx + 1, total_tracks, f"Ripping: {title}", track_number=num)
                    self._rip_track_from_cd(drive_path, num, filename)
                    results.append(str(filename))
                    report_progress("track_done", idx + 1, total_tracks, f"Done: {title}", track_number=num)
                except Exception as e:
                    logger.error(f"Error processing track {track}: {e}")

        if self._cancel_event.is_set():
            report_progress("cancelled", 0, total_tracks, "Import cancelled by user")
        else:
            report_progress("complete", total_tracks, total_tracks, "Import complete!")
        return results

    def _sanitize_filename(self, name):
        keep = (' ', '.', '_', '-')
        return "".join(c for c in name if c.isalnum() or c in keep).strip()
