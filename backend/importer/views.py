from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
from .services import CDRipper

def list_drives(request):
    ripper = CDRipper('music_library')
    drives = ripper.get_drives()
    return JsonResponse({'drives': drives})

@csrf_exempt
def rip_cd(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        drive = data.get('drive_path')
        
        ripper = CDRipper('music_library')
        try:
            # Note: In a real app this should be a Celery task or async
            tracks = ripper.rip_cd(drive)
            return JsonResponse({'status': 'started', 'drive': drive, 'tracks': tracks})
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid method'}, status=405)
