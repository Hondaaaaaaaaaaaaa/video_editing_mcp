"""
Tests for blur and pixelate region effects.

TDD: These tests must FAIL before implementation.
Run with: uv run pytest tests/test_blur_regions.py -v
"""

from __future__ import annotations

import os
import subprocess

import numpy as np
from PIL import Image

from tests.conftest import requires_ffmpeg


def extract_frame(video_path: str, timestamp: float, output_dir: str) -> str:
    """Extract a single frame from video at timestamp."""
    output_path = os.path.join(output_dir, f"frame_{timestamp}.png")
    cmd: list[str] = ["ffmpeg", "-y", "-ss", str(timestamp), "-i", video_path, "-frames:v", "1", output_path]
    subprocess.run(cmd, capture_output=True)
    return output_path


def get_region_variance(image_path: str, x: int, y: int, w: int, h: int) -> float:
    """Get the variance of pixel values in a region (lower = smoother/blurred)."""
    img = Image.open(image_path)
    arr = np.array(img)

    # Extract region
    region = arr[y : y + h, x : x + w]

    # Calculate variance across all channels
    return float(np.var(region))


@requires_ffmpeg
class TestBlurRegions:
    """Tests for blur regions - must fail before implementation."""

    def test_blur_region_applies_blur(self, sample_video: str, temp_dir: str) -> None:
        """Blur region should apply gaussian blur to specified area."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_blur_region(x=100, y=100, width=200, height=150, intensity=20)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

        # Extract same frame from both and compare
        original_frame = extract_frame(sample_video, 2.0, temp_dir)
        blurred_frame = extract_frame(output, 2.0, temp_dir)

        # The blurred region should have lower variance (smoother)
        region_variance_orig = get_region_variance(original_frame, 100, 100, 200, 150)
        region_variance_blur = get_region_variance(blurred_frame, 100, 100, 200, 150)

        assert region_variance_blur < region_variance_orig

    def test_blur_region_time_limited(self, sample_video: str, temp_dir: str) -> None:
        """Blur should only apply during specified time range."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_blur_region(x=100, y=100, width=200, height=150, intensity=20, start_time=2.0, end_time=4.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

        # Frame at 1.0s should NOT be blurred, frame at 3.0s should be
        frame_before = extract_frame(output, 1.0, temp_dir)
        frame_during = extract_frame(output, 3.0, temp_dir)

        var_before = get_region_variance(frame_before, 100, 100, 200, 150)
        var_during = get_region_variance(frame_during, 100, 100, 200, 150)

        # During blur should have lower variance
        assert var_during < var_before

    def test_blur_region_full_video(self, sample_video: str, temp_dir: str) -> None:
        """Blur should apply to entire video when no time specified."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_blur_region(x=50, y=50, width=100, height=100, intensity=15)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@requires_ffmpeg
class TestPixelateRegions:
    """Tests for pixelate regions - must fail before implementation."""

    def test_pixelate_region(self, sample_video: str, temp_dir: str) -> None:
        """Pixelate should apply mosaic effect to region."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_pixelate_region(x=100, y=100, width=200, height=150, block_size=10)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_pixelate_region_time_limited(self, sample_video: str, temp_dir: str) -> None:
        """Pixelate should respect time range."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_pixelate_region(x=100, y=100, width=200, height=150, block_size=15, start_time=1.0, end_time=3.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_pixelate_with_large_blocks(self, sample_video: str, temp_dir: str) -> None:
        """Pixelate with large block size."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_pixelate_region(
            x=100,
            y=100,
            width=200,
            height=150,
            block_size=30,  # Very blocky
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@requires_ffmpeg
class TestMultipleRegions:
    """Tests for multiple blur/pixelate regions - must fail before implementation."""

    def test_multiple_blur_regions(self, sample_video: str, temp_dir: str) -> None:
        """Multiple blur regions should all be applied."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_blur_region(x=0, y=0, width=100, height=100, intensity=15)
        pipeline.add_blur_region(x=200, y=200, width=100, height=100, intensity=15)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_mixed_blur_and_pixelate(self, sample_video: str, temp_dir: str) -> None:
        """Can combine blur and pixelate regions."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_blur_region(x=0, y=0, width=100, height=100, intensity=10)
        pipeline.add_pixelate_region(x=300, y=200, width=100, height=100, block_size=10)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_overlapping_regions(self, sample_video: str, temp_dir: str) -> None:
        """Overlapping regions should be handled."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_blur_region(x=100, y=100, width=200, height=200, intensity=15)
        pipeline.add_blur_region(x=150, y=150, width=200, height=200, intensity=15)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
