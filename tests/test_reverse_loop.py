"""
Tests for reverse playback and loop/repeat.

TDD: These tests must FAIL before implementation.
Run with: uv run pytest tests/test_reverse_loop.py -v
"""

from __future__ import annotations

import json
import os
import subprocess


from conftest import requires_ffmpeg, get_video_duration


@requires_ffmpeg
class TestReverse:
    """Tests for reverse playback - must fail before implementation."""

    def test_reverse_entire_video(self, sample_video: str, temp_dir: str) -> None:
        """Reverse should play video backwards."""
        from video_editor.pipeline import VideoPipeline

        original_duration = get_video_duration(sample_video)

        pipeline = VideoPipeline(sample_video)
        pipeline.add_reverse()
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        # Duration should be same
        output_duration = get_video_duration(output)
        assert original_duration is not None
        assert output_duration is not None
        assert abs(original_duration - output_duration) < 0.5

    def test_reverse_segment(self, sample_video: str, temp_dir: str) -> None:
        """Reverse only a segment of video."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_reverse(start_time=1.0, end_time=3.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        # Total duration should be unchanged
        original_duration = get_video_duration(sample_video)
        output_duration = get_video_duration(output)
        assert original_duration is not None
        assert output_duration is not None
        assert abs(original_duration - output_duration) < 0.5

    def test_reverse_with_audio(self, sample_video: str, temp_dir: str) -> None:
        """Reverse should also reverse audio."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_reverse()
        output = pipeline.render(output_dir=temp_dir)

        # Verify audio exists
        cmd: list[str] = ["ffprobe", "-v", "error", "-show_streams", "-select_streams", "a", "-of", "json", output]
        result = subprocess.run(cmd, capture_output=True)
        data = json.loads(result.stdout.decode())
        assert len(data.get("streams", [])) > 0

    def test_reverse_video_only(self, sample_video: str, temp_dir: str) -> None:
        """Reverse video but keep audio forward."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_reverse(reverse_audio=False)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@requires_ffmpeg
class TestLoop:
    """Tests for loop/repeat - must fail before implementation."""

    def test_loop_entire_video(self, sample_video: str, temp_dir: str) -> None:
        """Loop entire video 3 times."""
        from video_editor.pipeline import VideoPipeline

        original_duration = get_video_duration(sample_video)
        assert original_duration is not None

        pipeline = VideoPipeline(sample_video)
        pipeline.add_loop(count=3)
        output = pipeline.render(output_dir=temp_dir)

        new_duration = get_video_duration(output)
        assert new_duration is not None
        assert abs(new_duration - original_duration * 3) < 1.0

    def test_loop_twice(self, sample_video: str, temp_dir: str) -> None:
        """Loop entire video 2 times."""
        from video_editor.pipeline import VideoPipeline

        original_duration = get_video_duration(sample_video)
        assert original_duration is not None

        pipeline = VideoPipeline(sample_video)
        pipeline.add_loop(count=2)
        output = pipeline.render(output_dir=temp_dir)

        new_duration = get_video_duration(output)
        assert new_duration is not None
        assert abs(new_duration - original_duration * 2) < 1.0

    def test_loop_segment(self, sample_video: str, temp_dir: str) -> None:
        """Loop only a segment."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_loop(count=3, segment_start=1.0, segment_end=2.0)
        output = pipeline.render(output_dir=temp_dir)

        # Original 5s, segment 1s repeated 3 times = 5 + 2 = 7s
        duration = get_video_duration(output)
        assert duration is not None
        assert abs(duration - 7.0) < 1.0

    def test_loop_segment_in_place(self, sample_video: str, temp_dir: str) -> None:
        """Loop segment in place (replace segment with repeated version)."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_loop(
            count=2,
            segment_start=2.0,
            segment_end=3.0,
            in_place=True,  # Replace segment, don't append
        )
        output = pipeline.render(output_dir=temp_dir)

        # Original 5s, 1s segment becomes 2s = 6s total
        duration = get_video_duration(output)
        assert duration is not None
        assert abs(duration - 6.0) < 1.0

    def test_loop_with_crossfade(self, sample_video: str, temp_dir: str) -> None:
        """Loop with crossfade between repetitions."""
        from video_editor.pipeline import VideoPipeline

        original_duration = get_video_duration(sample_video)
        assert original_duration is not None

        pipeline = VideoPipeline(sample_video)
        pipeline.add_loop(count=2, crossfade=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        # Duration should be less than 2x due to crossfade overlap
        new_duration = get_video_duration(output)
        assert new_duration is not None
        assert new_duration < original_duration * 2

    def test_loop_preserves_audio(self, sample_video: str, temp_dir: str) -> None:
        """Loop should include audio in all repetitions."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_loop(count=2)
        output = pipeline.render(output_dir=temp_dir)

        # Verify audio exists
        cmd: list[str] = ["ffprobe", "-v", "error", "-show_streams", "-select_streams", "a", "-of", "json", output]
        result = subprocess.run(cmd, capture_output=True)
        data = json.loads(result.stdout.decode())
        assert len(data.get("streams", [])) > 0


@requires_ffmpeg
class TestBoomerang:
    """Tests for boomerang effect (forward then reverse) - must fail before implementation."""

    def test_boomerang_effect(self, sample_video: str, temp_dir: str) -> None:
        """Boomerang: play forward then backward."""
        from video_editor.pipeline import VideoPipeline

        original_duration = get_video_duration(sample_video)
        assert original_duration is not None

        pipeline = VideoPipeline(sample_video)
        pipeline.add_boomerang()
        output = pipeline.render(output_dir=temp_dir)

        # Duration should double
        new_duration = get_video_duration(output)
        assert new_duration is not None
        assert abs(new_duration - original_duration * 2) < 1.0

    def test_boomerang_segment(self, sample_video: str, temp_dir: str) -> None:
        """Boomerang only a segment."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_boomerang(segment_start=1.0, segment_end=2.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
