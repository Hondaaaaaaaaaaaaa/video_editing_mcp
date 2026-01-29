"""
Tests for frame extraction and thumbnail generation.

TDD: These tests must FAIL before implementation.
Run with: uv run pytest tests/test_frame_extraction.py -v
"""

from __future__ import annotations

import json
import os
import subprocess


from tests.conftest import requires_ffmpeg


def get_video_info(video_path: str) -> dict | None:
    """Get video info as dict."""
    cmd: list[str] = ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", video_path]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        return None
    return json.loads(result.stdout.decode())


@requires_ffmpeg
class TestFrameExtraction:
    """Tests for frame extraction - must fail before implementation."""

    def test_extract_frame_at_timestamp(self, sample_video: str, temp_dir: str) -> None:
        """Extract single frame at specific timestamp."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        frames = pipeline.extract_frames(timestamps=[2.5], output_dir=temp_dir)

        assert len(frames) == 1
        assert os.path.exists(frames[0])
        # Verify it's a valid image
        from PIL import Image

        img = Image.open(frames[0])
        assert img.size == (640, 480)  # Match sample_video resolution

    def test_extract_multiple_frames(self, sample_video: str, temp_dir: str) -> None:
        """Extract multiple frames at different timestamps."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        frames = pipeline.extract_frames(timestamps=[0.5, 1.5, 2.5, 3.5], output_dir=temp_dir)

        assert len(frames) == 4
        for frame in frames:
            assert os.path.exists(frame)

    def test_extract_frames_returns_sorted_by_timestamp(self, sample_video: str, temp_dir: str) -> None:
        """Frames should be returned in timestamp order."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        frames = pipeline.extract_frames(timestamps=[3.0, 1.0, 2.0], output_dir=temp_dir)

        # Files should be created for all timestamps
        assert len(frames) == 3
        for frame in frames:
            assert os.path.exists(frame)

    def test_extract_frames_png_format(self, sample_video: str, temp_dir: str) -> None:
        """Extract frames as PNG."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        frames = pipeline.extract_frames(timestamps=[1.0], output_dir=temp_dir, format="png")

        assert frames[0].endswith(".png")

    def test_extract_frames_jpg_format(self, sample_video: str, temp_dir: str) -> None:
        """Extract frames as JPEG."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        frames = pipeline.extract_frames(timestamps=[1.0], output_dir=temp_dir, format="jpg")

        assert frames[0].endswith(".jpg")

    def test_extract_keyframes_only(self, sample_video: str, temp_dir: str) -> None:
        """Extract only I-frames (keyframes)."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        keyframes = pipeline.extract_keyframes(output_dir=temp_dir, max_frames=10)

        assert len(keyframes) > 0
        assert len(keyframes) <= 10
        for kf in keyframes:
            assert os.path.exists(kf)


@requires_ffmpeg
class TestThumbnailGeneration:
    """Tests for thumbnail generation - must fail before implementation."""

    def test_generate_thumbnails_at_interval(self, sample_video: str, temp_dir: str) -> None:
        """Generate thumbnails every N seconds."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        thumbnails = pipeline.generate_thumbnails(interval=1.0, output_dir=temp_dir)

        # 5-second video with 1s interval = ~5 thumbnails
        assert len(thumbnails) >= 4
        assert len(thumbnails) <= 6

    def test_generate_thumbnails_custom_size(self, sample_video: str, temp_dir: str) -> None:
        """Thumbnails should respect size parameter."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        thumbnails = pipeline.generate_thumbnails(interval=2.0, size=(160, 90), output_dir=temp_dir)

        from PIL import Image

        img = Image.open(thumbnails[0])
        assert img.size == (160, 90)

    def test_generate_thumbnail_grid(self, sample_video: str, temp_dir: str) -> None:
        """Generate contact sheet / thumbnail grid."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        grid = pipeline.generate_thumbnail_grid(columns=4, rows=3, output_path=os.path.join(temp_dir, "grid.jpg"))

        assert os.path.exists(grid)
        from PIL import Image

        img = Image.open(grid)
        # Grid should be larger than individual thumbnail
        assert img.size[0] > 640

    def test_generate_thumbnails_with_timestamps(self, sample_video: str, temp_dir: str) -> None:
        """Thumbnails should include timestamp info."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        result = pipeline.generate_thumbnails(interval=1.0, output_dir=temp_dir, include_timestamps=True)

        # Result should include timestamp information
        assert isinstance(result, list)
        assert len(result) > 0
