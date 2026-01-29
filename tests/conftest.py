"""
Pytest configuration and fixtures for video editor tests.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Generator
from typing import Final

import pytest

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def is_ffmpeg_available() -> bool:
    """Check if FFmpeg is available in the system."""
    try:
        result: subprocess.CompletedProcess[bytes] = subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


# Global flag for FFmpeg availability
FFMPEG_AVAILABLE: Final[bool] = is_ffmpeg_available()

# Skip marker for tests requiring FFmpeg
requires_ffmpeg: pytest.MarkDecorator = pytest.mark.skipif(not FFMPEG_AVAILABLE, reason="FFmpeg not available on this system")


@pytest.fixture
def temp_dir() -> Generator[str, None, None]:
    """Create a temporary directory for test outputs."""
    temp: str = tempfile.mkdtemp()
    yield temp
    # Cleanup after test
    shutil.rmtree(temp, ignore_errors=True)


@pytest.fixture
def sample_video(temp_dir: str) -> str:
    """Create a sample test video using ffmpeg's test source."""
    if not FFMPEG_AVAILABLE:
        pytest.skip("FFmpeg not available")

    output_path: str = os.path.join(temp_dir, "test_video.mp4")

    # Generate a 5-second test video with audio
    cmd: list[str] = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=5:size=640x480:rate=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=5",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
        "-pix_fmt",
        "yuv420p",
        output_path,
    ]

    result: subprocess.CompletedProcess[bytes] = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        pytest.skip(f"Could not create test video: {result.stderr.decode()}")

    return output_path


@pytest.fixture
def sample_video_with_silence(temp_dir: str) -> str:
    """Create a sample test video with silent segments."""
    if not FFMPEG_AVAILABLE:
        pytest.skip("FFmpeg not available")

    output_path: str = os.path.join(temp_dir, "test_video_silence.mp4")

    # Generate a 10-second test video with alternating audio and silence
    # 0-2s: audio, 2-4s: silence, 4-6s: audio, 6-8s: silence, 8-10s: audio
    cmd: list[str] = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=10:size=640x480:rate=30",
        "-f",
        "lavfi",
        "-i",
        "aevalsrc='sin(440*2*PI*t)*if(between(t,0,2)+between(t,4,6)+between(t,8,10),1,0)':d=10",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
        "-pix_fmt",
        "yuv420p",
        output_path,
    ]

    result: subprocess.CompletedProcess[bytes] = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        pytest.skip(f"Could not create test video with silence: {result.stderr.decode()}")

    return output_path


@pytest.fixture
def sample_image(temp_dir: str) -> str:
    """Create a sample test image for overlay tests."""
    if not FFMPEG_AVAILABLE:
        pytest.skip("FFmpeg not available")

    output_path: str = os.path.join(temp_dir, "test_image.png")

    # Generate a simple test image
    cmd: list[str] = ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=red:s=100x100:d=1", "-frames:v", "1", output_path]

    result: subprocess.CompletedProcess[bytes] = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        pytest.skip(f"Could not create test image: {result.stderr.decode()}")

    return output_path


@pytest.fixture
def sample_audio(temp_dir: str) -> str:
    """Create a sample test audio file."""
    if not FFMPEG_AVAILABLE:
        pytest.skip("FFmpeg not available")

    output_path: str = os.path.join(temp_dir, "test_audio.mp3")

    # Generate a 3-second test audio
    cmd: list[str] = ["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=3", "-c:a", "libmp3lame", output_path]

    result: subprocess.CompletedProcess[bytes] = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        pytest.skip(f"Could not create test audio: {result.stderr.decode()}")

    return output_path


@pytest.fixture
def second_video(temp_dir: str) -> str:
    """Create a second sample video for transition/concat tests."""
    if not FFMPEG_AVAILABLE:
        pytest.skip("FFmpeg not available")

    output_path: str = os.path.join(temp_dir, "test_video2.mp4")

    # Generate a different 5-second test video
    cmd: list[str] = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=duration=5:size=640x480:rate=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=880:duration=5",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
        "-pix_fmt",
        "yuv420p",
        output_path,
    ]

    result: subprocess.CompletedProcess[bytes] = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        pytest.skip(f"Could not create second test video: {result.stderr.decode()}")

    return output_path


def get_video_duration(video_path: str) -> float | None:
    """Get the duration of a video file in seconds."""
    cmd: list[str] = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", video_path]
    result: subprocess.CompletedProcess[bytes] = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        return None
    return float(result.stdout.decode().strip())


def get_video_resolution(video_path: str) -> str | None:
    """Get the resolution of a video file."""
    cmd: list[str] = ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", video_path]
    result: subprocess.CompletedProcess[bytes] = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        return None
    return result.stdout.decode().strip()
