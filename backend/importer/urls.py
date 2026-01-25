from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from . import views

router = DefaultRouter()
router.register(r'library', views.AlbumViewSet, basename='library')

urlpatterns = [
    # Auth
    path('auth/register/', views.RegisterView.as_view(), name='register'),
    path('auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/me/', views.UserDetailView.as_view(), name='user_detail'),

    # CD Ripping (Legacy & Authenticated)
    path('drives/', views.list_drives, name='list_drives'),
    path('metadata/', views.get_cd_metadata, name='get_cd_metadata'),
    path('rip/', views.rip_cd, name='rip_cd'),

    # Library API
    path('', include(router.urls)),
]
