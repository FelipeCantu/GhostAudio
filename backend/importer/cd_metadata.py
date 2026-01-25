
import ctypes
import hashlib
import logging
import os
import musicbrainzngs

if os.name == 'nt':
    from ctypes import windll, create_string_buffer
else:
    # Dummy definitions for Linux/Render
    windll = None
    create_string_buffer = None


logger = logging.getLogger(__name__)

# Configure MusicBrainz
musicbrainzngs.set_useragent("GhostAudio", "0.1", "http://localhost")

def send_mci_command(command_str):
    """Send an MCI command string to winmm.dll"""
    if not windll:
        logger.warning("MCI commands not supported on this platform (Non-Windows)")
        return None

    response_buffer = create_string_buffer(255)
    error_code = windll.winmm.mciSendStringA(
        command_str.encode('ascii'), 
        response_buffer, 
        254, 
        0
    )
    if error_code != 0:
        return None
    return response_buffer.value.decode('ascii')

def get_drive_toc(drive_letter):
    """
    Get the TOC of the CD in the specified drive using MCI.
    Returns: (first_track, last_track, lead_out_offset, track_offsets)
    Offsets are in sectors (1/75th of a second).
    """
    alias = "cd_ripper_device"
    drive_str = f"{drive_letter}"
    if drive_str.endswith('\\'):
        drive_str = drive_str[:-1]
    
    # commands
    # Close any existing alias just in case
    send_mci_command(f"close {alias}")

    # Open drive
    res = send_mci_command(f"open {drive_str} type cdaudio alias {alias}")
    if res is None:
        logger.error(f"Failed to open drive {drive_letter}")
        return None

    try:
        # Set time format to MSF (Minutes, Seconds, Frames)
        send_mci_command(f"set {alias} time format msf")

        # Get number of tracks
        track_count_str = send_mci_command(f"status {alias} number of tracks")
        if not track_count_str:
            return None
        num_tracks = int(track_count_str)
        
        first_track = 1
        last_track = num_tracks
        
        track_offsets = []
        
        for i in range(first_track, last_track + 1):
            # Get position of track
            pos_str = send_mci_command(f"status {alias} position track {i}")
            # Format is mm:ss:ff or similar. MCI usually returns "mm:ss:ff"
            # Parse it
            m, s, f = map(int, pos_str.replace(':', ' ').split())
            sectors = (m * 60 + s) * 75 + f
            track_offsets.append(sectors)
            
        # Get lead-out (start of next track after last)
        # Often approximated by getting the length of the disc + start of disc?
        # Or "length track <last>" + "position track <last>"
        # "status <alias> length" returns total length
        # Using "status <alias> position track <last+1>" is sometimes possible for leadout if it supports it, 
        # but "length" of whole disc is safer + 150 frames (2 seconds pre-gap)
        
        # A more reliable way for leadout in MCI:
        # Get length of the CD
        total_len_str = send_mci_command(f"status {alias} length")
        tm, ts, tf = map(int, total_len_str.replace(':', ' ').split())
        total_sectors = (tm * 60 + ts) * 75 + tf
        
        # Leadout is usually Total Length + Start of First Track?
        # Actually, MSF absolute time usually starts at 2 seconds (150 frames).
        # But MCI 'length' might just be the duration.
        # Let's try: position of last track + length of last track
        last_len_str = send_mci_command(f"status {alias} length track {last_track}")
        lm, ls, lf = map(int, last_len_str.replace(':', ' ').split())
        last_len_sectors = (lm * 60 + ls) * 75 + lf
        
        lead_out_offset = track_offsets[-1] + last_len_sectors
        
        return (first_track, last_track, lead_out_offset, track_offsets)

    except Exception as e:
        logger.error(f"Error reading TOC: {e}")
        return None
    finally:
        send_mci_command(f"close {alias}")

