"""
Voice isolation using Demucs neural network.

Provides stem separation capabilities including:
- Vocal extraction
- Instrumental/music extraction
- Full stem separation (vocals, drums, bass, other)
"""

from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING, Callable, Optional

if TYPE_CHECKING:
    pass


class VoiceIsolationError(Exception):
    """Exception raised when voice isolation fails."""

    pass


class VoiceIsolator:
    """Handles audio stem separation using Demucs."""

    # Available Demucs models
    MODELS: dict[str, str] = {
        "htdemucs": "Best quality, 4 stems (vocals, drums, bass, other)",
        "htdemucs_ft": "Fine-tuned version, slightly better quality",
        "htdemucs_6s": "6 stems (vocals, drums, bass, guitar, piano, other)",
        "mdx": "MDX-Net model, good for vocals",
        "mdx_extra": "Enhanced MDX-Net",
    }

    # Standard stems for htdemucs
    STEMS: list[str] = ["vocals", "drums", "bass", "other"]

    def __init__(
        self,
        model: str = "htdemucs",
        device: Optional[str] = None,
        progress_callback: Optional[Callable[[float, str], None]] = None,
    ):
        """Initialize voice isolator.

        Args:
            model: Demucs model to use. See MODELS for options.
            device: Device to use ('cuda', 'cpu', or None for auto).
            progress_callback: Optional callback(progress, message) for progress updates.
        """
        self.model = model
        self.device = device
        self.progress_callback = progress_callback
        self._check_demucs()

    def _check_demucs(self) -> None:
        """Check if Demucs is available."""
        import importlib.util

        if importlib.util.find_spec("demucs") is None:
            raise VoiceIsolationError(
                "Demucs is not installed. Install it with: pip install demucs"
            )

    def _report_progress(self, progress: float, message: str) -> None:
        """Report progress if callback is set."""
        if self.progress_callback:
            self.progress_callback(progress, message)

    def separate_stems(
        self,
        audio_path: str,
        output_dir: Optional[str] = None,
        stems: Optional[list[str]] = None,
    ) -> dict[str, str]:
        """Separate audio into stems.

        Args:
            audio_path: Path to input audio file.
            output_dir: Directory to save separated stems. Uses temp dir if None.
            stems: List of stems to extract. None for all available stems.

        Returns:
            Dictionary mapping stem names to output file paths.
        """
        import torch
        from demucs.api import Separator

        self._report_progress(0.0, "Loading Demucs model...")

        # Determine device
        if self.device:
            device = self.device
        elif torch.cuda.is_available():
            device = "cuda"
        else:
            device = "cpu"

        # Create output directory
        if output_dir is None:
            output_dir = tempfile.mkdtemp(prefix="demucs_")
        else:
            os.makedirs(output_dir, exist_ok=True)

        self._report_progress(0.1, f"Initializing separator on {device}...")

        # Initialize separator
        separator = Separator(model=self.model, device=device)

        self._report_progress(0.2, "Processing audio...")

        # Separate the audio
        _, outputs = separator.separate_audio_file(Path(audio_path))

        self._report_progress(0.8, "Saving stems...")

        # Get the actual stems from the output
        stem_names = stems if stems else list(outputs.keys())
        result: dict[str, str] = {}

        input_name = Path(audio_path).stem

        for stem_name in stem_names:
            if stem_name not in outputs:
                continue

            stem_audio = outputs[stem_name]
            output_path = os.path.join(output_dir, f"{input_name}_{stem_name}.wav")

            # Save the stem using torchaudio
            import torchaudio
            torchaudio.save(output_path, stem_audio.cpu(), separator.samplerate)
            result[stem_name] = output_path

        self._report_progress(1.0, "Separation complete")

        return result

    def isolate_vocals(
        self,
        audio_path: str,
        output_dir: Optional[str] = None,
    ) -> str:
        """Extract vocals from audio.

        Args:
            audio_path: Path to input audio file.
            output_dir: Directory to save output. Uses temp dir if None.

        Returns:
            Path to extracted vocals audio file.
        """
        stems = self.separate_stems(audio_path, output_dir, stems=["vocals"])
        if "vocals" not in stems:
            raise VoiceIsolationError("Failed to extract vocals")
        return stems["vocals"]

    def isolate_instrumental(
        self,
        audio_path: str,
        output_dir: Optional[str] = None,
    ) -> str:
        """Extract instrumental (non-vocal) audio.

        This combines drums, bass, and other stems to create an instrumental track.

        Args:
            audio_path: Path to input audio file.
            output_dir: Directory to save output. Uses temp dir if None.

        Returns:
            Path to instrumental audio file.
        """
        import torch
        import torchaudio
        from demucs.api import Separator

        # Determine device
        if self.device:
            device = self.device
        elif torch.cuda.is_available():
            device = "cuda"
        else:
            device = "cpu"

        # Create output directory
        if output_dir is None:
            output_dir = tempfile.mkdtemp(prefix="demucs_")
        else:
            os.makedirs(output_dir, exist_ok=True)

        self._report_progress(0.1, "Loading model for instrumental extraction...")

        separator = Separator(model=self.model, device=device)

        self._report_progress(0.2, "Separating stems...")

        _, outputs = separator.separate_audio_file(Path(audio_path))

        self._report_progress(0.7, "Mixing instrumental stems...")

        # Combine all non-vocal stems
        instrumental_stems = [name for name in outputs.keys() if name != "vocals"]
        if not instrumental_stems:
            raise VoiceIsolationError("No instrumental stems found")

        # Sum the instrumental stems
        instrumental = outputs[instrumental_stems[0]].clone()
        for stem_name in instrumental_stems[1:]:
            instrumental += outputs[stem_name]

        # Normalize to prevent clipping
        max_val = instrumental.abs().max()
        if max_val > 1.0:
            instrumental = instrumental / max_val

        self._report_progress(0.9, "Saving instrumental track...")

        input_name = Path(audio_path).stem
        output_path = os.path.join(output_dir, f"{input_name}_instrumental.wav")

        torchaudio.save(output_path, instrumental.cpu(), separator.samplerate)

        self._report_progress(1.0, "Instrumental extraction complete")

        return output_path


