"""
Analysis module for video/audio analysis tools.

This module provides analysis functions that don't modify videos,
but extract information from them.
"""

from __future__ import annotations

from typing import Any

from scenedetect import detect, ContentDetector

__all__ = [
    "detect_scenes",
    "generate_chapters",
    "export_chapters_ffmetadata",
    "get_loudness",
]


def detect_scenes(
    video_path: str,
    threshold: float = 30.0,
    min_scene_length: float = 0.0,
) -> list[dict[str, Any]]:
    """Detect scene changes in video.

    Args:
        video_path: Path to video file
        threshold: Detection threshold (lower = more sensitive)
        min_scene_length: Minimum scene duration in seconds

    Returns:
        List of dicts with 'start' and 'end' times in seconds
    """
    scene_list = detect(video_path, ContentDetector(threshold=threshold))

    scenes = []
    for scene in scene_list:
        start = scene[0].get_seconds()
        end = scene[1].get_seconds()
        duration = end - start

        if duration >= min_scene_length:
            scenes.append({"start": start, "end": end})

    return scenes


def generate_chapters(
    video_path: str,
    threshold: float = 30.0,
    title_pattern: str = "Chapter {n}",
) -> list[dict[str, Any]]:
    """Generate chapter markers from scene detection.

    Args:
        video_path: Path to video file
        threshold: Detection threshold (lower = more sensitive)
        title_pattern: Pattern for chapter titles, {n} is replaced with chapter number

    Returns:
        List of dicts with 'title', 'start', and 'end' times
    """
    scenes = detect_scenes(video_path, threshold)

    chapters = []
    for i, scene in enumerate(scenes):
        chapters.append({"title": title_pattern.format(n=i + 1), "start": scene["start"], "end": scene["end"]})

    return chapters


def export_chapters_ffmetadata(
    chapters: list[dict[str, Any]],
    output_path: str,
) -> None:
    """Export chapters as FFmpeg metadata format.

    Args:
        chapters: List of chapter dicts with 'title', 'start', 'end' keys
        output_path: Path to write the metadata file
    """
    with open(output_path, "w") as f:
        f.write(";FFMETADATA1\n\n")
        for ch in chapters:
            start_ms = int(ch["start"] * 1000)
            end_ms = int(ch["end"] * 1000)
            f.write("[CHAPTER]\n")
            f.write("TIMEBASE=1/1000\n")
            f.write(f"START={start_ms}\n")
            f.write(f"END={end_ms}\n")
            f.write(f"title={ch['title']}\n\n")


def get_loudness(video_path: str) -> dict[str, float]:
    """Analyze audio loudness (LUFS, true peak, LRA).

    Uses FFmpeg's loudnorm filter in analysis mode to measure:
    - Integrated loudness (LUFS/LKFS)
    - True peak (dBTP)
    - Loudness Range (LU)

    Args:
        video_path: Path to video or audio file to analyze

    Returns:
        Dictionary with keys:
        - integrated_lufs: Integrated loudness in LUFS
        - true_peak: True peak in dBTP
        - lra: Loudness Range in LU
    """
    import json
    import re
    import subprocess

    cmd = ["ffmpeg", "-i", video_path, "-af", "loudnorm=print_format=json", "-f", "null", "-"]

    result = subprocess.run(cmd, capture_output=True, text=True)

    # FFmpeg outputs to stderr
    output = result.stderr

    # Find the JSON block in the output
    # The loudnorm filter outputs JSON at the end
    match = re.search(r'\{[^{}]*"input_i"[^{}]*\}', output, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group())
            return {
                "integrated_lufs": float(data.get("input_i", -24)),
                "true_peak": float(data.get("input_tp", 0)),
                "lra": float(data.get("input_lra", 0)),
            }
        except (json.JSONDecodeError, ValueError):
            pass

    # Fallback: try to find individual values with regex
    # This handles cases where the JSON might be malformed
    integrated = re.search(r'"input_i"\s*:\s*"?(-?\d+\.?\d*)"?', output)
    true_peak = re.search(r'"input_tp"\s*:\s*"?(-?\d+\.?\d*)"?', output)
    lra = re.search(r'"input_lra"\s*:\s*"?(-?\d+\.?\d*)"?', output)

    return {
        "integrated_lufs": float(integrated.group(1)) if integrated else -24.0,
        "true_peak": float(true_peak.group(1)) if true_peak else 0.0,
        "lra": float(lra.group(1)) if lra else 0.0,
    }
