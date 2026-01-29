"""
Helper utility functions for the video editor.
"""

from __future__ import annotations

import logging
import os
import subprocess
import tempfile
from typing import IO

# Setup logging for progress reporting
logging.basicConfig(level=logging.INFO)
logger: logging.Logger = logging.getLogger("video_editor")

# Cache the result of GPU detection to avoid checking multiple times
_gpu_available: bool | None = None


def _to_temp_file(input_data: str | bytes, suffix: str = "") -> str:
    """Write bytes or copy file path to a temp file and return its path."""
    if isinstance(input_data, bytes):
        tmp: IO[bytes] = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, mode="wb")
        tmp.write(input_data)
        tmp.close()
        return tmp.name
    elif os.path.exists(input_data):
        return input_data
    else:
        raise ValueError(f"Input path does not exist: {input_data}")


def _has_cuda_gpu() -> bool:
    """Check if a CUDA-compatible GPU is available for hardware acceleration."""
    try:
        # Try to run nvidia-smi to check for NVIDIA GPU
        nvidia_output: subprocess.CompletedProcess[bytes] = subprocess.run(
            ["nvidia-smi"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=2,
        )
        if nvidia_output.returncode == 0:
            logger.info("NVIDIA GPU detected, will use hardware acceleration")
            return True

        # If nvidia-smi fails, try a simple FFmpeg command to check if CUDA is available
        test_cmd: list[str] = [
            "ffmpeg",
            "-hide_banner",
            "-hwaccel",
            "cuda",
            "-hwaccel_output_format",
            "cuda",
            "-f",
            "lavfi",
            "-i",
            "testsrc=duration=1:size=1280x720:rate=30",
            "-f",
            "null",
            "-",
        ]
        ffmpeg_test: subprocess.CompletedProcess[bytes] = subprocess.run(
            test_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=3,
        )
        if ffmpeg_test.returncode == 0:
            logger.info("FFmpeg CUDA support detected, will use hardware acceleration")
            return True
    except (subprocess.SubprocessError, FileNotFoundError, OSError):
        pass

    logger.info("No CUDA GPU detected or FFmpeg lacks CUDA support, using CPU only")
    return False


def _is_gpu_available() -> bool:
    """Get cached result of GPU detection or perform detection."""
    global _gpu_available
    if _gpu_available is None:
        _gpu_available = _has_cuda_gpu()
    return _gpu_available
