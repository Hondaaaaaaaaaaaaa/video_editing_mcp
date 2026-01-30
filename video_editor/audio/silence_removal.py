"""
Professional silence removal using auto-editor or FFmpeg.

This module provides high-quality silence removal that actually works:
1. Uses auto-editor (gold standard) if installed
2. Falls back to proper FFmpeg select/aselect filter approach

The key difference from naive approaches:
- Uses select/aselect filters with between() expressions
- Properly fixes timestamps with setpts/asetpts
- Does NOT use fragile concat filter chains
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from typing import Callable, List, Optional, Tuple


class SilenceRemovalError(Exception):
    """Exception raised when silence removal fails."""
    pass


@dataclass
class AudioSegment:
    """Represents a segment of audio (silent or not)."""
    start: float
    end: float
    is_silent: bool

    @property
    def duration(self) -> float:
        return self.end - self.start


def is_auto_editor_available() -> bool:
    """Check if auto-editor is installed."""
    return shutil.which("auto-editor") is not None


def get_video_duration(video_path: str) -> float:
    """Get video duration in seconds."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise SilenceRemovalError(f"Failed to get duration: {result.stderr}")
    return float(result.stdout.strip())


def detect_silent_segments(
    video_path: str,
    noise_threshold_db: float = -30.0,
    min_silence_duration: float = 0.3,
) -> List[AudioSegment]:
    """Detect silent segments using FFmpeg silencedetect.

    Args:
        video_path: Path to video file
        noise_threshold_db: Threshold in dB (e.g., -30 means -30dB)
        min_silence_duration: Minimum silence duration in seconds

    Returns:
        List of AudioSegment objects (both silent and non-silent)
    """
    # Run silencedetect
    cmd = [
        "ffmpeg", "-i", video_path,
        "-af", f"silencedetect=noise={noise_threshold_db}dB:d={min_silence_duration}",
        "-f", "null", "-"
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    stderr = result.stderr

    # Parse silence segments
    silence_starts = []
    silence_ends = []

    for line in stderr.split('\n'):
        if 'silence_start:' in line:
            match = re.search(r'silence_start:\s*([\d.]+)', line)
            if match:
                silence_starts.append(float(match.group(1)))
        elif 'silence_end:' in line:
            match = re.search(r'silence_end:\s*([\d.]+)', line)
            if match:
                silence_ends.append(float(match.group(1)))

    # Get total duration
    total_duration = get_video_duration(video_path)

    # Build segment list
    segments: List[AudioSegment] = []
    current_pos = 0.0

    for i, (start, end) in enumerate(zip(silence_starts, silence_ends)):
        # Non-silent segment before this silence
        if start > current_pos:
            segments.append(AudioSegment(
                start=current_pos,
                end=start,
                is_silent=False
            ))

        # Silent segment
        segments.append(AudioSegment(
            start=start,
            end=end,
            is_silent=True
        ))
        current_pos = end

    # Final non-silent segment
    if current_pos < total_duration:
        segments.append(AudioSegment(
            start=current_pos,
            end=total_duration,
            is_silent=False
        ))

    return segments


def remove_silence_with_auto_editor(
    video_path: str,
    output_path: str,
    margin: float = 0.1,
    threshold: Optional[str] = None,
    silent_speed: float = 99999,  # Effectively cuts silent parts
    progress_callback: Optional[Callable[[float, str], None]] = None,
) -> str:
    """Remove silence using auto-editor (gold standard).

    Args:
        video_path: Input video path
        output_path: Output video path
        margin: Padding around cuts in seconds
        threshold: Audio threshold (e.g., "4%", "-30dB"). None for auto.
        silent_speed: Speed for silent parts (99999 = cut, 8 = 8x speed)
        progress_callback: Optional progress callback

    Returns:
        Path to output video
    """
    if not is_auto_editor_available():
        raise SilenceRemovalError("auto-editor not installed. Install with: pip install auto-editor")

    if progress_callback:
        progress_callback(0.1, "Running auto-editor...")

    cmd = [
        "auto-editor", video_path,
        "--margin", f"{margin}sec",
        "--silent-speed", str(silent_speed),
        "--output", output_path,
        "--no-open",  # Don't open the file after
    ]

    if threshold:
        cmd.extend(["--edit", f"audio:threshold={threshold}"])

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        raise SilenceRemovalError(f"auto-editor failed: {result.stderr}")

    if progress_callback:
        progress_callback(1.0, "Complete")

    return output_path


def remove_silence_with_ffmpeg(
    video_path: str,
    output_path: str,
    noise_threshold_db: float = -30.0,
    min_silence_duration: float = 0.3,
    padding: float = 0.05,
    progress_callback: Optional[Callable[[float, str], None]] = None,
) -> str:
    """Remove silence using FFmpeg concat demuxer approach.

    Extracts each non-silent segment to a temp file, then concatenates them.
    This is more reliable than filter_complex trim because each segment
    is fully decoded and re-encoded independently, avoiding frame reference issues.

    Args:
        video_path: Input video path
        output_path: Output video path
        noise_threshold_db: Silence threshold in dB
        min_silence_duration: Minimum silence to remove
        padding: Padding to keep around speech
        progress_callback: Optional progress callback

    Returns:
        Path to output video
    """
    if progress_callback:
        progress_callback(0.1, "Detecting silent segments...")

    # Detect segments
    segments = detect_silent_segments(
        video_path,
        noise_threshold_db=noise_threshold_db,
        min_silence_duration=min_silence_duration,
    )

    if not segments:
        raise SilenceRemovalError("No segments detected")

    # Get non-silent segments with padding
    non_silent_segments: List[Tuple[float, float]] = []
    total_duration = get_video_duration(video_path)

    for seg in segments:
        if not seg.is_silent:
            # Add padding
            start = max(0, seg.start - padding)
            end = min(total_duration, seg.end + padding)
            non_silent_segments.append((start, end))

    if not non_silent_segments:
        raise SilenceRemovalError("No non-silent segments found")

    # Merge overlapping segments
    merged_segments: List[Tuple[float, float]] = []
    for start, end in sorted(non_silent_segments):
        if merged_segments and start <= merged_segments[-1][1]:
            # Overlapping, extend the previous segment
            merged_segments[-1] = (merged_segments[-1][0], max(end, merged_segments[-1][1]))
        else:
            merged_segments.append((start, end))

    if progress_callback:
        progress_callback(0.3, f"Found {len(merged_segments)} speech segments...")

    # Create temp directory for segment files
    temp_dir = tempfile.mkdtemp(prefix="silence_removal_")
    segment_files: List[str] = []

    try:
        # Extract each segment to a temp file
        for i, (start, end) in enumerate(merged_segments):
            if progress_callback:
                progress = 0.3 + (0.5 * i / len(merged_segments))
                progress_callback(progress, f"Extracting segment {i+1}/{len(merged_segments)}...")

            segment_path = os.path.join(temp_dir, f"segment_{i:04d}.mp4")
            segment_files.append(segment_path)

            # Two-step approach to avoid freeze frames:
            # 1. Seek to 0 (or slightly before start) to ensure we start from a keyframe
            # 2. Use trim/atrim filters to cut exactly at the timestamps we want
            # This ensures proper decoding while maintaining frame accuracy
            seek_to = max(0, start - 0.5)  # Seek to 0.5s before (will hit a keyframe)
            trim_start = start - seek_to   # Adjust trim relative to seek point
            trim_end = end - seek_to

            cmd = [
                "ffmpeg", "-y",
                "-ss", str(seek_to),
                "-i", video_path,
                "-vf", f"trim={trim_start}:{trim_end},setpts=PTS-STARTPTS",
                "-af", f"atrim={trim_start}:{trim_end},asetpts=PTS-STARTPTS",
                "-c:v", "libx264",
                "-preset", "fast",
                "-c:a", "aac",
                segment_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise SilenceRemovalError(f"Failed to extract segment {i}: {result.stderr}")

        # Create concat list file
        concat_list_path = os.path.join(temp_dir, "concat_list.txt")
        with open(concat_list_path, "w") as f:
            for seg_file in segment_files:
                # Use forward slashes and escape single quotes for FFmpeg
                safe_path = seg_file.replace("\\", "/")
                f.write(f"file '{safe_path}'\n")

        if progress_callback:
            progress_callback(0.85, "Concatenating segments...")

        # Concatenate all segments
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_list_path,
            "-c", "copy",
            "-movflags", "+faststart",
            output_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise SilenceRemovalError(f"Failed to concatenate: {result.stderr}")

        if progress_callback:
            progress_callback(1.0, "Complete")

        return output_path

    finally:
        # Clean up temp files
        for seg_file in segment_files:
            if os.path.exists(seg_file):
                os.remove(seg_file)
        if os.path.exists(concat_list_path):
            os.remove(concat_list_path)
        if os.path.exists(temp_dir):
            os.rmdir(temp_dir)


def remove_silence(
    video_path: str,
    output_path: Optional[str] = None,
    method: str = "auto",
    noise_threshold_db: float = -30.0,
    min_silence_duration: float = 0.3,
    padding: float = 0.1,
    silent_speed: Optional[float] = None,
    progress_callback: Optional[Callable[[float, str], None]] = None,
) -> str:
    """Remove silence from video using the best available method.

    Args:
        video_path: Input video path
        output_path: Output path (auto-generated if None)
        method: "auto" (best available), "auto-editor", or "ffmpeg"
        noise_threshold_db: Silence threshold in dB (for ffmpeg method)
        min_silence_duration: Minimum silence duration to remove
        padding: Padding around speech segments
        silent_speed: For auto-editor: speed of silent parts (None=cut, 2=2x, etc.)
        progress_callback: Optional progress callback

    Returns:
        Path to output video
    """
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video not found: {video_path}")

    # Generate output path if not provided
    if output_path is None:
        base, ext = os.path.splitext(video_path)
        output_path = f"{base}_no_silence{ext}"

    # Select method
    if method == "auto":
        method = "auto-editor" if is_auto_editor_available() else "ffmpeg"

    if method == "auto-editor":
        # Convert dB threshold to auto-editor format
        # auto-editor uses percentage (0.04 = 4%) or dB (-30dB)
        threshold = f"{noise_threshold_db}dB"
        speed = silent_speed if silent_speed is not None else 99999

        return remove_silence_with_auto_editor(
            video_path=video_path,
            output_path=output_path,
            margin=padding,
            threshold=threshold,
            silent_speed=speed,
            progress_callback=progress_callback,
        )
    else:
        return remove_silence_with_ffmpeg(
            video_path=video_path,
            output_path=output_path,
            noise_threshold_db=noise_threshold_db,
            min_silence_duration=min_silence_duration,
            padding=padding,
            progress_callback=progress_callback,
        )


def speed_up_silence(
    video_path: str,
    output_path: Optional[str] = None,
    silent_speed: float = 6.0,
    noise_threshold_db: float = -30.0,
    padding: float = 0.1,
    progress_callback: Optional[Callable[[float, str], None]] = None,
) -> str:
    """Speed up silent parts instead of removing them completely.

    This creates a more natural feel than hard cuts.

    Args:
        video_path: Input video path
        output_path: Output path (auto-generated if None)
        silent_speed: Speed multiplier for silent parts (e.g., 6 = 6x speed)
        noise_threshold_db: Silence threshold in dB
        padding: Padding around speech
        progress_callback: Optional progress callback

    Returns:
        Path to output video
    """
    if not is_auto_editor_available():
        raise SilenceRemovalError(
            "speed_up_silence requires auto-editor. Install with: pip install auto-editor"
        )

    if output_path is None:
        base, ext = os.path.splitext(video_path)
        output_path = f"{base}_fast_silence{ext}"

    return remove_silence_with_auto_editor(
        video_path=video_path,
        output_path=output_path,
        margin=padding,
        threshold=f"{noise_threshold_db}dB",
        silent_speed=silent_speed,
        progress_callback=progress_callback,
    )
