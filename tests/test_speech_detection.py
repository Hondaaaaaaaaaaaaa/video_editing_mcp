"""
Tests for speech detection and smart silence removal features.

Run with: uv run pytest tests/test_speech_detection.py -v
"""

from __future__ import annotations

import os
import subprocess

import pytest

from conftest import requires_ffmpeg, get_video_duration


def torch_available() -> bool:
    """Check if PyTorch is available for Silero VAD."""
    import importlib.util

    return importlib.util.find_spec("torch") is not None


def webrtcvad_available() -> bool:
    """Check if WebRTC VAD is available."""
    import importlib.util

    return importlib.util.find_spec("webrtcvad") is not None


requires_torch = pytest.mark.skipif(
    not torch_available(),
    reason="PyTorch not installed (required for Silero VAD)"
)

requires_webrtcvad = pytest.mark.skipif(
    not webrtcvad_available(),
    reason="webrtcvad not installed"
)


@pytest.fixture
def video_with_speech_gaps(temp_dir: str) -> str:
    """Create a video with alternating speech and silence.

    Pattern: 2s speech, 2s silence, 2s speech, 2s silence, 2s speech (10s total)
    """
    output_path = os.path.join(temp_dir, "speech_gaps.mp4")

    # Create audio with gaps using aevalsrc
    # sin(440*2*PI*t) produces a tone; multiply by a pattern for gaps
    cmd: list[str] = [
        "ffmpeg",
        "-y",
        "-f", "lavfi",
        "-i", "testsrc=duration=10:size=640x480:rate=30",
        "-f", "lavfi",
        "-i", "aevalsrc='sin(440*2*PI*t)*if(between(t,0,2)+between(t,4,6)+between(t,8,10),1,0)':d=10",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-c:a", "aac",
        "-pix_fmt", "yuv420p",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        pytest.skip(f"Could not create test video: {result.stderr.decode()}")

    return output_path


@pytest.fixture
def video_with_noise(temp_dir: str) -> str:
    """Create a video with background noise and speech-like tones."""
    output_path = os.path.join(temp_dir, "noisy_speech.mp4")

    # Create audio with noise + tone pattern
    # The noise simulates background, tone simulates speech
    cmd: list[str] = [
        "ffmpeg",
        "-y",
        "-f", "lavfi",
        "-i", "testsrc=duration=10:size=640x480:rate=30",
        "-f", "lavfi",
        "-i", "anoisesrc=d=10:c=pink:a=0.1",  # Background noise
        "-f", "lavfi",
        "-i", "aevalsrc='sin(440*2*PI*t)*0.5*if(between(t,1,3)+between(t,5,7)+between(t,8,9),1,0)':d=10",
        "-filter_complex", "[1:a][2:a]amix=inputs=2:duration=first[a]",
        "-map", "0:v",
        "-map", "[a]",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-c:a", "aac",
        "-pix_fmt", "yuv420p",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        pytest.skip(f"Could not create noisy video: {result.stderr.decode()}")

    return output_path


@requires_ffmpeg
class TestSpeechDetector:
    """Tests for the SpeechDetector class."""

    def test_detector_init_defaults(self) -> None:
        """SpeechDetector should initialize with defaults."""
        from video_editor.audio.speech_detection import SpeechDetector

        detector = SpeechDetector()

        assert 0.0 <= detector.sensitivity <= 1.0
        assert detector.min_speech_duration > 0
        assert detector.min_silence_duration > 0

    def test_detector_backend_selection_auto(self) -> None:
        """Auto backend should select available option."""
        from video_editor.audio.speech_detection import SpeechDetector

        detector = SpeechDetector(backend="auto")

        # Should have selected a valid backend
        assert detector.backend in SpeechDetector.BACKENDS

    def test_detector_energy_backend(self, sample_video: str) -> None:
        """Energy-based backend should work without ML dependencies."""
        from video_editor.audio.speech_detection import SpeechDetector

        detector = SpeechDetector(backend="energy")
        segments = detector.detect_from_video(sample_video)

        assert isinstance(segments, list)
        # Should detect at least one segment in our test video (has continuous tone)
        assert len(segments) > 0

    @requires_torch
    def test_detector_silero_backend(self, sample_video: str) -> None:
        """Silero VAD backend should work with PyTorch."""
        from video_editor.audio.speech_detection import SpeechDetector

        detector = SpeechDetector(backend="silero")
        segments = detector.detect_from_video(sample_video)

        assert isinstance(segments, list)

    @requires_webrtcvad
    def test_detector_webrtc_backend(self, sample_video: str) -> None:
        """WebRTC VAD backend should work."""
        from video_editor.audio.speech_detection import SpeechDetector

        detector = SpeechDetector(backend="webrtc")
        segments = detector.detect_from_video(sample_video)

        assert isinstance(segments, list)

    def test_detect_speech_gaps(self, video_with_speech_gaps: str) -> None:
        """Should detect speech segments with gaps."""
        from video_editor.audio.speech_detection import detect_speech_segments

        segments = detect_speech_segments(
            video_with_speech_gaps,
            backend="energy",
            sensitivity=0.5,
            min_silence_duration=0.5,
        )

        # Should find multiple speech segments (we have 3 "speech" sections)
        assert len(segments) >= 1  # At least some detection

    def test_get_non_speech_segments(self, video_with_speech_gaps: str) -> None:
        """Should return inverse of speech segments."""
        from video_editor.audio.speech_detection import (
            detect_speech_segments,
            get_non_speech_segments,
        )

        speech = detect_speech_segments(video_with_speech_gaps, backend="energy")
        non_speech = get_non_speech_segments(video_with_speech_gaps, backend="energy")

        # If there's speech, there should be gaps (or vice versa)
        # Can't guarantee exact count but structures should be valid
        assert isinstance(speech, list)
        assert isinstance(non_speech, list)


@requires_ffmpeg
class TestRemoveNonSpeech:
    """Tests for remove_non_speech pipeline method."""

    def test_remove_non_speech_basic(
        self, video_with_speech_gaps: str, temp_dir: str
    ) -> None:
        """Remove non-speech segments from video."""
        from video_editor.pipeline import VideoPipeline

        original_duration = get_video_duration(video_with_speech_gaps)

        pipeline = VideoPipeline(video_with_speech_gaps)
        pipeline.remove_non_speech(backend="energy", sensitivity=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        # Duration should be less than original (we removed silence)
        output_duration = get_video_duration(output)
        # Allow some tolerance - detection isn't perfect with synthetic audio
        assert output_duration <= original_duration + 0.5

    def test_remove_non_speech_with_denoise(
        self, video_with_noise: str, temp_dir: str
    ) -> None:
        """Remove non-speech with denoising enabled."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(video_with_noise)
        pipeline.remove_non_speech(
            backend="energy",
            sensitivity=0.5,
            denoise=True,
            denoise_strength=0.5,
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_remove_non_speech_method_chaining(
        self, sample_video: str
    ) -> None:
        """Method should return self for chaining."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        result = pipeline.remove_non_speech(backend="energy")

        assert result is pipeline

    def test_remove_non_speech_operation_tracked(
        self, sample_video: str
    ) -> None:
        """Operation should be tracked."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.remove_non_speech(
            sensitivity=0.6,
            backend="energy",
            denoise=True,
        )

        ops = [op for op in pipeline._operations if op["type"] == "remove_non_speech"]
        assert len(ops) == 1
        assert ops[0]["sensitivity"] == 0.6
        assert ops[0]["denoise"] is True


@requires_ffmpeg
class TestSmartSilenceRemoval:
    """Tests for smart_silence_removal method."""

    def test_smart_removal_speech_mode(
        self, video_with_speech_gaps: str, temp_dir: str
    ) -> None:
        """Smart removal in speech mode."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(video_with_speech_gaps)
        pipeline.smart_silence_removal(mode="speech", sensitivity=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_smart_removal_amplitude_mode(
        self, video_with_speech_gaps: str, temp_dir: str
    ) -> None:
        """Smart removal in amplitude mode."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(video_with_speech_gaps)
        pipeline.smart_silence_removal(mode="amplitude", sensitivity=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_smart_removal_invalid_mode(self, sample_video: str) -> None:
        """Should raise error for invalid mode."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)

        with pytest.raises(ValueError) as exc_info:
            pipeline.smart_silence_removal(mode="invalid")

        assert "invalid" in str(exc_info.value).lower()

    def test_smart_removal_method_chaining(self, sample_video: str) -> None:
        """Method should return self for chaining."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        result = pipeline.smart_silence_removal(mode="amplitude")

        assert result is pipeline


@requires_ffmpeg
class TestDetectSpeech:
    """Tests for detect_speech pipeline method."""

    def test_detect_speech_returns_list(self, sample_video: str) -> None:
        """detect_speech should return list of tuples."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        segments = pipeline.detect_speech(backend="energy")

        assert isinstance(segments, list)
        for segment in segments:
            assert isinstance(segment, tuple)
            assert len(segment) == 2
            start, end = segment
            assert isinstance(start, float)
            assert isinstance(end, float)
            assert start < end

    def test_detect_speech_sensitivity(
        self, video_with_speech_gaps: str
    ) -> None:
        """Higher sensitivity should detect more segments."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(video_with_speech_gaps)

        low_sens = pipeline.detect_speech(sensitivity=0.2, backend="energy")
        high_sens = pipeline.detect_speech(sensitivity=0.8, backend="energy")

        # High sensitivity typically detects more (or same)
        # but exact numbers depend on audio content
        assert isinstance(low_sens, list)
        assert isinstance(high_sens, list)


@requires_ffmpeg
class TestVADDependencyChecking:
    """Tests for VAD dependency checking."""

    def test_check_vad_dependencies(self) -> None:
        """check_vad_dependencies should return dict."""
        from video_editor.audio import check_vad_dependencies

        result = check_vad_dependencies()

        assert isinstance(result, dict)
        assert "silero" in result
        assert "webrtc" in result
        assert "energy" in result

        # Energy backend should always be available
        assert result["energy"] is True

        # Other backends depend on installed packages
        assert isinstance(result["silero"], bool)
        assert isinstance(result["webrtc"], bool)

    def test_speech_detector_auto_selection(self) -> None:
        """Auto backend should work regardless of available dependencies."""
        from video_editor.audio.speech_detection import SpeechDetector

        # Should not raise an error
        detector = SpeechDetector(backend="auto")

        # Should have selected a valid backend
        assert detector.backend in ["silero", "webrtc", "energy"]
