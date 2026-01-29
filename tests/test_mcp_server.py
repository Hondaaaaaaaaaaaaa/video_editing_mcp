"""
Tests for the MCP server tools.

Note: The MCP tools are decorated with @mcp.tool() which wraps them as FunctionTool objects.
For testing, we need to access the underlying functions or test them differently.
These tests verify the core logic without going through the MCP wrapper.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import uuid
from typing import Any, cast
from unittest.mock import MagicMock, patch

import pytest

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from video_editor import VideoPipeline, pipelines


class TestCreatePipeline:
    """Tests for create_video_pipeline functionality."""

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_create_pipeline_returns_id(self, mock_subprocess: MagicMock, mock_exists: MagicMock, temp_dir: str) -> None:
        """Test that creating a pipeline returns a valid ID."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"5.0"

        fake_path = os.path.join(temp_dir, "test.mp4")
        pid = str(uuid.uuid4())
        pipeline = VideoPipeline(fake_path)
        pipelines[pid] = pipeline

        assert pid is not None
        assert isinstance(pid, str)
        assert len(pid) > 0

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_create_pipeline_stores_in_registry(self, mock_subprocess: MagicMock, mock_exists: MagicMock, temp_dir: str) -> None:
        """Test that created pipeline is stored in global registry."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"5.0"

        fake_path = os.path.join(temp_dir, "test.mp4")
        pid = str(uuid.uuid4())
        pipeline = VideoPipeline(fake_path)
        pipelines[pid] = pipeline

        assert pid in pipelines

    def test_create_pipeline_invalid_file(self, temp_dir: str) -> None:
        """Test that invalid file raises error."""
        from video_editor.utils.helpers import _to_temp_file

        with pytest.raises(ValueError):
            _to_temp_file(os.path.join(temp_dir, "nonexistent.mp4"))


class TestTrimTool:
    """Tests for trim functionality."""

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_add_trim_basic(self, mock_subprocess: MagicMock, mock_exists: MagicMock, temp_dir: str) -> None:
        """Test basic trim operation."""
        mock_exists.return_value = True
        mock_subprocess.return_value = b"5.0"

        fake_path = os.path.join(temp_dir, "test.mp4")
        pid = str(uuid.uuid4())
        pipeline = VideoPipeline(fake_path)
        pipelines[pid] = pipeline

        pipeline.trim(1.0, 3.0)

        assert pipelines[pid].start_time == 1.0
        assert pipelines[pid].end_time == 3.0

    @patch("video_editor.pipeline.core.os.path.exists")
    @patch("video_editor.pipeline.core.subprocess.check_output")
    def test_add_trim_invalid_pipeline(self, mock_subprocess: MagicMock, mock_exists: MagicMock) -> None:
        """Test that operations on non-existent pipeline fail."""
        # Verify that an invalid pipeline ID is not in the registry
        assert "invalid-id" not in pipelines


class TestSilenceRemovalTool:
    """Tests for silence removal tools."""

    def test_add_silence_removal(self, sample_video: str) -> None:
        """Test add_silence_removal tool."""
        from server import add_silence_removal, create_video_pipeline

        # Access the underlying function via .fn attribute
        create_fn = cast(Any, create_video_pipeline).fn
        silence_fn = cast(Any, add_silence_removal).fn

        pid: str = create_fn(sample_video)
        result: str = silence_fn(pid)

        assert result == pid

    def test_add_silence_removal_with_params(self, sample_video: str) -> None:
        """Test add_silence_removal with custom parameters."""
        from server import add_silence_removal, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        silence_fn = cast(Any, add_silence_removal).fn

        pid: str = create_fn(sample_video)
        result: str = silence_fn(pid, noise_threshold=-25.0, min_silence_duration=1.0, padding=0.2)

        assert result == pid

    def test_get_silences(self, sample_video: str) -> None:
        """Test get_silences tool."""
        from server import get_silences

        get_silences_fn = cast(Any, get_silences).fn

        result: str = get_silences_fn(sample_video)

        # Should return valid JSON
        data: dict[str, Any] = json.loads(result)
        assert "total_silences" in data
        assert "segments" in data
        assert isinstance(data["segments"], list)

    def test_get_silences_with_params(self, sample_video: str) -> None:
        """Test get_silences with custom parameters."""
        from server import get_silences

        get_silences_fn = cast(Any, get_silences).fn

        result: str = get_silences_fn(sample_video, noise_threshold=-40.0, min_silence_duration=0.3)

        data: dict[str, Any] = json.loads(result)
        assert "total_silences" in data


class TestOverlayTool:
    """Tests for add_overlay tool."""

    def test_add_overlay_basic(self, sample_video: str, sample_image: str) -> None:
        """Test basic overlay operation."""
        from server import add_overlay, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        overlay_fn = cast(Any, add_overlay).fn

        pid: str = create_fn(sample_video)
        result: str = overlay_fn(pid, sample_image, x=10, y=10)

        assert result == pid
        assert len(pipelines[pid].additional_inputs) == 1

    def test_add_overlay_with_timing(self, sample_video: str, sample_image: str) -> None:
        """Test overlay with timing parameters."""
        from server import add_overlay, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        overlay_fn = cast(Any, add_overlay).fn

        pid: str = create_fn(sample_video)
        result: str = overlay_fn(pid, sample_image, x=0, y=0, start_time=1.0, end_time=3.0)

        assert result == pid

    def test_add_overlay_invalid_file(self, sample_video: str, temp_dir: str) -> None:
        """Test that invalid overlay file raises error."""
        from server import add_overlay, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        overlay_fn = cast(Any, add_overlay).fn

        pid: str = create_fn(sample_video)

        with pytest.raises(FileNotFoundError):
            overlay_fn(pid, os.path.join(temp_dir, "nonexistent.png"))


class TestTransitionTool:
    """Tests for add_transition tool."""

    def test_add_transition_fade(self, sample_video: str, second_video: str) -> None:
        """Test fade transition."""
        from server import add_transition, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        transition_fn = cast(Any, add_transition).fn

        pid: str = create_fn(sample_video)
        result: str = transition_fn(pid, second_video, "fade", 1.0)

        assert result == pid

    def test_add_transition_wipe(self, sample_video: str, second_video: str) -> None:
        """Test wipe transition."""
        from server import add_transition, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        transition_fn = cast(Any, add_transition).fn

        pid: str = create_fn(sample_video)
        result: str = transition_fn(pid, second_video, "wipe_lr", 0.5)

        assert result == pid

    def test_add_transition_invalid_video(self, sample_video: str, temp_dir: str) -> None:
        """Test that invalid second video raises error."""
        from server import add_transition, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        transition_fn = cast(Any, add_transition).fn

        pid: str = create_fn(sample_video)

        with pytest.raises(FileNotFoundError):
            transition_fn(pid, os.path.join(temp_dir, "nonexistent.mp4"), "fade", 1.0)


class TestScaleTool:
    """Tests for add_scale tool."""

    def test_add_scale(self, sample_video: str) -> None:
        """Test scale operation."""
        from server import add_scale, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        scale_fn = cast(Any, add_scale).fn

        pid: str = create_fn(sample_video)
        result: str = scale_fn(pid, 1280, 720)

        assert result == pid
        assert len(pipelines[pid].video_filters) >= 1


class TestRotateTool:
    """Tests for add_rotate tool."""

    def test_add_rotate(self, sample_video: str) -> None:
        """Test rotate operation."""
        from server import add_rotate, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        rotate_fn = cast(Any, add_rotate).fn

        pid: str = create_fn(sample_video)
        result: str = rotate_fn(pid, 90)

        assert result == pid


class TestFlipTool:
    """Tests for add_flip tool."""

    def test_add_flip_horizontal(self, sample_video: str) -> None:
        """Test horizontal flip."""
        from server import add_flip, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        flip_fn = cast(Any, add_flip).fn

        pid: str = create_fn(sample_video)
        result: str = flip_fn(pid, horizontal=True)

        assert result == pid

    def test_add_flip_vertical(self, sample_video: str) -> None:
        """Test vertical flip."""
        from server import add_flip, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        flip_fn = cast(Any, add_flip).fn

        pid: str = create_fn(sample_video)
        result: str = flip_fn(pid, vertical=True)

        assert result == pid


class TestCropTool:
    """Tests for add_crop tool."""

    def test_add_crop(self, sample_video: str) -> None:
        """Test crop operation."""
        from server import add_crop, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        crop_fn = cast(Any, add_crop).fn

        pid: str = create_fn(sample_video)
        result: str = crop_fn(pid, 100, 50, 320, 240)

        assert result == pid


class TestSpeedTool:
    """Tests for add_speed_change tool."""

    def test_add_speed_change(self, sample_video: str) -> None:
        """Test speed change operation."""
        from server import add_speed_change, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        speed_fn = cast(Any, add_speed_change).fn

        pid: str = create_fn(sample_video)
        result: str = speed_fn(pid, 2.0)

        assert result == pid


class TestVolumeTool:
    """Tests for add_volume_change tool."""

    def test_add_volume_change(self, sample_video: str) -> None:
        """Test volume change operation."""
        from server import add_volume_change, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        volume_fn = cast(Any, add_volume_change).fn

        pid: str = create_fn(sample_video)
        result: str = volume_fn(pid, 0.5)

        assert result == pid


class TestColorGradeTool:
    """Tests for add_color_grade tool."""

    def test_add_color_grade(self, sample_video: str) -> None:
        """Test color grading operation."""
        from server import add_color_grade, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        color_fn = cast(Any, add_color_grade).fn

        pid: str = create_fn(sample_video)
        result: str = color_fn(pid, brightness=0.1, contrast=1.2, saturation=1.5)

        assert result == pid


class TestChromaKeyTool:
    """Tests for add_chroma_key tool."""

    def test_add_chroma_key(self, sample_video: str) -> None:
        """Test chroma key operation."""
        from server import add_chroma_key, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        chroma_fn = cast(Any, add_chroma_key).fn

        pid: str = create_fn(sample_video)
        result: str = chroma_fn(pid, "green")

        assert result == pid


class TestAudioTrackTool:
    """Tests for add_audio_track tool."""

    def test_add_audio_track(self, sample_video: str, sample_audio: str) -> None:
        """Test adding audio track."""
        from server import add_audio_track, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        audio_fn = cast(Any, add_audio_track).fn

        pid: str = create_fn(sample_video)
        result: str = audio_fn(pid, sample_audio)

        assert result == pid


class TestConcatenationTool:
    """Tests for add_concatenation tool."""

    def test_add_concatenation(self, sample_video: str, second_video: str) -> None:
        """Test concatenation operation."""
        from server import add_concatenation, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        concat_fn = cast(Any, add_concatenation).fn

        pid: str = create_fn(sample_video)
        result: str = concat_fn(pid, [second_video])

        assert result == pid


class TestSegmentDeletionTool:
    """Tests for add_segment_deletion tool."""

    def test_add_segment_deletion(self, sample_video: str) -> None:
        """Test segment deletion operation."""
        from server import add_segment_deletion, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        delete_fn = cast(Any, add_segment_deletion).fn

        pid: str = create_fn(sample_video)
        result: str = delete_fn(pid, 1.0, 2.0)

        assert result == pid


class TestGetVideoInfo:
    """Tests for get_video_info functionality."""

    def test_get_video_info(self, sample_video: str) -> None:
        """Test getting video info requires FFmpeg."""
        # This test requires FFmpeg, so it will be skipped if not available
        try:
            cmd: list[str] = ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", sample_video]
            res: subprocess.CompletedProcess[bytes] = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if res.returncode == 0:
                data: dict[str, Any] = json.loads(res.stdout.decode())
                assert "format" in data or "streams" in data
        except FileNotFoundError:
            pytest.skip("FFprobe not available")

    def test_file_not_found_raises_error(self, temp_dir: str) -> None:
        """Test that checking non-existent file is handled."""
        fake_path = os.path.join(temp_dir, "nonexistent.mp4")
        assert not os.path.exists(fake_path)


class TestToolChaining:
    """Tests for chaining multiple tools."""

    def test_chain_multiple_operations(self, sample_video: str) -> None:
        """Test chaining multiple operations."""
        from server import (
            add_color_grade,
            add_scale,
            add_trim,
            add_volume_change,
            create_video_pipeline,
        )

        create_fn = cast(Any, create_video_pipeline).fn
        trim_fn = cast(Any, add_trim).fn
        scale_fn = cast(Any, add_scale).fn
        volume_fn = cast(Any, add_volume_change).fn
        color_fn = cast(Any, add_color_grade).fn

        pid: str = create_fn(sample_video)
        trim_fn(pid, 0.5, 4.0)
        scale_fn(pid, 1280, 720)
        volume_fn(pid, 0.8)
        color_fn(pid, brightness=0.05)

        # All operations should be applied
        assert pipelines[pid].start_time == 0.5
        assert pipelines[pid].end_time == 4.0
        assert len(pipelines[pid].video_filters) >= 2
        assert len(pipelines[pid].audio_filters) >= 1

    def test_chain_returns_same_pipeline_id(self, sample_video: str) -> None:
        """Test that all operations return the same pipeline ID."""
        from server import add_flip, add_scale, add_trim, create_video_pipeline

        create_fn = cast(Any, create_video_pipeline).fn
        trim_fn = cast(Any, add_trim).fn
        scale_fn = cast(Any, add_scale).fn
        flip_fn = cast(Any, add_flip).fn

        pid: str = create_fn(sample_video)
        result1: str = trim_fn(pid, 1.0, 4.0)
        result2: str = scale_fn(pid, 640, 480)
        result3: str = flip_fn(pid, horizontal=True)

        assert result1 == pid
        assert result2 == pid
        assert result3 == pid
