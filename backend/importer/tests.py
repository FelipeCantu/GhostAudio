from django.test import TestCase
from unittest.mock import patch, MagicMock
from importer.services import CDRipper
import os

class CDRipperTests(TestCase):
    def test_init_no_ffmpeg(self):
        """Test that initializing CDRipper without ffmpeg does not crash"""
        # Ensure we don't accidentally find ffmpeg in system
        with patch('shutil.which', return_value=None):
            ripper = CDRipper('tmp_output')
            self.assertFalse(ripper.ffmpeg)
            # Cleanup
            if os.path.exists('tmp_output'):
                os.rmdir('tmp_output')

    def test_init_with_ffmpeg(self):
        """Test that initializing CDRipper with ffmpeg works"""
        with patch('shutil.which', return_value='/usr/bin/ffmpeg'):
            ripper = CDRipper('tmp_output')
            self.assertEqual(ripper.ffmpeg, '/usr/bin/ffmpeg')
            # Cleanup
            if os.path.exists('tmp_output'):
                os.rmdir('tmp_output')
