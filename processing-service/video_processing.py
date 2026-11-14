
import subprocess
from pathlib import Path

import cv2
from faster_whisper import WhisperModel

_model = None


def get_model():
    global _model
    if _model is None:
        _model = WhisperModel(
            "small",
            device="cpu",
            compute_type="int8",
            cpu_threads=4,
            num_workers=1,
        )
    return _model


def extract_audio(video_path, output_dir):
    audio_path = output_dir / "audio.mp3"

    command = [
        "ffmpeg", "-y", "-i", str(video_path),
        "-vn", "-ac", "1", "-ar", "16000",
        "-b:a", "64k", "-c:a", "libmp3lame",
        str(audio_path),
    ]

    result = subprocess.run(
        command, capture_output=True, text=True, timeout=3600
    )

    if result.returncode != 0:
        raise RuntimeError("Audio extraction failed")

    return audio_path


def transcribe_audio(audio_path, progress=None):
    model = get_model()

    segments, info = model.transcribe(
        str(audio_path),
        beam_size=3,
        vad_filter=True,
        condition_on_previous_text=False,
    )

    transcript = []

    for segment in segments:
        if segment.text.strip():
            transcript.append({
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "text": segment.text.strip(),
                "speaker": "Unknown",
            })

        if progress and len(transcript) % 25 == 0:
            progress({
                "stage": "Transcribing audio",
                "segments": len(transcript),
            })

    return {
        "language": info.language,
        "segments": transcript,
    }




def extract_keyframes(video_path, output_dir, progress=None):
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
    interval = max(1, round(fps * 10))
    frames = []
    frame_index = 0
    next_sample = 0

    try:
        while frame_index < total_frames and len(frames) < 60:
            success, frame = capture.read()

            if not success:
                break

            if frame_index >= next_sample:
                height, width = frame.shape[:2]

                if width > 960:
                    frame = cv2.resize(
                        frame,
                        (960, int(height * 960 / width)),
                    )

                timestamp = round(frame_index / fps, 2)
                filename = f"frame_{int(timestamp):06d}.jpg"
                frame_path = frame_dir / filename

                saved = cv2.imwrite(
                    str(frame_path),
                    frame,
                    [cv2.IMWRITE_JPEG_QUALITY, 75],
                )

                if saved:
                    frames.append({
                        "timestamp": timestamp,
                        "filename": filename,
                        "path": str(frame_path),
                    })

                next_sample += interval

                if progress and len(frames) % 10 == 0:
                    progress({
                        "stage": "Extracting keyframes",
                        "frames": len(frames),
                    })

            frame_index += 1

    finally:
        capture.release()

    return {
        "duration_seconds": round(duration, 2),
        "frames": frames,
    }



def process_video(video_path, output_dir, progress=None):
    video_path = Path(video_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if progress:
        progress({"stage": "Extracting audio"})

    audio_path = extract_audio(video_path, output_dir)

    try:
        if progress:
            progress({"stage": "Transcribing audio"})

        transcript = transcribe_audio(audio_path, progress)

        if progress:
            progress({"stage": "Extracting keyframes"})

        keyframes = extract_keyframes(video_path, output_dir, progress)

        print(
            f"VIDEO DEBUG: extraction complete; "
            f"transcript={len(transcript['segments'])}, "
            f"frames={len(keyframes['frames'])}",
            flush=True,
        )

        result = {
            "transcript": transcript,
            "keyframes": keyframes,
        }

        print("VIDEO DEBUG: returning result", flush=True)
        return result

    finally:
        audio_path.unlink(missing_ok=True)
        print("VIDEO DEBUG: audio cleanup complete", flush=True)
