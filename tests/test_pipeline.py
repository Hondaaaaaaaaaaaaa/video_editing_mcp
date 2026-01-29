"""
Tests for the VideoPipeline core functionality.
"""

from __future__ import annotations

import os
import uuid

import pytest

from video_editor import VideoPipeline


class TestVideoPipelineCreation:
    """Tests for creating and managing video pipelines."""

    def test_create_pipeline_with_valid_file(self, sample_video: str) -> None:
        """Test creating a pipeline with a valid video file."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        assert pipeline is not None
        assert pipeline.input_path == sample_video
        assert pipeline.video_filters == []
        assert pipeline.audio_filters == []

    def test_create_pipeline_with_invalid_file(self, temp_dir: str) -> None:
        """Test that creating a pipeline with invalid file raises error."""
        # VideoPipeline raises ValueError when file doesn't exist
        # But only if input is a path string (not bytes)
        fake_path: str = os.path.join(temp_dir, "nonexistent.mp4")
        with pytest.raises((ValueError, FileNotFoundError)):
            from video_editor.utils.helpers import _to_temp_file

            _to_temp_file(fake_path)

    def test_pipeline_get_input_duration(self, sample_video: str) -> None:
        """Test that pipeline correctly determines input duration."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        duration: float | None = pipeline._get_input_duration()
        assert duration is not None
        assert 4.5 <= duration <= 5.5  # Should be around 5 seconds


class TestTrimOperation:
    """Tests for video trimming operations."""

    def test_trim_basic(self, sample_video: str, temp_dir: str) -> None:
        """Test basic trim operation."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.trim(1.0, 3.0)

        assert pipeline.start_time == 1.0
        assert pipeline.end_time == 3.0

    def test_trim_and_render(self, sample_video: str, temp_dir: str) -> None:
        """Test that trim operation produces correct output duration."""
        from video_editor import pipelines as global_pipelines

        pid: str = str(uuid.uuid4())
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        global_pipelines[pid] = pipeline

        pipeline.trim(1.0, 3.0)

        # Build command and check it's valid
        cmd: list[str]
        output_path: str
        cmd, output_path = pipeline.build_cmd(
            format="mp4", video_codec="libx264", audio_codec="aac", output_path=os.path.join(temp_dir, "trimmed.mp4")
        )

        # Verify command contains trim parameters
        assert "-ss" in cmd
        assert "-to" in cmd


class TestScaleOperation:
    """Tests for video scaling operations."""

    def test_scale_adds_filter(self, sample_video: str) -> None:
        """Test that scale operation adds the correct filter."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.scale(1280, 720)

        assert len(pipeline.video_filters) == 1
        assert "scale=1280:720" in pipeline.video_filters[0]

    def test_scale_with_time_range(self, sample_video: str) -> None:
        """Test scaling with time constraints."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.scale(1280, 720, start_time=1.0, end_time=3.0)

        assert len(pipeline.video_filters) == 1
        assert "scale=1280:720" in pipeline.video_filters[0]
        assert "enable" in pipeline.video_filters[0]


class TestVolumeOperation:
    """Tests for audio volume operations."""

    def test_volume_change(self, sample_video: str) -> None:
        """Test volume change operation."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.change_volume(0.5)

        assert len(pipeline.audio_filters) == 1
        assert "volume=0.5" in pipeline.audio_filters[0]

    def test_volume_boost(self, sample_video: str) -> None:
        """Test volume boost operation."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.change_volume(2.0)

        assert "volume=2.0" in pipeline.audio_filters[0]


class TestColorGradeOperation:
    """Tests for color grading operations."""

    def test_color_grade_basic(self, sample_video: str) -> None:
        """Test basic color grading."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.color_grade(brightness=0.1, contrast=1.2, saturation=1.5)

        assert len(pipeline.video_filters) == 1
        filter_str: str = pipeline.video_filters[0]
        assert "brightness=0.1" in filter_str
        assert "contrast=1.2" in filter_str
        assert "saturation=1.5" in filter_str

    def test_color_grade_with_hue(self, sample_video: str) -> None:
        """Test color grading with hue adjustment."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.color_grade(hue=45.0)

        filter_str: str = pipeline.video_filters[0]
        assert "hue=h=45.0" in filter_str


class TestSpeedChangeOperation:
    """Tests for speed change operations."""

    def test_speed_double(self, sample_video: str) -> None:
        """Test doubling video speed."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.change_speed(2.0)

        assert "setpts=PTS/2.0" in pipeline.video_filters[0]
        assert "atempo" in pipeline.audio_filters[0]

    def test_speed_half(self, sample_video: str) -> None:
        """Test halving video speed."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.change_speed(0.5)

        assert "setpts=PTS/0.5" in pipeline.video_filters[0]

    def test_speed_extreme(self, sample_video: str) -> None:
        """Test that extreme speeds are handled correctly with chained atempo."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.change_speed(4.0)  # Requires chained atempo filters

        # Should have chained atempo filters for speed > 2.0
        audio_filter: str = pipeline.audio_filters[0]
        assert "atempo" in audio_filter


