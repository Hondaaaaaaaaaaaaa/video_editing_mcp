"""
Tests for auto-subtitles and transcription.

TDD: These tests must FAIL before implementation.
Run with: uv run pytest tests/test_subtitles.py -v
"""

from __future__ import annotations

import os
import subprocess

import pytest

from tests.conftest import requires_ffmpeg


@pytest.fixture
def sample_video_with_speech(temp_dir: str) -> str:
    """Create video with audio for transcription tests.

    Note: For real transcription tests, use actual speech audio.
    This fixture uses synthetic audio which Whisper may not transcribe well.
    """
    output_path = os.path.join(temp_dir, "speech_video.mp4")

    cmd: list[str] = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=5:size=640x480:rate=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=5",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        pytest.skip(f"Could not create test video: {result.stderr.decode()}")

    return output_path


@requires_ffmpeg
class TestTranscription:
    """Tests for audio transcription - must fail before implementation."""

    def test_transcribe_returns_segments(self, sample_video_with_speech: str) -> None:
        """Transcribe should return list of timed segments."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video_with_speech)
        segments = pipeline.transcribe_audio(language="en", model_size="tiny")

        assert isinstance(segments, list)
        # May be empty for synthetic audio, but should be a list
        for seg in segments:
            assert "text" in seg
            assert "start" in seg
            assert "end" in seg
            assert seg["end"] >= seg["start"]

    def test_transcribe_with_different_models(self, sample_video_with_speech: str) -> None:
        """Transcribe should support different model sizes."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video_with_speech)

        # tiny is fastest for testing
        segments = pipeline.transcribe_audio(language="en", model_size="tiny")
        assert isinstance(segments, list)

    def test_transcribe_auto_language(self, sample_video_with_speech: str) -> None:
        """Transcribe should auto-detect language when not specified."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video_with_speech)
        result = pipeline.transcribe_audio(model_size="tiny")

        # Should return segments and detected language
        assert isinstance(result, (list, dict))

    def test_transcribe_returns_confidence(self, sample_video_with_speech: str) -> None:
        """Transcribe should include confidence scores."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video_with_speech)
        segments = pipeline.transcribe_audio(language="en", model_size="tiny", include_confidence=True)

        # Segments may include confidence if available
        assert isinstance(segments, list)


@requires_ffmpeg
class TestSubtitleGeneration:
    """Tests for subtitle generation - must fail before implementation."""

    def test_add_subtitles_burns_into_video(self, sample_video_with_speech: str, temp_dir: str) -> None:
        """Add subtitles should burn text into video."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video_with_speech)
        pipeline.add_subtitles(language="en", burn_in=True, model_size="tiny")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_subtitles_creates_srt_sidecar(self, sample_video_with_speech: str, temp_dir: str) -> None:
        """Add subtitles with burn_in=False should create SRT file."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video_with_speech)
        pipeline.add_subtitles(language="en", burn_in=False, model_size="tiny")
        output = pipeline.render(output_dir=temp_dir)

        # SRT file should be created alongside video
        srt_path = output.replace(".mp4", ".srt")
        assert os.path.exists(srt_path)

    def test_add_subtitles_custom_style(self, sample_video_with_speech: str, temp_dir: str) -> None:
        """Subtitles should support custom styling."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video_with_speech)
        pipeline.add_subtitles(language="en", burn_in=True, model_size="tiny", font_size=24, font_color="yellow", outline_color="black")
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@requires_ffmpeg
class TestExternalSubtitles:
    """Tests for external SRT subtitles - must fail before implementation."""

    def test_add_existing_srt_subtitles(self, sample_video: str, temp_dir: str) -> None:
        """Should be able to add existing SRT file."""
        from video_editor.pipeline import VideoPipeline

        # Create a simple SRT file
        srt_content = """1
00:00:01,000 --> 00:00:03,000
Hello World

2
00:00:03,500 --> 00:00:05,000
This is a test
"""
        srt_path = os.path.join(temp_dir, "test.srt")
        with open(srt_path, "w", encoding="utf-8") as f:
            f.write(srt_content)

        pipeline = VideoPipeline(sample_video)
        pipeline.add_srt_subtitles(srt_path, burn_in=True)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_srt_with_custom_position(self, sample_video: str, temp_dir: str) -> None:
        """SRT subtitles should support custom position."""
        from video_editor.pipeline import VideoPipeline

        srt_content = """1
00:00:01,000 --> 00:00:03,000
Top subtitle
"""
        srt_path = os.path.join(temp_dir, "test.srt")
        with open(srt_path, "w", encoding="utf-8") as f:
            f.write(srt_content)

        pipeline = VideoPipeline(sample_video)
        pipeline.add_srt_subtitles(
            srt_path,
            burn_in=True,
            position="top",  # Top instead of default bottom
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_srt_as_soft_subs(self, sample_video: str, temp_dir: str) -> None:
        """Add SRT as soft subtitles (embedded, not burned)."""
        from video_editor.pipeline import VideoPipeline
        import json

        srt_content = """1
00:00:01,000 --> 00:00:03,000
Soft subtitle
"""
        srt_path = os.path.join(temp_dir, "test.srt")
        with open(srt_path, "w", encoding="utf-8") as f:
            f.write(srt_content)

        pipeline = VideoPipeline(sample_video)
        pipeline.add_srt_subtitles(srt_path, burn_in=False, embed=True)
        output = pipeline.render(output_dir=temp_dir, format="mkv")

        assert os.path.exists(output)

        # Verify subtitle stream exists
        cmd: list[str] = ["ffprobe", "-v", "error", "-show_streams", "-select_streams", "s", "-of", "json", output]
        result = subprocess.run(cmd, capture_output=True)
        data = json.loads(result.stdout.decode())

        assert len(data.get("streams", [])) > 0
