"""
Tests for audio normalization and loudness.

TDD: These tests must FAIL before implementation.
Run with: uv run pytest tests/test_audio_normalization.py -v
"""

from __future__ import annotations

import os
import subprocess

import pytest

from conftest import requires_ffmpeg, get_video_resolution


@pytest.fixture
def quiet_video(temp_dir: str) -> str:
    """Create a video with quiet audio."""
    output_path = os.path.join(temp_dir, "quiet.mp4")

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
        "-af",
        "volume=0.1",  # Very quiet
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
        pytest.skip(f"Could not create quiet video: {result.stderr.decode()}")

    return output_path


@pytest.fixture
def loud_video(temp_dir: str) -> str:
    """Create a video with loud audio."""
    output_path = os.path.join(temp_dir, "loud.mp4")

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
        "-af",
        "volume=3.0",  # Boosted
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
        pytest.skip(f"Could not create loud video: {result.stderr.decode()}")

    return output_path


@requires_ffmpeg
class TestLoudnessAnalysis:
    """Tests for loudness analysis - must fail before implementation."""

    def test_get_loudness_returns_lufs(self, sample_video: str) -> None:
        """Get loudness should return LUFS measurement."""
        from video_editor.analysis import get_loudness

        result = get_loudness(sample_video)

        assert "integrated_lufs" in result
        assert "true_peak" in result
        assert "lra" in result  # Loudness Range
        assert isinstance(result["integrated_lufs"], float)
        assert isinstance(result["true_peak"], float)

    def test_get_loudness_quiet_video(self, quiet_video: str) -> None:
        """Quiet video should have lower LUFS."""
        from video_editor.analysis import get_loudness

        result = get_loudness(quiet_video)

        # Quiet video should be below -20 LUFS typically
        assert result["integrated_lufs"] < -20

    def test_get_loudness_loud_video(self, loud_video: str) -> None:
        """Loud video should have higher LUFS."""
        from video_editor.analysis import get_loudness

        result = get_loudness(loud_video)

        # Loud video should be above -20 LUFS typically
        assert result["integrated_lufs"] > -25


@requires_ffmpeg
class TestLoudnessNormalization:
    """Tests for loudness normalization - must fail before implementation."""

    def test_normalize_to_target_lufs(self, quiet_video: str, temp_dir: str) -> None:
        """Normalize should adjust to target LUFS."""
        from video_editor.pipeline import VideoPipeline
        from video_editor.analysis import get_loudness

        _original_loudness = get_loudness(quiet_video)  # noqa: F841

        pipeline = VideoPipeline(quiet_video)
        pipeline.add_loudness_normalization(target_lufs=-14.0)
        output = pipeline.render(output_dir=temp_dir)

        new_loudness = get_loudness(output)

        # Should be closer to -14 LUFS
        assert abs(new_loudness["integrated_lufs"] - (-14.0)) < 2.0

    def test_normalize_youtube_standard(self, sample_video: str, temp_dir: str) -> None:
        """Normalize to YouTube standard (-14 LUFS)."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_loudness_normalization(target_lufs=-14.0, true_peak=-1.0, preset="youtube")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_normalize_podcast_standard(self, sample_video: str, temp_dir: str) -> None:
        """Normalize to podcast standard (-16 LUFS)."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_loudness_normalization(target_lufs=-16.0, preset="podcast")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_normalize_broadcast_standard(self, sample_video: str, temp_dir: str) -> None:
        """Normalize to broadcast standard (-24 LUFS)."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_loudness_normalization(target_lufs=-24.0, preset="broadcast")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_normalize_preserves_video(self, sample_video: str, temp_dir: str) -> None:
        """Normalization should not alter video stream."""
        from video_editor.pipeline import VideoPipeline

        original_resolution = get_video_resolution(sample_video)

        pipeline = VideoPipeline(sample_video)
        pipeline.add_loudness_normalization(target_lufs=-14.0)
        output = pipeline.render(output_dir=temp_dir)

        assert get_video_resolution(output) == original_resolution

    def test_normalize_with_true_peak_limit(self, loud_video: str, temp_dir: str) -> None:
        """Normalization should respect true peak limit."""
        from video_editor.pipeline import VideoPipeline
        from video_editor.analysis import get_loudness

        pipeline = VideoPipeline(loud_video)
        pipeline.add_loudness_normalization(
            target_lufs=-14.0,
            true_peak=-1.0,  # -1 dBTP limit
        )
        output = pipeline.render(output_dir=temp_dir)

        result = get_loudness(output)
        assert result["true_peak"] <= -0.5  # Should be at or below -1 dBTP


@requires_ffmpeg
class TestPeakNormalization:
    """Tests for peak normalization - must fail before implementation."""

    def test_peak_normalize(self, quiet_video: str, temp_dir: str) -> None:
        """Peak normalize to 0 dB."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(quiet_video)
        pipeline.add_peak_normalization(target_db=0.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_peak_normalize_with_headroom(self, sample_video: str, temp_dir: str) -> None:
        """Peak normalize with headroom."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_peak_normalization(
            target_db=-3.0  # Leave 3dB headroom
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
