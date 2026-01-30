"""
Tests for audio layering and sound effect features.

Run with: uv run pytest tests/test_audio_layering.py -v
"""

from __future__ import annotations

import os
import subprocess

import pytest

from conftest import requires_ffmpeg, get_video_duration


@pytest.fixture
def short_audio(temp_dir: str) -> str:
    """Create a short audio file for sound effect testing."""
    output_path = os.path.join(temp_dir, "short_sfx.wav")

    cmd: list[str] = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=880:duration=1",
        "-c:a",
        "pcm_s16le",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        pytest.skip(f"Could not create short audio: {result.stderr.decode()}")

    return output_path


@pytest.fixture
def music_track(temp_dir: str) -> str:
    """Create a longer music track for layering tests."""
    output_path = os.path.join(temp_dir, "music.mp3")

    # Create a 10-second music track
    cmd: list[str] = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=220:duration=10",
        "-c:a",
        "libmp3lame",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        pytest.skip(f"Could not create music track: {result.stderr.decode()}")

    return output_path


@requires_ffmpeg
class TestAudioLayering:
    """Tests for add_audio_layer method."""

    def test_add_audio_layer_basic(
        self, sample_video: str, sample_audio: str, temp_dir: str
    ) -> None:
        """Add an audio layer with default settings."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_layer(sample_audio)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        # Duration should remain same as original video
        original_duration = get_video_duration(sample_video)
        output_duration = get_video_duration(output)
        assert abs(output_duration - original_duration) < 0.5

    def test_add_audio_layer_with_start_time(
        self, sample_video: str, sample_audio: str, temp_dir: str
    ) -> None:
        """Add audio layer starting at a specific time."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_layer(sample_audio, start_time=2.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_audio_layer_with_volume(
        self, sample_video: str, sample_audio: str, temp_dir: str
    ) -> None:
        """Add audio layer with custom volume."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_layer(sample_audio, volume=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_audio_layer_with_fade_in(
        self, sample_video: str, sample_audio: str, temp_dir: str
    ) -> None:
        """Add audio layer with fade in effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_layer(sample_audio, fade_in=1.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_audio_layer_with_fade_out(
        self, sample_video: str, sample_audio: str, temp_dir: str
    ) -> None:
        """Add audio layer with fade out effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_layer(sample_audio, end_time=2.5, fade_out=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_audio_layer_with_end_time(
        self, sample_video: str, music_track: str, temp_dir: str
    ) -> None:
        """Add audio layer that stops at a specific time."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_layer(music_track, start_time=0, end_time=3.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_audio_layer_full_options(
        self, sample_video: str, music_track: str, temp_dir: str
    ) -> None:
        """Add audio layer with all options."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_layer(
            music_track,
            start_time=1.0,
            end_time=4.0,
            volume=0.7,
            fade_in=0.5,
            fade_out=0.5,
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_audio_layer_file_not_found(self, sample_video: str) -> None:
        """Should raise error for non-existent audio file."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)

        with pytest.raises(FileNotFoundError):
            pipeline.add_audio_layer("/nonexistent/audio.mp3")

    def test_add_audio_layer_method_chaining(
        self, sample_video: str, sample_audio: str, temp_dir: str
    ) -> None:
        """Method should return self for chaining."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        result = pipeline.add_audio_layer(sample_audio, start_time=1.0)

        assert result is pipeline


@requires_ffmpeg
class TestSoundEffects:
    """Tests for add_sound_effect method."""

    def test_add_sound_effect_basic(
        self, sample_video: str, short_audio: str, temp_dir: str
    ) -> None:
        """Add a sound effect at a specific time."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_sound_effect(short_audio, at_time=2.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_sound_effect_with_volume(
        self, sample_video: str, short_audio: str, temp_dir: str
    ) -> None:
        """Add a sound effect with custom volume."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_sound_effect(short_audio, at_time=1.5, volume=0.8)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_multiple_sound_effects(
        self, sample_video: str, short_audio: str, temp_dir: str
    ) -> None:
        """Add multiple sound effects at different times."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_sound_effect(short_audio, at_time=1.0)
        pipeline.add_sound_effect(short_audio, at_time=3.0, volume=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_sound_effect_method_chaining(
        self, sample_video: str, short_audio: str
    ) -> None:
        """Method should return self for chaining."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        result = pipeline.add_sound_effect(short_audio, at_time=2.0)

        assert result is pipeline


@requires_ffmpeg
class TestMixedAudioOperations:
    """Tests for combining audio operations."""

    def test_audio_layer_with_volume_change(
        self, sample_video: str, sample_audio: str, temp_dir: str
    ) -> None:
        """Combine audio layer with volume change."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.change_volume(0.8)
        pipeline.add_audio_layer(sample_audio, start_time=1.0, volume=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_sound_effect_with_trim(
        self, sample_video: str, short_audio: str, temp_dir: str
    ) -> None:
        """Add sound effect to trimmed video."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.trim(1.0, 4.0)
        pipeline.add_sound_effect(short_audio, at_time=1.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        # Duration should be approximately 3 seconds
        duration = get_video_duration(output)
        assert abs(duration - 3.0) < 0.5

    def test_operation_tracking(
        self, sample_video: str, sample_audio: str
    ) -> None:
        """Audio layer operations should be tracked."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_layer(
            sample_audio,
            start_time=1.0,
            volume=0.5,
            fade_in=0.5,
        )

        # Check that the operation was tracked
        ops = [op for op in pipeline._operations if op["type"] == "add_audio_layer"]
        assert len(ops) == 1
        assert ops[0]["start_time"] == 1.0
        assert ops[0]["volume"] == 0.5
        assert ops[0]["fade_in"] == 0.5
