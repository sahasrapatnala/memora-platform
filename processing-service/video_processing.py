import hashlib
import subprocess
import time
from pathlib import Path


_model = None
MAX_KEYFRAMES = 60


def get_model():
    from faster_whisper import WhisperModel
    global _model
    if _model is None:
        _model = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=4, num_workers=1)
    return _model


def extract_audio(video_path, output_dir, progress=None):
    audio_path = output_dir / "audio.mp3"
    command = ["ffmpeg", "-y", "-i", str(video_path), "-vn", "-ac", "1", "-ar", "16000",
               "-b:a", "64k", "-c:a", "libmp3lame", str(audio_path)]
    process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    started = time.monotonic()
    last_heartbeat = started
    try:
        while process.poll() is None:
            if time.monotonic() - started > 3600:
                process.kill()
                raise RuntimeError("Audio extraction timed out")
            if progress and time.monotonic() - last_heartbeat >= 30:
                progress({"stage": "Extracting audio"})
                last_heartbeat = time.monotonic()
            time.sleep(2)
        if process.returncode != 0:
            raise RuntimeError("Audio extraction failed")
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
    return audio_path


def transcribe_audio(audio_path, progress=None):
    model = get_model()
    segments, info = model.transcribe(str(audio_path), beam_size=3, vad_filter=True,
                                      condition_on_previous_text=False)
    transcript = []
    for segment in segments:
        content = segment.text.strip()
        if content:
            if len(content) > 20000:
                raise RuntimeError("A transcript segment exceeds the bounded manifest limit")
            transcript.append({"start_seconds": round(segment.start, 3),
                               "end_seconds": round(segment.end, 3),
                               "content": content,
                               "content_sha256": hashlib.sha256(content.encode("utf-8")).hexdigest(),
                               "speaker_key": None})
        if progress and len(transcript) % 25 == 0:
            progress({"stage": "Transcribing audio", "segments": len(transcript)})
    if len(transcript) > 20000:
        raise RuntimeError("Transcript exceeds the bounded manifest limit")
    return {"language": info.language, "segments": transcript}


def _save_jpeg(frame, path, width):
    import cv2
    height, original_width = frame.shape[:2]
    if original_width > width:
        frame = cv2.resize(frame, (width, max(1, int(height * width / original_width))))
    if not cv2.imwrite(str(path), frame, [cv2.IMWRITE_JPEG_QUALITY, 75]):
        raise RuntimeError("Could not encode an extracted frame")


def extract_keyframes(video_path, output_dir, progress=None):
    import cv2
    import imagehash
    from PIL import Image
    frame_dir = output_dir / "frames"
    frame_dir.mkdir(parents=True, exist_ok=True)
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError("Could not open video")
    fps = capture.get(cv2.CAP_PROP_FPS)
    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if fps <= 0 or total_frames <= 0:
        capture.release()
        raise RuntimeError("Invalid video metadata")
    duration = total_frames / fps
    # Evenly sample the entire duration rather than stopping after the first ten minutes.
    sample_times = sorted(set(round(duration * i / (MAX_KEYFRAMES - 1), 3)
                              for i in range(MAX_KEYFRAMES))) if duration > 0 else [0]
    frames = []
    hashes = []
    try:
        for timestamp in sample_times:
            capture.set(cv2.CAP_PROP_POS_MSEC, max(0, timestamp * 1000))
            success, frame = capture.read()
            if not success:
                continue
            actual_timestamp = min(duration, max(0, capture.get(cv2.CAP_PROP_POS_MSEC) / 1000))
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            fingerprint = imagehash.phash(Image.fromarray(rgb))
            if any(abs(fingerprint - previous) <= 2 for previous in hashes):
                continue
            hashes.append(fingerprint)
            stem = f"frame_{len(frames):04d}"
            frame_path = frame_dir / f"{stem}.jpg"
            thumbnail_path = frame_dir / f"{stem}_thumb.jpg"
            _save_jpeg(frame, frame_path, 960)
            _save_jpeg(frame, thumbnail_path, 320)
            frames.append({"timestamp_seconds": round(actual_timestamp, 3),
                           "path": str(frame_path), "thumbnail_local_path": str(thumbnail_path)})
            if progress:
                progress({"stage": "Extracting keyframes", "frames": len(frames)})
    finally:
        capture.release()
    if not frames:
        raise RuntimeError("No readable frames were extracted")
    return {"duration_seconds": round(duration, 3), "frames": frames}


def process_video(video_path, output_dir, progress=None):
    video_path = Path(video_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    if progress:
        progress({"stage": "Extracting audio"})
    audio_path = extract_audio(video_path, output_dir, progress)
    try:
        if progress:
            progress({"stage": "Transcribing audio"})
        transcript = transcribe_audio(audio_path, progress)
        if progress:
            progress({"stage": "Extracting keyframes"})
        keyframes = extract_keyframes(video_path, output_dir, progress)
        return {"kind": "video", "format": video_path.suffix.lstrip(".").upper(),
                "language": transcript["language"], "duration_seconds": keyframes["duration_seconds"],
                "speakers": [], "speaker_turns": [], "transcript_segments": transcript["segments"],
                "frames": keyframes["frames"], "pages": [], "slides": [],
                "metadata": {"speaker_attribution": "unavailable",
                             "extraction": "Faster-Whisper and OpenCV"}}
    finally:
        audio_path.unlink(missing_ok=True)
