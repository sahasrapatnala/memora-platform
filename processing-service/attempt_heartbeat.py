"""Renew a fenced lease even while model loading/extraction produces no events."""
import threading


class AttemptHeartbeat:
    def __init__(self, request, send, interval=30):
        self.request = request
        self.send = send
        self.interval = interval
        self.stage = "Downloading original"
        self.progress = 0
        self.error = None
        self.lock = threading.Lock()
        self.stopped = threading.Event()
        self.thread = threading.Thread(target=self._run, daemon=True)

    def __enter__(self):
        self.update(self.stage, 0)
        self.thread.start()
        return self

    def update(self, stage, progress):
        with self.lock:
            if self.error:
                raise RuntimeError("Processing lease renewal rejected") from self.error
            self.stage = stage
            self.progress = max(self.progress, progress)
            try:
                self.send(self.request, self.stage, self.progress)
            except Exception as error:
                self.error = error
                raise

    def _run(self):
        while not self.stopped.wait(self.interval):
            try:
                self.update(self.stage, self.progress)
            except Exception:
                self.stopped.set()

    def __exit__(self, *args):
        self.stopped.set()
        self.thread.join()