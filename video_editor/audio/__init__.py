"""
Audio processing module for advanced audio editing capabilities.

This module provides professional audio editing features including:
- Voice isolation (using Demucs neural network)
- VST3/VST2 plugin support (using Pedalboard)
- Audio transitions and effects
- Speech detection using Voice Activity Detection (VAD)
"""

from __future__ import annotations

from video_editor.audio.voice_isolation import VoiceIsolator
from video_editor.audio.vst_processor import VSTProcessor
from video_editor.audio.transitions import AudioTransitionHelper
from video_editor.audio.speech_detection import (
    SpeechDetector,
    SpeechSegment,
    detect_speech_segments,
    get_non_speech_segments,
)
from video_editor.audio.silence_removal import (
    remove_silence,
    speed_up_silence,
    is_auto_editor_available,
    detect_silent_segments,
)

__all__: list[str] = [
    "VoiceIsolator",
    "VSTProcessor",
    "AudioTransitionHelper",
    "SpeechDetector",
    "SpeechSegment",
    "detect_speech_segments",
    "get_non_speech_segments",
    "remove_silence",
    "speed_up_silence",
    "is_auto_editor_available",
    "detect_silent_segments",
    "check_audio_dependencies",
    "check_vad_dependencies",
]


def check_audio_dependencies() -> list[str]:
    """Check if advanced audio dependencies are installed.

    Returns:
        List of missing dependency names. Empty list means all dependencies are available.
    """
    import importlib.util

    missing: list[str] = []

    if importlib.util.find_spec("demucs") is None:
        missing.append("demucs")

    if importlib.util.find_spec("pedalboard") is None:
        missing.append("pedalboard")

    if importlib.util.find_spec("librosa") is None:
        missing.append("librosa")

    if importlib.util.find_spec("soundfile") is None:
        missing.append("soundfile")

    return missing


def check_vad_dependencies() -> dict[str, bool]:
    """Check which VAD backends are available.

    Returns:
        Dictionary mapping backend names to availability status.
    """
    import importlib.util

    availability: dict[str, bool] = {}

    # Check Silero VAD (requires torch and torchaudio)
    availability["silero"] = (
        importlib.util.find_spec("torch") is not None
        and importlib.util.find_spec("torchaudio") is not None
    )

    # Check WebRTC VAD
    availability["webrtc"] = importlib.util.find_spec("webrtcvad") is not None

    # Energy-based is always available (uses FFmpeg)
    availability["energy"] = True

    return availability
