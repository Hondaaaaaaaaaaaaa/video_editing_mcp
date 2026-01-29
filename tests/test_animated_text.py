"""
Tests for animated text effects.

TDD: These tests must FAIL before implementation.
Run with: uv run pytest tests/test_animated_text.py -v
"""

from __future__ import annotations

import os


from tests.conftest import requires_ffmpeg


@requires_ffmpeg
class TestAnimatedText:
    """Tests for animated text - must fail before implementation."""

    def test_text_fade_in(self, sample_video: str, temp_dir: str) -> None:
        """Text should fade in."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(text="Hello World", animation="fade_in", duration=1.0, start_time=1.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_text_fade_out(self, sample_video: str, temp_dir: str) -> None:
        """Text should fade out."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(text="Goodbye", animation="fade_out", duration=1.0, start_time=1.0, end_time=3.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_text_fade_in_out(self, sample_video: str, temp_dir: str) -> None:
        """Text should fade in then out."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(
            text="Fade In/Out",
            animation="fade_in_out",
            duration=0.5,  # Duration of each fade
            start_time=1.0,
            end_time=4.0,
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_text_slide_in_left(self, sample_video: str, temp_dir: str) -> None:
        """Text should slide in from left."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(text="Sliding Text", animation="slide_in_left", duration=0.5, start_time=1.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_text_slide_in_right(self, sample_video: str, temp_dir: str) -> None:
        """Text should slide in from right."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(text="From Right", animation="slide_in_right", duration=0.5, start_time=1.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_text_slide_in_top(self, sample_video: str, temp_dir: str) -> None:
        """Text should slide in from top."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(text="From Top", animation="slide_in_top", duration=0.5, start_time=1.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_text_slide_in_bottom(self, sample_video: str, temp_dir: str) -> None:
        """Text should slide in from bottom."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(text="From Bottom", animation="slide_in_bottom", duration=0.5, start_time=1.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_text_typewriter(self, sample_video: str, temp_dir: str) -> None:
        """Text should appear letter by letter."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(text="Typewriter Effect", animation="typewriter", duration=2.0, start_time=1.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_text_zoom_in(self, sample_video: str, temp_dir: str) -> None:
        """Text should zoom in."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(text="ZOOM", animation="zoom_in", duration=0.5, start_time=1.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_text_zoom_out(self, sample_video: str, temp_dir: str) -> None:
        """Text should zoom out."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(text="ZOOM OUT", animation="zoom_out", duration=0.5, start_time=1.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_text_bounce(self, sample_video: str, temp_dir: str) -> None:
        """Text should bounce in."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(text="Bounce!", animation="bounce", duration=0.5, start_time=1.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@requires_ffmpeg
class TestAnimatedTextStyling:
    """Tests for animated text styling - must fail before implementation."""

    def test_animated_text_with_font_size(self, sample_video: str, temp_dir: str) -> None:
        """Animated text should support font size."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(text="Large Text", animation="fade_in", duration=0.5, start_time=1.0, font_size=72)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_animated_text_with_color(self, sample_video: str, temp_dir: str) -> None:
        """Animated text should support custom color."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(text="Red Text", animation="fade_in", duration=0.5, start_time=1.0, color="red")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_animated_text_with_position(self, sample_video: str, temp_dir: str) -> None:
        """Animated text should support custom position."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(text="Positioned", animation="fade_in", duration=0.5, start_time=1.0, position="top-center")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_animated_text_with_outline(self, sample_video: str, temp_dir: str) -> None:
        """Animated text should support outline."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(text="Outlined", animation="fade_in", duration=0.5, start_time=1.0, outline_color="black", outline_width=2)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_multiple_animated_texts(self, sample_video: str, temp_dir: str) -> None:
        """Multiple animated texts should work together."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(text="First", animation="fade_in", duration=0.5, start_time=0.5, end_time=2.0)
        pipeline.add_animated_text(text="Second", animation="slide_in_left", duration=0.5, start_time=2.5, end_time=4.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
