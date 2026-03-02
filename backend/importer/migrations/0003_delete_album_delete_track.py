from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('importer', '0002_alter_album_cover_art'),
    ]

    operations = [
        migrations.DeleteModel(
            name='Track',
        ),
        migrations.DeleteModel(
            name='Album',
        ),
    ]
