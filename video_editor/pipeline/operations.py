"""
Video operations for the pipeline.

This module provides specific operation methods that are added to the VideoPipeline class.
These include effects, overlays, and other video manipulations.
"""

from __future__ import annotations

import logging
import math
import os
import re
import subprocess
from typing import TYPE_CHECKING

from video_editor.utils.helpers import _to_temp_file

if TYPE_CHECKING:
    from video_editor.pipeline.core import VideoPipeline

logger: logging.Logger = logging.getLogger("video_editor")

# These functions will be added to the VideoPipeline class dynamically
# or imported and used in the class implementation


def add_text(
    self: VideoPipeline,
    text: str,
    fontfile: str,
    font_size: int,
    color: str,
    opacity: float,
    x: str,
    y: str,
    start_time: float = 0,
    end_time: float | None = None,
    scale: float = 1.0,
) -> VideoPipeline:
    """Add text overlay to the video.

    Args:
        text: Text to display
        fontfile: Path to font file
        font_size: Font size in pixels
        color: Color name or hex code
        opacity: Opacity from 0.0 to 1.0
        x, y: Position coordinates (can be expressions)
        start_time, end_time: Time range to show text
        scale: Scale factor for the font size
    """
    # Map time points from the edited timeline to the original timeline
    original_start: float | None = self._map_timeline_point(start_time)
    original_end: float | None = self._map_timeline_point(end_time)

    # Build the drawtext filter
    filter_str: str = f"drawtext=text='{text}':fontfile='{fontfile}':fontsize={font_size * scale}:fontcolor={color}@{opacity}:x={x}:y={y}"

    # Add time constraints if specified
    if original_start is not None and original_start > 0:
        filter_str += f":enable='between(t,{original_start},"
        if original_end is not None:
            filter_str += f"{original_end})"
        else:
            filter_str += "999999)"

    self.video_filters.append(filter_str)
    return self


def change_volume(self: VideoPipeline, volume: float) -> VideoPipeline:
    """Change audio volume.

    Args:
        volume: Volume multiplier (1.0 = original, 0.5 = half, 2.0 = double)
    """
    self.audio_filters.append(f"volume={volume}")
    return self


def color_grade(
    self: VideoPipeline,
    brightness: float = 0.0,
    contrast: float = 1.0,
    saturation: float = 1.0,
    hue: float = 0.0,
    black_level: float = 0.0,
    white_level: float = 1.0,
    start_time: float | None = None,
    end_time: float | None = None,
) -> VideoPipeline:
    """Apply color grading effects.

    Args:
        brightness: Brightness adjustment (-1 to 1, 0 = no change)
        contrast: Contrast multiplier (0 to 10, 1 = no change)
        saturation: Saturation multiplier (0 to 10, 1 = no change)
        hue: Hue rotation in degrees (-180 to 180, 0 = no change)
        black_level: Black level (0 to 1)
        white_level: White level (0 to 1)
        start_time, end_time: Time range to apply effect
    """
    # Map time points from the edited timeline to the original timeline
    original_start: float | None = self._map_timeline_point(start_time)
    original_end: float | None = self._map_timeline_point(end_time)

    # Build the combined filter
    filter_str: str = f"eq=brightness={brightness}:contrast={contrast}:saturation={saturation}:gamma=1.0"

    if hue != 0.0:
        filter_str += f",hue=h={hue}"

    if black_level > 0.0 or white_level < 1.0:
        filter_str += f",curves=black={black_level}:white={white_level}"

    # Apply time constraints if specified
    if original_start is not None or original_end is not None:
        if original_start is not None and original_end is not None:
            # Enable only between start and end times
            filter_str += f":enable='between(t,{original_start},{original_end})'"
        elif original_start is not None:
            # Enable only after start time
            filter_str += f":enable='gte(t,{original_start})'"
        elif original_end is not None:
            # Enable only before end time
            filter_str += f":enable='lte(t,{original_end})'"

    self.video_filters.append(filter_str)
    return self


