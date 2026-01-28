from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework import viewsets, permissions, status, generics
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
import json
import logging
import os
from datetime import datetime
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
        'platform': os.name
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

@api_view(['POST'])
@permission_classes([permissions.AllowAny]) 
def rip_cd(request):
    data = request.data
    drive = data.get('drive_path')
    metadata = data.get('metadata')
    nosave = data.get('nosave', False)
    mongo_user_id = data.get('mongo_user_id') # New required field for bridge

    ripper = CDRipper('music_library')
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
                
                artist_name = metadata.get('artist', 'Unknown Artist')
                album_title = metadata.get('album', 'Unknown Album')
                # Assume cover art is handled separately or we add a placeholder path
                # For now, we focus on the data structure

                # Construct Tracks
                mongo_tracks = []
                for idx, path in enumerate(tracks_paths):
                    track_num = idx + 1
                    track_title = f"Track {track_num}"
                    if metadata and 'tracks' in metadata and idx < len(metadata['tracks']):
                        track_title = metadata['tracks'][idx].get('title', track_title)
                    
                    # Convert absolute path to relative or accessible path?
                    # For local bridge, we might need the absolute path.
                    # Or we serve it via Django static/media.
                    # let's store the absolute path for Electron to read.
                    mongo_tracks.append({
                        'title': track_title,
                        'trackNumber': track_num,
                        'audioFile': str(path),
                        'duration': 0 # Placeholder, would need mutagen to get real duration
                    })

                new_album = {
                    'user': ObjectId(mongo_user_id),
                    'title': album_title,
                    'artist': artist_name,
                    'coverArt': '', # TODO: Implement cover art upload/link
                    'tracks': mongo_tracks,
                    'createdAt': datetime.now()
                }
                
                result = albums_collection.insert_one(new_album)
                logger.info(f"Inserted album into MongoDB: {result.inserted_id}")

            except Exception as e:
                logger.error(f"MongoDB Bridge Failed: {e}")
                # We don't fail the whole request, but we should warn
                return Response({'status': 'completed_with_errors', 'message': f'Ripped but failed to save to MongoDB: {str(e)}', 'tracks': tracks_paths})

        # 3. Save to Django SQLite (Legacy/Backup)
        # We keep this for now so we don't break existing Django Admin views if they are used
        if request.user.is_authenticated:
            artist_name = metadata.get('artist', 'Unknown Artist')
            album_title = metadata.get('album', 'Unknown Album')
            
            album = Album.objects.create(
                user=request.user,
                title=album_title,
                artist=artist_name,
            )
            
            for idx, path in enumerate(tracks_paths):
                track_num = idx + 1
                track_title = f"Track {track_num}"
                if metadata and 'tracks' in metadata and idx < len(metadata['tracks']):
                    track_title = metadata['tracks'][idx].get('title', track_title)
                
                Track.objects.create(
                    album=album,
                    title=track_title,
                    track_number=track_num,
                    audio_file=str(path)
                )

        return Response({'status': 'completed', 'message': 'Ripped and bridged to MongoDB'})

    except Exception as e:
        logger.error(f"Rip failed: {e}")
        return Response({'status': 'error', 'message': str(e)}, status=500)