def isolate_vocals_from_video(
    video_path: str,
    output_dir: Optional[str] = None,
    model: str = "htdemucs",
    progress_callback: Optional[Callable[[float, str], None]] = None,
) -> str:
    """Convenience function to isolate vocals from a video file.

    Args:
        video_path: Path to input video file.
        output_dir: Directory to save output. Uses temp dir if None.
        model: Demucs model to use.
        progress_callback: Optional progress callback.

    Returns:
        Path to extracted vocals audio file.
    """
    if output_dir is None:
        output_dir = tempfile.mkdtemp(prefix="vocals_")
    else:
        os.makedirs(output_dir, exist_ok=True)

    # First extract audio from video
    audio_path = os.path.join(output_dir, "extracted_audio.wav")

    if progress_callback:
        progress_callback(0.0, "Extracting audio from video...")

    # Use FFmpeg to extract audio
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-vn",  # No video
        "-acodec", "pcm_s16le",  # PCM format for Demucs
        "-ar", "44100",  # 44.1kHz sample rate
        "-ac", "2",  # Stereo
        audio_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise VoiceIsolationError(f"Failed to extract audio: {result.stderr}")

    if progress_callback:
        progress_callback(0.1, "Audio extracted, starting voice isolation...")

    # Now isolate vocals
    isolator = VoiceIsolator(model=model, progress_callback=progress_callback)
    return isolator.isolate_vocals(audio_path, output_dir)


def isolate_instrumental_from_video(
    video_path: str,
    output_dir: Optional[str] = None,
    model: str = "htdemucs",
    progress_callback: Optional[Callable[[float, str], None]] = None,
) -> str:
    """Convenience function to isolate instrumental from a video file.

    Args:
        video_path: Path to input video file.
        output_dir: Directory to save output. Uses temp dir if None.
        model: Demucs model to use.
        progress_callback: Optional progress callback.

    Returns:
        Path to instrumental audio file.
    """
    if output_dir is None:
        output_dir = tempfile.mkdtemp(prefix="instrumental_")
    else:
        os.makedirs(output_dir, exist_ok=True)

    # First extract audio from video
    audio_path = os.path.join(output_dir, "extracted_audio.wav")

    if progress_callback:
        progress_callback(0.0, "Extracting audio from video...")

    # Use FFmpeg to extract audio
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "44100",
        "-ac", "2",
        audio_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise VoiceIsolationError(f"Failed to extract audio: {result.stderr}")

    if progress_callback:
        progress_callback(0.1, "Audio extracted, starting instrumental isolation...")

    isolator = VoiceIsolator(model=model, progress_callback=progress_callback)
    return isolator.isolate_instrumental(audio_path, output_dir)
