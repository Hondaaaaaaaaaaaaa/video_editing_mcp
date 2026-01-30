"""
Tests for targeted audio segment modification features.

Run with: uv run pytest tests/test_audio_segments.py -v
"""

from __future__ import annotations

import os

import pytest

from conftest import requires_ffmpeg


@requires_ffmpeg
class TestModifyAudioSegment:
    """Tests for modify_audio_segment method."""

    def test_modify_segment_volume(self, sample_video: str, temp_dir: str) -> None:
        """Modify volume of a specific segment."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.modify_audio_segment(start_time=1.0, end_time=3.0, volume=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_modify_segment_volume_increase(
        self, sample_video: str, temp_dir: str
    ) -> None:
        """Increase volume of a specific segment."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.modify_audio_segment(start_time=2.0, end_time=4.0, volume=1.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_modify_segment_pitch(self, sample_video: str, temp_dir: str) -> None:
        """Modify pitch of a specific segment."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.modify_audio_segment(start_time=1.0, end_time=3.0, pitch=2)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_modify_segment_speed(self, sample_video: str, temp_dir: str) -> None:
        """Modify speed of a specific segment."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.modify_audio_segment(start_time=1.0, end_time=3.0, speed=1.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_modify_segment_eq(self, sample_video: str, temp_dir: str) -> None:
        """Modify EQ of a specific segment."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.modify_audio_segment(
            start_time=1.0,
            end_time=3.0,
            eq={"bass": 1.5, "mid": 0.8, "treble": 1.2},
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_modify_segment_combined(self, sample_video: str, temp_dir: str) -> None:
        """Modify multiple parameters of a segment."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.modify_audio_segment(
            start_time=1.0,
            end_time=3.0,
            volume=0.8,
            pitch=1,
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_modify_segment_method_chaining(self, sample_video: str) -> None:
        """Method should return self for chaining."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        result = pipeline.modify_audio_segment(
            start_time=1.0, end_time=3.0, volume=0.5
        )

        assert result is pipeline

    def test_modify_segment_operation_tracked(self, sample_video: str) -> None:
        """Modify segment operation should be tracked."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.modify_audio_segment(
            start_time=1.0,
            end_time=3.0,
            volume=0.5,
            pitch=2,
            eq={"bass": 1.2},
        )

        ops = [
            op for op in pipeline._operations if op["type"] == "modify_audio_segment"
        ]
        assert len(ops) == 1
        assert ops[0]["start_time"] == 1.0
        assert ops[0]["end_time"] == 3.0
        assert ops[0]["volume"] == 0.5
        assert ops[0]["pitch"] == 2
        assert ops[0]["eq"] == {"bass": 1.2}


@requires_ffmpeg
class TestChangePitch:
    """Tests for change_pitch method."""

    def test_change_pitch_whole_video(self, sample_video: str, temp_dir: str) -> None:
        """Change pitch of entire video."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.change_pitch(semitones=2)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_change_pitch_lower(self, sample_video: str, temp_dir: str) -> None:
        """Lower pitch of entire video."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.change_pitch(semitones=-3)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_change_pitch_segment(self, sample_video: str, temp_dir: str) -> None:
        """Change pitch of a specific segment."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.change_pitch(semitones=4, start_time=1.0, end_time=3.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_change_pitch_method_chaining(self, sample_video: str) -> None:
        """Method should return self for chaining."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        result = pipeline.change_pitch(semitones=2)

        assert result is pipeline

    def test_change_pitch_operation_tracked(self, sample_video: str) -> None:
        """Change pitch operation should be tracked."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.change_pitch(semitones=5, start_time=0.5, end_time=2.5)

        ops = [op for op in pipeline._operations if op["type"] == "change_pitch"]
        assert len(ops) == 1
        assert ops[0]["semitones"] == 5
        assert ops[0]["start_time"] == 0.5
        assert ops[0]["end_time"] == 2.5


@requires_ffmpeg
class TestChangeAudioSpeed:
    """Tests for change_audio_speed method."""

    def test_change_speed_whole_video(self, sample_video: str, temp_dir: str) -> None:
        """Change audio speed of entire video."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.change_audio_speed(factor=1.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_change_speed_slow_down(self, sample_video: str, temp_dir: str) -> None:
        """Slow down audio of entire video."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.change_audio_speed(factor=0.75)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_change_speed_segment(self, sample_video: str, temp_dir: str) -> None:
        """Change audio speed of a specific segment."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.change_audio_speed(factor=1.5, start_time=1.0, end_time=3.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_change_speed_invalid(self, sample_video: str) -> None:
        """Should raise error for invalid speed factor."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)

        with pytest.raises(ValueError):
            pipeline.change_audio_speed(factor=0)

        with pytest.raises(ValueError):
            pipeline.change_audio_speed(factor=-1)

    def test_change_speed_method_chaining(self, sample_video: str) -> None:
        """Method should return self for chaining."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        result = pipeline.change_audio_speed(factor=1.25)

        assert result is pipeline

    def test_change_speed_operation_tracked(self, sample_video: str) -> None:
        """Change speed operation should be tracked."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.change_audio_speed(factor=2.0, start_time=1.0, end_time=4.0)

        ops = [op for op in pipeline._operations if op["type"] == "change_audio_speed"]
        assert len(ops) == 1
        assert ops[0]["factor"] == 2.0
        assert ops[0]["start_time"] == 1.0
        assert ops[0]["end_time"] == 4.0


@requires_ffmpeg
class TestCombinedSegmentOperations:
    """Tests for combining segment modification operations."""

    def test_multiple_segment_modifications(
        self, sample_video: str, temp_dir: str
    ) -> None:
        """Apply different modifications to different segments."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.modify_audio_segment(start_time=0, end_time=2, volume=0.5)
        pipeline.modify_audio_segment(start_time=2, end_time=4, volume=1.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_segment_with_fades(self, sample_video: str, temp_dir: str) -> None:
        """Combine segment modification with fades."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.modify_audio_segment(start_time=1.0, end_time=4.0, volume=0.5)
        pipeline.add_audio_fade_in(duration=0.5)
        pipeline.add_audio_fade_out(duration=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_pitch_and_speed_together(self, sample_video: str, temp_dir: str) -> None:
        """Apply both pitch and speed changes."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.change_pitch(semitones=2)
        pipeline.change_audio_speed(factor=1.25)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
