"""
Tests for blur, sharpen, and denoise effects.

TDD: These tests must FAIL before implementation.
Run with: uv run pytest tests/test_blur_sharpen.py -v
"""

from __future__ import annotations

import os
import subprocess

import pytest

from tests.conftest import requires_ffmpeg


@pytest.fixture
def noisy_video(temp_dir: str) -> str:
    """Create a video with noise."""
    output_path = os.path.join(temp_dir, "noisy.mp4")

    cmd: list[str] = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=3:size=640x480:rate=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=3",
        "-vf",
        "noise=alls=20:allf=t",
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
        pytest.skip(f"Could not create noisy video: {result.stderr.decode()}")

    return output_path


@requires_ffmpeg
class TestMotionBlur:
    """Tests for motion blur effect - must fail before implementation."""

    def test_add_motion_blur_basic(self, sample_video: str, temp_dir: str) -> None:
        """Motion blur effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_motion_blur(intensity=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_motion_blur_light(self, sample_video: str, temp_dir: str) -> None:
        """Light motion blur."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_motion_blur(intensity=0.3)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_motion_blur_heavy(self, sample_video: str, temp_dir: str) -> None:
        """Heavy motion blur for artistic effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_motion_blur(intensity=0.8)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@requires_ffmpeg
class TestSharpen:
    """Tests for sharpen effect - must fail before implementation."""

    def test_add_sharpen_basic(self, sample_video: str, temp_dir: str) -> None:
        """Sharpen effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_sharpen(amount=1.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_sharpen_light(self, sample_video: str, temp_dir: str) -> None:
        """Light sharpen."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_sharpen(amount=1.2)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_sharpen_strong(self, sample_video: str, temp_dir: str) -> None:
        """Strong sharpen."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_sharpen(amount=2.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_sharpen_time_range(self, sample_video: str, temp_dir: str) -> None:
        """Sharpen only during time range."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_sharpen(amount=2.0, start_time=1.0, end_time=3.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@requires_ffmpeg
class TestDenoise:
    """Tests for denoise effect - must fail before implementation."""

    def test_add_denoise_basic(self, noisy_video: str, temp_dir: str) -> None:
        """Denoise should reduce noise."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(noisy_video)
        pipeline.add_denoise(strength=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_denoise_light(self, noisy_video: str, temp_dir: str) -> None:
        """Light denoise."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(noisy_video)
        pipeline.add_denoise(strength=0.3)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_denoise_strong(self, noisy_video: str, temp_dir: str) -> None:
        """Strong denoise."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(noisy_video)
        pipeline.add_denoise(strength=0.8)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_denoise_temporal(self, noisy_video: str, temp_dir: str) -> None:
        """Temporal denoise (uses multiple frames)."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(noisy_video)
        pipeline.add_denoise(strength=0.5, temporal=True)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@requires_ffmpeg
class TestSoften:
    """Tests for soften/blur effect - must fail before implementation."""

    def test_add_soften_basic(self, sample_video: str, temp_dir: str) -> None:
        """Soften/blur effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_soften(amount=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_soften_light(self, sample_video: str, temp_dir: str) -> None:
        """Light soften for beauty effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_soften(amount=0.3)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_gaussian_blur(self, sample_video: str, temp_dir: str) -> None:
        """Gaussian blur effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_gaussian_blur(sigma=2.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_box_blur(self, sample_video: str, temp_dir: str) -> None:
        """Box blur effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_box_blur(radius=5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
