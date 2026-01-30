"""
Speech detection using Voice Activity Detection (VAD).

Provides accurate speech detection that distinguishes between:
- Actual speech
- Background noise
- Music
- Silence

Uses Silero VAD for high accuracy speech detection.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, List, Optional, Tuple


class SpeechDetectionError(Exception):
    """Exception raised when speech detection fails."""
    pass


@dataclass
class SpeechSegment:
    """Represents a detected speech segment."""
    start: float  # Start time in seconds
    end: float    # End time in seconds

    @property
    def duration(self) -> float:
        return self.end - self.start


def check_silero_available() -> bool:
    """Check if Silero VAD is available."""
    import importlib.util

    # Silero VAD is loaded via torch.hub and needs torchaudio for audio reading
    return (
        importlib.util.find_spec("torch") is not None
        and importlib.util.find_spec("torchaudio") is not None
    )


def check_webrtc_vad_available() -> bool:
    """Check if WebRTC VAD is available."""
    import importlib.util

    return importlib.util.find_spec("webrtcvad") is not None


class SpeechDetector:
    """Detect speech segments using Voice Activity Detection."""

    # Supported VAD backends
    BACKENDS = ["silero", "webrtc", "energy"]

    def __init__(
        self,
        backend: str = "auto",
        sensitivity: float = 0.5,
        min_speech_duration: float = 0.25,
        min_silence_duration: float = 0.5,
        speech_pad: float = 0.1,
        progress_callback: Optional[Callable[[float, str], None]] = None,
    ):
        """Initialize speech detector.

        Args:
            backend: VAD backend to use ("silero", "webrtc", "energy", or "auto")
            sensitivity: Detection sensitivity (0.0-1.0, higher = more sensitive)
            min_speech_duration: Minimum speech segment duration in seconds
            min_silence_duration: Minimum silence duration to split segments
            speech_pad: Padding to add around speech segments in seconds
            progress_callback: Optional callback(progress, message) for updates
        """
        self.sensitivity = max(0.0, min(1.0, sensitivity))
        self.min_speech_duration = min_speech_duration
        self.min_silence_duration = min_silence_duration
        self.speech_pad = speech_pad
        self.progress_callback = progress_callback

        # Select backend
        if backend == "auto":
            if check_silero_available():
                self.backend = "silero"
            elif check_webrtc_vad_available():
                self.backend = "webrtc"
            else:
                self.backend = "energy"
        else:
            self.backend = backend

        self._model: Any = None
        self._utils: Any = None

    def _report_progress(self, progress: float, message: str) -> None:
        """Report progress if callback is set."""
        if self.progress_callback:
            self.progress_callback(progress, message)

    def _load_silero_model(self) -> None:
        """Load Silero VAD model."""
        if self._model is not None:
            return

        import torch

        self._report_progress(0.05, "Loading Silero VAD model...")

        # Load model from torch hub
        model, utils = torch.hub.load(
            repo_or_dir='snakers4/silero-vad',
            model='silero_vad',
            force_reload=False,
            onnx=False,
            trust_repo=True
        )

        self._model = model
        self._utils = utils

    def _detect_with_silero(
        self,
        audio_path: str,
    ) -> List[SpeechSegment]:
        """Detect speech using Silero VAD."""

        self._load_silero_model()

        assert self._utils is not None, "Silero model not loaded"
        (get_speech_timestamps,
         save_audio,
         read_audio,
         VADIterator,
         collect_chunks) = self._utils

        self._report_progress(0.1, "Reading audio file...")

        # Read audio at 16kHz (required by Silero)
        wav = read_audio(audio_path, sampling_rate=16000)

        self._report_progress(0.2, "Detecting speech segments...")

        # Map sensitivity to threshold (inverse relationship)
        # sensitivity 0.0 -> threshold 0.9 (less sensitive)
        # sensitivity 1.0 -> threshold 0.1 (more sensitive)
        threshold = 0.9 - (self.sensitivity * 0.8)

        # Get speech timestamps
        speech_timestamps = get_speech_timestamps(
            wav,
            self._model,
            threshold=threshold,
            sampling_rate=16000,
            min_speech_duration_ms=int(self.min_speech_duration * 1000),
            min_silence_duration_ms=int(self.min_silence_duration * 1000),
            speech_pad_ms=int(self.speech_pad * 1000),
        )

        self._report_progress(0.9, "Processing results...")

        # Convert to SpeechSegment objects
        segments = []
        for ts in speech_timestamps:
            start = ts['start'] / 16000  # Convert samples to seconds
            end = ts['end'] / 16000
            segments.append(SpeechSegment(start=start, end=end))

        return segments

    def _detect_with_webrtc(
        self,
        audio_path: str,
    ) -> List[SpeechSegment]:
        """Detect speech using WebRTC VAD."""
        import webrtcvad
        import wave

        self._report_progress(0.1, "Loading audio for WebRTC VAD...")

        # WebRTC VAD requires specific format: 16-bit PCM, mono, 8/16/32kHz
        # Convert audio to required format
        temp_wav = tempfile.mktemp(suffix=".wav")

        cmd = [
            "ffmpeg", "-y",
            "-i", audio_path,
            "-ar", "16000",
            "-ac", "1",
            "-sample_fmt", "s16",
            temp_wav
        ]
        subprocess.run(cmd, capture_output=True)

        try:
            # Read the WAV file
            with wave.open(temp_wav, 'rb') as wf:
                sample_rate = wf.getframerate()
                sample_width = wf.getsampwidth()
                num_frames = wf.getnframes()
                audio_data = wf.readframes(num_frames)

            self._report_progress(0.2, "Running VAD analysis...")

            # Create VAD
            # Aggressiveness: 0 (least aggressive) to 3 (most aggressive)
            aggressiveness = int((1 - self.sensitivity) * 3)
            vad = webrtcvad.Vad(aggressiveness)

            # Process in 30ms frames (required by WebRTC VAD)
            frame_duration_ms = 30
            frame_size = int(sample_rate * frame_duration_ms / 1000) * sample_width

            segments = []
            current_start = None
            speech_frames = 0
            silence_frames = 0

            min_speech_frames = int(self.min_speech_duration * 1000 / frame_duration_ms)
            min_silence_frames = int(self.min_silence_duration * 1000 / frame_duration_ms)

            for i in range(0, len(audio_data) - frame_size, frame_size):
                frame = audio_data[i:i + frame_size]
                time_offset = i / (sample_rate * sample_width)

                is_speech = vad.is_speech(frame, sample_rate)

                if is_speech:
                    if current_start is None:
                        current_start = time_offset
                        speech_frames = 1
                    else:
                        speech_frames += 1
                    silence_frames = 0
                else:
                    if current_start is not None:
                        silence_frames += 1
                        if silence_frames >= min_silence_frames and speech_frames >= min_speech_frames:
                            # End of speech segment
                            end_time = time_offset - (silence_frames * frame_duration_ms / 1000)
                            segments.append(SpeechSegment(
                                start=max(0, current_start - self.speech_pad),
                                end=end_time + self.speech_pad
                            ))
                            current_start = None
                            speech_frames = 0
                            silence_frames = 0

            # Handle final segment
            if current_start is not None and speech_frames >= min_speech_frames:
                end_time = len(audio_data) / (sample_rate * sample_width)
                segments.append(SpeechSegment(
                    start=max(0, current_start - self.speech_pad),
                    end=end_time
                ))

            self._report_progress(0.9, "Processing results...")
            return segments

        finally:
            if os.path.exists(temp_wav):
                os.remove(temp_wav)

    def _detect_with_energy(
        self,
        audio_path: str,
    ) -> List[SpeechSegment]:
        """Detect speech using energy-based analysis with RMS.

        This is a fallback when no ML-based VAD is available.
        Uses adaptive thresholding on RMS energy.
        """
        self._report_progress(0.1, "Analyzing audio energy...")

        # Use FFmpeg to get audio levels
        cmd = [
            "ffmpeg",
            "-i", audio_path,
            "-af", "astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
            "-f", "null",
            "-"
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        # Parse RMS levels from output
        import re
        rms_pattern = r"lavfi\.astats\.Overall\.RMS_level=(-?[\d.]+)"
        rms_values = []

        for line in result.stderr.split('\n'):
            match = re.search(rms_pattern, line)
            if match:
                rms_values.append(float(match.group(1)))

        if not rms_values:
            # Fallback to simpler detection
            return self._detect_with_ffmpeg_silence(audio_path)

        self._report_progress(0.5, "Finding speech segments...")

        # Calculate adaptive threshold
        import statistics
        rms_values = [v for v in rms_values if v > -100]  # Filter out -inf

        if not rms_values:
            return []

        mean_rms = statistics.mean(rms_values)
        std_rms = statistics.stdev(rms_values) if len(rms_values) > 1 else 10

        # Threshold based on sensitivity
        # Higher sensitivity = lower threshold = more speech detected
        threshold = mean_rms - (self.sensitivity * 2 * std_rms)

        # Find speech segments
        segments = []
        current_start = None
        frame_duration = 1.0 / len(rms_values) if rms_values else 0.1

        for i, rms in enumerate(rms_values):
            time_offset = i * frame_duration
            is_speech = rms > threshold

            if is_speech and current_start is None:
                current_start = time_offset
            elif not is_speech and current_start is not None:
                duration = time_offset - current_start
                if duration >= self.min_speech_duration:
                    segments.append(SpeechSegment(
                        start=max(0, current_start - self.speech_pad),
                        end=time_offset + self.speech_pad
                    ))
                current_start = None

        # Handle final segment
        if current_start is not None:
            end_time = len(rms_values) * frame_duration
            if end_time - current_start >= self.min_speech_duration:
                segments.append(SpeechSegment(
                    start=max(0, current_start - self.speech_pad),
                    end=end_time
                ))

        self._report_progress(0.9, "Processing results...")
        return segments

    def _detect_with_ffmpeg_silence(
        self,
        audio_path: str,
    ) -> List[SpeechSegment]:
        """Fallback to FFmpeg silencedetect (inverted to get speech)."""
        # Map sensitivity to noise threshold
        # sensitivity 0.0 -> -50dB (less sensitive, more things considered silence)
        # sensitivity 1.0 -> -20dB (more sensitive, only quiet things are silence)
        noise_threshold = -50 + (self.sensitivity * 30)

        cmd = [
            "ffmpeg",
            "-i", audio_path,
            "-af", f"silencedetect=noise={noise_threshold}dB:d={self.min_silence_duration}",
            "-f", "null",
            "-"
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        # Parse silence segments
        import re
        silences = []
        current_start = None

        for line in result.stderr.split('\n'):
            if "silence_start:" in line:
                match = re.search(r"silence_start:\s*([\d.]+)", line)
                if match:
                    current_start = float(match.group(1))
            elif "silence_end:" in line:
                match = re.search(r"silence_end:\s*([\d.]+)", line)
                if match and current_start is not None:
                    silences.append((current_start, float(match.group(1))))
                    current_start = None

        # Get total duration
        duration_cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            audio_path
        ]
        result = subprocess.run(duration_cmd, capture_output=True, text=True)
        total_duration = float(result.stdout.strip()) if result.stdout.strip() else 0

        # Invert silences to get speech segments
        segments = []
        prev_end = 0.0

        for silence_start, silence_end in silences:
            if silence_start > prev_end + self.min_speech_duration:
                segments.append(SpeechSegment(
                    start=max(0, prev_end - self.speech_pad),
                    end=silence_start + self.speech_pad
                ))
            prev_end = silence_end

        # Add final segment if there's speech at the end
        if total_duration > prev_end + self.min_speech_duration:
            segments.append(SpeechSegment(
                start=max(0, prev_end - self.speech_pad),
                end=total_duration
            ))

        return segments

    def detect(
        self,
        audio_path: str,
    ) -> List[SpeechSegment]:
        """Detect speech segments in an audio file.

        Args:
            audio_path: Path to audio file

        Returns:
            List of SpeechSegment objects representing speech regions
        """
        self._report_progress(0.0, f"Starting speech detection with {self.backend} backend...")

        if self.backend == "silero":
            if not check_silero_available():
                raise SpeechDetectionError(
                    "Silero VAD requires PyTorch. Install with: pip install torch torchaudio"
                )
            segments = self._detect_with_silero(audio_path)
        elif self.backend == "webrtc":
            if not check_webrtc_vad_available():
                raise SpeechDetectionError(
                    "WebRTC VAD not installed. Install with: pip install webrtcvad"
                )
            segments = self._detect_with_webrtc(audio_path)
        else:
            segments = self._detect_with_energy(audio_path)

        self._report_progress(1.0, f"Detected {len(segments)} speech segments")
        return segments

    def detect_from_video(
        self,
        video_path: str,
        output_dir: Optional[str] = None,
    ) -> List[SpeechSegment]:
        """Detect speech segments from a video file.

        Extracts audio and runs speech detection.

        Args:
            video_path: Path to video file
            output_dir: Optional directory for temporary files

        Returns:
            List of SpeechSegment objects
        """
        # Extract audio to temp file
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
            audio_path = os.path.join(output_dir, "extracted_audio.wav")
        else:
            audio_path = tempfile.mktemp(suffix=".wav")

        self._report_progress(0.0, "Extracting audio from video...")

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            audio_path
        ]

        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            raise SpeechDetectionError(f"Failed to extract audio: {result.stderr.decode()}")

        try:
            return self.detect(audio_path)
        finally:
            # Cleanup temp file if we created it
            if not output_dir and os.path.exists(audio_path):
                os.remove(audio_path)


def detect_speech_segments(
    input_path: str,
    sensitivity: float = 0.5,
    min_speech_duration: float = 0.25,
    min_silence_duration: float = 0.5,
    speech_pad: float = 0.1,
    backend: str = "auto",
) -> List[Tuple[float, float]]:
    """Convenience function to detect speech segments.

    Args:
        input_path: Path to video or audio file
        sensitivity: Detection sensitivity (0.0-1.0)
        min_speech_duration: Minimum speech segment duration in seconds
        min_silence_duration: Minimum silence to split segments
        speech_pad: Padding around speech segments
        backend: VAD backend ("silero", "webrtc", "energy", "auto")

    Returns:
        List of (start, end) tuples representing speech segments
    """
    detector = SpeechDetector(
        backend=backend,
        sensitivity=sensitivity,
        min_speech_duration=min_speech_duration,
        min_silence_duration=min_silence_duration,
        speech_pad=speech_pad,
    )

    # Check if input is video or audio
    ext = Path(input_path).suffix.lower()
    video_extensions = {'.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv'}

    if ext in video_extensions:
        segments = detector.detect_from_video(input_path)
    else:
        segments = detector.detect(input_path)

    return [(s.start, s.end) for s in segments]


def get_non_speech_segments(
    input_path: str,
    sensitivity: float = 0.5,
    min_speech_duration: float = 0.25,
    min_silence_duration: float = 0.5,
    speech_pad: float = 0.1,
    backend: str = "auto",
) -> List[Tuple[float, float]]:
    """Get segments that do NOT contain speech (inverse of detect_speech_segments).

    Args:
        input_path: Path to video or audio file
        sensitivity: Detection sensitivity (0.0-1.0)
        min_speech_duration: Minimum speech segment duration
        min_silence_duration: Minimum silence to split segments
        speech_pad: Padding around speech segments
        backend: VAD backend

    Returns:
        List of (start, end) tuples representing non-speech segments
    """
    # Get speech segments
    speech_segments = detect_speech_segments(
        input_path,
        sensitivity=sensitivity,
        min_speech_duration=min_speech_duration,
        min_silence_duration=min_silence_duration,
        speech_pad=speech_pad,
        backend=backend,
    )

    if not speech_segments:
        return []

    # Get total duration
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        input_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    total_duration = float(result.stdout.strip()) if result.stdout.strip() else 0

    # Invert to get non-speech segments
    non_speech = []
    prev_end = 0.0

    for start, end in speech_segments:
        if start > prev_end:
            non_speech.append((prev_end, start))
        prev_end = end

    # Add final non-speech segment if any
    if total_duration > prev_end:
        non_speech.append((prev_end, total_duration))

    return non_speech
