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
import uuid
from datetime import datetime, timedelta
from bson.objectid import ObjectId
from pymongo import MongoClient
from django.conf import settings
from .services import CDRipper
from .models import Album, Track
from .serializers import AlbumSerializer, UserSerializer

logger = logging.getLogger(__name__)

# Active rip session registry for cancellation support
_active_rips = {}   # session_id -> CDRipper instance
_rips_lock = threading.Lock()

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
                client = MongoClient(
                    settings.MONGODB_URI,
                    serverSelectionTimeoutMS=5000,
                    socketTimeoutMS=10000,
                    connectTimeoutMS=5000,
                )
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

    # Generate a unique session ID for cancellation support
    session_id = str(uuid.uuid4())

    def generate_progress():
        progress_queue = queue.Queue()
        result_holder = {'tracks': None, 'error': None}
        ripper = CDRipper(get_library_path())

        # Register this ripper so it can be cancelled
        with _rips_lock:
            _active_rips[session_id] = ripper

        # Send session ID as first event
        yield f"data: {json.dumps({'type': 'session', 'session_id': session_id})}\n\n"

        def progress_callback(stage, current, total, message, track_number=None, track_percent=None):
            event = {
                'type': 'progress',
                'stage': stage,
                'current': current,
                'total': total,
                'message': message
            }
            if track_number is not None:
                event['track_number'] = track_number
            if track_percent is not None:
                event['track_percent'] = track_percent
            progress_queue.put(event)

        def do_rip():
            try:
                result_holder['tracks'] = ripper.rip_cd(drive, metadata=metadata, progress_callback=progress_callback)
            except Exception as e:
                result_holder['error'] = str(e)
                progress_queue.put({'type': 'error', 'message': str(e)})
            finally:
                progress_queue.put(None)  # Signal completion

        # Start ripping in background thread
        rip_thread = threading.Thread(target=do_rip)
        rip_thread.start()

        try:
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
                    client = MongoClient(
                        settings.MONGODB_URI,
                        serverSelectionTimeoutMS=5000,
                        socketTimeoutMS=10000,
                        connectTimeoutMS=5000,
                    )
                    db = client.get_database()
                    albums_collection = db['albums']

                    safe_metadata = metadata or {}
                    artist_name = safe_metadata.get('artist', 'Unknown Artist')
                    album_title = safe_metadata.get('album', 'Unknown Album')

                    # Build a lookup from track number -> metadata for reliable matching
                    meta_lookup = {}
                    if metadata and 'tracks' in metadata:
                        for t in metadata['tracks']:
                            try:
                                meta_lookup[int(t['track_number'])] = t
                            except (ValueError, KeyError):
                                pass

                    mongo_tracks = []
                    for path in result_holder['tracks']:
                        # Extract track number from filename (e.g. "03 - Title.wav" -> 3)
                        basename = os.path.basename(path)
                        try:
                            track_num = int(basename.split(' - ', 1)[0])
                        except (ValueError, IndexError):
                            track_num = len(mongo_tracks) + 1

                        track_title = f"Track {track_num}"
                        duration_str = "00:00"

                        if track_num in meta_lookup:
                            track_info = meta_lookup[track_num]
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
                    yield f"data: {json.dumps({'type': 'warning', 'message': f'Library save failed: {e}. Files were ripped successfully.'})}\n\n"

            # Final status
            if result_holder['error']:
                yield f"data: {json.dumps({'type': 'error', 'message': result_holder['error']})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'complete', 'tracks': len(result_holder['tracks'] or [])})}\n\n"
        finally:
            # Clean up session registry
            with _rips_lock:
                _active_rips.pop(session_id, None)

    response = StreamingHttpResponse(generate_progress(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    return response


@csrf_exempt
def cancel_rip(request):
    """Cancel an active rip session by session_id."""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    session_id = data.get('session_id')
    if not session_id:
        return JsonResponse({'error': 'session_id required'}, status=400)

    with _rips_lock:
        if session_id == '__all__':
            # Cancel all active rips (used during app shutdown)
            for sid, ripper in list(_active_rips.items()):
                try:
                    ripper.cancel()
                except Exception as e:
                    logger.warning(f"Error cancelling session {sid}: {e}")
            return JsonResponse({'status': 'cancelled', 'sessions': len(_active_rips)})

        ripper = _active_rips.get(session_id)

    if not ripper:
        return JsonResponse({'error': 'Session not found or already finished'}, status=404)

    try:
        ripper.cancel()
        return JsonResponse({'status': 'cancelled', 'session_id': session_id})
    except Exception as e:
        logger.error(f"Error cancelling rip {session_id}: {e}")
        return JsonResponse({'error': str(e)}, status=500)


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
        client = MongoClient(
            settings.MONGODB_URI,
            serverSelectionTimeoutMS=5000,
            socketTimeoutMS=10000,
            connectTimeoutMS=5000,
        )
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
        client = MongoClient(
            settings.MONGODB_URI,
            serverSelectionTimeoutMS=5000,
            socketTimeoutMS=10000,
            connectTimeoutMS=5000,
        )
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
        client = MongoClient(
            settings.MONGODB_URI,
            serverSelectionTimeoutMS=5000,
            socketTimeoutMS=10000,
            connectTimeoutMS=5000,
        )
        db = client.get_database()
        albums_collection = db['albums']

        albums = list(albums_collection.find({'user': ObjectId(user_id)}).sort('createdAt', -1))

        # Convert ObjectId to string for JSON serialization
        for album in albums:
            album['_id'] = str(album['_id'])
            album['user'] = str(album['user'])
            if 'createdAt' in album:
                album['createdAt'] = album['createdAt'].isoformat()
                album['created_at'] = album['createdAt']  # alias for frontend compatibility

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
        return Response({'total_albums': 0, 'total_tracks': 0, 'recent_albums': []})

    try:
        client = MongoClient(settings.MONGODB_URI, serverSelectionTimeoutMS=3000)
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
        logger.warning(f"MongoDB stats unavailable: {e}")
        return Response({'total_albums': 0, 'total_tracks': 0, 'recent_albums': []})
