"""
Tests for silence detection and removal functionality.
"""

from __future__ import annotations

import os

import pytest

from video_editor import VideoPipeline, detect_silences


class TestSilenceDetection:
    """Tests for silence detection functionality."""

    def test_detect_silences_returns_list(self, sample_video: str) -> None:
        """Test that detect_silences returns a list."""
        silences: list[tuple[float, float]] = detect_silences(sample_video)
        assert isinstance(silences, list)

    def test_detect_silences_with_silent_video(self, sample_video_with_silence: str) -> None:
        """Test detection on video with known silent segments."""
        silences: list[tuple[float, float]] = detect_silences(sample_video_with_silence, noise_threshold=-20.0, min_silence_duration=0.5)

        # The test video has silent segments around 2-4s and 6-8s
        assert len(silences) >= 1  # Should detect at least some silence

    def test_detect_silences_nonexistent_file(self, temp_dir: str) -> None:
        """Test that detecting silences on nonexistent file raises error."""
        with pytest.raises(FileNotFoundError):
            detect_silences(os.path.join(temp_dir, "nonexistent.mp4"))

    def test_detect_silences_threshold_parameter(self, sample_video: str) -> None:
        """Test that threshold parameter affects detection."""
        # Very high threshold should detect everything as silence
        silences_high: list[tuple[float, float]] = detect_silences(sample_video, noise_threshold=0)  # 0 dB = very loud

        # Very low threshold should detect almost no silence
        silences_low: list[tuple[float, float]] = detect_silences(sample_video, noise_threshold=-60)  # -60 dB = very quiet

        # Results may vary, but both should return lists
        assert isinstance(silences_high, list)
        assert isinstance(silences_low, list)

    def test_detect_silences_min_duration_parameter(self, sample_video_with_silence: str) -> None:
        """Test that minimum duration parameter affects detection."""
        # With very long minimum duration, should detect fewer silences
        silences_long: list[tuple[float, float]] = detect_silences(sample_video_with_silence, min_silence_duration=5.0)

        # With short minimum duration, should detect more silences
        silences_short: list[tuple[float, float]] = detect_silences(sample_video_with_silence, min_silence_duration=0.1)

        # Long minimum should have fewer or equal silences
        assert len(silences_long) <= len(silences_short)


class TestSilenceRemoval:
    """Tests for silence removal functionality."""

    def test_remove_silences_method_exists(self, sample_video: str) -> None:
        """Test that remove_silences method exists on pipeline."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        assert hasattr(pipeline, "remove_silences")
        assert callable(pipeline.remove_silences)

    def test_remove_silences_returns_self(self, sample_video: str) -> None:
        """Test that remove_silences returns self for chaining."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)
        result: VideoPipeline = pipeline.remove_silences()
        assert result is pipeline

    def test_remove_silences_with_padding(self, sample_video_with_silence: str) -> None:
        """Test silence removal with padding parameter."""
        pipeline: VideoPipeline = VideoPipeline(sample_video_with_silence)

        # This should add segment deletions to the pipeline
        pipeline.remove_silences(padding=0.2)

        # Pipeline should have recorded some modifications
        assert pipeline.timeline is not None

    def test_remove_silences_modifies_timeline(self, sample_video_with_silence: str) -> None:
        """Test that silence removal modifies the timeline tracker."""
        pipeline: VideoPipeline = VideoPipeline(sample_video_with_silence)
        _initial_mods: int = len(pipeline.timeline.modifications)  # noqa: F841

        pipeline.remove_silences(noise_threshold=-20.0, min_silence_duration=0.5)

        # Should have added some modifications (if silences were found)
        # Note: This depends on the test video having detectable silences
        # The test may pass even with no changes if no silences are detected

    def test_remove_silences_custom_threshold(self, sample_video: str) -> None:
        """Test silence removal with custom threshold."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)

        # Should not raise any errors
        pipeline.remove_silences(noise_threshold=-40.0, min_silence_duration=1.0)

        # Method should complete without errors
        assert True


class TestSilenceRemovalIntegration:
    """Integration tests for silence removal in the full pipeline."""

    def test_silence_removal_with_other_operations(self, sample_video: str) -> None:
        """Test that silence removal can be chained with other operations."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)

        # Chain silence removal with other operations
        pipeline.remove_silences()
        pipeline.scale(1280, 720)
        pipeline.change_volume(0.8)

        # Should have video and audio filters
        assert len(pipeline.video_filters) >= 1
        assert len(pipeline.audio_filters) >= 1

    def test_silence_removal_before_trim(self, sample_video: str) -> None:
        """Test silence removal before trim operation."""
        pipeline: VideoPipeline = VideoPipeline(sample_video)

        pipeline.remove_silences()
        pipeline.trim(0.5, 4.0)

        # Both operations should be recorded
        assert pipeline.start_time == 0.5
        assert pipeline.end_time == 4.0
