"""
FFmpeg utilities for executing commands and managing operations.
"""

from __future__ import annotations

from video_editor.ffmpeg.executor import execute_ffmpeg

__all__: list[str] = ["execute_ffmpeg"]
