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
import stripe

logger = logging.getLogger(__name__)

# Active rip session registry for cancellation support
_active_rips = {}   # session_id -> CDRipper instance
_rips_lock = threading.Lock()

_JWT_SECRET = os.environ.get('JWT_SECRET', 'fallback_secret')

# --- Storage Plan Constants ---

PLAN_LIMITS = {
    'free':     5_368_709_120,    # 5 GB
    'personal': 107_374_182_400,  # 100 GB
    'lifetime': 214_748_364_800,  # 200 GB
}
DEFAULT_PLAN = 'free'
DEFAULT_STORAGE_LIMIT = PLAN_LIMITS[DEFAULT_PLAN]


# --- MongoDB Client Helper ---

def _get_mongo_client():
    """Return a pymongo MongoClient using the URI from Django settings."""
    return MongoClient(
        settings.MONGODB_URI,
        serverSelectionTimeoutMS=20000,
        socketTimeoutMS=10000,
        connectTimeoutMS=5000,
    )


# --- Quota Helpers ---

def _get_user_quota(mongo_user_id: str) -> dict:
    """
    Return quota fields for a user document.

    Falls back to default free-tier values if the fields are absent so that
    legacy users are never incorrectly blocked before migration runs.
    """
    db = _get_mongo_client().get_database()
    user = db['users'].find_one(
        {'_id': ObjectId(mongo_user_id)},
        {'plan': 1, 'storage_used_bytes': 1, 'storage_limit_bytes': 1},
    )
    if not user:
        return None
    return {
        'plan': user.get('plan', DEFAULT_PLAN),
        'storage_used_bytes': user.get('storage_used_bytes', 0),
        'storage_limit_bytes': user.get('storage_limit_bytes', DEFAULT_STORAGE_LIMIT),
    }


def _increment_storage(mongo_user_id: str, bytes_added: int) -> None:
    """
    Atomically increment storage_used_bytes for a user by bytes_added.

    Uses $inc so concurrent uploads from the same account don't produce a
    lost-update race condition.
    """
    db = _get_mongo_client().get_database()
    db['users'].update_one(
        {'_id': ObjectId(mongo_user_id)},
        {'$inc': {'storage_used_bytes': bytes_added}},
    )


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
        user_doc = {
            'username': username,
            'password': hashed,
            'createdAt': datetime.now(),
            # Storage quota — new users start on the free tier
            'plan': DEFAULT_PLAN,
            'storage_used_bytes': 0,
            'storage_limit_bytes': DEFAULT_STORAGE_LIMIT,
        }
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
    """
    Upload an audio file to R2 and return its public URL.

    Requires a valid JWT in the Authorization header.  Enforces per-user
    storage quota: returns 403 if the upload would exceed the limit.
    On success the user's storage_used_bytes is atomically incremented.
    """
    # --- Auth: resolve mongo_user_id from JWT ---
    auth = request.META.get('HTTP_AUTHORIZATION', '')
    mongo_user_id = None
    if auth.startswith('Bearer '):
        try:
            payload = pyjwt.decode(auth[7:], _JWT_SECRET, algorithms=['HS256'])
            mongo_user_id = payload.get('id')
        except Exception:
            pass

    # Fall back to the legacy body param so existing desktop callers keep working
    # while the JWT path is being rolled out.
    user_id = mongo_user_id or request.data.get('user_id')

    album_title = request.data.get('album_title', 'Unknown')
    artist = request.data.get('artist', 'Unknown Artist')
    audio_file = request.FILES.get('file')

    if not user_id or not audio_file:
        return Response({'error': 'user_id and file required'}, status=400)
    if not settings.MONGODB_URI:
        return Response({'error': 'MongoDB not configured'}, status=500)

    # --- Measure file size before writing to disk ---
    file_data = audio_file.read()
    file_size = len(file_data)
    audio_file.seek(0)

    # --- Quota check ---
    try:
        quota = _get_user_quota(user_id)
    except Exception as e:
        logger.error(f"mongo_upload_audio quota lookup failed for {user_id}: {e}")
        return Response({'error': 'Could not verify storage quota'}, status=500)

    if quota is None:
        return Response({'error': 'User not found'}, status=404)

    if quota['storage_used_bytes'] + file_size > quota['storage_limit_bytes']:
        return Response(
            {
                'error': 'storage_limit_reached',
                'used': quota['storage_used_bytes'],
                'limit': quota['storage_limit_bytes'],
            },
            status=403,
        )

    # --- Write to temp file and upload ---
    import tempfile
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(audio_file.name)[1]) as tmp:
        tmp.write(file_data)
        tmp_path = tmp.name

    object_key = f"audio/{user_id}/{artist}/{album_title}/{audio_file.name}"
    url = _upload_to_r2(tmp_path, object_key)
    os.unlink(tmp_path)

    # --- Atomically record consumed bytes (only after successful upload) ---
    try:
        _increment_storage(user_id, file_size)
    except Exception as e:
        logger.error(f"mongo_upload_audio storage increment failed for {user_id}: {e}")
        # Upload already succeeded — don't fail the response, just log.

    return Response({'url': url})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def mongo_upload_cover(request):
    """Upload a cover art image to R2 and return the public URL."""
    user_id = request.data.get('user_id')
    album_title = request.data.get('album_title', 'Unknown')
    artist = request.data.get('artist', 'Unknown Artist')
    image_file = request.FILES.get('file')
    if not user_id or not image_file:
        return Response({'error': 'user_id and file required'}, status=400)
    import tempfile
    ext = os.path.splitext(image_file.name)[1] or '.jpg'
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        for chunk in image_file.chunks():
            tmp.write(chunk)
        tmp_path = tmp.name
    object_key = f"covers/{user_id}/{artist}/{album_title}/cover{ext}"
    url = _upload_to_r2(tmp_path, object_key)
    os.unlink(tmp_path)
    return Response({'url': url})


