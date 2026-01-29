"""
Pipeline architecture for video processing operations.

This module provides the pipeline architecture for efficient video operations.
It allows chaining of operations in a single FFmpeg call.
"""

from __future__ import annotations

from video_editor.pipeline.core import VideoPipeline, pipelines, pipeline_render, create_slideshow

__all__: list[str] = ["VideoPipeline", "pipelines", "pipeline_render", "create_slideshow"]
