"""
Tests for audio ducking.

TDD: These tests must FAIL before implementation.
Run with: uv run pytest tests/test_audio_ducking.py -v
"""

from __future__ import annotations

import os
import subprocess

import pytest

from tests.conftest import requires_ffmpeg


@pytest.fixture
def video_with_speech(temp_dir: str) -> str:
    """Create video with speech-like audio patterns."""
    output_path = os.path.join(temp_dir, "speech.mp4")

    # Create audio with varying levels to simulate speech
    # Louder sections (speech) and quieter sections (pauses)
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
        "aevalsrc='sin(440*2*PI*t)*if(between(t,0,2)+between(t,4,6)+between(t,8,10),0.8,0.1)':d=10",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        pytest.skip(f"Could not create speech video: {result.stderr.decode()}")

    return output_path


@pytest.fixture
def music_track(temp_dir: str) -> str:
    """Create a music-like audio track."""
    output_path = os.path.join(temp_dir, "music.mp3")

    # Create a continuous tone as "music"
    cmd: list[str] = ["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=10", "-c:a", "libmp3lame", output_path]
    subprocess.run(cmd, capture_output=True)
    return output_path


@requires_ffmpeg
class TestAudioDucking:
    """Tests for audio ducking - must fail before implementation."""

    def test_duck_music_during_speech(self, video_with_speech: str, music_track: str, temp_dir: str) -> None:
        """Music should be quieter during speech."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(video_with_speech)
        pipeline.add_audio_track(music_track, volume=1.0)
        pipeline.add_audio_ducking(duck_amount=0.3)  # Duck to 30%
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_duck_with_custom_threshold(self, video_with_speech: str, music_track: str, temp_dir: str) -> None:
        """Ducking should respect threshold parameter."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(video_with_speech)
        pipeline.add_audio_track(music_track)
        pipeline.add_audio_ducking(
            duck_amount=0.2,
            threshold=-20,  # dB threshold for speech detection
            attack=0.1,
            release=0.5,
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_duck_with_attack_release(self, video_with_speech: str, music_track: str, temp_dir: str) -> None:
        """Ducking with custom attack and release times."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(video_with_speech)
        pipeline.add_audio_track(music_track)
        pipeline.add_audio_ducking(
            duck_amount=0.25,
            attack=0.05,  # Fast attack
            release=1.0,  # Slow release
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_duck_external_music_file(self, sample_video: str, music_track: str, temp_dir: str) -> None:
        """Duck external music track."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_ducking(music_path=music_track, duck_amount=0.25)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_duck_preserves_video(self, video_with_speech: str, music_track: str, temp_dir: str) -> None:
        """Ducking should not alter video stream."""
        from video_editor.pipeline import VideoPipeline
        from tests.conftest import get_video_resolution

        original_resolution = get_video_resolution(video_with_speech)

        pipeline = VideoPipeline(video_with_speech)
        pipeline.add_audio_track(music_track)
        pipeline.add_audio_ducking(duck_amount=0.3)
        output = pipeline.render(output_dir=temp_dir)

        assert get_video_resolution(output) == original_resolution


@requires_ffmpeg
class TestSidechainCompression:
    """Tests for sidechain compression - must fail before implementation."""

    def test_sidechain_compress_basic(self, video_with_speech: str, music_track: str, temp_dir: str) -> None:
        """Basic sidechain compression."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(video_with_speech)
        pipeline.add_audio_track(music_track)
        pipeline.add_sidechain_compression(ratio=4.0, threshold=-20)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_sidechain_compress_aggressive(self, video_with_speech: str, music_track: str, temp_dir: str) -> None:
        """Aggressive sidechain compression for podcasts."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(video_with_speech)
        pipeline.add_audio_track(music_track)
        pipeline.add_sidechain_compression(ratio=10.0, threshold=-25, attack=0.01, release=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
