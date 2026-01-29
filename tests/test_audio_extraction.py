"""
Tests for audio extraction and replacement.

TDD: These tests must FAIL before implementation.
Run with: uv run pytest tests/test_audio_extraction.py -v
"""

from __future__ import annotations

import os
import subprocess


from tests.conftest import requires_ffmpeg, get_video_duration


def get_audio_duration(audio_path: str) -> float | None:
    """Get the duration of an audio file in seconds."""
    cmd: list[str] = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audio_path]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        return None
    return float(result.stdout.decode().strip())


def get_audio_info(file_path: str) -> dict | None:
    """Get audio stream info from a file."""
    import json

    cmd: list[str] = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=codec_name,sample_rate,channels",
        "-of",
        "json",
        file_path,
    ]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        return None
    data = json.loads(result.stdout.decode())
    if data.get("streams"):
        return data["streams"][0]
    return None


def create_short_audio(temp_dir: str, duration: float = 1.0) -> str:
    """Create a short audio file for testing."""
    output_path = os.path.join(temp_dir, "short_audio.mp3")
    cmd: list[str] = ["ffmpeg", "-y", "-f", "lavfi", "-i", f"sine=frequency=880:duration={duration}", "-c:a", "libmp3lame", output_path]
    subprocess.run(cmd, capture_output=True)
    return output_path


@requires_ffmpeg
class TestAudioExtraction:
    """Tests for audio extraction - must fail before implementation."""

    def test_extract_audio_creates_mp3_file(self, sample_video: str, temp_dir: str) -> None:
        """Extract audio should create valid MP3 file."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        output = pipeline.extract_audio(format="mp3", output_dir=temp_dir)

        assert os.path.exists(output)
        assert output.endswith(".mp3")
        # Verify it's a valid audio file with duration
        duration = get_audio_duration(output)
        assert duration is not None
        assert duration > 0

    def test_extract_audio_wav_format(self, sample_video: str, temp_dir: str) -> None:
        """Extract audio should support WAV format."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        output = pipeline.extract_audio(format="wav", output_dir=temp_dir)

        assert output.endswith(".wav")
        assert os.path.exists(output)

    def test_extract_audio_flac_format(self, sample_video: str, temp_dir: str) -> None:
        """Extract audio should support FLAC format."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        output = pipeline.extract_audio(format="flac", output_dir=temp_dir)

        assert output.endswith(".flac")
        assert os.path.exists(output)

    def test_extract_audio_preserves_duration(self, sample_video: str, temp_dir: str) -> None:
        """Extracted audio should match video duration."""
        from video_editor.pipeline import VideoPipeline

        video_duration = get_video_duration(sample_video)
        assert video_duration is not None

        pipeline = VideoPipeline(sample_video)
        output = pipeline.extract_audio(format="mp3", output_dir=temp_dir)
        audio_duration = get_audio_duration(output)

        assert audio_duration is not None
        assert abs(video_duration - audio_duration) < 0.5  # Within 0.5s


@requires_ffmpeg
class TestAudioReplacement:
    """Tests for audio replacement - must fail before implementation."""

    def test_replace_audio_changes_audio_track(self, sample_video: str, sample_audio: str, temp_dir: str) -> None:
        """Replace audio should swap the audio track."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.replace_audio(sample_audio)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        # Duration should match the video, not the replacement audio
        video_duration = get_video_duration(sample_video)
        output_duration = get_video_duration(output)
        assert video_duration is not None
        assert output_duration is not None
        assert abs(video_duration - output_duration) < 0.5

    def test_replace_audio_keeps_video_intact(self, sample_video: str, sample_audio: str, temp_dir: str) -> None:
        """Replace audio should not alter video stream."""
        from video_editor.pipeline import VideoPipeline
        from tests.conftest import get_video_resolution

        original_resolution = get_video_resolution(sample_video)

        pipeline = VideoPipeline(sample_video)
        pipeline.replace_audio(sample_audio)
        output = pipeline.render(output_dir=temp_dir)

        new_resolution = get_video_resolution(output)
        assert original_resolution == new_resolution

    def test_replace_audio_loops_short_audio(self, sample_video: str, temp_dir: str) -> None:
        """Short audio should loop to match video duration."""
        from video_editor.pipeline import VideoPipeline

        # Create 1-second audio for 5-second video
        short_audio = create_short_audio(temp_dir, duration=1)

        pipeline = VideoPipeline(sample_video)
        pipeline.replace_audio(short_audio, loop=True)
        output = pipeline.render(output_dir=temp_dir)

        # Output should still be ~5 seconds
        output_duration = get_video_duration(output)
        assert output_duration is not None
        assert abs(output_duration - 5.0) < 0.5

    def test_replace_audio_with_volume_adjustment(self, sample_video: str, sample_audio: str, temp_dir: str) -> None:
        """Replace audio should support volume adjustment."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.replace_audio(sample_audio, volume=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
