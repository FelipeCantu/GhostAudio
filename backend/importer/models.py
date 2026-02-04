from django.db import models
from django.contrib.auth.models import User

class Album(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='albums')
    title = models.CharField(max_length=255)
    artist = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    cover_art = models.URLField(max_length=500, null=True, blank=True)

    def __str__(self):
        return f"{self.title} by {self.artist}"

class Track(models.Model):
    album = models.ForeignKey(Album, on_delete=models.CASCADE, related_name='tracks')
    title = models.CharField(max_length=255)
    track_number = models.IntegerField()
    audio_file = models.CharField(max_length=500, help_text="Path to local audio file")
    duration = models.DurationField(null=True, blank=True)

    class Meta:
        ordering = ['track_number']

    def __str__(self):
        return f"{self.track_number}. {self.title}"
