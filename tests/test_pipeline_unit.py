"""
Unit tests for the VideoPipeline that don't require FFmpeg.
These tests mock file existence and test command generation logic.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch


class TestVideoPipelineUnit:
    """Unit tests for VideoPipeline command generation."""

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_create_pipeline(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test creating a pipeline with mocked file."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"5.0"  # 5 second duration

        from video_editor import VideoPipeline

        pipeline = VideoPipeline("/fake/video.mp4")
        assert pipeline is not None
        assert pipeline.input_path == "/fake/video.mp4"

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_trim_sets_times(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test that trim sets start and end times."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"10.0"

        from video_editor import VideoPipeline

        pipeline = VideoPipeline("/fake/video.mp4")
        pipeline.trim(1.0, 5.0)

        assert pipeline.start_time == 1.0
        assert pipeline.end_time == 5.0

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_scale_adds_filter(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test that scale adds correct video filter."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"10.0"

        from video_editor import VideoPipeline

        pipeline = VideoPipeline("/fake/video.mp4")
        pipeline.scale(1920, 1080)

        assert len(pipeline.video_filters) == 1
        assert "scale=1920:1080" in pipeline.video_filters[0]

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_change_volume_adds_filter(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test that change_volume adds correct audio filter."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"10.0"

        from video_editor import VideoPipeline

        pipeline = VideoPipeline("/fake/video.mp4")
        pipeline.change_volume(0.5)

        assert len(pipeline.audio_filters) == 1
        assert "volume=0.5" in pipeline.audio_filters[0]

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_color_grade_adds_filter(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test that color_grade adds correct filter."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"10.0"

        from video_editor import VideoPipeline

        pipeline = VideoPipeline("/fake/video.mp4")
        pipeline.color_grade(brightness=0.1, contrast=1.2, saturation=1.5)

        assert len(pipeline.video_filters) == 1
        filter_str: str = pipeline.video_filters[0]
        assert "brightness=0.1" in filter_str
        assert "contrast=1.2" in filter_str
        assert "saturation=1.5" in filter_str

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_change_speed_adds_filters(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test that change_speed adds video and audio filters."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"10.0"

        from video_editor import VideoPipeline

        pipeline = VideoPipeline("/fake/video.mp4")
        pipeline.change_speed(2.0)

        assert len(pipeline.video_filters) >= 1
        assert "setpts=PTS/2.0" in pipeline.video_filters[0]
        assert len(pipeline.audio_filters) >= 1
        assert "atempo" in pipeline.audio_filters[0]

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_rotate_adds_filter(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test that rotate adds correct filter."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"10.0"

        from video_editor import VideoPipeline

        pipeline = VideoPipeline("/fake/video.mp4")
        pipeline.rotate(90)

        assert len(pipeline.video_filters) == 1
        assert "rotate=" in pipeline.video_filters[0]

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_flip_horizontal_adds_filter(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test that horizontal flip adds correct filter."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"10.0"

        from video_editor import VideoPipeline

        pipeline = VideoPipeline("/fake/video.mp4")
        pipeline.flip(horizontal=True)

        assert len(pipeline.video_filters) == 1
        assert "hflip" in pipeline.video_filters[0]

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_flip_vertical_adds_filter(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test that vertical flip adds correct filter."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"10.0"

        from video_editor import VideoPipeline

        pipeline = VideoPipeline("/fake/video.mp4")
        pipeline.flip(vertical=True)

        assert len(pipeline.video_filters) == 1
        assert "vflip" in pipeline.video_filters[0]

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_crop_adds_filter(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test that crop adds correct filter."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"10.0"

        from video_editor import VideoPipeline

        pipeline = VideoPipeline("/fake/video.mp4")
        pipeline.crop(100, 50, 640, 480)

        assert len(pipeline.video_filters) == 1
        assert "crop=640:480:100:50" in pipeline.video_filters[0]

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_chroma_key_adds_filter(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test that chroma_key adds correct filter."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"10.0"

        from video_editor import VideoPipeline

        pipeline = VideoPipeline("/fake/video.mp4")
        pipeline.chroma_key("green", similarity=0.4, blend=0.15)

        assert len(pipeline.video_filters) == 1
        filter_str: str = pipeline.video_filters[0]
        assert "chromakey=green" in filter_str
        assert "0.4" in filter_str
        assert "0.15" in filter_str

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_delete_segment_adds_complex_filter(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test that delete_segment adds complex filter for trimming."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"10.0"

        from video_editor import VideoPipeline

        pipeline = VideoPipeline("/fake/video.mp4")
        pipeline.delete_segment(2.0, 4.0)

        assert len(pipeline.complex_filters) == 1
        filter_str: str = pipeline.complex_filters[0]
        assert "trim" in filter_str
        assert "concat" in filter_str

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_method_chaining(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test that methods return self for chaining."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"10.0"

        from video_editor import VideoPipeline

        pipeline = VideoPipeline("/fake/video.mp4")

        # These should all return the pipeline for chaining
        result: VideoPipeline = pipeline.scale(1280, 720)
        assert result is pipeline

        result = pipeline.change_volume(0.8)
        assert result is pipeline

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_build_cmd_generates_ffmpeg_command(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test that build_cmd generates a valid FFmpeg command."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"10.0"

        from video_editor import VideoPipeline

        pipeline = VideoPipeline("/fake/video.mp4")
        pipeline.scale(1280, 720)

        cmd: list[str]
        output_path: str
        cmd, output_path = pipeline.build_cmd(format="mp4", video_codec="libx264", audio_codec="aac", output_path="/fake/output.mp4")

        cmd_str: str = " ".join(cmd)
        assert "ffmpeg" in cmd_str
        assert "-c:v" in cmd_str
        assert "libx264" in cmd_str
        assert "-vf" in cmd_str

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_build_cmd_with_trim(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test that build_cmd includes trim parameters."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"10.0"

        from video_editor import VideoPipeline

        pipeline = VideoPipeline("/fake/video.mp4")
        pipeline.trim(1.0, 5.0)

        cmd: list[str]
        output_path: str
        cmd, output_path = pipeline.build_cmd(format="mp4", video_codec="libx264", audio_codec="aac", output_path="/fake/output.mp4")

        cmd_str: str = " ".join(cmd)
        assert "-ss" in cmd_str
        assert "-to" in cmd_str

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_multiple_filters_combined(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test that multiple video filters are combined correctly."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"10.0"

        from video_editor import VideoPipeline

        pipeline = VideoPipeline("/fake/video.mp4")
        pipeline.scale(1280, 720)
        pipeline.color_grade(brightness=0.1)

        # Should have 2 video filters
        assert len(pipeline.video_filters) == 2


class TestPipelineRegistry:
    """Tests for pipeline registry management."""

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_pipelines_registry(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test that pipelines are stored in global registry."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"10.0"

        from video_editor import VideoPipeline, pipelines

        pid: str = str(uuid.uuid4())
        pipeline = VideoPipeline("/fake/video.mp4")
        pipelines[pid] = pipeline

        assert pid in pipelines
        assert pipelines[pid] is pipeline


class TestTimelineIntegration:
    """Tests for timeline tracking integration."""

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_pipeline_has_timeline(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test that pipeline initializes with timeline tracker."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"10.0"

        from video_editor import VideoPipeline

        pipeline = VideoPipeline("/fake/video.mp4")
        assert pipeline.timeline is not None

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_delete_segment_updates_timeline(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test that delete_segment registers with timeline."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"10.0"

        from video_editor import VideoPipeline

        pipeline = VideoPipeline("/fake/video.mp4")
        initial_mods: int = len(pipeline.timeline.modifications)

        pipeline.delete_segment(2.0, 4.0)

        # Should have added a modification
        assert len(pipeline.timeline.modifications) > initial_mods
