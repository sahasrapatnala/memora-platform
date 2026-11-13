"""Bounded-memory retrieval of a private, expiring Cloud source URL."""
import hashlib
import shutil
from urllib.parse import urlsplit

import requests

MAX_ORIGINAL_BYTES = 5 * 1024**3
CHUNK_BYTES = 1024**2
DISK_RESERVE_BYTES = 1024**3


def check_capacity(directory, expected_bytes):
    if not 0 < expected_bytes <= MAX_ORIGINAL_BYTES:
        raise ValueError("Original exceeds configured 5 GiB limit or is empty")
    # Original + intermediate output budget + headroom; actual pipelines may need more.
    required = expected_bytes * 2 + DISK_RESERVE_BYTES
    if shutil.disk_usage(directory).free < required:
        raise ValueError(f"Insufficient processing disk: {required} free bytes required")
    return required


def validate_source(url, allowed_origin):
    source, allowed = urlsplit(url), urlsplit(allowed_origin)
    if (not allowed.netloc or source.scheme != "https" or
            (source.scheme, source.netloc) != (allowed.scheme, allowed.netloc) or
            source.username or source.password or source.fragment or
            not source.path.startswith("/storage/v1/object/sign/original-files/")):
        raise ValueError("Source must be an expiring private original URL on the configured Cloud origin")


def download_original(url, destination, expected_bytes, expected_hash, allowed_origin):
    """Yield actual byte counters; publish a local file only after size/hash verification."""
    validate_source(url, allowed_origin)
    check_capacity(destination.parent, expected_bytes)
    partial = destination.with_suffix(destination.suffix + ".partial")
    digest, received = hashlib.sha256(), 0
    try:
        with requests.get(url, stream=True, timeout=(15, 120), allow_redirects=False,
                          headers={"Accept-Encoding": "identity"}) as response:
            if response.status_code != 200:
                raise ValueError("Private original download failed; refresh its access URL")
            length = response.headers.get("Content-Length")
            if length is not None and int(length) != expected_bytes:
                raise ValueError("Stored size differs from registered original")
            with partial.open("wb") as output:
                for chunk in response.iter_content(chunk_size=CHUNK_BYTES):
                    if not chunk:
                        continue
                    received += len(chunk)
                    if received > expected_bytes:
                        raise ValueError("Stored size exceeds registered original")
                    if shutil.disk_usage(destination.parent).free < len(chunk) + DISK_RESERVE_BYTES:
                        raise ValueError("Processing disk reserve exhausted")
                    digest.update(chunk)
                    output.write(chunk)
                    yield {"stage": "Downloading original", "received_bytes": received,
                           "total_bytes": expected_bytes}
        if received != expected_bytes or digest.hexdigest() != expected_hash:
            raise ValueError("Original size or SHA-256 verification failed")
        partial.replace(destination)
        yield {"stage": "Original verified", "received_bytes": received,
               "total_bytes": expected_bytes, "sha256": digest.hexdigest()}
    finally:
        partial.unlink(missing_ok=True)