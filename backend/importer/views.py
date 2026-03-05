from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework import permissions, status, generics
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes, authentication_classes
import json
import logging
import os
import queue
import threading
import uuid
from datetime import datetime
from bson.objectid import ObjectId
from pymongo import MongoClient
from django.conf import settings
from .services import CDRipper
from .serializers import UserSerializer
import boto3
from botocore.config import Config as BotoConfig
import jwt as pyjwt
import bcrypt as _bcrypt

logger = logging.getLogger(__name__)

# Active rip session registry for cancellation support
_active_rips = {}   # session_id -> CDRipper instance
_rips_lock = threading.Lock()

_JWT_SECRET = os.environ.get('JWT_SECRET', 'fallback_secret')


# --- R2 Helpers ---

def _get_r2_client():
    import sys
    # PyInstaller frozen binaries have TLS handshake failures with Cloudflare due to
    # Python 3.14 / OpenSSL cipher incompatibilities. verify=False keeps HTTPS
    # encryption active but skips cert validation — acceptable for a desktop app.
    verify = not getattr(sys, 'frozen', False)
    return boto3.client(
        's3',
        endpoint_url=f'https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        config=BotoConfig(
            signature_version='s3v4',
            connect_timeout=10,
            read_timeout=60,
            retries={'max_attempts': 2},
        ),
        region_name='auto',
        verify=verify,
    )


def _upload_to_r2(local_path: str, object_key: str) -> str:
    """Upload file to R2, return public URL. Returns local_path unchanged if R2 not configured."""
    if not settings.R2_ACCOUNT_ID:
        return local_path
    try:
        ext = os.path.splitext(local_path)[1].lower().lstrip('.')
        mime = {'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'flac': 'audio/flac',
                'm4a': 'audio/mp4', 'aac': 'audio/aac', 'ogg': 'audio/ogg'}.get(ext, 'application/octet-stream')
        _get_r2_client().upload_file(local_path, settings.R2_BUCKET_NAME, object_key,
                                     ExtraArgs={'ContentType': mime})
        return f"{settings.R2_PUBLIC_URL}/{object_key}"
    except Exception as e:
        logger.warning(f"R2 upload failed for {local_path}: {e}")
        from pathlib import Path as _P
        _dbg = _P(os.path.expanduser('~')) / 'ghost_app_debug.log'
        with open(_dbg, 'a') as _f:
            _f.write(f"[R2 ERROR] {type(e).__name__}: {e} | key={os.path.basename(local_path)} | bucket={settings.R2_BUCKET_NAME} | account_id_len={len(settings.R2_ACCOUNT_ID)}\n")
        return local_path  # graceful fallback


# --- MongoDB Auth Views ---