def calculate_disc_id(first, last, lead_out, offsets):
    """
    Calculate MusicBrainz Disc ID.
    Based on: https://musicbrainz.org/doc/Disc_ID_Calculation
    """
    # 1. SHA-1 of input strings
    # Input format:
    # FIRST LAST LEAD_OUT OFFSETS...
    # All stored as capital hex, 2 chars for tracks, 8 chars for offsets.
    
    msg = "{:02X}{:02X}{:08X}".format(first, last, lead_out)
    for off in offsets:
        msg += "{:08X}".format(off)
        
    # How many times? 99 times? No, just the string?
    # Wait, the MusicBrainz algorithm is:
    # binary SHA-1 of the following data:
    # 1 byte: first track
    # 1 byte: last track
    # 4 bytes: lead-out offset (big endian? No, usually sectors)
    # 99 * 4 bytes: track offsets (0 for unused).
    
    # Wait, let's verify the python implementation commonly used.
    # It's usually Base64 of SHA-1 digest.
    
    s = hashlib.sha1()
    s.update(chr(first).encode('latin1'))
    s.update(chr(last).encode('latin1'))
    s.update("{:08X}".format(lead_out).encode('ascii')) # Wait, this seems wrong.
    
    # Looking at a reference implementation (e.g. from picnic/discid.py)
    # It constructs a string for the SHA input?
    # Actually, the MusicBrainz Disc ID is:
    # base64_url_safe( sha1( 
    #   sprintf("%02X", first_track) + 
    #   sprintf("%02X", last_track) + 
    #   sprintf("%08X", lead_out_offset) + 
    #   sprintf("%08X", offset_1) + ... + sprintf("%08X", offset_99) 
    # ) )
    
    # Note: Ensure we have 99 offsets (pad with 0) if less.
    # The offsets include the sectors.
    
    message = "{:02X}{:02X}{:08X}".format(first, last, lead_out)
    
    for i in range(0, 100): # MusicBrainz usually expects 100 offsets? Or 99? 
        # The logic is often just the tracks that exist.
        # But the standard is strict.
        # The digest is over the string.
        pass
        
    # Let's follow the official spec more closely:
    # https://musicbrainz.org/doc/Disc_ID_Calculation
    # "The hash is calculated by applying SHA-1 to a string..."
    # String = 
    # 1. First track (2 hex digits)
    # 2. Last track (2 hex digits)
    # 3. Lead-out address (8 hex digits)
    # 4. 99 Track offsets (each 8 hex digits)
    
    # Total string length: 2 + 2 + 8 + (99 * 8) = 12 + 792 = 804 chars.
    
    content = "{:02X}{:02X}{:08X}".format(first, last, lead_out)
    
    # Add existing offsets
    for off in offsets:
        content += "{:08X}".format(off)
        
    # Pad with 0s until 99 offsets
    for _ in range(len(offsets), 99):
        content += "00000000"
        
    digest = hashlib.sha1(content.encode('ascii')).digest()
    
    # Base64 encode, modify chars for URL safety
    import base64
    b64 = base64.b64encode(digest).decode('ascii')
    # Replace + with . , / with _ , = with -
    # Spec: "replace '+' with '.', '/' with '_', and '=' with '-'"
    disc_id = b64.replace('+', '.').replace('/', '_').replace('=', '-')
    
    return disc_id

def get_release_info(drive_letter):
    """
    Main entry point to get metadata.
    """
    toc = get_drive_toc(drive_letter)
    if not toc:
        return {"error": "Could not read CD TOC"}
    
    first, last, lead_out, offsets = toc
    disc_id = calculate_disc_id(first, last, lead_out, offsets)
    
    try:
        # includes=['recordings', 'artists'] gives us the tracks
        result = musicbrainzngs.get_releases_by_discid(disc_id, includes=['artists', 'recordings'])
        
        # Parse the result to a friendly format
        if 'disc' in result and 'release-list' in result['disc']:
            releases = result['disc']['release-list']
            if releases:
                release = releases[0] # Take the first match
                title = release.get('title', 'Unknown Album')
                artist = "Unknown Artist"
                if 'artist-credit' in release:
                    artist = release['artist-credit'][0]['artist']['name']
                
                tracks = []
                medium = release['medium-list'][0] # Assuming single disc
                if 'track-list' in medium:
                    for trk in medium['track-list']:
                        track_name = trk['recording']['title']
                        track_num = trk['number']
                        tracks.append({
                            'track_number': track_num,
                            'title': track_name,
                            'artist': artist # Can be per track
                        })
                
                return {
                    'disc_id': disc_id,
                    'album': title,
                    'artist': artist,
                    'tracks': tracks,
                    'cover_art': f"http://coverartarchive.org/release/{release['id']}/front"
                }
                
    except musicbrainzngs.ResponseError as e:
        logger.warning(f"MusicBrainz lookup failed: {e}")
        return {"error": "Metadata not found", "disc_id": disc_id}
        
    return {"error": "Unknown error", "disc_id": disc_id}

# Simulation/Fallback if needed for logic testing without a CD
def simulate_metadata():
    return {
        'disc_id': 'simulated_disc_id',
        'album': 'Simulated Album',
        'artist': 'Simulated Artist',
        'tracks': [
            {'track_number': '1', 'title': 'Simulated Track 1', 'artist': 'Simulated Artist'},
            {'track_number': '2', 'title': 'Simulated Track 2', 'artist': 'Simulated Artist'},
            {'track_number': '3', 'title': 'Simulated Track 3', 'artist': 'Simulated Artist'},
        ],
        'cover_art': None
    }
