"""
FFmpeg utilities for executing commands with progress tracking.
This is used for direct FFmpeg command execution rather than the pipeline architecture.
"""

from __future__ import annotations

import asyncio
import re
import sys
from re import Match
from typing import TYPE_CHECKING

from fastmcp import Context

if TYPE_CHECKING:
    from asyncio.subprocess import Process

# Flag to indicate if GPU is available
_gpu_available: bool | None = None


async def execute_ffmpeg(command: str, ctx: Context) -> bytes:
    """Execute an arbitrary ffmpeg command with progress tracking."""
    # Import here to avoid circular imports
    from video_editor.pipeline import VideoPipeline

    # Create a pipeline to use its output path generation
    dummy_pipeline: VideoPipeline = VideoPipeline("dummy")
    output_path: str = dummy_pipeline.build_output_path("output", "mp4")

    # Replace any output references with our managed output path
    if "-y " not in command and " -y" not in command:
        command = command + " -y"

    # Extract the input file path for error reporting
    input_match: Match[str] | None = re.search(r"-i\s+([^\s]+)", command)
    _input_path: str = input_match.group(1) if input_match else "unknown_input"

    try:
        process: Process = await asyncio.create_subprocess_shell(
            f"{command} {output_path}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await ctx.info(f"Starting: {command}")

        assert process.stderr is not None, "stderr pipe must be available"

        while True:
            line: bytes = await process.stderr.readline()
            if not line:
                break
            text: str = line.decode().strip()
            await ctx.info(text)
            if "frame=" in text:
                # Parse progress
                frame_match: Match[str] | None = re.search(r"frame=\s*(\d+)", text)
                time_match: Match[str] | None = re.search(r"time=\s*(\d+:\d+:\d+\.\d+)", text)
                if frame_match and time_match:
                    # Could calculate progress if duration is known
                    pass

        stdout: bytes
        stderr: bytes
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_message: str = stderr.decode()
            print(f"FFmpeg error: {error_message}", file=sys.stderr)
            raise Exception(error_message)

        # Log the output path
        await ctx.info(f"Output saved to {output_path}")

        with open(output_path, "rb") as f:
            data: bytes = f.read()
        return data
    except Exception as e:
        print(f"Exception in execute_ffmpeg: {e}", file=sys.stderr)
        await ctx.report_progress(progress=1.0, total=1.0)
        raise
