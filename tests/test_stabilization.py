"""
Tests for video stabilization.

TDD: These tests must FAIL before implementation.
Run with: uv run pytest tests/test_stabilization.py -v
"""

from __future__ import annotations

import os
import subprocess

import pytest

from tests.conftest import requires_ffmpeg, get_video_duration


@pytest.fixture
def shaky_video(temp_dir: str) -> str:
    """Create a video with simulated camera shake."""
    output_path = os.path.join(temp_dir, "shaky.mp4")

    # Use FFmpeg to add artificial shake via crop with oscillating position
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
        "-vf",
        "crop=600:440:20+10*sin(t*10):20+10*cos(t*8)",
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
        pytest.skip(f"Could not create shaky video: {result.stderr.decode()}")

    return output_path


@requires_ffmpeg
class TestVideoStabilization:
    """Tests for video stabilization - must fail before implementation."""

    def test_stabilization_creates_output(self, shaky_video: str, temp_dir: str) -> None:
        """Stabilization should produce valid output."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(shaky_video)
        pipeline.add_stabilization(smoothing=10)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        duration = get_video_duration(output)
        assert duration is not None
        assert duration > 0

    def test_stabilization_preserves_duration(self, shaky_video: str, temp_dir: str) -> None:
        """Stabilization should not significantly alter duration."""
        from video_editor.pipeline import VideoPipeline

        original_duration = get_video_duration(shaky_video)
        assert original_duration is not None

        pipeline = VideoPipeline(shaky_video)
        pipeline.add_stabilization()
        output = pipeline.render(output_dir=temp_dir)

        new_duration = get_video_duration(output)
        assert new_duration is not None
        assert abs(original_duration - new_duration) < 1.0

    def test_stabilization_with_custom_settings(self, shaky_video: str, temp_dir: str) -> None:
        """Stabilization should respect shakiness and accuracy params."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(shaky_video)
        pipeline.add_stabilization(shakiness=8, accuracy=15, smoothing=30)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_stabilization_default_settings(self, shaky_video: str, temp_dir: str) -> None:
        """Stabilization with default settings should work."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(shaky_video)
        pipeline.add_stabilization()
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_stabilization_preserves_audio(self, shaky_video: str, temp_dir: str) -> None:
        """Stabilization should preserve audio track."""
        from video_editor.pipeline import VideoPipeline
        import json

        pipeline = VideoPipeline(shaky_video)
        pipeline.add_stabilization()
        output = pipeline.render(output_dir=temp_dir)

        # Check output has audio
        cmd: list[str] = ["ffprobe", "-v", "error", "-show_streams", "-select_streams", "a", "-of", "json", output]
        result = subprocess.run(cmd, capture_output=True)
        data = json.loads(result.stdout.decode())

        assert len(data.get("streams", [])) > 0

    def test_stabilization_low_smoothing(self, shaky_video: str, temp_dir: str) -> None:
        """Low smoothing value should still work."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(shaky_video)
        pipeline.add_stabilization(smoothing=3)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_stabilization_high_smoothing(self, shaky_video: str, temp_dir: str) -> None:
        """High smoothing value should produce very stable output."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(shaky_video)
        pipeline.add_stabilization(smoothing=50)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_stabilization_with_zoom(self, shaky_video: str, temp_dir: str) -> None:
        """Stabilization with zoom to hide borders."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(shaky_video)
        pipeline.add_stabilization(
            smoothing=10,
            zoom=5,  # 5% zoom to hide black borders
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
