"""
Tests for visual effects (vignette, film grain, etc).

TDD: These tests must FAIL before implementation.
Run with: uv run pytest tests/test_visual_effects.py -v
"""

from __future__ import annotations

import os


from tests.conftest import requires_ffmpeg


@requires_ffmpeg
class TestVignette:
    """Tests for vignette effect - must fail before implementation."""

    def test_add_vignette_basic(self, sample_video: str, temp_dir: str) -> None:
        """Vignette should darken edges."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_vignette(intensity=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_vignette_light(self, sample_video: str, temp_dir: str) -> None:
        """Light vignette effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_vignette(intensity=0.3)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_vignette_strong(self, sample_video: str, temp_dir: str) -> None:
        """Strong vignette effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_vignette(intensity=0.8)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_vignette_time_limited(self, sample_video: str, temp_dir: str) -> None:
        """Vignette only during time range."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_vignette(intensity=0.5, start_time=1.0, end_time=3.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@requires_ffmpeg
class TestFilmGrain:
    """Tests for film grain effect - must fail before implementation."""

    def test_add_film_grain_basic(self, sample_video: str, temp_dir: str) -> None:
        """Film grain effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_film_grain(intensity=0.3)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_film_grain_light(self, sample_video: str, temp_dir: str) -> None:
        """Light film grain."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_film_grain(intensity=0.1)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_film_grain_heavy(self, sample_video: str, temp_dir: str) -> None:
        """Heavy film grain for vintage look."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_film_grain(intensity=0.6)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@requires_ffmpeg
class TestColorEffects:
    """Tests for color effects - must fail before implementation."""

    def test_add_sepia(self, sample_video: str, temp_dir: str) -> None:
        """Sepia tone effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_sepia()
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_sepia_with_intensity(self, sample_video: str, temp_dir: str) -> None:
        """Sepia with custom intensity."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_sepia(intensity=0.7)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_black_and_white(self, sample_video: str, temp_dir: str) -> None:
        """Black and white effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_black_and_white()
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_negative(self, sample_video: str, temp_dir: str) -> None:
        """Negative/invert colors effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_negative()
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_vintage(self, sample_video: str, temp_dir: str) -> None:
        """Vintage/retro color effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_vintage()
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_cool_tint(self, sample_video: str, temp_dir: str) -> None:
        """Cool/blue tint effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_color_tint(tint="cool")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_warm_tint(self, sample_video: str, temp_dir: str) -> None:
        """Warm/orange tint effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_color_tint(tint="warm")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@requires_ffmpeg
class TestCinematicEffects:
    """Tests for cinematic effects - must fail before implementation."""

    def test_add_letterbox_bars(self, sample_video: str, temp_dir: str) -> None:
        """Add cinematic letterbox bars."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_letterbox_bars(bar_height=50)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_scan_lines(self, sample_video: str, temp_dir: str) -> None:
        """Add CRT scan lines effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_scan_lines(intensity=0.3)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_vhs_effect(self, sample_video: str, temp_dir: str) -> None:
        """Add VHS/retro video effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_vhs_effect()
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_combine_cinematic_effects(self, sample_video: str, temp_dir: str) -> None:
        """Combine multiple effects for cinematic look."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_vignette(intensity=0.4)
        pipeline.add_film_grain(intensity=0.2)
        pipeline.add_letterbox_bars(bar_height=30)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
