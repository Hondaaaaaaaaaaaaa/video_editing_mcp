"""
Tests for Picture-in-Picture and split screen layouts.

TDD: These tests must FAIL before implementation.
Run with: uv run pytest tests/test_pip_splitscreen.py -v
"""

from __future__ import annotations

import os
import subprocess


from tests.conftest import requires_ffmpeg, get_video_resolution


@requires_ffmpeg
class TestPictureInPicture:
    """Tests for PiP - must fail before implementation."""

    def test_pip_top_left(self, sample_video: str, second_video: str, temp_dir: str) -> None:
        """PiP in top-left corner."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_pip(
            pip_video=second_video,
            position="top-left",
            size=0.25,  # 25% of main video size
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        # Resolution should match main video
        assert get_video_resolution(output) == "640x480"

    def test_pip_top_right(self, sample_video: str, second_video: str, temp_dir: str) -> None:
        """PiP in top-right corner."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_pip(pip_video=second_video, position="top-right", size=0.25)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_pip_bottom_left(self, sample_video: str, second_video: str, temp_dir: str) -> None:
        """PiP in bottom-left corner."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_pip(pip_video=second_video, position="bottom-left", size=0.3)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_pip_bottom_right(self, sample_video: str, second_video: str, temp_dir: str) -> None:
        """PiP in bottom-right corner."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_pip(pip_video=second_video, position="bottom-right", size=0.3)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_pip_center(self, sample_video: str, second_video: str, temp_dir: str) -> None:
        """PiP in center."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_pip(pip_video=second_video, position="center", size=0.4)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_pip_custom_position(self, sample_video: str, second_video: str, temp_dir: str) -> None:
        """PiP at custom x,y coordinates."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_pip(
            pip_video=second_video,
            position=(100, 50),  # x=100, y=50
            size=(160, 90),  # Exact pixel size
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_pip_time_limited(self, sample_video: str, second_video: str, temp_dir: str) -> None:
        """PiP should only appear during specified time range."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_pip(pip_video=second_video, position="top-right", size=0.25, start_time=1.0, end_time=3.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_pip_with_border(self, sample_video: str, second_video: str, temp_dir: str) -> None:
        """PiP with border around it."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_pip(pip_video=second_video, position="bottom-right", size=0.25, border_width=3, border_color="white")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@requires_ffmpeg
class TestSplitScreen:
    """Tests for split screen layouts - must fail before implementation."""

    def test_split_screen_side_by_side(self, sample_video: str, second_video: str, temp_dir: str) -> None:
        """Side-by-side (horizontal) split."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_split_screen(
            videos=[second_video],
            layout="horizontal",  # 2 videos side by side
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        # Width should be doubled
        resolution = get_video_resolution(output)
        assert resolution is not None
        assert "1280" in resolution  # 640*2

    def test_split_screen_stacked(self, sample_video: str, second_video: str, temp_dir: str) -> None:
        """Top-bottom (vertical) split."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_split_screen(videos=[second_video], layout="vertical")
        output = pipeline.render(output_dir=temp_dir)

        resolution = get_video_resolution(output)
        assert resolution is not None
        assert "960" in resolution  # 480*2

    def test_split_screen_2x2_grid(self, sample_video: str, second_video: str, temp_dir: str) -> None:
        """2x2 grid layout."""
        from video_editor.pipeline import VideoPipeline

        # Need 4 videos total for 2x2
        pipeline = VideoPipeline(sample_video)
        pipeline.add_split_screen(videos=[second_video, sample_video, second_video], layout="grid_2x2")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_split_screen_3x3_grid(self, sample_video: str, second_video: str, temp_dir: str) -> None:
        """3x3 grid layout."""
        from video_editor.pipeline import VideoPipeline

        videos = [second_video] * 8  # Need 8 more for 9 total

        pipeline = VideoPipeline(sample_video)
        pipeline.add_split_screen(videos=videos, layout="grid_3x3")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_split_screen_custom_sizes(self, sample_video: str, second_video: str, temp_dir: str) -> None:
        """Split screen with custom size ratios."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_split_screen(
            videos=[second_video],
            layout="horizontal",
            ratios=[0.7, 0.3],  # 70% / 30% split
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_split_screen_with_gap(self, sample_video: str, second_video: str, temp_dir: str) -> None:
        """Split screen with gap between videos."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_split_screen(
            videos=[second_video],
            layout="horizontal",
            gap=10,  # 10 pixel gap
            gap_color="black",
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_split_screen_preserves_audio(self, sample_video: str, second_video: str, temp_dir: str) -> None:
        """Split screen should keep audio from main video."""
        from video_editor.pipeline import VideoPipeline
        import json

        pipeline = VideoPipeline(sample_video)
        pipeline.add_split_screen(videos=[second_video], layout="horizontal")
        output = pipeline.render(output_dir=temp_dir)

        # Check audio exists
        cmd: list[str] = ["ffprobe", "-v", "error", "-show_streams", "-select_streams", "a", "-of", "json", output]
        result = subprocess.run(cmd, capture_output=True)
        data = json.loads(result.stdout.decode())

        assert len(data.get("streams", [])) > 0
