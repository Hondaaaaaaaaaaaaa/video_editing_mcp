"""
Video Editing MCP Server

A comprehensive video editing pipeline built on FFmpeg for use by Large Language Models.
This server provides a unified pipeline architecture for efficient video operations:

Features:
- Consistent pipeline architecture for all video operations
- Efficient chaining of operations in a single FFmpeg call
- File output organized in a 'render' folder beside the original video
- Comprehensive set of video editing operations:
  - Trimming, cropping, scaling, rotating
  - Speed manipulation
  - Text overlays
  - Video overlays and picture-in-picture
  - Color grading
  - Audio manipulations
  - Transitions between videos
  - Segment deletion
  - Special effects and filters

The pipeline architecture ensures that operations are processed efficiently
without creating unnecessary intermediate files.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import uuid
from typing import Dict, List, Optional, Tuple, Union

from fastmcp import FastMCP

# Import from our new module structure
from video_editor import VideoPipeline, detect_silences, pipeline_render, pipelines
from video_editor.utils.helpers import _is_gpu_available

# Create a server instance
mcp: FastMCP = FastMCP(name="Video Editing Server")

# Setup logging for progress reporting
logging.basicConfig(level=logging.INFO)
logger: logging.Logger = logging.getLogger("video_editor")

# Type alias for silence detection results
SilenceSegment = Dict[str, float]
SilenceResult = Dict[str, Union[int, float, List[SilenceSegment]]]


@mcp.tool()
def create_video_pipeline(input_path: str) -> str:
    """Create a new video processing pipeline and return its ID.

    This allows you to chain multiple operations before rendering the final result.

    Returns:
        Pipeline ID to use in subsequent operations
    """
    # Ensure input exists
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    pid: str = str(uuid.uuid4())
    pipelines[pid] = VideoPipeline(input_path)
    return pid


@mcp.tool()
def add_trim(pipeline_id: str, start_time: Union[float, str], end_time: Optional[Union[float, str]] = None) -> str:
    """Add a trim operation to the pipeline.

    Parameters:
    - pipeline_id: ID returned from create_video_pipeline
    - start_time: Can be float (seconds) or string timestamp (HH:MM:SS.mmm)
    - end_time: Can be float (seconds) or string timestamp (HH:MM:SS.mmm)

    Returns:
        The same pipeline ID for chaining operations
    """
    if pipeline_id not in pipelines:
        raise ValueError(f"Pipeline ID not found: {pipeline_id}")

    # Convert string timestamps to float if needed
    start_seconds: Union[float, str] = start_time
    end_seconds: Optional[Union[float, str]] = end_time

    if isinstance(start_time, str) and ":" in start_time:
        parts: List[str] = start_time.split(":")
        if len(parts) == 3:
            h, m, s = parts
            start_seconds = float(h) * 3600 + float(m) * 60 + float(s)

    if isinstance(end_time, str) and ":" in end_time:
        parts = end_time.split(":")
        if len(parts) == 3:
            h, m, s = parts
            end_seconds = float(h) * 3600 + float(m) * 60 + float(s)

    pipelines[pipeline_id].trim(start_seconds, end_seconds)  # type: ignore[arg-type]
    return pipeline_id


@mcp.tool()
def add_speed_change(
    pipeline_id: str,
    speed: float,
    preserve_audio_pitch: bool = True,
    max_speed: float = 16.0,
    start_time: Optional[float] = None,
    end_time: Optional[float] = None,
) -> str:
    """Add a speed change operation to the pipeline.

    Parameters:
    - pipeline_id: ID returned from create_video_pipeline
    - speed: Speed multiplier (1.0 = normal, 2.0 = double speed, 0.5 = half speed)
    - preserve_audio_pitch: If True, maintains audio pitch. Set to False for higher speeds.
    - max_speed: Maximum speed multiplier (values too high can cause processing issues)
    - start_time: Start time in seconds to apply the effect (None = from beginning)
    - end_time: End time in seconds to apply the effect (None = until end)

    Returns:
        The same pipeline ID for chaining operations
    """
    if pipeline_id not in pipelines:
        raise ValueError(f"Pipeline ID not found: {pipeline_id}")

    pipelines[pipeline_id].change_speed(speed, preserve_audio_pitch, max_speed, start_time, end_time)
    return pipeline_id


@mcp.tool()
def add_text_overlay(
    pipeline_id: str,
    text: str,
    fontfile: str,
    font_size: int,
    color: str,
    opacity: float,
    x: str,
    y: str,
    start_time: float = 0,
    end_time: Optional[float] = None,
    scale: float = 1.0,
) -> str:
    """Add a text overlay operation to the pipeline.

    Parameters:
    - pipeline_id: ID returned from create_video_pipeline
    - text: Text to display
    - fontfile: Path to the font file
    - font_size: Font size in pixels
    - color: Color in hex format (e.g., 'white', 'black', '0xFFFFFF')
    - opacity: Opacity from 0.0 (transparent) to 1.0 (opaque)
    - x, y: Position coordinates (can be expressions like 'w-text_w-10')
    - start_time, end_time: When to show the text (in seconds)
    - scale: Scale factor for the font size

    Returns:
        The same pipeline ID for chaining operations
    """
    if pipeline_id not in pipelines:
        raise ValueError(f"Pipeline ID not found: {pipeline_id}")

    pipelines[pipeline_id].add_text(text, fontfile, font_size, color, opacity, x, y, start_time, end_time, scale)
    return pipeline_id


@mcp.tool()
def add_volume_change(pipeline_id: str, volume: float) -> str:
    """Add a volume change operation to the pipeline.

    Parameters:
    - pipeline_id: ID returned from create_video_pipeline
    - volume: Volume multiplier (1.0 = normal, 0.5 = 50% volume, 2.0 = double volume)

    Returns:
        The same pipeline ID for chaining operations
    """
    if pipeline_id not in pipelines:
        raise ValueError(f"Pipeline ID not found: {pipeline_id}")

    pipelines[pipeline_id].change_volume(volume)
    return pipeline_id


@mcp.tool()
def add_color_grade(
    pipeline_id: str,
    brightness: float = 0.0,
    contrast: float = 1.0,
    saturation: float = 1.0,
    hue: float = 0.0,
    black_level: float = 0.0,
    white_level: float = 1.0,
    start_time: Optional[float] = None,
    end_time: Optional[float] = None,
) -> str:
    """Add a color grading operation to the pipeline.

    Parameters:
    - pipeline_id: ID returned from create_video_pipeline
    - brightness: Brightness adjustment (-1.0 to 1.0, 0 = no change)
    - contrast: Contrast multiplier (0.0 to 10.0, 1.0 = no change)
    - saturation: Saturation multiplier (0.0 to 10.0, 1.0 = no change)
    - hue: Hue rotation in degrees (-180 to 180, 0 = no change)
    - black_level: Black level (0.0 to 1.0)
    - white_level: White level (0.0 to 1.0)
    - start_time: Start time in seconds to apply the effect (None = from beginning)
    - end_time: End time in seconds to apply the effect (None = until end)

    Returns:
        The same pipeline ID for chaining operations
    """
    if pipeline_id not in pipelines:
        raise ValueError(f"Pipeline ID not found: {pipeline_id}")

    pipelines[pipeline_id].color_grade(brightness, contrast, saturation, hue, black_level, white_level, start_time, end_time)
    return pipeline_id


@mcp.tool()
def add_scale(pipeline_id: str, width: int, height: int, start_time: Optional[float] = None, end_time: Optional[float] = None) -> str:
    """Add a scaling operation to the pipeline.

    Parameters:
    - pipeline_id: ID returned from create_video_pipeline
    - width: Target width in pixels
    - height: Target height in pixels
    - start_time: Start time in seconds to apply the effect (None = from beginning)
    - end_time: End time in seconds to apply the effect (None = until end)

    Returns:
        The same pipeline ID for chaining operations
    """
    if pipeline_id not in pipelines:
        raise ValueError(f"Pipeline ID not found: {pipeline_id}")

    pipelines[pipeline_id].scale(width, height, start_time, end_time)
    return pipeline_id


@mcp.tool()
def add_rotate(pipeline_id: str, angle: float, start_time: Optional[float] = None, end_time: Optional[float] = None) -> str:
    """Add a rotation operation to the pipeline.

    Parameters:
    - pipeline_id: ID returned from create_video_pipeline
    - angle: Rotation angle in degrees
    - start_time: Start time in seconds to apply the effect (None = from beginning)
    - end_time: End time in seconds to apply the effect (None = until end)

    Returns:
        The same pipeline ID for chaining operations
    """
    if pipeline_id not in pipelines:
        raise ValueError(f"Pipeline ID not found: {pipeline_id}")

    pipelines[pipeline_id].rotate(angle, start_time, end_time)
    return pipeline_id


@mcp.tool()
def add_flip(
    pipeline_id: str, horizontal: bool = False, vertical: bool = False, start_time: Optional[float] = None, end_time: Optional[float] = None
) -> str:
    """Add a flip operation to the pipeline.

    Parameters:
    - pipeline_id: ID returned from create_video_pipeline
    - horizontal: Whether to flip horizontally
    - vertical: Whether to flip vertically
    - start_time: Start time in seconds to apply the effect (None = from beginning)
    - end_time: End time in seconds to apply the effect (None = until end)

    Returns:
        The same pipeline ID for chaining operations
    """
    if pipeline_id not in pipelines:
        raise ValueError(f"Pipeline ID not found: {pipeline_id}")

    pipelines[pipeline_id].flip(horizontal, vertical, start_time, end_time)
    return pipeline_id


@mcp.tool()
def add_crop(pipeline_id: str, x: int, y: int, width: int, height: int, start_time: Optional[float] = None, end_time: Optional[float] = None) -> str:
    """Add a crop operation to the pipeline.

    Parameters:
    - pipeline_id: ID returned from create_video_pipeline
    - x, y: Top-left corner coordinates
    - width, height: Dimensions of the crop area
    - start_time: Start time in seconds to apply the effect (None = from beginning)
    - end_time: End time in seconds to apply the effect (None = until end)

    Returns:
        The same pipeline ID for chaining operations
    """
    if pipeline_id not in pipelines:
        raise ValueError(f"Pipeline ID not found: {pipeline_id}")

    pipelines[pipeline_id].crop(x, y, width, height, start_time, end_time)
    return pipeline_id


@mcp.tool()
def add_overlay(
    pipeline_id: str,
    overlay_path: str,
    x: int = 0,
    y: int = 0,
    start_time: float = 0,
    end_time: Optional[float] = None,
    loop: bool = False,
    speed_adjust: bool = False,
    trim: bool = True,
) -> str:
    """Add an overlay operation to the pipeline.

    Parameters:
    - pipeline_id: ID returned from create_video_pipeline
    - overlay_path: Path to the overlay image/video
    - x, y: Position coordinates
    - start_time, end_time: When to show the overlay (in seconds)
    - loop: If True, loop the overlay if it's shorter than the time range
    - speed_adjust: If True, speed up/slow down the overlay to match the time range
    - trim: If True (default), trim the overlay if it's longer than the time range

    Returns:
        The same pipeline ID for chaining operations
    """
    if pipeline_id not in pipelines:
        raise ValueError(f"Pipeline ID not found: {pipeline_id}")

    # Ensure overlay exists
    if not os.path.exists(overlay_path):
        raise FileNotFoundError(f"Overlay file not found: {overlay_path}")

    pipelines[pipeline_id].overlay(overlay_path, x, y, start_time, end_time, loop, speed_adjust, trim)
    return pipeline_id


@mcp.tool()
def add_chroma_key(
    pipeline_id: str, color: str, similarity: float = 0.3, blend: float = 0.1, start_time: Optional[float] = None, end_time: Optional[float] = None
) -> str:
    """Add a chroma key operation to the pipeline.

    Parameters:
    - pipeline_id: ID returned from create_video_pipeline
    - color: Color to key out (e.g., 'green', '0x00FF00')
    - similarity: How similar colors need to be to be keyed out (0.0-1.0)
    - blend: Blend factor for edges (0.0-1.0)
    - start_time: Start time in seconds to apply the effect (None = from beginning)
    - end_time: End time in seconds to apply the effect (None = until end)

    Returns:
        The same pipeline ID for chaining operations
    """
    if pipeline_id not in pipelines:
        raise ValueError(f"Pipeline ID not found: {pipeline_id}")

    pipelines[pipeline_id].chroma_key(color, similarity, blend, start_time, end_time)
    return pipeline_id


@mcp.tool()
def add_audio_track(pipeline_id: str, audio_path: str, start_time: float = 0, volume: float = 1.0) -> str:
    """Add an audio track to the pipeline.

    Parameters:
    - pipeline_id: ID returned from create_video_pipeline
    - audio_path: Path to the audio file
    - start_time: When to start the audio (in seconds)
    - volume: Volume level for the added audio

    Returns:
        The same pipeline ID for chaining operations
    """
    if pipeline_id not in pipelines:
        raise ValueError(f"Pipeline ID not found: {pipeline_id}")

    # Ensure audio exists
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    pipelines[pipeline_id].add_audio(audio_path, start_time, volume)
    return pipeline_id


@mcp.tool()
def add_transition(
    pipeline_id: str, second_path: str, transition_type: str, duration: float, start_time: Optional[float] = None, end_time: Optional[float] = None
) -> str:
    """Add a transition operation to the pipeline.

    Parameters:
    - pipeline_id: ID returned from create_video_pipeline
    - second_path: Path to the second video
    - transition_type: Type of transition ('fade', 'wipe_lr', 'wipe_rl', 'wipe_tb', 'wipe_bt')
    - duration: Duration of the transition in seconds
    - start_time: Start time in seconds to apply the transition (None = at end of video)
    - end_time: End time in seconds to end the transition (None = calculated from start + duration)

    Returns:
        The same pipeline ID for chaining operations
    """
    if pipeline_id not in pipelines:
        raise ValueError(f"Pipeline ID not found: {pipeline_id}")

    # Ensure second video exists
    if not os.path.exists(second_path):
        raise FileNotFoundError(f"Second video not found: {second_path}")

    pipelines[pipeline_id].apply_transition(second_path, transition_type, duration, start_time, end_time)
    return pipeline_id


@mcp.tool()
def add_vst3_processing(pipeline_id: str, plugin_path: str, start_time: Optional[float] = None, end_time: Optional[float] = None) -> str:
    """Add a VST3 audio processing operation to the pipeline.

    Parameters:
    - pipeline_id: ID returned from create_video_pipeline
    - plugin_path: Path to the VST3 plugin
    - start_time: Start time in seconds to apply the effect (None = from beginning)
    - end_time: End time in seconds to apply the effect (None = until end)

    Returns:
        The same pipeline ID for chaining operations
    """
    if pipeline_id not in pipelines:
        raise ValueError(f"Pipeline ID not found: {pipeline_id}")

    # Ensure plugin exists
    if not os.path.exists(plugin_path):
        raise FileNotFoundError(f"VST3 plugin not found: {plugin_path}")

    pipelines[pipeline_id].apply_vst3(plugin_path, start_time, end_time)
    return pipeline_id


@mcp.tool()
def add_segment_deletion(pipeline_id: str, start_time: float, end_time: float) -> str:
    """Add a segment deletion operation to the pipeline.

    Parameters:
    - pipeline_id: ID returned from create_video_pipeline
    - start_time: Start of segment to delete (in seconds)
    - end_time: End of segment to delete (in seconds)

    Returns:
        The same pipeline ID for chaining operations
    """
    if pipeline_id not in pipelines:
        raise ValueError(f"Pipeline ID not found: {pipeline_id}")

    pipelines[pipeline_id].delete_segment(start_time, end_time)
    return pipeline_id


@mcp.tool()
def add_concatenation(pipeline_id: str, additional_files: List[str]) -> str:
    """Add a concatenation operation to the pipeline.

    Parameters:
    - pipeline_id: ID returned from create_video_pipeline
    - additional_files: List of additional file paths to concatenate

    Returns:
        The same pipeline ID for chaining operations
    """
    if pipeline_id not in pipelines:
        raise ValueError(f"Pipeline ID not found: {pipeline_id}")

    # Ensure all files exist
    for file_path in additional_files:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

    pipelines[pipeline_id].concat(additional_files)
    return pipeline_id


@mcp.tool()
def add_silence_removal(pipeline_id: str, noise_threshold: float = -30.0, min_silence_duration: float = 0.5, padding: float = 0.1) -> str:
    """Add a silence removal operation to the pipeline.

    This analyzes the audio track to find silent portions and removes them,
    creating a more compact video without dead air.

    Parameters:
    - pipeline_id: ID returned from create_video_pipeline
    - noise_threshold: dB threshold below which audio is considered silence (default -30dB)
    - min_silence_duration: Minimum duration in seconds for a segment to be considered silence (default 0.5s)
    - padding: Amount of silence to keep at the edges of speech in seconds (default 0.1s)

    Returns:
        The same pipeline ID for chaining operations
    """
    if pipeline_id not in pipelines:
        raise ValueError(f"Pipeline ID not found: {pipeline_id}")

    pipelines[pipeline_id].remove_silences(noise_threshold, min_silence_duration, padding)
    return pipeline_id


@mcp.tool()
def get_silences(video_path: str, noise_threshold: float = -30.0, min_silence_duration: float = 0.5) -> str:
    """Detect and return silent segments in a video.

    This analyzes the audio track and returns a list of time ranges where silence was detected.
    Useful for previewing what would be removed before applying silence removal.

    Parameters:
    - video_path: Path to the video file
    - noise_threshold: dB threshold below which audio is considered silence (default -30dB)
    - min_silence_duration: Minimum duration in seconds for a segment to be considered silence (default 0.5s)

    Returns:
        JSON string containing list of silent segments with start and end times
    """
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    silences: List[Tuple[float, float]] = detect_silences(video_path, noise_threshold, min_silence_duration)

    result: SilenceResult = {
        "total_silences": len(silences),
        "total_silence_duration": sum(end - start for start, end in silences),
        "segments": [{"start": start, "end": end, "duration": end - start} for start, end in silences],
    }

    return json.dumps(result, indent=2)


@mcp.tool()
def render_pipeline(
    pipeline_id: str,
    format: Optional[str] = None,
    video_codec: Optional[str] = None,
    audio_codec: Optional[str] = None,
    resolution: Optional[str] = None,
    frame_rate: Optional[float] = None,
    hardware_accel: Optional[bool] = None,
    preset: Optional[str] = None,
    output_path: Optional[str] = None,
) -> str:
    """Render a pipeline to produce the final output file.

    Parameters:
    - pipeline_id: ID returned from create_video_pipeline or other pipeline operations
    - format: Output format (mp4, mkv, etc.), defaults to same as input
    - video_codec: Video codec to use, defaults to same as input
    - audio_codec: Audio codec to use, defaults to same as input
    - resolution: Output resolution (e.g., '1920x1080')
    - frame_rate: Output frame rate
    - hardware_accel: Whether to use GPU acceleration (auto-detected if None)
    - preset: Encoding preset ('youtube', 'twitch', 'instagram', 'compress')
    - output_path: Custom output path, defaults to a render folder beside input

    Returns:
        Path to the output file
    """
    if pipeline_id not in pipelines:
        raise ValueError(f"Pipeline ID not found: {pipeline_id}")

    # Auto-detect hardware acceleration if not specified
    use_hw_accel: bool = hardware_accel if hardware_accel is not None else _is_gpu_available()

    # Apply preset if specified
    if preset:
        if preset == "youtube":
            pipelines[pipeline_id].additional_options.extend(["-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart"])
        elif preset == "twitch":
            pipelines[pipeline_id].additional_options.extend(["-preset", "veryfast", "-maxrate", "6000k", "-bufsize", "12000k", "-g", "60"])
        elif preset == "instagram":
            pipelines[pipeline_id].additional_options.extend(["-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart"])
            # Special case for Instagram - add scaling filter if not already present
            if not any("scale=" in f for f in pipelines[pipeline_id].video_filters):
                pipelines[pipeline_id].video_filters.append("scale='min(1080,iw)':'-1'")
        elif preset == "compress":
            pipelines[pipeline_id].additional_options.extend(["-preset", "slow", "-crf", "23"])

    result: Union[bytes, str] = pipeline_render(
        pipeline_id, format, video_codec, audio_codec, resolution, frame_rate, use_hw_accel, output_path=output_path
    )

    if isinstance(result, bytes):
        return "Rendered to memory buffer"
    else:
        return f"Rendered to: {result}"


@mcp.tool()
def render_video(
    input_path: str,
    format: str = "mp4",
    video_codec: str = "libx264",
    audio_codec: str = "aac",
    resolution: Optional[str] = None,
    frame_rate: Optional[float] = None,
    hardware_accel: Optional[bool] = None,
    preset: Optional[str] = None,
    output_path: Optional[str] = None,
) -> str:
    """Create a pipeline with the specified settings and render it immediately.

    Parameters:
    - input_path: Path to the input video file
    - format: Output format (mp4, mkv, etc.)
    - video_codec: Video codec to use
    - audio_codec: Audio codec to use
    - resolution: Output resolution (e.g., '1920x1080')
    - frame_rate: Output frame rate
    - hardware_accel: Whether to use GPU acceleration (auto-detected if None)
    - preset: Encoding preset ('youtube', 'twitch', 'instagram', 'compress')
    - output_path: Custom output path, defaults to a render folder beside input

    Returns:
        Path to the rendered output file
    """
    # Ensure input exists
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    # Auto-detect hardware acceleration if not specified
    use_hw_accel: bool = hardware_accel if hardware_accel is not None else _is_gpu_available()

    # Create pipeline directly (not using the decorated tool)
    pid: str = str(uuid.uuid4())
    pipelines[pid] = VideoPipeline(input_path)

    # Store output path preference if provided
    if output_path:
        pipelines[pid].output_path = output_path

    # Apply preset if specified
    if preset:
        if preset == "youtube":
            pipelines[pid].additional_options.extend(["-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart"])
        elif preset == "twitch":
            pipelines[pid].additional_options.extend(["-preset", "veryfast", "-maxrate", "6000k", "-bufsize", "12000k", "-g", "60"])
        elif preset == "instagram":
            pipelines[pid].additional_options.extend(["-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart"])
            if not any("scale=" in f for f in pipelines[pid].video_filters):
                pipelines[pid].video_filters.append("scale='min(1080,iw)':'-1'")
        elif preset == "compress":
            pipelines[pid].additional_options.extend(["-preset", "slow", "-crf", "23"])

    # Render directly (not using the decorated tool)
    result: str | bytes = pipeline_render(pid, format, video_codec, audio_codec, resolution, frame_rate, use_hw_accel, output_path=output_path)

    if isinstance(result, bytes):
        return "Rendered to memory buffer"
    else:
        return f"Rendered to: {result}"


@mcp.tool()
def list_vst3() -> List[str]:
    """List installed VST3 plugins on Windows."""
    paths: List[str] = [
        os.path.join(os.environ.get("ProgramFiles", "C:\\Program Files"), "Common Files", "VST3"),
        os.path.join(os.environ.get("ProgramFiles", "C:\\Program Files"), "Steinberg", "VST3"),
    ]
    plugins: List[str] = []
    for p in paths:
        if os.path.isdir(p):
            for f in os.listdir(p):
                if f.lower().endswith(".vst3"):
                    plugins.append(os.path.join(p, f))
    return plugins


@mcp.tool()
def get_video_info(video_path: str) -> str:
    """Return video metadata as JSON via ffprobe"""
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    cmd: List[str] = ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", video_path]
    try:
        res: subprocess.CompletedProcess[bytes] = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if res.returncode != 0:
            raise RuntimeError(res.stderr.decode())
        return res.stdout.decode()
    except Exception as e:
        print(f"Exception in get_video_info: {e}", file=sys.stderr)
        raise


@mcp.tool()
def find_video_path(root_path: str, video_name: str) -> str:
    """Search for the first matching video file recursively"""
    if not os.path.exists(root_path) or not os.path.isdir(root_path):
        raise ValueError(f"Root path does not exist or is not a directory: {root_path}")

    VIDEO_EXTS: set[str] = {".mp4", ".avi", ".mov", ".mkv", ".flv", ".wmv", ".webm", ".ts"}
    stem: str
    ext: str
    stem, ext = os.path.splitext(video_name)
    if ext.lower() not in VIDEO_EXTS:
        ext = ""
    for root, dirs, files in os.walk(root_path):
        for f in files:
            s: str
            e: str
            s, e = os.path.splitext(f)
            if s.lower() == stem.lower() and (not ext or e.lower() in VIDEO_EXTS):
                return os.path.join(root, f)
    return ""


if __name__ == "__main__":
    mcp.run()
