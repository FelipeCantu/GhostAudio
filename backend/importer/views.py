from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework import viewsets, permissions, status, generics
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes, authentication_classes
import json
import logging
import os
import queue
import threading
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

@csrf_exempt
def rip_cd(request):
    """Rip CD endpoint - plain Django view (no DRF auth)"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    drive = data.get('drive_path')
    metadata = data.get('metadata')
    nosave = data.get('nosave', False)
    mongo_user_id = data.get('mongo_user_id')  # Used for MongoDB bridge

    logger.info(f"=== RIP REQUEST RECEIVED ===")
    logger.info(f"Drive: {drive}")
    logger.info(f"Metadata: {metadata}")
    logger.info(f"Mongo User ID: {mongo_user_id}")

    ripper = CDRipper(get_library_path())
    try:
        # 1. Perform the rip (Physical/File Operation)
        tracks_paths = ripper.rip_cd(drive, metadata=metadata)
        
        if nosave:
             return JsonResponse({
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
                    'coverArt': safe_metadata.get('cover_art', ''),
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
                cover_art=safe_metadata.get('cover_art'),
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

        return JsonResponse({'status': 'completed', 'message': 'Ripped and bridged to MongoDB'})

    except Exception as e:
        logger.error(f"Rip failed: {e}")
        try:
             import os
             from pathlib import Path
             log_path = Path(os.path.expanduser('~')) / 'ghost_app_debug.log'
             with open(log_path, 'a') as f:
                 f.write(f"\n[Rip Error] {datetime.now()}: {str(e)}\n")
        except:
            pass
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


@csrf_exempt
def rip_cd_stream(request):
    """Streaming rip CD endpoint with real-time progress updates"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    drive = data.get('drive_path')
    metadata = data.get('metadata')
    mongo_user_id = data.get('mongo_user_id')

    def generate_progress():
        progress_queue = queue.Queue()
        result_holder = {'tracks': None, 'error': None}

        def progress_callback(stage, current, total, message):
            progress_queue.put({
                'type': 'progress',
                'stage': stage,
                'current': current,
                'total': total,
                'message': message
            })

        def do_rip():
            try:
                ripper = CDRipper(get_library_path())
                result_holder['tracks'] = ripper.rip_cd(drive, metadata=metadata, progress_callback=progress_callback)
            except Exception as e:
                result_holder['error'] = str(e)
                progress_queue.put({'type': 'error', 'message': str(e)})
            finally:
                progress_queue.put(None)  # Signal completion

        # Start ripping in background thread
        rip_thread = threading.Thread(target=do_rip)
        rip_thread.start()

        # Yield progress updates as they come
        while True:
            try:
                update = progress_queue.get(timeout=120)  # 2 min timeout per update
                if update is None:
                    break
                yield f"data: {json.dumps(update)}\n\n"
            except queue.Empty:
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"

        rip_thread.join()

        # After rip complete, save to MongoDB
        if result_holder['tracks'] and mongo_user_id and settings.MONGODB_URI:
            try:
                client = MongoClient(settings.MONGODB_URI)
                db = client.get_database()
                albums_collection = db['albums']

                safe_metadata = metadata or {}
                artist_name = safe_metadata.get('artist', 'Unknown Artist')
                album_title = safe_metadata.get('album', 'Unknown Album')

                mongo_tracks = []
                for idx, path in enumerate(result_holder['tracks']):
                    track_num = idx + 1
                    track_title = f"Track {track_num}"
                    duration_str = "00:00"

                    if metadata and 'tracks' in metadata and idx < len(metadata['tracks']):
                        track_info = metadata['tracks'][idx]
                        track_title = track_info.get('title', track_title)
                        duration_ms = track_info.get('duration_ms', 0)
                        if duration_ms:
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
                    'coverArt': safe_metadata.get('cover_art', ''),
                    'tracks': mongo_tracks,
                    'createdAt': datetime.now()
                }

                albums_collection.insert_one(new_album)
                yield f"data: {json.dumps({'type': 'saved', 'message': 'Saved to library'})}\n\n"
            except Exception as e:
                logger.error(f"MongoDB save failed: {e}")

        # Final status
        if result_holder['error']:
            yield f"data: {json.dumps({'type': 'error', 'message': result_holder['error']})}\n\n"
        else:
            yield f"data: {json.dumps({'type': 'complete', 'tracks': len(result_holder['tracks'] or [])})}\n\n"

    response = StreamingHttpResponse(generate_progress(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    return response


# --- MongoDB Direct Endpoints (for Desktop App) ---

@api_view(['DELETE'])
@permission_classes([permissions.AllowAny])
def mongo_delete_album(request, album_id):
    """Delete an album from MongoDB"""
    user_id = request.query_params.get('user_id')
    if not user_id:
        return Response({'error': 'user_id required'}, status=400)

    if not settings.MONGODB_URI:
        return Response({'error': 'MongoDB not configured'}, status=500)

    try:
        client = MongoClient(settings.MONGODB_URI)
        db = client.get_database()
        albums_collection = db['albums']

        # Delete only if album belongs to this user
        result = albums_collection.delete_one({
            '_id': ObjectId(album_id),
            'user': ObjectId(user_id)
        })

        if result.deleted_count == 0:
            return Response({'error': 'Album not found or not authorized'}, status=404)

        return Response({'status': 'deleted'})
    except Exception as e:
        logger.error(f"MongoDB delete failed: {e}")
        return Response({'error': str(e)}, status=500)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def mongo_import_local(request):
    """Import local audio files to MongoDB"""
    data = request.data
    user_id = data.get('user_id')
    title = data.get('title', 'Imported Album')
    artist = data.get('artist', 'Unknown Artist')
    tracks = data.get('tracks', [])

    if not user_id:
        return Response({'error': 'user_id required'}, status=400)

    if not settings.MONGODB_URI:
        return Response({'error': 'MongoDB not configured'}, status=500)

    try:
        client = MongoClient(settings.MONGODB_URI)
        db = client.get_database()
        albums_collection = db['albums']

        new_album = {
            'user': ObjectId(user_id),
            'title': title,
            'artist': artist,
            'coverArt': '',
            'tracks': tracks,
            'createdAt': datetime.now()
        }

        result = albums_collection.insert_one(new_album)
        logger.info(f"Imported local album to MongoDB: {result.inserted_id}")

        return Response({
            'status': 'success',
            'album_id': str(result.inserted_id)
        })
    except Exception as e:
        logger.error(f"MongoDB import failed: {e}")
        return Response({'error': str(e)}, status=500)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def mongo_library(request):
    """Fetch library directly from MongoDB for desktop app"""
    user_id = request.query_params.get('user_id')
    if not user_id:
        return Response({'error': 'user_id required'}, status=400)

    if not settings.MONGODB_URI:
        return Response({'error': 'MongoDB not configured'}, status=500)

    try:
        client = MongoClient(settings.MONGODB_URI)
        db = client.get_database()
        albums_collection = db['albums']

        albums = list(albums_collection.find({'user': ObjectId(user_id)}).sort('createdAt', -1))

        # Convert ObjectId to string for JSON serialization
        for album in albums:
            album['_id'] = str(album['_id'])
            album['user'] = str(album['user'])
            if 'createdAt' in album:
                album['createdAt'] = album['createdAt'].isoformat()

        return Response(albums)
    except Exception as e:
        logger.error(f"MongoDB library fetch failed: {e}")
        return Response({'error': str(e)}, status=500)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def mongo_stats(request):
    """Fetch stats directly from MongoDB for desktop app"""
    user_id = request.query_params.get('user_id')
    if not user_id:
        return Response({'error': 'user_id required'}, status=400)

    if not settings.MONGODB_URI:
        return Response({'error': 'MongoDB not configured'}, status=500)

    try:
        client = MongoClient(settings.MONGODB_URI)
        db = client.get_database()
        albums_collection = db['albums']

        # Get albums for this user
        albums = list(albums_collection.find({'user': ObjectId(user_id)}))

        total_albums = len(albums)
        total_tracks = sum(len(a.get('tracks', [])) for a in albums)

        # Recent albums (last 5)
        recent = albums_collection.find({'user': ObjectId(user_id)}).sort('createdAt', -1).limit(5)
        recent_albums = []
        for album in recent:
            recent_albums.append({
                'id': str(album['_id']),
                'title': album.get('title', 'Unknown'),
                'artist': album.get('artist', 'Unknown'),
                'cover_art': album.get('coverArt', ''),
                'track_count': len(album.get('tracks', []))
            })

        return Response({
            'total_albums': total_albums,
            'total_tracks': total_tracks,
            'recent_albums': recent_albums
        })
    except Exception as e:
        logger.error(f"MongoDB stats fetch failed: {e}")
        return Response({'error': str(e)}, status=500)
