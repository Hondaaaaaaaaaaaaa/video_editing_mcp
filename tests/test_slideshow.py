"""
Tests for Ken Burns effect and slideshow creation.

TDD: These tests must FAIL before implementation.
Run with: uv run pytest tests/test_slideshow.py -v
"""

from __future__ import annotations

import os
import subprocess
import json

import pytest

from conftest import requires_ffmpeg, get_video_duration


def create_test_images(temp_dir: str, count: int = 5) -> list[str]:
    """Create colored test images."""
    images = []
    colors = ["red", "green", "blue", "yellow", "purple", "cyan", "orange", "pink", "white"]

    for i in range(count):
        path = os.path.join(temp_dir, f"image_{i}.png")
        color = colors[i % len(colors)]
        cmd: list[str] = ["ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c={color}:s=1920x1080:d=1", "-frames:v", "1", path]
        subprocess.run(cmd, capture_output=True)
        images.append(path)
    return images


@pytest.fixture
def sample_image_video(temp_dir: str) -> str:
    """Create a video from a single static image (good for Ken Burns testing)."""
    # First create an image
    image_path = os.path.join(temp_dir, "static_image.png")
    cmd: list[str] = ["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc=duration=1:size=1920x1080:rate=1", "-frames:v", "1", image_path]
    subprocess.run(cmd, capture_output=True)

    # Then create a 5-second video from it
    video_path = os.path.join(temp_dir, "image_video.mp4")
    cmd = ["ffmpeg", "-y", "-loop", "1", "-i", image_path, "-t", "5", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", video_path]
    subprocess.run(cmd, capture_output=True)
    return video_path


@requires_ffmpeg
class TestKenBurns:
    """Tests for Ken Burns effect - must fail before implementation."""

    def test_ken_burns_zoom_in(self, sample_image_video: str, temp_dir: str) -> None:
        """Ken Burns should zoom from 1.0 to 1.5."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_image_video)
        pipeline.add_ken_burns(zoom_start=1.0, zoom_end=1.5, pan_direction="center")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_ken_burns_zoom_out(self, sample_image_video: str, temp_dir: str) -> None:
        """Ken Burns should zoom out from 1.5 to 1.0."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_image_video)
        pipeline.add_ken_burns(zoom_start=1.5, zoom_end=1.0, pan_direction="center")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_ken_burns_pan_left_to_right(self, sample_image_video: str, temp_dir: str) -> None:
        """Ken Burns should pan from left to right."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_image_video)
        pipeline.add_ken_burns(zoom_start=1.2, zoom_end=1.2, pan_direction="left_to_right")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_ken_burns_pan_right_to_left(self, sample_image_video: str, temp_dir: str) -> None:
        """Ken Burns should pan from right to left."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_image_video)
        pipeline.add_ken_burns(zoom_start=1.2, zoom_end=1.2, pan_direction="right_to_left")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_ken_burns_pan_top_to_bottom(self, sample_image_video: str, temp_dir: str) -> None:
        """Ken Burns should pan from top to bottom."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_image_video)
        pipeline.add_ken_burns(zoom_start=1.3, zoom_end=1.3, pan_direction="top_to_bottom")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_ken_burns_combined_zoom_and_pan(self, sample_image_video: str, temp_dir: str) -> None:
        """Ken Burns with both zoom and pan."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_image_video)
        pipeline.add_ken_burns(zoom_start=1.0, zoom_end=1.3, pan_direction="left_to_right")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@requires_ffmpeg
class TestSlideshow:
    """Tests for slideshow creation - must fail before implementation."""

    def test_create_slideshow_basic(self, temp_dir: str) -> None:
        """Create slideshow from images."""
        from video_editor.pipeline import create_slideshow

        images = create_test_images(temp_dir, count=5)

        output = create_slideshow(images=images, duration_per_image=2.0, output_path=os.path.join(temp_dir, "slideshow.mp4"))

        assert os.path.exists(output)
        duration = get_video_duration(output)
        assert duration is not None
        assert abs(duration - 10.0) < 1.0  # 5 images * 2s

    def test_create_slideshow_with_transitions(self, temp_dir: str) -> None:
        """Slideshow with fade transitions."""
        from video_editor.pipeline import create_slideshow

        images = create_test_images(temp_dir, count=3)

        output = create_slideshow(
            images=images, duration_per_image=3.0, transition="fade", transition_duration=0.5, output_path=os.path.join(temp_dir, "slideshow.mp4")
        )

        assert os.path.exists(output)

    def test_create_slideshow_with_dissolve(self, temp_dir: str) -> None:
        """Slideshow with dissolve transitions."""
        from video_editor.pipeline import create_slideshow

        images = create_test_images(temp_dir, count=3)

        output = create_slideshow(
            images=images, duration_per_image=2.0, transition="dissolve", transition_duration=1.0, output_path=os.path.join(temp_dir, "slideshow.mp4")
        )

        assert os.path.exists(output)

    def test_create_slideshow_with_ken_burns(self, temp_dir: str) -> None:
        """Slideshow with Ken Burns on each image."""
        from video_editor.pipeline import create_slideshow

        images = create_test_images(temp_dir, count=3)

        output = create_slideshow(images=images, duration_per_image=3.0, ken_burns=True, output_path=os.path.join(temp_dir, "slideshow.mp4"))

        assert os.path.exists(output)

    def test_create_slideshow_with_audio(self, temp_dir: str, sample_audio: str) -> None:
        """Slideshow with background audio."""
        from video_editor.pipeline import create_slideshow

        images = create_test_images(temp_dir, count=3)

        output = create_slideshow(images=images, duration_per_image=2.0, audio_path=sample_audio, output_path=os.path.join(temp_dir, "slideshow.mp4"))

        assert os.path.exists(output)

        # Should have audio track
        cmd: list[str] = ["ffprobe", "-v", "error", "-show_streams", "-select_streams", "a", "-of", "json", output]
        result = subprocess.run(cmd, capture_output=True)
        data = json.loads(result.stdout.decode())
        assert len(data.get("streams", [])) > 0

    def test_create_slideshow_custom_resolution(self, temp_dir: str) -> None:
        """Slideshow with custom output resolution."""
        from video_editor.pipeline import create_slideshow

        images = create_test_images(temp_dir, count=2)

        output = create_slideshow(images=images, duration_per_image=2.0, resolution=(1280, 720), output_path=os.path.join(temp_dir, "slideshow.mp4"))

        assert os.path.exists(output)

    def test_create_slideshow_single_image(self, temp_dir: str) -> None:
        """Slideshow with single image."""
        from video_editor.pipeline import create_slideshow

        images = create_test_images(temp_dir, count=1)

        output = create_slideshow(images=images, duration_per_image=5.0, output_path=os.path.join(temp_dir, "slideshow.mp4"))

        assert os.path.exists(output)
        duration = get_video_duration(output)
        assert duration is not None
        assert abs(duration - 5.0) < 0.5
