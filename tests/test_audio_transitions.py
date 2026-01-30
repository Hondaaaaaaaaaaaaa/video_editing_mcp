"""
Tests for audio transition features (fade in, fade out, crossfade).

Run with: uv run pytest tests/test_audio_transitions.py -v
"""

from __future__ import annotations

import os


from conftest import requires_ffmpeg, get_video_duration


@requires_ffmpeg
class TestAudioFadeIn:
    """Tests for add_audio_fade_in method."""

    def test_fade_in_basic(self, sample_video: str, temp_dir: str) -> None:
        """Add a basic fade in effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_fade_in(duration=1.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_fade_in_with_start_time(self, sample_video: str, temp_dir: str) -> None:
        """Add fade in starting at a specific time."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_fade_in(duration=1.0, start_time=2.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_fade_in_with_curve(self, sample_video: str, temp_dir: str) -> None:
        """Add fade in with non-linear curve."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_fade_in(duration=2.0, curve="qsin")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_fade_in_long_duration(self, sample_video: str, temp_dir: str) -> None:
        """Add a longer fade in effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_fade_in(duration=3.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_fade_in_method_chaining(self, sample_video: str) -> None:
        """Method should return self for chaining."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        result = pipeline.add_audio_fade_in(duration=1.0)

        assert result is pipeline

    def test_fade_in_operation_tracked(self, sample_video: str) -> None:
        """Fade in operation should be tracked."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_fade_in(duration=1.5, start_time=0.5, curve="log")

        ops = [op for op in pipeline._operations if op["type"] == "audio_fade_in"]
        assert len(ops) == 1
        assert ops[0]["duration"] == 1.5
        assert ops[0]["start_time"] == 0.5
        assert ops[0]["curve"] == "log"


@requires_ffmpeg
class TestAudioFadeOut:
    """Tests for add_audio_fade_out method."""

    def test_fade_out_basic(self, sample_video: str, temp_dir: str) -> None:
        """Add a basic fade out effect at end of video."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_fade_out(duration=1.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_fade_out_with_end_time(self, sample_video: str, temp_dir: str) -> None:
        """Add fade out ending at a specific time."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_fade_out(duration=1.0, end_time=4.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_fade_out_with_curve(self, sample_video: str, temp_dir: str) -> None:
        """Add fade out with non-linear curve."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_fade_out(duration=2.0, curve="exp")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_fade_out_method_chaining(self, sample_video: str) -> None:
        """Method should return self for chaining."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        result = pipeline.add_audio_fade_out(duration=1.0)

        assert result is pipeline

    def test_fade_out_operation_tracked(self, sample_video: str) -> None:
        """Fade out operation should be tracked."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_fade_out(duration=2.0, end_time=5.0, curve="hsin")

        ops = [op for op in pipeline._operations if op["type"] == "audio_fade_out"]
        assert len(ops) == 1
        assert ops[0]["duration"] == 2.0
        assert ops[0]["end_time"] == 5.0
        assert ops[0]["curve"] == "hsin"


@requires_ffmpeg
class TestAudioCrossfade:
    """Tests for add_audio_crossfade method."""

    def test_crossfade_basic(self, sample_video: str, temp_dir: str) -> None:
        """Add a basic crossfade effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_crossfade(at_time=2.5, duration=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_crossfade_longer_duration(self, sample_video: str, temp_dir: str) -> None:
        """Add a crossfade with longer duration."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_crossfade(at_time=2.5, duration=1.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_crossfade_with_curves(self, sample_video: str, temp_dir: str) -> None:
        """Add a crossfade with custom curves."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_crossfade(
            at_time=2.5,
            duration=0.5,
            curve1="qsin",
            curve2="qsin",
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_crossfade_method_chaining(self, sample_video: str) -> None:
        """Method should return self for chaining."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        result = pipeline.add_audio_crossfade(at_time=2.5, duration=0.5)

        assert result is pipeline

    def test_crossfade_operation_tracked(self, sample_video: str) -> None:
        """Crossfade operation should be tracked."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_crossfade(
            at_time=3.0,
            duration=1.0,
            curve1="exp",
            curve2="log",
        )

        ops = [op for op in pipeline._operations if op["type"] == "audio_crossfade"]
        assert len(ops) == 1
        assert ops[0]["at_time"] == 3.0
        assert ops[0]["duration"] == 1.0
        assert ops[0]["curve1"] == "exp"
        assert ops[0]["curve2"] == "log"


@requires_ffmpeg
class TestCombinedFades:
    """Tests for combining multiple fade effects."""

    def test_fade_in_and_fade_out(self, sample_video: str, temp_dir: str) -> None:
        """Add both fade in and fade out to same video."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_fade_in(duration=1.0)
        pipeline.add_audio_fade_out(duration=1.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_fade_with_trim(self, sample_video: str, temp_dir: str) -> None:
        """Add fades to trimmed video."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.trim(1.0, 4.0)
        pipeline.add_audio_fade_in(duration=0.5)
        pipeline.add_audio_fade_out(duration=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        # Should be approximately 3 seconds
        duration = get_video_duration(output)
        assert abs(duration - 3.0) < 0.5

    def test_fade_with_volume_change(self, sample_video: str, temp_dir: str) -> None:
        """Combine fades with volume adjustment."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.change_volume(0.8)
        pipeline.add_audio_fade_in(duration=1.0)
        pipeline.add_audio_fade_out(duration=1.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_multiple_crossfades(self, sample_video: str, temp_dir: str) -> None:
        """Add multiple crossfades at different points."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_crossfade(at_time=1.5, duration=0.3)
        pipeline.add_audio_crossfade(at_time=3.5, duration=0.3)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
