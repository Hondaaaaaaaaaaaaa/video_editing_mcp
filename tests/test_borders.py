"""
Tests for borders and padding.

TDD: These tests must FAIL before implementation.
Run with: uv run pytest tests/test_borders.py -v
"""

from __future__ import annotations

import os


from conftest import requires_ffmpeg, get_video_resolution


@requires_ffmpeg
class TestPadding:
    """Tests for padding/borders - must fail before implementation."""

    def test_add_padding_all_sides(self, sample_video: str, temp_dir: str) -> None:
        """Add equal padding to all sides."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_padding(top=20, right=20, bottom=20, left=20, color="black")
        output = pipeline.render(output_dir=temp_dir)

        # Resolution should increase by padding
        resolution = get_video_resolution(output)
        assert resolution == "680x520"  # 640+40 x 480+40

    def test_add_padding_asymmetric(self, sample_video: str, temp_dir: str) -> None:
        """Add different padding to each side."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_padding(top=10, right=30, bottom=50, left=20, color="black")
        output = pipeline.render(output_dir=temp_dir)

        resolution = get_video_resolution(output)
        # 640 + 30 + 20 = 690
        # 480 + 10 + 50 = 540
        assert resolution == "690x540"

    def test_add_padding_custom_color(self, sample_video: str, temp_dir: str) -> None:
        """Padding with custom color."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_padding(
            top=50,
            right=50,
            bottom=50,
            left=50,
            color="#FF0000",  # Red
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_padding_white(self, sample_video: str, temp_dir: str) -> None:
        """Padding with white color."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_padding(top=30, right=30, bottom=30, left=30, color="white")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_padding_time_limited(self, sample_video: str, temp_dir: str) -> None:
        """Padding only during specific time range."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_padding(top=20, right=20, bottom=20, left=20, color="blue", start_time=1.0, end_time=3.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@requires_ffmpeg
class TestLetterbox:
    """Tests for letterbox/pillarbox - must fail before implementation."""

    def test_letterbox_to_widescreen(self, sample_video: str, temp_dir: str) -> None:
        """Letterbox 4:3 to 16:9."""
        from video_editor.pipeline import VideoPipeline

        # sample_video is 640x480 (4:3)
        pipeline = VideoPipeline(sample_video)
        pipeline.add_letterbox(aspect_ratio="16:9", color="black")
        output = pipeline.render(output_dir=temp_dir)

        # Should now be 16:9
        resolution = get_video_resolution(output)
        assert resolution is not None
        w, h = map(int, resolution.split("x"))
        ratio = w / h
        assert abs(ratio - 16 / 9) < 0.1

    def test_letterbox_to_ultrawide(self, sample_video: str, temp_dir: str) -> None:
        """Letterbox to 21:9 ultrawide."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_letterbox(aspect_ratio="21:9", color="black")
        output = pipeline.render(output_dir=temp_dir)

        resolution = get_video_resolution(output)
        assert resolution is not None
        w, h = map(int, resolution.split("x"))
        ratio = w / h
        assert abs(ratio - 21 / 9) < 0.15

    def test_pillarbox_to_vertical(self, sample_video: str, temp_dir: str) -> None:
        """Pillarbox 4:3 to 9:16 (vertical)."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_letterbox(aspect_ratio="9:16", color="white")
        output = pipeline.render(output_dir=temp_dir)

        resolution = get_video_resolution(output)
        assert resolution is not None
        w, h = map(int, resolution.split("x"))
        ratio = w / h
        assert abs(ratio - 9 / 16) < 0.1

    def test_letterbox_to_square(self, sample_video: str, temp_dir: str) -> None:
        """Letterbox to 1:1 square."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_letterbox(aspect_ratio="1:1", color="black")
        output = pipeline.render(output_dir=temp_dir)

        resolution = get_video_resolution(output)
        assert resolution is not None
        w, h = map(int, resolution.split("x"))
        assert abs(w - h) < 2  # Should be square

    def test_letterbox_custom_color(self, sample_video: str, temp_dir: str) -> None:
        """Letterbox with custom bar color."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_letterbox(
            aspect_ratio="16:9",
            color="#333333",  # Dark gray
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_letterbox_blur_bars(self, sample_video: str, temp_dir: str) -> None:
        """Letterbox with blurred video in bars instead of solid color."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_letterbox(
            aspect_ratio="9:16",
            blur_bars=True,  # Use blurred video as background
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@requires_ffmpeg
class TestBorder:
    """Tests for decorative borders - must fail before implementation."""

    def test_add_border_outline(self, sample_video: str, temp_dir: str) -> None:
        """Add a simple outline border."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_border(width=5, color="white")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_border_thick(self, sample_video: str, temp_dir: str) -> None:
        """Add a thick decorative border."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_border(width=20, color="gold")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