def scale(
    self: VideoPipeline,
    width: int,
    height: int,
    start_time: float | None = None,
    end_time: float | None = None,
) -> VideoPipeline:
    """Scale the video to new dimensions.

    Args:
        width: Target width in pixels
        height: Target height in pixels
        start_time, end_time: Time range to apply effect
    """
    # Map time points from the edited timeline to the original timeline
    original_start: float | None = self._map_timeline_point(start_time)
    original_end: float | None = self._map_timeline_point(end_time)

    # Build the scale filter
    filter_str: str = f"scale={width}:{height}"

    # Apply time constraints if specified
    if original_start is not None or original_end is not None:
        if original_start is not None and original_end is not None:
            # Enable only between start and end times
            filter_str += f":enable='between(t,{original_start},{original_end})'"
        elif original_start is not None:
            # Enable only after start time
            filter_str += f":enable='gte(t,{original_start})'"
        elif original_end is not None:
            # Enable only before end time
            filter_str += f":enable='lte(t,{original_end})'"

    self.video_filters.append(filter_str)
    return self


def overlay(
    self: VideoPipeline,
    overlay_media: str | bytes,
    x: int = 0,
    y: int = 0,
    start_time: float = 0,
    end_time: float | None = None,
    loop: bool = False,
    speed_adjust: bool = False,
    trim: bool = True,
) -> VideoPipeline:
    """Add overlay (image or video) to the video.

    Args:
        overlay_media: Path to overlay file or bytes of overlay file
        x, y: Position coordinates for overlay
        start_time, end_time: Time range to show overlay
        loop: Whether to loop a shorter overlay to fill the time range
        speed_adjust: Whether to adjust speed of overlay to match time range
        trim: Whether to trim a longer overlay to fit time range
    """
    # Map time points from the edited timeline to the original timeline
    original_start: float | None = self._map_timeline_point(start_time)
    original_end: float | None = self._map_timeline_point(end_time)

    # Convert overlay to temporary file if it's bytes
    overlay_path: str = _to_temp_file(overlay_media)

    # Add overlay to additional inputs
    self.additional_inputs.append(overlay_path)
    input_index: int = len(self.additional_inputs)  # 1-based index

    # Check if overlay is an image or video
    is_image: bool = False
    duration: float = 0.0
    try:
        # Try to get duration to determine if it's a video
        duration_cmd: list[str] = [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            overlay_path,
        ]
        duration = float(subprocess.check_output(duration_cmd).decode().strip())

        # Check if it has video streams
        video_cmd: list[str] = [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            overlay_path,
        ]
        video_output: str = subprocess.check_output(video_cmd).decode().strip()

        is_image = not video_output or duration < 0.1  # Treat very short media as image
    except (subprocess.SubprocessError, ValueError):
        # Default to image if we can't determine
        is_image = True

    # Calculate overlay duration
    overlay_duration: float | None = None
    if not is_image:
        overlay_duration = duration

    # Build the overlay filter
    complex_filter: str = ""

    if is_image:
        # Images are simpler - they can be overlaid directly
        complex_filter = f"[0:v][{input_index}:v]overlay={x}:{y}"

        # Add timing for the overlay if necessary
        if original_start is not None or original_end is not None:
            if original_start is not None and original_end is not None:
                complex_filter += f":enable='between(t,{original_start},{original_end})'"
            elif original_start is not None:
                complex_filter += f":enable='gte(t,{original_start})'"
            elif original_end is not None:
                complex_filter += f":enable='lte(t,{original_end})'"
    else:
        # Videos are more complex - we need to handle timing and duration
        if original_end is not None and overlay_duration is not None:
            required_duration: float = original_end - (original_start or 0)

            if overlay_duration < required_duration and loop:
                # Loop the overlay
                complex_filter = f"[{input_index}:v]loop=-1:1[looped];"
                complex_filter += f"[0:v][looped]overlay={x}:{y}"

                # Add timing constraints (original_end is guaranteed not None here)
                if original_start is not None:
                    complex_filter += f":enable='between(t,{original_start},{original_end})'"
                else:
                    complex_filter += f":enable='lte(t,{original_end})'"

            elif overlay_duration < required_duration and speed_adjust:
                # Adjust speed to match required duration
                speed_factor: float = overlay_duration / required_duration
                complex_filter = f"[{input_index}:v]setpts=PTS*{speed_factor}[adjusted];"
                complex_filter += f"[0:v][adjusted]overlay={x}:{y}"

                # Add timing constraints (original_end is guaranteed not None here)
                if original_start is not None:
                    complex_filter += f":enable='between(t,{original_start},{original_end})'"
                else:
                    complex_filter += f":enable='lte(t,{original_end})'"

            else:
                # Default: just overlay and handle timing
                complex_filter = f"[0:v][{input_index}:v]overlay={x}:{y}"

                # Add timing constraints (original_end is guaranteed not None here)
                if original_start is not None:
                    complex_filter += f":enable='between(t,{original_start},{original_end})'"
                else:
                    complex_filter += f":enable='lte(t,{original_end})'"
        else:
            # No end time specified, just overlay and handle start time
            complex_filter = f"[0:v][{input_index}:v]overlay={x}:{y}"

            # Add timing constraint for start time
            if original_start is not None:
                complex_filter += f":enable='gte(t,{original_start})'"

    # Add the complex filter
    self.complex_filters.append(complex_filter + "[v]")
    self.map_options.extend(["-map", "[v]", "-map", "0:a?"])

    return self


