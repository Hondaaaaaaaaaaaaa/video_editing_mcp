"""
Tests for overlay and transition functionality.
"""

from __future__ import annotations

import os
import subprocess

import pytest

from video_editor import VideoPipeline


class TestImageOverlay:
    """Tests for image overlay functionality."""

    def test_image_overlay_basic(self, sample_video: str, sample_image: str) -> None:
        """Test basic image overlay."""
        pipeline = VideoPipeline(sample_video)
        pipeline.overlay(sample_image, x=10, y=10)

        assert len(pipeline.additional_inputs) == 1
        assert len(pipeline.complex_filters) == 1
        assert "overlay=10:10" in pipeline.complex_filters[0]

    def test_image_overlay_with_timing(self, sample_video: str, sample_image: str) -> None:
        """Test image overlay with start and end time."""
        pipeline = VideoPipeline(sample_video)
        pipeline.overlay(sample_image, x=0, y=0, start_time=1.0, end_time=3.0)

        filter_str: str = pipeline.complex_filters[0]
        assert "enable" in filter_str
        assert "between" in filter_str

    def test_image_overlay_position(self, sample_video: str, sample_image: str) -> None:
        """Test image overlay at different positions."""
        pipeline = VideoPipeline(sample_video)
        pipeline.overlay(sample_image, x=100, y=200)

        assert "overlay=100:200" in pipeline.complex_filters[0]

    def test_image_overlay_center(self, sample_video: str, sample_image: str) -> None:
        """Test image overlay approximately centered."""
        pipeline = VideoPipeline(sample_video)
        # Center of 640x480 video with 100x100 overlay
        pipeline.overlay(sample_image, x=270, y=190)

        assert "overlay=270:190" in pipeline.complex_filters[0]


class TestVideoOverlay:
    """Tests for video-on-video overlay functionality."""

    def test_video_overlay_basic(self, sample_video: str, second_video: str) -> None:
        """Test overlaying one video on another."""
        pipeline = VideoPipeline(sample_video)
        pipeline.overlay(second_video, x=10, y=10, start_time=0, end_time=3.0)

        assert len(pipeline.additional_inputs) == 1
        assert len(pipeline.complex_filters) == 1
        assert "overlay" in pipeline.complex_filters[0]

    def test_video_overlay_with_loop(self, sample_video: str, second_video: str) -> None:
        """Test video overlay with loop option."""
        pipeline = VideoPipeline(sample_video)
        pipeline.overlay(second_video, x=0, y=0, start_time=0, end_time=10.0, loop=True)

        # When loop is needed, filter should handle it
        assert len(pipeline.complex_filters) == 1


class TestTransitions:
    """Tests for video transition functionality."""

    def test_fade_transition(self, sample_video: str, second_video: str) -> None:
        """Test fade transition between two videos."""
        pipeline = VideoPipeline(sample_video)
        pipeline.apply_transition(second_video, transition_type="fade", duration=1.0)

        assert len(pipeline.additional_inputs) == 1
        assert len(pipeline.complex_filters) >= 1

    def test_wipe_lr_transition(self, sample_video: str, second_video: str) -> None:
        """Test left-to-right wipe transition."""
        pipeline = VideoPipeline(sample_video)
        pipeline.apply_transition(second_video, transition_type="wipe_lr", duration=1.0)

        assert len(pipeline.additional_inputs) == 1

    def test_wipe_rl_transition(self, sample_video: str, second_video: str) -> None:
        """Test right-to-left wipe transition."""
        pipeline = VideoPipeline(sample_video)
        pipeline.apply_transition(second_video, transition_type="wipe_rl", duration=1.0)

        assert len(pipeline.additional_inputs) == 1

    def test_wipe_tb_transition(self, sample_video: str, second_video: str) -> None:
        """Test top-to-bottom wipe transition."""
        pipeline = VideoPipeline(sample_video)
        pipeline.apply_transition(second_video, transition_type="wipe_tb", duration=1.0)

        assert len(pipeline.additional_inputs) == 1

    def test_wipe_bt_transition(self, sample_video: str, second_video: str) -> None:
        """Test bottom-to-top wipe transition."""
        pipeline = VideoPipeline(sample_video)
        pipeline.apply_transition(second_video, transition_type="wipe_bt", duration=1.0)

        assert len(pipeline.additional_inputs) == 1

    def test_transition_with_custom_start_time(self, sample_video: str, second_video: str) -> None:
        """Test transition with custom start time."""
        pipeline = VideoPipeline(sample_video)
        pipeline.apply_transition(second_video, transition_type="fade", duration=1.0, start_time=3.0)

        assert len(pipeline.complex_filters) >= 1

    def test_transition_default_dissolve(self, sample_video: str, second_video: str) -> None:
        """Test default dissolve transition for unknown type."""
        pipeline = VideoPipeline(sample_video)
        pipeline.apply_transition(second_video, transition_type="unknown", duration=1.0)

        # Should fall back to default transition
        assert len(pipeline.additional_inputs) == 1

    def test_transition_invalid_second_video(self, sample_video: str, temp_dir: str) -> None:
        """Test that transition with invalid second video raises error."""
        pipeline = VideoPipeline(sample_video)

        with pytest.raises(FileNotFoundError):
            pipeline.apply_transition(os.path.join(temp_dir, "nonexistent.mp4"), transition_type="fade", duration=1.0)


