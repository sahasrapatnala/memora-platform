import os
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from main import app

class ServiceRules(unittest.TestCase):
    def test_requires_private_worker_auth(self):
        with patch.dict(os.environ, {'PROCESSING_API_KEY': 'unit-test-only'}):
            response = TestClient(app).post('/retrieve', json={
                'file_id': '00000000-0000-0000-0000-000000000001',
                'workspace_id': '00000000-0000-0000-0000-000000000002',
                'name': 'Ericsson.mp4', 'source_url': 'https://cloud.example.test/storage/v1/object/sign/original-files/a',
                'size_bytes': 220480662, 'sha256': '0' * 64})
            self.assertEqual(response.status_code, 401)

    def test_multipart_originals_are_not_accepted(self):
        response = TestClient(app).post('/process', files={'file': ('video.mp4', b'abc')})
        self.assertEqual(response.status_code, 422)

    def test_video_retrieval_never_implies_completed_processing(self):
        descriptor = {'file_id': '00000000-0000-0000-0000-000000000001',
                      'workspace_id': '00000000-0000-0000-0000-000000000002',
                      'name': 'Ericsson.mp4',
                      'source_url': 'https://cloud.example.test/storage/v1/object/sign/original-files/a',
                      'size_bytes': 220480662, 'sha256': '0' * 64}
        with patch.dict(os.environ, {'PROCESSING_API_KEY': 'unit-test-only',
                                    'PROCESSING_CLOUD_ORIGIN': 'https://cloud.example.test'}), \
                patch('main.download_original', return_value=iter([{'stage': 'Original verified', 'received_bytes': 220480662}])):
            response = TestClient(app).post('/retrieve', json=descriptor,
                                           headers={'Authorization': 'Bearer unit-test-only'})
        self.assertEqual(response.status_code, 200)
        import json
        events = [json.loads(line) for line in response.text.splitlines()]
        self.assertEqual(events[-1]['status'], 'Blocked')

    def test_attempt_dispatch_returns_202_without_secrets(self):
        descriptor = {'file_id': '00000000-0000-0000-0000-000000000001',
                      'workspace_id': '00000000-0000-0000-0000-000000000002',
                      'job_id': '00000000-0000-0000-0000-000000000003',
                      'dispatch_token': '00000000-0000-0000-0000-000000000004',
                      'worker_id': 'test-worker', 'callback_url': 'https://app.example.test/api/public/processing',
                      'name': 'Ericsson.mp4', 'source_url': 'https://cloud.example.test/storage/v1/object/sign/original-files/a?token=private',
                      'size_bytes': 100, 'sha256': '0' * 64}
        with patch.dict(os.environ, {'PROCESSING_API_KEY': 'unit-test-only',
                                    'PROCESSING_CALLBACK_ORIGIN': 'https://app.example.test'}), \
                patch('main.validate_request', return_value=('.mp4', '/tmp')), \
                patch('main.execute_attempt') as execute:
            response = TestClient(app).post('/process', json=descriptor,
                                           headers={'Authorization': 'Bearer unit-test-only'})
        self.assertEqual(response.status_code, 202)
        self.assertEqual(set(response.json()), {'accepted', 'job_id'})
        self.assertNotIn('dispatch_token', response.text)
        self.assertNotIn('source_url', response.text)
        execute.assert_called_once()

if __name__ == '__main__':
    unittest.main()