def detect_silences(
    input_path: str,
    noise_threshold: float = -30.0,
    min_silence_duration: float = 0.5,
) -> list[tuple[float, float]]:
    """Detect silent segments in a video/audio file.

    Args:
        input_path: Path to the input video/audio file
        noise_threshold: dB threshold below which audio is considered silence (default -30dB)
        min_silence_duration: Minimum duration in seconds for a segment to be considered silence

    Returns:
        List of (start_time, end_time) tuples representing silent segments
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    # Use ffmpeg's silencedetect filter to find silent segments
    cmd: list[str] = [
        "ffmpeg",
        "-i",
        input_path,
        "-af",
        f"silencedetect=noise={noise_threshold}dB:d={min_silence_duration}",
        "-f",
        "null",
        "-",
    ]

    try:
        result: subprocess.CompletedProcess[bytes] = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE)
        stderr_output: str = result.stderr.decode()

        # Parse the silencedetect output
        # Format: [silencedetect @ ...] silence_start: X.XXXX
        #         [silencedetect @ ...] silence_end: X.XXXX | silence_duration: X.XXXX
        silences: list[tuple[float, float]] = []
        current_start: float | None = None

        for line in stderr_output.split("\n"):
            if "silence_start:" in line:
                match: re.Match[str] | None = re.search(r"silence_start:\s*([\d.]+)", line)
                if match:
                    current_start = float(match.group(1))
            elif "silence_end:" in line:
                match = re.search(r"silence_end:\s*([\d.]+)", line)
                if match and current_start is not None:
                    end_time: float = float(match.group(1))
                    silences.append((current_start, end_time))
                    current_start = None

        return silences

    except subprocess.SubprocessError as e:
        logger.error(f"Failed to detect silences: {e}")
        raise RuntimeError(f"Failed to detect silences: {e}") from e


def remove_silences(
    self: VideoPipeline,
    noise_threshold: float = -30.0,
    min_silence_duration: float = 0.5,
    padding: float = 0.1,
) -> VideoPipeline:
    """Remove silent segments from the video.

    This analyzes the audio track to find silent portions and removes them,
    creating a more compact video without dead air.

    Args:
        noise_threshold: dB threshold below which audio is considered silence (default -30dB)
        min_silence_duration: Minimum duration in seconds for a segment to be considered silence
        padding: Amount of silence to keep at the edges of speech (in seconds)

    Returns:
        Self for method chaining
    """
    # Detect silent segments
    silences: list[tuple[float, float]] = detect_silences(self.input_path, noise_threshold, min_silence_duration)

    if not silences:
        logger.info("No silences detected in the video")
        return self

    logger.info(f"Detected {len(silences)} silent segments")

    # Remove each silent segment (in reverse order to maintain timeline accuracy)
    for start, end in reversed(silences):
        # Apply padding to keep some silence at speech boundaries
        adjusted_start: float = start + padding
        adjusted_end: float = end - padding

        # Only remove if there's still a meaningful segment after padding
        if adjusted_end > adjusted_start:
            self.delete_segment(adjusted_start, adjusted_end)

    return self


def rotate(
    self: VideoPipeline,
    angle: float,
    start_time: float | None = None,
    end_time: float | None = None,
) -> VideoPipeline:
    """Rotate the video by a given angle.

    Args:
        angle: Rotation angle in degrees (positive = clockwise)
        start_time, end_time: Time range to apply effect
    """
    # Map time points from the edited timeline to the original timeline
    original_start: float | None = self._map_timeline_point(start_time)
    original_end: float | None = self._map_timeline_point(end_time)

    # Convert angle to radians for FFmpeg
    angle_rad: float = angle * math.pi / 180

    # Build the rotate filter
    filter_str: str = f"rotate={angle_rad}:c=black:ow=rotw({angle_rad}):oh=roth({angle_rad})"

    # Apply time constraints if specified
    if original_start is not None or original_end is not None:
        if original_start is not None and original_end is not None:
            filter_str += f":enable='between(t,{original_start},{original_end})'"
        elif original_start is not None:
            filter_str += f":enable='gte(t,{original_start})'"
        elif original_end is not None:
            filter_str += f":enable='lte(t,{original_end})'"

    self.video_filters.append(filter_str)
    return self


def flip(
    self: VideoPipeline,
    horizontal: bool = False,
    vertical: bool = False,
    start_time: float | None = None,
    end_time: float | None = None,
) -> VideoPipeline:
    """Flip the video horizontally and/or vertically.

    Args:
        horizontal: Whether to flip horizontally
        vertical: Whether to flip vertically
        start_time, end_time: Time range to apply effect
    """
    # Map time points from the edited timeline to the original timeline
    original_start: float | None = self._map_timeline_point(start_time)
    original_end: float | None = self._map_timeline_point(end_time)

    filters: list[str] = []
    if horizontal:
        filters.append("hflip")
    if vertical:
        filters.append("vflip")

    if not filters:
        return self

    filter_str: str = ",".join(filters)

    # Apply time constraints if specified
    if original_start is not None or original_end is not None:
        # For flip, we need to use enable on each filter
        enabled_filters: list[str] = []
        for f in filters:
            if original_start is not None and original_end is not None:
                enabled_filters.append(f"{f}:enable='between(t,{original_start},{original_end})'")
            elif original_start is not None:
                enabled_filters.append(f"{f}:enable='gte(t,{original_start})'")
            elif original_end is not None:
                enabled_filters.append(f"{f}:enable='lte(t,{original_end})'")
        filter_str = ",".join(enabled_filters)

    self.video_filters.append(filter_str)
    return self


def crop(
    self: VideoPipeline,
    x: int,
    y: int,
    width: int,
    height: int,
    start_time: float | None = None,
    end_time: float | None = None,
) -> VideoPipeline:
    """Crop the video to a specific region.

    Args:
        x, y: Top-left corner coordinates
        width, height: Dimensions of the crop area
        start_time, end_time: Time range to apply effect
    """
    # Map time points from the edited timeline to the original timeline
    original_start: float | None = self._map_timeline_point(start_time)
    original_end: float | None = self._map_timeline_point(end_time)

    # Build the crop filter
    filter_str: str = f"crop={width}:{height}:{x}:{y}"

    # Apply time constraints if specified
    if original_start is not None or original_end is not None:
        if original_start is not None and original_end is not None:
            filter_str += f":enable='between(t,{original_start},{original_end})'"
        elif original_start is not None:
            filter_str += f":enable='gte(t,{original_start})'"
        elif original_end is not None:
            filter_str += f":enable='lte(t,{original_end})'"

    self.video_filters.append(filter_str)
    return self


def chroma_key(
    self: VideoPipeline,
    color: str,
    similarity: float = 0.3,
    blend: float = 0.1,
    start_time: float | None = None,
    end_time: float | None = None,
) -> VideoPipeline:
    """Apply chroma key (green screen) effect.

    Args:
        color: Color to key out (e.g., 'green', '0x00FF00')
        similarity: How similar colors need to be to be keyed out (0.0-1.0)
        blend: Blend factor for edges (0.0-1.0)
        start_time, end_time: Time range to apply effect
    """
    # Map time points from the edited timeline to the original timeline
    original_start: float | None = self._map_timeline_point(start_time)
    original_end: float | None = self._map_timeline_point(end_time)

    # Build the chromakey filter
    filter_str: str = f"chromakey={color}:{similarity}:{blend}"

    # Apply time constraints if specified
    if original_start is not None or original_end is not None:
        if original_start is not None and original_end is not None:
            filter_str += f":enable='between(t,{original_start},{original_end})'"
        elif original_start is not None:
            filter_str += f":enable='gte(t,{original_start})'"
        elif original_end is not None:
            filter_str += f":enable='lte(t,{original_end})'"

    self.video_filters.append(filter_str)
    return self


def add_audio(
    self: VideoPipeline,
    audio_path: str,
    start_time: float = 0,
    volume: float = 1.0,
) -> VideoPipeline:
    """Add an additional audio track to the video.

    Args:
        audio_path: Path to the audio file
        start_time: When to start the audio (in seconds)
        volume: Volume level for the added audio
    """
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    # Add audio to additional inputs
    self.additional_inputs.append(audio_path)
    input_index: int = len(self.additional_inputs)

    # Build the complex filter for mixing audio
    complex_filter: str
    # Delay the new audio if start_time > 0
    if start_time > 0:
        delay_ms: int = int(start_time * 1000)
        complex_filter = f"[{input_index}:a]adelay={delay_ms}|{delay_ms},volume={volume}[delayed];"
        complex_filter += "[0:a][delayed]amix=inputs=2:duration=longest[a]"
    else:
        complex_filter = f"[{input_index}:a]volume={volume}[vol];"
        complex_filter += "[0:a][vol]amix=inputs=2:duration=longest[a]"

    self.complex_filters.append(complex_filter)
    self.map_options.extend(["-map", "0:v", "-map", "[a]"])

    return self


def apply_transition(
    self: VideoPipeline,
    second_path: str,
    transition_type: str,
    duration: float,
    start_time: float | None = None,
    end_time: float | None = None,
) -> VideoPipeline:
    """Apply a transition effect between the current video and another video.

    Args:
        second_path: Path to the second video
        transition_type: Type of transition ('fade', 'wipe_lr', 'wipe_rl', 'wipe_tb', 'wipe_bt', 'dissolve')
        duration: Duration of the transition in seconds
        start_time: Start time for the transition (None = at end of first video)
        end_time: End time for the transition
    """
    if not os.path.exists(second_path):
        raise FileNotFoundError(f"Second video not found: {second_path}")

    # Add second video to additional inputs
    self.additional_inputs.append(second_path)
    input_index: int = len(self.additional_inputs)

    # Get duration of first video if start_time not specified
    actual_start_time: float
    if start_time is None:
        # Will transition at the end of the first video
        # We need to determine the transition point
        duration_cmd: list[str] = [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            self.input_path,
        ]
        try:
            first_duration: float = float(subprocess.check_output(duration_cmd).decode().strip())
            actual_start_time = first_duration - duration
        except (subprocess.SubprocessError, ValueError):
            actual_start_time = 0  # Fallback
    else:
        actual_start_time = start_time

    # Build the transition filter based on type
    complex_filter: str
    if transition_type == "fade":
        # Cross-fade transition
        trim_start = actual_start_time
        trim_end = actual_start_time + duration
        complex_filter = (
            f"[0:v]trim=0:{trim_start},setpts=PTS-STARTPTS[v1];"
            f"[0:v]trim={trim_start}:{trim_end},setpts=PTS-STARTPTS,format=yuva420p,"
            f"fade=t=out:st=0:d={duration}:alpha=1[v1fade];"
            f"[{input_index}:v]trim=0:{duration},setpts=PTS-STARTPTS,format=yuva420p,"
            f"fade=t=in:st=0:d={duration}:alpha=1[v2fade];"
            f"[v1fade][v2fade]overlay[vtrans];"
            f"[{input_index}:v]trim={duration},setpts=PTS-STARTPTS[v2rest];"
            f"[v1][vtrans][v2rest]concat=n=3:v=1:a=0[v]"
        )
    elif transition_type == "wipe_lr":
        # Wipe from left to right
        complex_filter = (
            f"[0:v]trim=0:{actual_start_time},setpts=PTS-STARTPTS[v1];"
            f"[0:v]trim={actual_start_time}:{actual_start_time + duration},setpts=PTS-STARTPTS[v1wipe];"
            f"[{input_index}:v]trim=0:{duration},setpts=PTS-STARTPTS[v2wipe];"
            f"[v1wipe][v2wipe]overlay=x='min(0,-W+(t/{duration})*W)':y=0[vtrans];"
            f"[{input_index}:v]trim={duration},setpts=PTS-STARTPTS[v2rest];"
            f"[v1][vtrans][v2rest]concat=n=3:v=1:a=0[v]"
        )
    elif transition_type == "wipe_rl":
        # Wipe from right to left
        complex_filter = (
            f"[0:v]trim=0:{actual_start_time},setpts=PTS-STARTPTS[v1];"
            f"[0:v]trim={actual_start_time}:{actual_start_time + duration},setpts=PTS-STARTPTS[v1wipe];"
            f"[{input_index}:v]trim=0:{duration},setpts=PTS-STARTPTS[v2wipe];"
            f"[v1wipe][v2wipe]overlay=x='max(0,W-(t/{duration})*W)':y=0[vtrans];"
            f"[{input_index}:v]trim={duration},setpts=PTS-STARTPTS[v2rest];"
            f"[v1][vtrans][v2rest]concat=n=3:v=1:a=0[v]"
        )
    elif transition_type == "wipe_tb":
        # Wipe from top to bottom
        complex_filter = (
            f"[0:v]trim=0:{actual_start_time},setpts=PTS-STARTPTS[v1];"
            f"[0:v]trim={actual_start_time}:{actual_start_time + duration},setpts=PTS-STARTPTS[v1wipe];"
            f"[{input_index}:v]trim=0:{duration},setpts=PTS-STARTPTS[v2wipe];"
            f"[v1wipe][v2wipe]overlay=x=0:y='min(0,-H+(t/{duration})*H)'[vtrans];"
            f"[{input_index}:v]trim={duration},setpts=PTS-STARTPTS[v2rest];"
            f"[v1][vtrans][v2rest]concat=n=3:v=1:a=0[v]"
        )
    elif transition_type == "wipe_bt":
        # Wipe from bottom to top
        complex_filter = (
            f"[0:v]trim=0:{actual_start_time},setpts=PTS-STARTPTS[v1];"
            f"[0:v]trim={actual_start_time}:{actual_start_time + duration},setpts=PTS-STARTPTS[v1wipe];"
            f"[{input_index}:v]trim=0:{duration},setpts=PTS-STARTPTS[v2wipe];"
            f"[v1wipe][v2wipe]overlay=x=0:y='max(0,H-(t/{duration})*H)'[vtrans];"
            f"[{input_index}:v]trim={duration},setpts=PTS-STARTPTS[v2rest];"
            f"[v1][vtrans][v2rest]concat=n=3:v=1:a=0[v]"
        )
    else:
        # Default to dissolve/crossfade
        complex_filter = f"[0:v][{input_index}:v]xfade=transition=fade:duration={duration}:offset={actual_start_time}[v]"

    # Handle audio transition (cross-fade)
    audio_filter: str = (
        f"[0:a]atrim=0:{actual_start_time + duration},asetpts=PTS-STARTPTS[a1];"
        f"[{input_index}:a]asetpts=PTS-STARTPTS[a2];"
        f"[a1][a2]acrossfade=d={duration}:c1=tri:c2=tri[a]"
    )

    self.complex_filters.append(complex_filter)
    self.complex_filters.append(audio_filter)
    self.map_options.extend(["-map", "[v]", "-map", "[a]"])

    return self


def apply_vst3(
    self: VideoPipeline,
    plugin_path: str,
    start_time: float | None = None,
    end_time: float | None = None,
) -> VideoPipeline:
    """Apply a VST3 audio plugin to the audio track.

    Note: This requires FFmpeg to be compiled with VST3 support.

    Args:
        plugin_path: Path to the VST3 plugin
        start_time, end_time: Time range to apply effect
    """
    if not os.path.exists(plugin_path):
        raise FileNotFoundError(f"VST3 plugin not found: {plugin_path}")

    # Build the VST3 filter
    # Note: FFmpeg's vst3 filter syntax may vary
    filter_str: str = f"vst3=p='{plugin_path}'"

    # Apply time constraints if specified
    original_start: float | None = self._map_timeline_point(start_time)
    original_end: float | None = self._map_timeline_point(end_time)

    if original_start is not None or original_end is not None:
        if original_start is not None and original_end is not None:
            filter_str += f":enable='between(t,{original_start},{original_end})'"
        elif original_start is not None:
            filter_str += f":enable='gte(t,{original_start})'"
        elif original_end is not None:
            filter_str += f":enable='lte(t,{original_end})'"

    self.audio_filters.append(filter_str)
    return self


def concat(self: VideoPipeline, additional_files: list[str]) -> VideoPipeline:
    """Concatenate additional video files to the current video.

    Args:
        additional_files: List of video file paths to concatenate
    """
    for file_path in additional_files:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        self.additional_inputs.append(file_path)

    # Build concatenation filter
    n_inputs: int = 1 + len(additional_files)  # Original + additional files

    # Create input stream labels
    input_labels: str = "".join([f"[{i}:v][{i}:a]" for i in range(n_inputs)])

    complex_filter: str = f"{input_labels}concat=n={n_inputs}:v=1:a=1[v][a]"

    self.complex_filters.append(complex_filter)
    self.map_options.extend(["-map", "[v]", "-map", "[a]"])

    return self


def add_ken_burns(
    self: VideoPipeline,
    zoom_start: float = 1.0,
    zoom_end: float = 1.5,
    pan_direction: str = "center",
) -> VideoPipeline:
    """Apply Ken Burns effect (zoom and pan) to video.

    Args:
        zoom_start: Starting zoom level (1.0 = no zoom)
        zoom_end: Ending zoom level
        pan_direction: Pan direction - "center", "left_to_right", "right_to_left",
                      "top_to_bottom", or "bottom_to_top"

    Returns:
        Self for method chaining
    """
    # Get video duration for calculating zoom progression
    duration = self._get_input_duration()
    if duration is None:
        duration = 5.0  # Fallback default

    # Calculate zoom delta
    zoom_delta = zoom_end - zoom_start

    # Default output resolution and fps
    output_width = 1920
    output_height = 1080
    fps = 30

    # Build zoompan filter based on pan direction
    # zoompan filter: z=zoom, x=pan_x, y=pan_y, d=frame_count, s=output_size, fps=output_fps
    # 'on' is the frame number (0-based)
    # Total frames = fps * duration
    total_frames = fps * duration

    if pan_direction == "center":
        # Zoom with centered pan
        # x and y keep the image centered while zooming
        # x = (iw - iw/zoom)/2, y = (ih - ih/zoom)/2
        if abs(zoom_delta) > 0.001:
            # Progressive zoom
            zoom_expr = f"'{zoom_start}+({zoom_delta})*on/{total_frames}'"
        else:
            # Static zoom
            zoom_expr = f"'{zoom_start}'"
        x_expr = "'(iw-iw/zoom)/2'"
        y_expr = "'(ih-ih/zoom)/2'"

    elif pan_direction == "left_to_right":
        # Pan from left to right
        # x starts at 0 and moves to (iw - iw/zoom)
        if abs(zoom_delta) > 0.001:
            zoom_expr = f"'{zoom_start}+({zoom_delta})*on/{total_frames}'"
        else:
            zoom_expr = f"'{zoom_start}'"
        x_expr = f"'(iw-iw/zoom)*on/{total_frames}'"
        y_expr = "'(ih-ih/zoom)/2'"

    elif pan_direction == "right_to_left":
        # Pan from right to left
        # x starts at (iw - iw/zoom) and moves to 0
        if abs(zoom_delta) > 0.001:
            zoom_expr = f"'{zoom_start}+({zoom_delta})*on/{total_frames}'"
        else:
            zoom_expr = f"'{zoom_start}'"
        x_expr = f"'(iw-iw/zoom)*(1-on/{total_frames})'"
        y_expr = "'(ih-ih/zoom)/2'"

    elif pan_direction == "top_to_bottom":
        # Pan from top to bottom
        # y starts at 0 and moves to (ih - ih/zoom)
        if abs(zoom_delta) > 0.001:
            zoom_expr = f"'{zoom_start}+({zoom_delta})*on/{total_frames}'"
        else:
            zoom_expr = f"'{zoom_start}'"
        x_expr = "'(iw-iw/zoom)/2'"
        y_expr = f"'(ih-ih/zoom)*on/{total_frames}'"

    elif pan_direction == "bottom_to_top":
        # Pan from bottom to top
        # y starts at (ih - ih/zoom) and moves to 0
        if abs(zoom_delta) > 0.001:
            zoom_expr = f"'{zoom_start}+({zoom_delta})*on/{total_frames}'"
        else:
            zoom_expr = f"'{zoom_start}'"
        x_expr = "'(iw-iw/zoom)/2'"
        y_expr = f"'(ih-ih/zoom)*(1-on/{total_frames})'"

    else:
        # Default to center
        zoom_expr = f"'{zoom_start}'"
        x_expr = "'(iw-iw/zoom)/2'"
        y_expr = "'(ih-ih/zoom)/2'"

    # Build the zoompan filter
    # d=1 means each input frame produces 1 output frame (we let fps handle framerate)
    zoompan_filter = f"zoompan=z={zoom_expr}:x={x_expr}:y={y_expr}:d=1:s={output_width}x{output_height}:fps={fps}"

    self.video_filters.append(zoompan_filter)
    return self
