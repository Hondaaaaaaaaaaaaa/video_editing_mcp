"""
Tests for voice isolation features using Demucs.

Note: These tests require the demucs package to be installed.
Tests will be skipped if demucs is not available.

Run with: uv run pytest tests/test_voice_isolation.py -v
"""

from __future__ import annotations

import os

import pytest

from conftest import requires_ffmpeg


def demucs_available() -> bool:
    """Check if Demucs is available."""
    import importlib.util

    return importlib.util.find_spec("demucs") is not None


requires_demucs = pytest.mark.skipif(
    not demucs_available(),
    reason="Demucs not installed"
)


@requires_ffmpeg
@requires_demucs
class TestVoiceIsolation:
    """Tests for voice isolation methods."""

    def test_isolate_vocals(self, sample_video: str, temp_dir: str) -> None:
        """Extract vocals from video."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        vocals_path = pipeline.isolate_vocals(output_dir=temp_dir)

        assert os.path.exists(vocals_path)
        assert vocals_path.endswith(".wav")

    def test_isolate_music(self, sample_video: str, temp_dir: str) -> None:
        """Extract instrumental from video."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        music_path = pipeline.isolate_music(output_dir=temp_dir)

        assert os.path.exists(music_path)
        assert music_path.endswith(".wav")

    def test_isolate_stems(self, sample_video: str, temp_dir: str) -> None:
        """Separate audio into all stems."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        stems = pipeline.isolate_stems(output_dir=temp_dir)

        assert isinstance(stems, dict)
        # Should have at least vocals and some instrumental stems
        assert "vocals" in stems or len(stems) > 0
        # All paths should exist
        for stem_name, path in stems.items():
            assert os.path.exists(path), f"Stem {stem_name} file not found"

    def test_isolate_stems_specific(self, sample_video: str, temp_dir: str) -> None:
        """Separate audio into specific stems only."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        stems = pipeline.isolate_stems(
            output_dir=temp_dir,
            stems=["vocals", "bass"]
        )

        assert isinstance(stems, dict)
        # Should only have requested stems (if available)
        for stem_name in stems.keys():
            assert stem_name in ["vocals", "bass"]

    def test_isolate_vocals_temp_dir(self, sample_video: str) -> None:
        """Extract vocals using temporary directory."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        vocals_path = pipeline.isolate_vocals()

        assert os.path.exists(vocals_path)
        # Should be in a temp directory
        assert "temp" in vocals_path.lower() or "tmp" in vocals_path.lower()

    def test_isolate_with_different_model(
        self, sample_video: str, temp_dir: str
    ) -> None:
        """Test with different Demucs model."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        # htdemucs is the default model
        vocals_path = pipeline.isolate_vocals(
            output_dir=temp_dir,
            model="htdemucs"
        )

        assert os.path.exists(vocals_path)


@requires_ffmpeg
@requires_demucs
class TestVoiceIsolationEffects:
    """Tests for remove_vocals and keep_only_vocals methods."""

    def test_remove_vocals(self, sample_video: str, temp_dir: str) -> None:
        """Remove vocals from video (keep instrumental)."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.remove_vocals()
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_keep_only_vocals(self, sample_video: str, temp_dir: str) -> None:
        """Keep only vocals in video (remove instrumental)."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.keep_only_vocals()
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_remove_vocals_method_chaining(self, sample_video: str) -> None:
        """remove_vocals should return self for chaining."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        result = pipeline.remove_vocals()

        assert result is pipeline

    def test_keep_only_vocals_method_chaining(self, sample_video: str) -> None:
        """keep_only_vocals should return self for chaining."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        result = pipeline.keep_only_vocals()

        assert result is pipeline


@requires_ffmpeg
class TestVoiceIsolationModule:
    """Tests for the voice isolation module classes."""

    def test_voice_isolator_check_demucs(self) -> None:
        """VoiceIsolator should check for demucs availability."""
        if not demucs_available():
            from video_editor.audio.voice_isolation import (
                VoiceIsolator,
                VoiceIsolationError,
            )

            with pytest.raises(VoiceIsolationError) as exc_info:
                VoiceIsolator()

            assert "demucs" in str(exc_info.value).lower()
        else:
            from video_editor.audio.voice_isolation import VoiceIsolator

            isolator = VoiceIsolator()
            assert isolator.model == "htdemucs"

    @requires_demucs
    def test_voice_isolator_models(self) -> None:
        """VoiceIsolator should list available models."""
        from video_editor.audio.voice_isolation import VoiceIsolator

        assert "htdemucs" in VoiceIsolator.MODELS
        assert "htdemucs_ft" in VoiceIsolator.MODELS

    @requires_demucs
    def test_voice_isolator_stems(self) -> None:
        """VoiceIsolator should list available stems."""
        from video_editor.audio.voice_isolation import VoiceIsolator

        assert "vocals" in VoiceIsolator.STEMS
        assert "drums" in VoiceIsolator.STEMS
        assert "bass" in VoiceIsolator.STEMS
        assert "other" in VoiceIsolator.STEMS


@requires_ffmpeg
class TestVoiceIsolationConvenienceFunctions:
    """Tests for convenience functions."""

    @requires_demucs
    def test_isolate_vocals_from_video(
        self, sample_video: str, temp_dir: str
    ) -> None:
        """Test convenience function for vocal isolation."""
        from video_editor.audio.voice_isolation import isolate_vocals_from_video

        vocals_path = isolate_vocals_from_video(
            video_path=sample_video,
            output_dir=temp_dir,
        )

        assert os.path.exists(vocals_path)

    @requires_demucs
    def test_isolate_instrumental_from_video(
        self, sample_video: str, temp_dir: str
    ) -> None:
        """Test convenience function for instrumental isolation."""
        from video_editor.audio.voice_isolation import isolate_instrumental_from_video

        instrumental_path = isolate_instrumental_from_video(
            video_path=sample_video,
            output_dir=temp_dir,
        )

        assert os.path.exists(instrumental_path)

    @requires_demucs
    def test_isolate_with_progress_callback(
        self, sample_video: str, temp_dir: str
    ) -> None:
        """Test voice isolation with progress callback."""
        from video_editor.audio.voice_isolation import isolate_vocals_from_video

        progress_updates: list[tuple[float, str]] = []

        def callback(progress: float, message: str) -> None:
            progress_updates.append((progress, message))

        vocals_path = isolate_vocals_from_video(
            video_path=sample_video,
            output_dir=temp_dir,
            progress_callback=callback,
        )

        assert os.path.exists(vocals_path)
        assert len(progress_updates) > 0
        # Progress should start at 0 and end at 1
        assert progress_updates[0][0] == 0.0
        assert progress_updates[-1][0] == 1.0
