from django.urls import path
from . import views

urlpatterns = [
    path('drives/', views.list_drives, name='list_drives'),
    path('rip/', views.rip_cd, name='rip_cd'),
]
