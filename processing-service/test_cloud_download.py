import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock
from cloud_download import MAX_ORIGINAL_BYTES, check_capacity, download_original, validate_source

ORIGIN = 'https://cloud.example.test'
URL = ORIGIN + '/storage/v1/object/sign/original-files/owner/video.mp4?token=test'

class DownloadRules(unittest.TestCase):
    def test_five_gib_limit(self):
        self.assertEqual(MAX_ORIGINAL_BYTES, 5368709120)
        with patch('cloud_download.shutil.disk_usage', return_value=Mock(free=12 * 1024**3)):
            self.assertEqual(check_capacity('/tmp', 5368709120), 11811160064)
            with self.assertRaises(ValueError):
                check_capacity('/tmp', 5368709121)

    def test_disk_admission(self):
        with patch('cloud_download.shutil.disk_usage', return_value=Mock(free=1024**3)):
            with self.assertRaisesRegex(ValueError, 'Insufficient processing disk'):
                check_capacity('/tmp', 220480662)

    def test_private_origin_only(self):
        validate_source(URL, ORIGIN)
        for url in ['http://127.0.0.1/private', 'https://foreign.test/storage/v1/object/sign/original-files/a', ORIGIN + '/storage/v1/object/public/original-files/a']:
            with self.assertRaises(ValueError):
                validate_source(url, ORIGIN)

    def test_streamed_bytes_and_integrity(self):
        response = Mock(status_code=200, headers={'Content-Length': '3'})
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.iter_content.return_value = iter([b'a', b'bc'])
        with tempfile.TemporaryDirectory() as directory, patch('cloud_download.requests.get', return_value=response) as get:
            path = Path(directory) / 'original.mp4'
            events = list(download_original(URL, path, 3, hashlib.sha256(b'abc').hexdigest(), ORIGIN))
            self.assertEqual([e['received_bytes'] for e in events], [1, 3, 3])
            self.assertEqual(path.read_bytes(), b'abc')
            self.assertTrue(get.call_args.kwargs['stream'])
            self.assertFalse(get.call_args.kwargs['allow_redirects'])

    def test_hash_mismatch_never_publishes_original(self):
        response = Mock(status_code=200, headers={})
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.iter_content.return_value = iter([b'abc'])
        with tempfile.TemporaryDirectory() as directory, patch('cloud_download.requests.get', return_value=response):
            path = Path(directory) / 'original.mp4'
            with self.assertRaisesRegex(ValueError, 'SHA-256'):
                list(download_original(URL, path, 3, '0' * 64, ORIGIN))
            self.assertFalse(path.exists())
            self.assertFalse(path.with_suffix('.mp4.partial').exists())

if __name__ == '__main__':
    unittest.main()