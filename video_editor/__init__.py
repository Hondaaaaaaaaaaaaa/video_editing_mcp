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

__all__: list[str] = [
    "VideoPipeline",
    "pipelines",
    "pipeline_render",
    "execute_ffmpeg",
    "detect_silences",
    "TimeRange",
    "TimelineModification",
    "TimelineTracker",
    "_to_temp_file",
    "_is_gpu_available",
]
