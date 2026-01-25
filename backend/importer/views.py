from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework import viewsets, permissions, status, generics
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
import json
import logging
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

# --- CD Import Views ---

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
@permission_classes([permissions.IsAuthenticated])
def rip_cd(request):
    data = request.data
    drive = data.get('drive_path')
    metadata = data.get('metadata')
    
    ripper = CDRipper('music_library')
    try:
        # 1. Perform the rip (Physical/File Operation)
        # Note: We update service to return track paths
        tracks_paths = ripper.rip_cd(drive, metadata=metadata)
        
        # 2. Save to Database
        artist_name = metadata.get('artist', 'Unknown Artist')
        album_title = metadata.get('album', 'Unknown Album')
        
        # Create Album
        album = Album.objects.create(
            user=request.user,
            title=album_title,
            artist=artist_name,
            # cover_art could be handled if we saved it to disk
        )
        
        # Create Tracks
        # Assuming tracks_paths is a list of file paths.
        # We need to map them back to metadata logic or just use order
        for idx, path in enumerate(tracks_paths):
            track_num = idx + 1
            # Try to get title from metadata if available
            track_title = f"Track {track_num}"
            if metadata and 'tracks' in metadata and idx < len(metadata['tracks']):
                track_title = metadata['tracks'][idx].get('title', track_title)
            
            Track.objects.create(
                album=album,
                title=track_title,
                track_number=track_num,
                audio_file=str(path)
            )

        # Return the new album data
        serializer = AlbumSerializer(album)
        return Response({'status': 'completed', 'album': serializer.data})
    except Exception as e:
        logger.error(f"Rip failed: {e}")
        return Response({'status': 'error', 'message': str(e)}, status=500)
