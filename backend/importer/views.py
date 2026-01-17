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
        # Trigger rip (async usually)
        return JsonResponse({'status': 'started', 'drive': drive})
    return JsonResponse({'error': 'Invalid method'}, status=405)
