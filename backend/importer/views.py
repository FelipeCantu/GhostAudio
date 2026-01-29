from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework import viewsets, permissions, status, generics
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
import json
import logging
import os
from datetime import datetime, timedelta
from bson.objectid import ObjectId
from pymongo import MongoClient
from django.conf import settings
from .services import CDRipper
from .models import Album, Track
from .serializers import AlbumSerializer, UserSerializer

logger = logging.getLogger(__name__)

# --- Auth Views ---

class RegisterView(generics.CreateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.AllowAny]

class UserDetailView(generics.RetrieveAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

# --- Library Views ---

class AlbumViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AlbumSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Album.objects.filter(user=self.request.user)

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def dashboard_stats(request):
    """
    Get statistics for the user's library:
    - Total Albums
    - Total Tracks
    - Recent Albums (top 5)
    """
    user = request.user
    
    # Counts
    total_albums = Album.objects.filter(user=user).count()
    total_tracks = Track.objects.filter(album__user=user).count()
    
    # Recent Activity
    recent_albums_qs = Album.objects.filter(user=user).order_by('-created_at')[:5]
    recent_albums = AlbumSerializer(recent_albums_qs, many=True).data
    
    return Response({
        'total_albums': total_albums,
        'total_tracks': total_tracks,
        'recent_albums': recent_albums
    })

# --- CD Import Views ---

@csrf_exempt
def check_system(request):
    """Check system capabilities like ffmpeg presence"""
    ripper = CDRipper('music_library')
    return JsonResponse({
        'ffmpeg_found': bool(ripper.ffmpeg),
        'ffmpeg_path': ripper.ffmpeg,
        'platform': os.name,
        'debug_log': ripper.debug_log
    })

def list_drives(request):
    # Public for now, or could require auth
    ripper = CDRipper('music_library')
    drives = ripper.get_drives()
    return JsonResponse({'drives': drives})


@csrf_exempt
def get_cd_metadata(request):
    """Get metadata for a CD in the specified drive"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            drive = data.get('drive_path')
            
            ripper = CDRipper('music_library')
            metadata = ripper.get_cd_metadata(drive)
            return JsonResponse(metadata)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid method'}, status=405)

# Helper for consistent path
def get_library_path():
    # Use User's Music Directory for persistence
    # e.g. C:\Users\Username\Music\GhostAudio Library
    home = os.path.expanduser("~")
    path = os.path.join(home, "Music", "GhostAudio Library")
    return path

@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated]) 
def rip_cd(request):
    data = request.data
    drive = data.get('drive_path')
    metadata = data.get('metadata')
    nosave = data.get('nosave', False)
    mongo_user_id = data.get('mongo_user_id') # New required field for bridge

    ripper = CDRipper(get_library_path())
    logger.info(f"Rip Request User: {request.user}, Is Authenticated: {request.user.is_authenticated}")
    try:
        # 1. Perform the rip (Physical/File Operation)
        tracks_paths = ripper.rip_cd(drive, metadata=metadata)
        
        if nosave:
             return Response({
                'status': 'completed', 
                'tracks': tracks_paths,
                'metadata': metadata
            })

        # 2. Bridge to MongoDB (Primary)
        if mongo_user_id and settings.MONGODB_URI:
            try:
                client = MongoClient(settings.MONGODB_URI)
                db = client.get_database() # Uses database from URI
                albums_collection = db['albums']
                
                safe_metadata = metadata or {}
                artist_name = safe_metadata.get('artist', 'Unknown Artist')
                album_title = safe_metadata.get('album', 'Unknown Album')

                # Construct Tracks
                mongo_tracks = []
                for idx, path in enumerate(tracks_paths):
                    track_num = idx + 1
                    track_title = f"Track {track_num}"
                    duration_ms = 0
                    duration_str = "00:00"
                    
                    if metadata and 'tracks' in metadata and idx < len(metadata['tracks']):
                        track_info = metadata['tracks'][idx]
                        track_title = track_info.get('title', track_title)
                        duration_ms = track_info.get('duration_ms', 0)
                        if duration_ms:
                            # Format MM:SS
                            seconds = int(duration_ms) // 1000
                            m, s = divmod(seconds, 60)
                            duration_str = f"{m:02d}:{s:02d}"

                    mongo_tracks.append({
                        'title': track_title,
                        'trackNumber': track_num,
                        'audioFile': str(path),
                        'duration': duration_str 
                    })

                new_album = {
                    'user': ObjectId(mongo_user_id),
                    'title': album_title,
                    'artist': artist_name,
                    'coverArt': '',
                    'tracks': mongo_tracks,
                    'createdAt': datetime.now()
                }
                
                result = albums_collection.insert_one(new_album)
                logger.info(f"Inserted album into MongoDB: {result.inserted_id}")

            except Exception as e:
                logger.error(f"MongoDB Bridge Failed: {e}")
                pass

        # 3. Save to Django SQLite (Legacy/Backup)
        if request.user.is_authenticated:
            safe_metadata = metadata or {}
            
            album = Album.objects.create(
                user=request.user,
                title=safe_metadata.get('album', 'Unknown Album'),
                artist=safe_metadata.get('artist', 'Unknown Artist'),
            )
            
            for idx, path in enumerate(tracks_paths):
                track_num = idx + 1
                track_title = f"Track {track_num}"
                duration_val = None
                if metadata and 'tracks' in metadata and idx < len(metadata['tracks']):
                    track_info = metadata['tracks'][idx]
                    track_title = track_info.get('title', track_title)
                    d_ms = track_info.get('duration_ms', 0)
                    if d_ms:
                        duration_val = timedelta(milliseconds=int(d_ms))
                
                Track.objects.create(
                    album=album,
                    title=track_title,
                    track_number=track_num,
                    audio_file=str(path),
                    duration=duration_val
                )

        return Response({'status': 'completed', 'message': 'Ripped and bridged to MongoDB'})

    except Exception as e:
        logger.error(f"Rip failed: {e}")
        return Response({'status': 'error', 'message': str(e)}, status=500)
