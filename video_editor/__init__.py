"""
Video Editor Package

A comprehensive video editing system built on FFmpeg for use by Large Language Models.
This package provides a unified pipeline architecture for efficient video operations.
"""

from __future__ import annotations

from video_editor.pipeline import VideoPipeline, pipelines, pipeline_render
from video_editor.pipeline.operations import detect_silences
from video_editor.ffmpeg.executor import execute_ffmpeg
from video_editor.timeline import TimeRange, TimelineModification, TimelineTracker
from video_editor.utils.helpers import _to_temp_file, _is_gpu_available
from video_editor.audio import (
    VoiceIsolator,
    VSTProcessor,
    AudioTransitionHelper,
    SpeechDetector,
    detect_speech_segments,
    get_non_speech_segments,
    check_audio_dependencies,
    check_vad_dependencies,
)

__all__: list[str] = [
    # Pipeline
    "VideoPipeline",
    "pipelines",
    "pipeline_render",
    # FFmpeg
    "execute_ffmpeg",
    "detect_silences",
    # Timeline
    "TimeRange",
    "TimelineModification",
    "TimelineTracker",
    # Audio
    "VoiceIsolator",
    "VSTProcessor",
    "AudioTransitionHelper",
    "SpeechDetector",
    "detect_speech_segments",
    "get_non_speech_segments",
    "check_audio_dependencies",
    "check_vad_dependencies",
    # Utils
    "_to_temp_file",
    "_is_gpu_available",
]
