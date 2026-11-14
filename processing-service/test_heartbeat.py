import threading
import unittest
from attempt_heartbeat import AttemptHeartbeat


class HeartbeatRules(unittest.TestCase):
    def test_renews_during_silent_extraction_and_never_regresses_progress(self):
        renewed = threading.Event()
        calls = []
        def send(request, stage, progress):
            calls.append((stage, progress))
            if len(calls) >= 4:
                renewed.set()
        with AttemptHeartbeat(None, send, interval=0.01) as heartbeat:
            heartbeat.update("Transcribing audio", 60)
            heartbeat.update("Extracting keyframes", 30)
            self.assertTrue(renewed.wait(1))
        self.assertEqual(calls[-1], ("Extracting keyframes", 60))

    def test_rejected_lease_stops_followup_work(self):
        def rejected(*args):
            raise RuntimeError("expired")
        heartbeat = AttemptHeartbeat(None, rejected)
        with self.assertRaisesRegex(RuntimeError, "expired"):
            heartbeat.update("Transcribing audio", 45)
        with self.assertRaisesRegex(RuntimeError, "renewal rejected"):
            heartbeat.update("Persisting results", 97)