class TestAudioTrack:
    """Tests for adding audio tracks."""

    def test_add_audio_basic(self, sample_video: str, sample_audio: str) -> None:
        """Test adding an audio track."""
        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio(sample_audio)

        assert len(pipeline.additional_inputs) == 1
        assert len(pipeline.complex_filters) == 1
        assert "amix" in pipeline.complex_filters[0]

    def test_add_audio_with_delay(self, sample_video: str, sample_audio: str) -> None:
        """Test adding audio with start time delay."""
        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio(sample_audio, start_time=2.0)

        filter_str: str = pipeline.complex_filters[0]
        assert "adelay" in filter_str

    def test_add_audio_with_volume(self, sample_video: str, sample_audio: str) -> None:
        """Test adding audio with volume adjustment."""
        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio(sample_audio, volume=0.5)

        filter_str: str = pipeline.complex_filters[0]
        assert "volume=0.5" in filter_str

    def test_add_audio_invalid_path(self, sample_video: str, temp_dir: str) -> None:
        """Test that adding invalid audio raises error."""
        pipeline = VideoPipeline(sample_video)

        with pytest.raises(FileNotFoundError):
            pipeline.add_audio(os.path.join(temp_dir, "nonexistent.mp3"))


class TestChromaKey:
    """Tests for chroma key (green screen) functionality."""

    def test_chroma_key_green(self, sample_video: str) -> None:
        """Test chroma key with green color."""
        pipeline = VideoPipeline(sample_video)
        pipeline.chroma_key(color="green")

        assert len(pipeline.video_filters) == 1
        assert "chromakey=green" in pipeline.video_filters[0]

    def test_chroma_key_hex_color(self, sample_video: str) -> None:
        """Test chroma key with hex color."""
        pipeline = VideoPipeline(sample_video)
        pipeline.chroma_key(color="0x00FF00")

        assert "chromakey=0x00FF00" in pipeline.video_filters[0]

    def test_chroma_key_with_parameters(self, sample_video: str) -> None:
        """Test chroma key with similarity and blend parameters."""
        pipeline = VideoPipeline(sample_video)
        pipeline.chroma_key(color="green", similarity=0.5, blend=0.2)

        filter_str: str = pipeline.video_filters[0]
        assert "0.5" in filter_str
        assert "0.2" in filter_str

    def test_chroma_key_with_time_range(self, sample_video: str) -> None:
        """Test chroma key with time constraints."""
        pipeline = VideoPipeline(sample_video)
        pipeline.chroma_key(color="blue", start_time=1.0, end_time=3.0)

        filter_str: str = pipeline.video_filters[0]
        assert "enable" in filter_str


class TestConcatenation:
    """Tests for video concatenation functionality."""

    def test_concat_single_video(self, sample_video: str, second_video: str) -> None:
        """Test concatenating with a single additional video."""
        pipeline = VideoPipeline(sample_video)
        pipeline.concat([second_video])

        assert len(pipeline.additional_inputs) == 1
        filter_str: str = pipeline.complex_filters[0]
        assert "concat=n=2" in filter_str

    def test_concat_multiple_videos(self, sample_video: str, second_video: str, temp_dir: str) -> None:
        """Test concatenating with multiple additional videos."""
        # Create a third video
        third_video: str = os.path.join(temp_dir, "third.mp4")
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc=duration=3:size=640x480:rate=30",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=660:duration=3",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-c:a",
                "aac",
                "-pix_fmt",
                "yuv420p",
                third_video,
            ],
            capture_output=True,
        )

        if os.path.exists(third_video):
            pipeline = VideoPipeline(sample_video)
            pipeline.concat([second_video, third_video])

            assert len(pipeline.additional_inputs) == 2
            filter_str: str = pipeline.complex_filters[0]
            assert "concat=n=3" in filter_str

    def test_concat_invalid_file(self, sample_video: str, temp_dir: str) -> None:
        """Test that concatenating with invalid file raises error."""
        pipeline = VideoPipeline(sample_video)

        with pytest.raises(FileNotFoundError):
            pipeline.concat([os.path.join(temp_dir, "nonexistent.mp4")])


class TestComplexOverlayScenarios:
    """Tests for complex overlay scenarios."""

    def test_multiple_overlays(self, sample_video: str, sample_image: str, temp_dir: str) -> None:
        """Test adding multiple overlays."""
        # Create a second image
        second_image: str = os.path.join(temp_dir, "second_image.png")
        subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=blue:s=50x50:d=1", "-frames:v", "1", second_image], capture_output=True)

        if os.path.exists(second_image):
            pipeline = VideoPipeline(sample_video)
            pipeline.overlay(sample_image, x=10, y=10, start_time=0, end_time=2.0)
            # Note: Multiple overlays may require careful filter chaining
            # This test ensures no errors are raised

    def test_overlay_after_scale(self, sample_video: str, sample_image: str) -> None:
        """Test overlay after scaling the video."""
        pipeline = VideoPipeline(sample_video)
        pipeline.scale(1280, 720)
        pipeline.overlay(sample_image, x=100, y=100)

        assert len(pipeline.video_filters) >= 1
        assert len(pipeline.complex_filters) >= 1

    def test_overlay_with_color_grade(self, sample_video: str, sample_image: str) -> None:
        """Test overlay combined with color grading."""
        pipeline = VideoPipeline(sample_video)
        pipeline.color_grade(brightness=0.1)
        pipeline.overlay(sample_image, x=50, y=50)

        assert len(pipeline.video_filters) >= 1
        assert len(pipeline.complex_filters) >= 1
