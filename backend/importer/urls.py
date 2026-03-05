from django.urls import path
from . import views

urlpatterns = [
    # CD Ripping (Legacy & Authenticated)
    path('system/check/', views.check_system, name='check_system'),
    path('drives/', views.list_drives, name='list_drives'),
    path('metadata/', views.get_cd_metadata, name='get_cd_metadata'),
    path('rip/', views.rip_cd, name='rip_cd'),
    path('rip/stream/', views.rip_cd_stream, name='rip_cd_stream'),
    path('rip/cancel/', views.cancel_rip, name='cancel_rip'),

    # Dashboard API
    path('dashboard/stats/', views.dashboard_stats, name='dashboard_stats'),

    # MongoDB Auth (shared between desktop and web)
    path('mongo/auth/register/', views.mongo_auth_register, name='mongo_auth_register'),
    path('mongo/auth/login/', views.mongo_auth_login, name='mongo_auth_login'),
    path('mongo/auth/me/', views.mongo_auth_me, name='mongo_auth_me'),
    path('mongo/upload-audio/', views.mongo_upload_audio, name='mongo_upload_audio'),

    # MongoDB Direct (Desktop App)
    path('mongo/update-track-urls/', views.mongo_update_track_urls, name='mongo_update_track_urls'),
    path('mongo/import-local/', views.mongo_import_local, name='mongo_import_local'),
    path('mongo/library/', views.mongo_library, name='mongo_library'),
    path('mongo/library/<str:album_id>/', views.mongo_delete_album, name='mongo_delete_album'),
    path('mongo/stats/', views.mongo_stats, name='mongo_stats'),

    # Playlists
    path('mongo/playlists/', views.mongo_playlists, name='mongo_playlists'),
    path('mongo/playlists/<str:playlist_id>/', views.mongo_playlist_detail, name='mongo_playlist_detail'),
    path('mongo/playlists/<str:playlist_id>/items/', views.mongo_playlist_items, name='mongo_playlist_items'),
    path('mongo/playlists/<str:playlist_id>/items/<int:item_index>/', views.mongo_playlist_item_delete, name='mongo_playlist_item_delete'),
    path('mongo/playlists/<str:playlist_id>/refresh/', views.mongo_playlist_refresh, name='mongo_playlist_refresh'),
]
