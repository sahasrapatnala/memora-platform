"""Run genuine local extraction, never write application/Cloud records."""
import argparse
import hashlib
import json
from pathlib import Path

from document_processing import extract_document
from video_processing import process_video


def file_hash(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def extract_local(source, output):
    source, output = Path(source).resolve(), Path(output).resolve()
    if not source.is_file():
        raise ValueError("Choose an existing local original")
    if source.suffix.lower() not in {".mp4", ".mov", ".pdf", ".pptx"}:
        raise ValueError("Use MP4, MOV, PDF or PPTX")
    # Never overwrite originals or previously collected evidence.
    if output.exists():
        raise ValueError("Output directory already exists; choose a new directory")
    output.mkdir(parents=True)
    progress = lambda event: print(json.dumps({"extraction_progress": event}), flush=True)
    if source.suffix.lower() in {".mp4", ".mov"}:
        manifest = process_video(source, output / "artifacts", progress=progress)
        if not manifest["transcript_segments"]:
            raise ValueError("No speech detected; this file does not satisfy the speech demo acceptance")
        # Check the real JPEGs and retain measured evidence locally.
        for frame in manifest["frames"]:
            for field in ("path", "thumbnail_local_path"):
                artifact = Path(frame[field])
                with artifact.open("rb") as data:
                    if data.read(2) != b"\xff\xd8":
                        raise ValueError("Extracted artifact is not a JPEG")
                frame[field + "_sha256"] = file_hash(artifact)
                frame[field + "_size_bytes"] = artifact.stat().st_size
    else:
        manifest = extract_document(source, progress=progress)
    evidence = {"classification": "actual local extraction; Cloud dispatch/persistence NOT tested",
                "original_name": source.name, "original_size_bytes": source.stat().st_size,
                "original_sha256": file_hash(source), "manifest": manifest}
    (output / "local-evidence.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
    return evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = extract_local(args.source, args.output)
    manifest = result["manifest"]
    print(json.dumps({"classification": result["classification"], "sha256": result["original_sha256"],
                      "segments": len(manifest["transcript_segments"]), "frames": len(manifest["frames"]),
                      "pages": len(manifest["pages"]), "slides": len(manifest["slides"])}))


if __name__ == "__main__":
    main()