@api_view(['POST'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def mongo_auth_register(request):
    username = request.data.get('username', '').strip()
    password = request.data.get('password', '')
    email = request.data.get('email') or None
    if not username or not password:
        return Response({'error': 'username and password required'}, status=400)
    if not settings.MONGODB_URI:
        return Response({'error': 'MongoDB not configured'}, status=500)
    try:
        db = _get_mongo_client().get_database()
        if db['users'].find_one({'username': username}):
            return Response({'error': 'User already exists'}, status=400)
        hashed = _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()
        user_doc = {'username': username, 'password': hashed, 'createdAt': datetime.now()}
        if email:
            user_doc['email'] = email
        db['users'].insert_one(user_doc)
        return Response({'success': True, 'username': username}, status=201)
    except Exception as e:
        logger.error(f"mongo_auth_register error: {e}")
        return Response({'error': str(e)}, status=500)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def mongo_auth_login(request):
    username = request.data.get('username', '').strip()
    password = request.data.get('password', '')
    if not settings.MONGODB_URI:
        return Response({'error': 'MongoDB not configured'}, status=500)
    try:
        db = _get_mongo_client().get_database()
        user = db['users'].find_one({'username': username})
        if not user or not _bcrypt.checkpw(password.encode(), user['password'].encode()):
            return Response({'error': 'Invalid credentials'}, status=401)
        token = pyjwt.encode({'id': str(user['_id']), 'username': username}, _JWT_SECRET, algorithm='HS256')
        return Response({'access': token, 'user': {'id': str(user['_id']), 'username': username}})
    except Exception as e:
        logger.error(f"mongo_auth_login error: {e}")
        return Response({'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def mongo_auth_me(request):
    auth = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth.startswith('Bearer '):
        logger.error(f"auth.me: no Bearer token. auth header='{auth[:30]}'")
        return Response({'error': 'No token'}, status=401)
    try:
        payload = pyjwt.decode(auth[7:], _JWT_SECRET, algorithms=['HS256'])
        return Response({'id': payload['id'], 'username': payload['username']})
    except Exception as e:
        logger.error(f"auth.me decode failed: {type(e).__name__}: {e} | key_len={len(_JWT_SECRET)} | token_prefix={auth[7:20]}")
        return Response({'error': 'Invalid token'}, status=401)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def mongo_upload_audio(request):
    user_id = request.data.get('user_id')
    album_title = request.data.get('album_title', 'Unknown')
    artist = request.data.get('artist', 'Unknown Artist')
    audio_file = request.FILES.get('file')
    if not user_id or not audio_file:
        return Response({'error': 'user_id and file required'}, status=400)
    import tempfile
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(audio_file.name)[1]) as tmp:
        for chunk in audio_file.chunks():
            tmp.write(chunk)
        tmp_path = tmp.name
    object_key = f"audio/{user_id}/{artist}/{album_title}/{audio_file.name}"
    url = _upload_to_r2(tmp_path, object_key)
    os.unlink(tmp_path)
    return Response({'url': url})


# --- Auth Views ---

class RegisterView(generics.CreateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.AllowAny]

class UserDetailView(generics.RetrieveAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

@api_view(['GET'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def dashboard_stats(request):
    """
    Get statistics for the user's library from MongoDB.
    Accepts user_id as a query param (MongoDB ObjectId string).
    """
    user_id = request.query_params.get('user_id')
    if not user_id:
        return Response({'error': 'user_id required'}, status=400)

    if not settings.MONGODB_URI:
        return Response({'total_albums': 0, 'total_tracks': 0, 'recent_albums': []})

    try:
        client = MongoClient(settings.MONGODB_URI, serverSelectionTimeoutMS=20000)
        db = client.get_database()
        albums_collection = db['albums']

        albums = list(albums_collection.find({'user': ObjectId(user_id)}))

        total_albums = len(albums)
        total_tracks = sum(len(a.get('tracks', [])) for a in albums)

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
        logger.warning(f"MongoDB dashboard_stats unavailable: {e}")
        return Response({'total_albums': 0, 'total_tracks': 0, 'recent_albums': []})

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
                    serverSelectionTimeoutMS=20000,
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

                    object_key = f"audio/{mongo_user_id}/{artist_name}/{album_title}/{os.path.basename(str(path))}"
                    audio_url = _upload_to_r2(str(path), object_key)
                    mongo_tracks.append({
                        'title': track_title,
                        'trackNumber': track_num,
                        'audioFile': audio_url,
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

        return JsonResponse({'status': 'completed', 'message': 'Ripped and saved to MongoDB'})

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
    from pathlib import Path as _Path
    _dbg = _Path(os.path.expanduser('~')) / 'ghost_app_debug.log'
    with open(_dbg, 'a') as _f:
        _f.write(f"\n[{datetime.now()}] rip_cd_stream called: method={request.method}\n")

    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError as e:
        with open(_dbg, 'a') as _f:
            _f.write(f"[{datetime.now()}] rip_cd_stream JSON parse error: {e}\n")
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    drive = data.get('drive_path')
    metadata = data.get('metadata')
    mongo_user_id = data.get('mongo_user_id')
    with open(_dbg, 'a') as _f:
        _f.write(f"[{datetime.now()}] rip_cd_stream parsed: drive={drive}, user={mongo_user_id}, meta_keys={list(metadata.keys()) if metadata else None}\n")

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
            with open(_dbg, 'a') as _f:
                _f.write(f"[{datetime.now()}] Rip finished. tracks={len(result_holder['tracks'] or [])}, error={result_holder['error']}, user={mongo_user_id}, has_mongo_uri={bool(settings.MONGODB_URI)}\n")
            if result_holder['tracks'] and mongo_user_id and settings.MONGODB_URI:
                try:
                    client = MongoClient(
                        settings.MONGODB_URI,
                        serverSelectionTimeoutMS=20000,
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

                        object_key = f"audio/{mongo_user_id}/{artist_name}/{album_title}/{os.path.basename(str(path))}"
                        with open(_dbg, 'a') as _f:
                            _f.write(f"[{datetime.now()}] Uploading track {track_num} to R2: {os.path.basename(str(path))}\n")
                        audio_url = _upload_to_r2(str(path), object_key)
                        with open(_dbg, 'a') as _f:
                            _f.write(f"[{datetime.now()}] Track {track_num} upload done: {audio_url[:60]}\n")
                        mongo_tracks.append({
                            'title': track_title,
                            'trackNumber': track_num,
                            'audioFile': audio_url,
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
                    with open(_dbg, 'a') as _f:
                        _f.write(f"[{datetime.now()}] MongoDB save SUCCESS. Album: {album_title} by {artist_name}\n")
                    yield f"data: {json.dumps({'type': 'saved', 'message': 'Saved to library'})}\n\n"
                except Exception as e:
                    logger.error(f"MongoDB save failed: {e}")
                    with open(_dbg, 'a') as _f:
                        _f.write(f"[{datetime.now()}] MongoDB save FAILED: {e}\n")
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
@authentication_classes([])
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
            serverSelectionTimeoutMS=20000,
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
@authentication_classes([])
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
            serverSelectionTimeoutMS=20000,
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
@authentication_classes([])
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
            serverSelectionTimeoutMS=20000,
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
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def mongo_stats(request):
    """Fetch stats directly from MongoDB for desktop app"""
    user_id = request.query_params.get('user_id')
    if not user_id:
        return Response({'error': 'user_id required'}, status=400)

    if not settings.MONGODB_URI:
        return Response({'total_albums': 0, 'total_tracks': 0, 'recent_albums': []})

    try:
        client = MongoClient(settings.MONGODB_URI, serverSelectionTimeoutMS=20000)
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


# --- Playlist Endpoints ---

def _get_mongo_client():
    return MongoClient(
        settings.MONGODB_URI,
        serverSelectionTimeoutMS=20000,
        socketTimeoutMS=10000,
        connectTimeoutMS=5000,
    )


def _serialize_playlist(p, full=False):
    """Convert a MongoDB playlist document to a JSON-serializable dict."""
    items = p.get('items', [])
    result = {
        'id': str(p['_id']),
        'name': p.get('name', ''),
        'description': p.get('description', ''),
        'is_smart': p.get('isSmart', False),
        'smart_rule': p.get('smartRule'),
        'item_count': len(items),
        'cover_arts': list({i.get('coverArt', '') for i in items if i.get('coverArt')})[:4],
        'created_at': p['createdAt'].isoformat() if isinstance(p.get('createdAt'), datetime) else str(p.get('createdAt', '')),
        'updated_at': p['updatedAt'].isoformat() if isinstance(p.get('updatedAt'), datetime) else str(p.get('updatedAt', '')),
    }
    if full:
        result['items'] = items
    return result


def _resolve_smart_rule(user_id, rule, albums_col):
    """Build items list from a smart rule."""
    import random as _random
    rule_type = rule.get('type')
    value = rule.get('value', '')

    def album_to_items(album):
        tracks = []
        for t in album.get('tracks', []):
            tracks.append({
                'albumId': str(album['_id']),
                'trackNumber': t.get('trackNumber', 0),
                'title': t.get('title', ''),
                'artist': album.get('artist', ''),
                'albumTitle': album.get('title', ''),
                'audioFile': t.get('audioFile', ''),
                'duration': t.get('duration', ''),
                'coverArt': album.get('coverArt', ''),
            })
        return tracks

    if rule_type == 'by_artist':
        albums = list(albums_col.find({
            'user': ObjectId(user_id),
            'artist': {'$regex': value, '$options': 'i'}
        }).sort('createdAt', 1))
        items = []
        for a in albums:
            items.extend(album_to_items(a))
        return items

    elif rule_type == 'recently_added':
        albums = list(albums_col.find({'user': ObjectId(user_id)}).sort('createdAt', -1).limit(10))
        items = []
        for a in albums:
            items.extend(album_to_items(a))
        return items

    elif rule_type == 'random':
        albums = list(albums_col.find({'user': ObjectId(user_id)}))
        items = []
        for a in albums:
            items.extend(album_to_items(a))
        _random.shuffle(items)
        return items[:50]

    return []


@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def mongo_playlists(request):
    """List all playlists for a user (GET) or create a new one (POST)."""
    user_id = request.query_params.get('user_id') or (request.data.get('user_id') if request.method == 'POST' else None)
    if not user_id:
        return Response({'error': 'user_id required'}, status=400)
    if not settings.MONGODB_URI:
        return Response({'error': 'MongoDB not configured'}, status=500)

    try:
        client = _get_mongo_client()
        db = client.get_database()
        playlists_col = db['playlists']
        albums_col = db['albums']

        if request.method == 'GET':
            docs = list(playlists_col.find({'user': ObjectId(user_id)}).sort('createdAt', -1))
            return Response([_serialize_playlist(p) for p in docs])

        # POST — create playlist
        data = request.data
        name = data.get('name', '').strip()
        if not name:
            return Response({'error': 'name required'}, status=400)

        is_smart = bool(data.get('is_smart', False))
        smart_rule = data.get('smart_rule') if is_smart else None
        now = datetime.now()

        items = []
        if is_smart and smart_rule:
            items = _resolve_smart_rule(user_id, smart_rule, albums_col)

        doc = {
            'user': ObjectId(user_id),
            'name': name,
            'description': data.get('description', ''),
            'isSmart': is_smart,
            'smartRule': smart_rule,
            'items': items,
            'createdAt': now,
            'updatedAt': now,
        }
        result = playlists_col.insert_one(doc)
        doc['_id'] = result.inserted_id
        return Response(_serialize_playlist(doc, full=True), status=201)
    except Exception as e:
        logger.error(f"mongo_playlists error: {e}")
        return Response({'error': str(e)}, status=500)


@api_view(['GET', 'PATCH', 'DELETE'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def mongo_playlist_detail(request, playlist_id):
    """Get, update, or delete a single playlist."""
    user_id = request.query_params.get('user_id') or request.data.get('user_id')
    if not user_id:
        return Response({'error': 'user_id required'}, status=400)
    if not settings.MONGODB_URI:
        return Response({'error': 'MongoDB not configured'}, status=500)

    try:
        client = _get_mongo_client()
        db = client.get_database()
        playlists_col = db['playlists']

        playlist = playlists_col.find_one({'_id': ObjectId(playlist_id)})
        if not playlist:
            return Response({'error': 'Playlist not found'}, status=404)
        if str(playlist['user']) != user_id:
            return Response({'error': 'Not authorized'}, status=403)

        if request.method == 'GET':
            return Response(_serialize_playlist(playlist, full=True))

        if request.method == 'DELETE':
            playlists_col.delete_one({'_id': ObjectId(playlist_id)})
            return Response({'status': 'deleted'})

        # PATCH — update fields
        data = request.data
        updates = {'updatedAt': datetime.now()}
        if 'name' in data:
            updates['name'] = data['name']
        if 'description' in data:
            updates['description'] = data['description']
        if 'items' in data:
            updates['items'] = data['items']
        playlists_col.update_one({'_id': ObjectId(playlist_id)}, {'$set': updates})
        updated = playlists_col.find_one({'_id': ObjectId(playlist_id)})
        return Response(_serialize_playlist(updated, full=True))
    except Exception as e:
        logger.error(f"mongo_playlist_detail error: {e}")
        return Response({'error': str(e)}, status=500)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def mongo_playlist_items(request, playlist_id):
    """Append items to a playlist."""
    user_id = request.data.get('user_id')
    if not user_id:
        return Response({'error': 'user_id required'}, status=400)
    if not settings.MONGODB_URI:
        return Response({'error': 'MongoDB not configured'}, status=500)

    try:
        client = _get_mongo_client()
        db = client.get_database()
        playlists_col = db['playlists']

        playlist = playlists_col.find_one({'_id': ObjectId(playlist_id)})
        if not playlist:
            return Response({'error': 'Playlist not found'}, status=404)
        if str(playlist['user']) != user_id:
            return Response({'error': 'Not authorized'}, status=403)

        new_items = request.data.get('items', [])
        playlists_col.update_one(
            {'_id': ObjectId(playlist_id)},
            {
                '$push': {'items': {'$each': new_items}},
                '$set': {'updatedAt': datetime.now()},
            }
        )
        updated = playlists_col.find_one({'_id': ObjectId(playlist_id)})
        return Response(_serialize_playlist(updated, full=True))
    except Exception as e:
        logger.error(f"mongo_playlist_items error: {e}")
        return Response({'error': str(e)}, status=500)


@api_view(['DELETE'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def mongo_playlist_item_delete(request, playlist_id, item_index):
    """Remove a single item from a playlist by index."""
    user_id = request.query_params.get('user_id')
    if not user_id:
        return Response({'error': 'user_id required'}, status=400)
    if not settings.MONGODB_URI:
        return Response({'error': 'MongoDB not configured'}, status=500)

    try:
        client = _get_mongo_client()
        db = client.get_database()
        playlists_col = db['playlists']

        playlist = playlists_col.find_one({'_id': ObjectId(playlist_id)})
        if not playlist:
            return Response({'error': 'Playlist not found'}, status=404)
        if str(playlist['user']) != user_id:
            return Response({'error': 'Not authorized'}, status=403)

        items = playlist.get('items', [])
        if item_index < 0 or item_index >= len(items):
            return Response({'error': 'Index out of range'}, status=400)

        items.pop(item_index)
        playlists_col.update_one(
            {'_id': ObjectId(playlist_id)},
            {'$set': {'items': items, 'updatedAt': datetime.now()}}
        )
        updated = playlists_col.find_one({'_id': ObjectId(playlist_id)})
        return Response(_serialize_playlist(updated, full=True))
    except Exception as e:
        logger.error(f"mongo_playlist_item_delete error: {e}")
        return Response({'error': str(e)}, status=500)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def mongo_playlist_refresh(request, playlist_id):
    """Re-run a smart playlist's rule and replace items."""
    user_id = request.data.get('user_id')
    if not user_id:
        return Response({'error': 'user_id required'}, status=400)
    if not settings.MONGODB_URI:
        return Response({'error': 'MongoDB not configured'}, status=500)

    try:
        client = _get_mongo_client()
        db = client.get_database()
        playlists_col = db['playlists']
        albums_col = db['albums']

        playlist = playlists_col.find_one({'_id': ObjectId(playlist_id)})
        if not playlist:
            return Response({'error': 'Playlist not found'}, status=404)
        if str(playlist['user']) != user_id:
            return Response({'error': 'Not authorized'}, status=403)
        if not playlist.get('isSmart') or not playlist.get('smartRule'):
            return Response({'error': 'Not a smart playlist'}, status=400)

        items = _resolve_smart_rule(user_id, playlist['smartRule'], albums_col)
        playlists_col.update_one(
            {'_id': ObjectId(playlist_id)},
            {'$set': {'items': items, 'updatedAt': datetime.now()}}
        )
        updated = playlists_col.find_one({'_id': ObjectId(playlist_id)})
        return Response(_serialize_playlist(updated, full=True))
    except Exception as e:
        logger.error(f"mongo_playlist_refresh error: {e}")
        return Response({'error': str(e)}, status=500)