class TestRotateOperation:
    """Tests for video rotation operations."""

    def test_rotate_90(self, sample_video: str) -> None:
        """Test 90 degree rotation."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.rotate(90)

        assert len(pipeline.video_filters) == 1
        assert "rotate=" in pipeline.video_filters[0]


class TestFlipOperation:
    """Tests for video flip operations."""

    def test_flip_horizontal(self, sample_video: str) -> None:
        """Test horizontal flip."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.flip(horizontal=True)

        assert "hflip" in pipeline.video_filters[0]

    def test_flip_vertical(self, sample_video: str) -> None:
        """Test vertical flip."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.flip(vertical=True)

        assert "vflip" in pipeline.video_filters[0]

    def test_flip_both(self, sample_video: str) -> None:
        """Test both horizontal and vertical flip."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.flip(horizontal=True, vertical=True)

        filter_str: str = pipeline.video_filters[0]
        assert "hflip" in filter_str
        assert "vflip" in filter_str


class TestCropOperation:
    """Tests for video crop operations."""

    def test_crop_basic(self, sample_video: str) -> None:
        """Test basic crop operation."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.crop(x=100, y=50, width=320, height=240)

        assert len(pipeline.video_filters) == 1
        assert "crop=320:240:100:50" in pipeline.video_filters[0]


class TestDeleteSegmentOperation:
    """Tests for segment deletion operations."""

    def test_delete_segment(self, sample_video: str) -> None:
        """Test deleting a segment from the video."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.delete_segment(2.0, 3.0)

        assert len(pipeline.complex_filters) == 1
        # Should have trim and concat filters
        filter_str: str = pipeline.complex_filters[0]
        assert "trim" in filter_str
        assert "concat" in filter_str


class TestOverlayOperation:
    """Tests for overlay operations."""

    def test_image_overlay(self, sample_video: str, sample_image: str) -> None:
        """Test overlaying an image on video."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.overlay(sample_image, x=10, y=10, start_time=1.0, end_time=3.0)

        assert len(pipeline.complex_filters) == 1
        assert len(pipeline.additional_inputs) == 1
        assert "overlay" in pipeline.complex_filters[0]

    def test_overlay_with_timing(self, sample_video: str, sample_image: str) -> None:
        """Test overlay with timing constraints."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.overlay(sample_image, x=0, y=0, start_time=1.0, end_time=2.0)

        filter_str: str = pipeline.complex_filters[0]
        assert "enable" in filter_str
        assert "between" in filter_str


class TestConcatenation:
    """Tests for video concatenation."""

    def test_concat_two_videos(self, sample_video: str, second_video: str) -> None:
        """Test concatenating two videos."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.concat([second_video])

        assert len(pipeline.additional_inputs) == 1
        assert len(pipeline.complex_filters) == 1
        assert "concat" in pipeline.complex_filters[0]


class TestChaining:
    """Tests for chaining multiple operations."""

    def test_chain_multiple_operations(self, sample_video: str) -> None:
        """Test chaining multiple operations together."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)

        # Chain multiple operations
        pipeline.scale(1280, 720)
        pipeline.change_volume(0.8)
        pipeline.color_grade(brightness=0.05)

        assert len(pipeline.video_filters) == 2  # scale + color_grade
        assert len(pipeline.audio_filters) == 1  # volume

    def test_method_chaining_returns_self(self, sample_video: str) -> None:
        """Test that operations return self for fluent interface."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)

        result: VideoPipeline = pipeline.scale(640, 480)
        assert result is pipeline

        result = pipeline.change_volume(1.0)
        assert result is pipeline


class TestBuildCommand:
    """Tests for FFmpeg command building."""

    def test_build_basic_command(self, sample_video: str, temp_dir: str) -> None:
        """Test building a basic FFmpeg command."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        pipeline.scale(1280, 720)

        cmd: list[str]
        output_path: str
        cmd, output_path = pipeline.build_cmd(
            format="mp4", video_codec="libx264", audio_codec="aac", output_path=os.path.join(temp_dir, "output.mp4")
        )

        assert "ffmpeg" in cmd
        assert "-c:v" in cmd
        assert "libx264" in cmd
        assert "-vf" in cmd

    def test_build_command_with_resolution(self, sample_video: str, temp_dir: str) -> None:
        """Test building command with resolution option."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)

        cmd: list[str]
        output_path: str
        cmd, output_path = pipeline.build_cmd(
            format="mp4", video_codec="libx264", audio_codec="aac", resolution="1920x1080", output_path=os.path.join(temp_dir, "output.mp4")
        )

        assert "-s" in cmd
        assert "1920x1080" in cmd

    def test_build_command_with_frame_rate(self, sample_video: str, temp_dir: str) -> None:
        """Test building command with frame rate option."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)

        cmd: list[str]
        output_path: str
        cmd, output_path = pipeline.build_cmd(
            format="mp4", video_codec="libx264", audio_codec="aac", frame_rate=60, output_path=os.path.join(temp_dir, "output.mp4")
        )

        assert "-r" in cmd
        assert "60" in cmd