@api_view(['GET'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def mongo_quota(request):
    """
    GET /api/mongo/quota/

    Return the authenticated user's storage quota and current usage.

    Response shape:
        {
            "plan": "free",
            "storage_used_bytes": 1234567,
            "storage_limit_bytes": 5368709120,
            "storage_used_gb": 0.18,
            "storage_limit_gb": 5.0,
            "percent_used": 3.6
        }
    """
    auth = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth.startswith('Bearer '):
        return Response({'error': 'Authentication required'}, status=401)
    try:
        payload = pyjwt.decode(auth[7:], _JWT_SECRET, algorithms=['HS256'])
        mongo_user_id = payload['id']
    except Exception:
        return Response({'error': 'Invalid token'}, status=401)

    if not settings.MONGODB_URI:
        return Response({'error': 'MongoDB not configured'}, status=500)

    try:
        quota = _get_user_quota(mongo_user_id)
    except Exception as e:
        logger.error(f"mongo_quota error for {mongo_user_id}: {e}")
        return Response({'error': 'Could not retrieve quota'}, status=500)

    if quota is None:
        return Response({'error': 'User not found'}, status=404)

    used = quota['storage_used_bytes']
    limit = quota['storage_limit_bytes']
    gb_divisor = 1_073_741_824  # 1 GB in bytes
    percent = round((used / limit) * 100, 2) if limit > 0 else 0.0

    return Response({
        'plan': quota['plan'],
        'storage_used_bytes': used,
        'storage_limit_bytes': limit,
        'storage_used_gb': round(used / gb_divisor, 2),
        'storage_limit_gb': round(limit / gb_divisor, 2),
        'percent_used': percent,
    })


@api_view(['POST'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def mongo_quota_migrate(request):
    """
    POST /api/mongo/quota/migrate/

    Back-fill quota fields on existing user documents that pre-date the quota
    system.  Safe to run multiple times — only touches documents that are
    missing at least one of the three quota fields.

    Returns a count of documents updated.
    """
    if not settings.MONGODB_URI:
        return Response({'error': 'MongoDB not configured'}, status=500)

    try:
        db = _get_mongo_client().get_database()
        result = db['users'].update_many(
            # Match docs missing any of the three fields
            {'$or': [
                {'plan': {'$exists': False}},
                {'storage_used_bytes': {'$exists': False}},
                {'storage_limit_bytes': {'$exists': False}},
            ]},
            {'$set': {
                'plan': DEFAULT_PLAN,
                'storage_used_bytes': 0,
                'storage_limit_bytes': DEFAULT_STORAGE_LIMIT,
            }},
        )
        return Response({
            'migrated': result.modified_count,
            'message': f"Set quota fields on {result.modified_count} user(s).",
        })
    except Exception as e:
        logger.error(f"mongo_quota_migrate error: {e}")
        return Response({'error': 'Migration failed', 'detail': str(e)}, status=500)


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

                    result = albums_collection.insert_one(new_album)
                    with open(_dbg, 'a') as _f:
                        _f.write(f"[{datetime.now()}] MongoDB save SUCCESS. Album: {album_title} by {artist_name}\n")
                    yield f"data: {json.dumps({'type': 'saved', 'message': 'Saved to library', 'album_id': str(result.inserted_id)})}\n\n"
                except Exception as e:
                    logger.error(f"MongoDB save failed: {e}")
                    with open(_dbg, 'a') as _f:
                        _f.write(f"[{datetime.now()}] MongoDB save FAILED: {e}\n")
                    yield f"data: {json.dumps({'type': 'warning', 'message': f'Library save failed: {e}. Files were ripped successfully.'})}\n\n"

            # Final status
            if result_holder['error']:
                yield f"data: {json.dumps({'type': 'error', 'message': result_holder['error']})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'complete', 'tracks': result_holder['tracks'] or []})}\n\n"
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


@api_view(['DELETE'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def mongo_delete_track(request, album_id, track_number):
    """Remove a single track from an album by track number."""
    user_id = request.query_params.get('user_id')
    if not user_id:
        return Response({'error': 'user_id required'}, status=400)
    try:
        client = _get_mongo_client()
        db = client.get_database()
        result = db['albums'].update_one(
            {'_id': ObjectId(album_id), 'user': ObjectId(user_id)},
            {'$pull': {'tracks': {'trackNumber': track_number}}}
        )
        if result.matched_count == 0:
            return Response({'error': 'Album not found or not authorized'}, status=404)
        return Response({'status': 'deleted'})
    except Exception as e:
        logger.error(f"mongo_delete_track failed: {e}")
        return Response({'error': str(e)}, status=500)


@api_view(['PATCH'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def mongo_update_album(request, album_id):
    """Update title, artist, and/or coverArt on a locally imported album."""
    user_id = request.data.get('user_id')
    if not user_id:
        return Response({'error': 'user_id required'}, status=400)

    updates = {}
    if 'title' in request.data:
        updates['title'] = request.data['title']
    if 'artist' in request.data:
        updates['artist'] = request.data['artist']
    if 'cover_art' in request.data:
        updates['coverArt'] = request.data['cover_art']

    if not updates:
        return Response({'error': 'Nothing to update'}, status=400)

    try:
        client = _get_mongo_client()
        db = client.get_database()
        result = db['albums'].update_one(
            {'_id': ObjectId(album_id), 'user': ObjectId(user_id), 'source': 'local_import'},
            {'$set': updates}
        )
        if result.matched_count == 0:
            return Response({'error': 'Album not found or not editable'}, status=404)
        return Response({'status': 'updated'})
    except Exception as e:
        logger.error(f"mongo_update_album failed: {e}")
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
            'coverArt': data.get('cover_art', ''),
            'tracks': tracks,
            'source': 'local_import',
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


# --- Payment Endpoints ---

# Inline pricing keeps setup simple — no Stripe dashboard Price IDs required.
PLAN_PRICES = {
    'personal': 2900,  # $29.00 in cents
    'lifetime': 4900,  # $49.00 in cents
}

PLAN_DISPLAY_NAMES = {
    'personal': 'DiZC Personal (100 GB)',
    'lifetime': 'DiZC Lifetime (200 GB)',
}


def _resolve_jwt(request):
    """
    Extract and decode the Bearer JWT from the Authorization header.

    Returns (mongo_user_id: str, None) on success or
    (None, JsonResponse) when auth fails, so callers can do:
        user_id, err = _resolve_jwt(request)
        if err: return err
    """
    auth = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth.startswith('Bearer '):
        return None, JsonResponse({'error': 'Authentication required'}, status=401)
    try:
        payload = pyjwt.decode(auth[7:], _JWT_SECRET, algorithms=['HS256'])
        return payload['id'], None
    except Exception:
        return None, JsonResponse({'error': 'Invalid token'}, status=401)


@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def create_checkout_session(request):
    """
    POST /api/mongo/payments/create-checkout/

    Create a Stripe Checkout Session for a one-time plan upgrade.

    Request body:
        { "plan": "personal" | "lifetime" }

    Response:
        { "checkout_url": "https://checkout.stripe.com/..." }

    Requires a valid JWT in the Authorization header.
    """
    mongo_user_id, err = _resolve_jwt(request)
    if err:
        return err

    if not settings.STRIPE_SECRET_KEY:
        return JsonResponse({'error': 'Payments not configured'}, status=503)

    plan = (request.data.get('plan') or '').strip().lower()
    if plan not in PLAN_PRICES:
        return JsonResponse(
            {'error': f"Invalid plan. Choose one of: {', '.join(PLAN_PRICES)}"},
            status=400,
        )

    # Guard: don't charge users who already hold this plan or better
    try:
        quota = _get_user_quota(mongo_user_id)
    except Exception as e:
        logger.error(f"create_checkout_session quota check error for {mongo_user_id}: {e}")
        return JsonResponse({'error': 'Could not verify current plan'}, status=500)

    if quota and quota.get('plan') == plan:
        return JsonResponse({'error': f"You are already on the {plan} plan"}, status=409)

    stripe.api_key = settings.STRIPE_SECRET_KEY
    frontend_url = settings.FRONTEND_URL.rstrip('/')

    try:
        session = stripe.checkout.Session.create(
            mode='payment',
            line_items=[{
                'price_data': {
                    'currency': 'usd',
                    'product_data': {'name': PLAN_DISPLAY_NAMES[plan]},
                    'unit_amount': PLAN_PRICES[plan],
                },
                'quantity': 1,
            }],
            metadata={
                'mongo_user_id': mongo_user_id,
                'plan': plan,
            },
            # After payment, land on /settings?upgrade=success (or cancelled)
            success_url=f"{frontend_url}/settings?upgrade=success&plan={plan}",
            cancel_url=f"{frontend_url}/settings?upgrade=cancelled",
        )
    except stripe.error.StripeError as e:
        logger.error(f"Stripe session creation failed for {mongo_user_id}: {e}")
        return JsonResponse({'error': 'Could not create checkout session'}, status=502)

    logger.info(f"Stripe Checkout Session created: {session.id} for user {mongo_user_id} plan={plan}")
    return JsonResponse({'checkout_url': session.url})


@csrf_exempt
def stripe_webhook(request):
    """
    POST /api/mongo/payments/webhook/

    Stripe webhook handler — no JWT auth; signature verification via
    STRIPE_WEBHOOK_SECRET replaces authentication here.

    Handles: checkout.session.completed
      - Upgrades the user's plan and storage_limit_bytes in MongoDB.
    """
    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE', '')

    if not settings.STRIPE_WEBHOOK_SECRET:
        logger.warning("stripe_webhook called but STRIPE_WEBHOOK_SECRET is not set")
        return JsonResponse({'error': 'Webhook secret not configured'}, status=503)

    stripe.api_key = settings.STRIPE_SECRET_KEY

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        # Invalid JSON payload
        return JsonResponse({'error': 'Invalid payload'}, status=400)
    except stripe.error.SignatureVerificationError:
        # Forged or tampered signature
        logger.warning("stripe_webhook: signature verification failed")
        return JsonResponse({'error': 'Invalid signature'}, status=400)

    if event['type'] == 'checkout.session.completed':
        _handle_checkout_completed(event['data']['object'])

    # Always return 200 so Stripe doesn't retry for unhandled event types
    return JsonResponse({'received': True})


def _handle_checkout_completed(session):
    """
    Upgrade the user's MongoDB document after a successful Stripe payment.

    Called synchronously from stripe_webhook — Stripe retries with exponential
    back-off if we return a non-2xx status, so failures here are safe to surface
    as errors at the webhook level.
    """
    mongo_user_id = session.get('metadata', {}).get('mongo_user_id')
    plan = session.get('metadata', {}).get('plan')

    if not mongo_user_id or not plan:
        logger.error(
            f"stripe checkout.session.completed missing metadata: session_id={session.get('id')}"
        )
        return

    new_limit = PLAN_LIMITS.get(plan)
    if not new_limit:
        logger.error(f"stripe _handle_checkout_completed: unknown plan '{plan}'")
        return

    if not settings.MONGODB_URI:
        logger.error("stripe _handle_checkout_completed: MongoDB not configured")
        return

    try:
        db = _get_mongo_client().get_database()
        result = db['users'].update_one(
            {'_id': ObjectId(mongo_user_id)},
            {
                '$set': {
                    'plan': plan,
                    'storage_limit_bytes': new_limit,
                    'upgraded_at': datetime.utcnow(),
                }
            },
        )
        if result.matched_count == 0:
            logger.error(
                f"stripe _handle_checkout_completed: user not found mongo_user_id={mongo_user_id}"
            )
            return
        logger.info(
            f"User {mongo_user_id} upgraded to plan='{plan}' "
            f"storage_limit_bytes={new_limit} via Stripe session {session.get('id')}"
        )
    except Exception as e:
        logger.error(
            f"stripe _handle_checkout_completed DB error for {mongo_user_id}: {e}"
        )


@api_view(['GET'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def payment_status(request):
    """
    GET /api/mongo/payments/status/

    Return the authenticated user's current plan and upgrade timestamp.

    Response:
        {
            "plan": "free" | "personal" | "lifetime",
            "upgraded_at": "<ISO-8601 string>" | null
        }

    Requires a valid JWT in the Authorization header.
    """
    mongo_user_id, err = _resolve_jwt(request)
    if err:
        return err

    if not settings.MONGODB_URI:
        return Response({'error': 'MongoDB not configured'}, status=500)

    try:
        db = _get_mongo_client().get_database()
        user = db['users'].find_one(
            {'_id': ObjectId(mongo_user_id)},
            {'plan': 1, 'upgraded_at': 1},
        )
    except Exception as e:
        logger.error(f"payment_status DB error for {mongo_user_id}: {e}")
        return Response({'error': 'Could not retrieve payment status'}, status=500)

    if not user:
        return Response({'error': 'User not found'}, status=404)

    upgraded_at = user.get('upgraded_at')
    return Response({
        'plan': user.get('plan', DEFAULT_PLAN),
        'upgraded_at': upgraded_at.isoformat() if upgraded_at else None,
    })


# --- Playlist Endpoints ---


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


@api_view(['POST'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def mongo_update_track_urls(request):
    """
    Patch audioFile URLs on a saved album's tracks (called by Electron after R2 upload).

    Expects JSON body:
      {
        "album_id":     "<MongoDB ObjectId string>",
        "mongo_user_id": "<MongoDB user ObjectId string>",
        "tracks":       [{"track_number": 1, "audio_file": "https://..."}, ...]
      }

    Ownership is verified: the album's `user` field must match `mongo_user_id`.
    Only tracks whose URLs start with 'http' are accepted to prevent re-introducing
    local file paths.
    """
    from pathlib import Path as _Path
    _log = _Path(os.path.expanduser('~')) / 'ghost_app_debug.log'

    album_id = request.data.get('album_id')
    mongo_user_id = request.data.get('mongo_user_id')
    tracks = request.data.get('tracks', [])  # [{track_number, audio_file}, ...]

    with open(_log, 'a') as _f:
        _f.write(f"[{datetime.now()}] update-track-urls called: album_id={album_id}, user={mongo_user_id}, track_count={len(tracks)}\n")

    if not album_id or not tracks:
        return Response({'error': 'album_id and tracks required'}, status=400)
    if not mongo_user_id:
        return Response({'error': 'mongo_user_id required'}, status=400)

    try:
        client = _get_mongo_client()
        db = client.get_database()
        albums_col = db['albums']
        album = albums_col.find_one({'_id': ObjectId(album_id)})
        if not album:
            with open(_log, 'a') as _f:
                _f.write(f"[{datetime.now()}] update-track-urls: album {album_id} NOT FOUND\n")
            return Response({'error': 'Album not found'}, status=404)

        # Verify that this album belongs to the requesting user.
        if str(album.get('user', '')) != mongo_user_id:
            with open(_log, 'a') as _f:
                _f.write(f"[{datetime.now()}] update-track-urls: ownership mismatch for album {album_id}\n")
            return Response({'error': 'Not authorized'}, status=403)

        # Build a map of track_number -> R2 URL, ignoring any non-HTTP values
        # to prevent accidentally overwriting good URLs with local paths.
        track_map = {}
        for t in tracks:
            url = t.get('audio_file', '')
            if url.startswith('http'):
                track_map[int(t['track_number'])] = url

        if not track_map:
            with open(_log, 'a') as _f:
                _f.write(f"[{datetime.now()}] update-track-urls: no valid HTTP URLs provided, skipping patch\n")
            return Response({'ok': True, 'patched': 0})

        updated_tracks = []
        for t in album.get('tracks', []):
            num = t.get('trackNumber', 0)
            updated_tracks.append({**t, 'audioFile': track_map.get(num, t.get('audioFile', ''))})

        albums_col.update_one({'_id': ObjectId(album_id)}, {'$set': {'tracks': updated_tracks}})
        with open(_log, 'a') as _f:
            _f.write(f"[{datetime.now()}] update-track-urls SUCCESS: {len(updated_tracks)} tracks patched for album {album_id}\n")
        return Response({'ok': True, 'patched': len(track_map)})
    except Exception as e:
        logger.error(f"mongo_update_track_urls error: {e}")
        with open(_log, 'a') as _f:
            _f.write(f"[{datetime.now()}] update-track-urls ERROR: {e}\n")
        return Response({'error': str(e)}, status=500)
