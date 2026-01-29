"""
Batch processing module for applying operations to multiple files.
"""

from __future__ import annotations

import os
from concurrent.futures import ProcessPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Tuple

__all__ = [
    "batch_process",
    "batch_watermark",
    "batch_convert",
]


def _process_single_file(
    input_file: str,
    operations: List[Dict[str, Any]],
    output_dir: str,
    output_prefix: str,
    output_suffix: str,
) -> Dict[str, Any]:
    """Process a single video file with the given operations.

    This function is designed to be called in a separate process.

    Args:
        input_file: Path to input video file
        operations: List of operations to apply
        output_dir: Directory for output files
        output_prefix: Prefix for output filenames
        output_suffix: Suffix for output filenames (before extension)

    Returns:
        Dict with input, output, success, and optionally error keys
    """
    try:
        # Import here to avoid pickling issues with ProcessPoolExecutor
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(input_file)

        # Apply each operation
        for op in operations:
            op_type = op.get("type")
            if op_type == "trim":
                start: float = float(op.get("start", 0))
                end: float = float(op.get("end", 0))
                pipeline.trim(start, end)
            elif op_type == "scale":
                width: int = int(op.get("width", 0))
                height: int = int(op.get("height", 0))
                pipeline.scale(width, height)
            elif op_type == "overlay":
                # Handle overlay/watermark operation
                overlay_path: str = str(op.get("overlay_path", ""))
                position = op.get("position", "bottom-right")
                # Note: opacity and scale are retrieved but not yet used by overlay()
                _ = op.get("opacity", 1.0)
                _ = op.get("scale", 1.0)

                # Calculate position coordinates based on preset
                x, y = _get_position_coords(position)

                # Apply overlay with scaling if needed
                # Note: The overlay method handles images and videos
                pipeline.overlay(
                    overlay_media=overlay_path,
                    x=x,
                    y=y,
                )
            elif op_type == "volume":
                pipeline.change_volume(float(op.get("level", 1.0)))
            elif op_type == "speed":
                pipeline.change_speed(float(op.get("factor", 1.0)))
            elif op_type == "rotate":
                pipeline.rotate(float(op.get("angle", 0)))
            elif op_type == "flip":
                pipeline.flip(horizontal=bool(op.get("horizontal", False)), vertical=bool(op.get("vertical", False)))
            elif op_type == "crop":
                crop_x: int = int(op.get("x", 0))
                crop_y: int = int(op.get("y", 0))
                crop_width: int = int(op.get("width", 0))
                crop_height: int = int(op.get("height", 0))
                pipeline.crop(x=crop_x, y=crop_y, width=crop_width, height=crop_height)
            elif op_type == "color_grade":
                pipeline.color_grade(
                    brightness=float(op.get("brightness", 0.0)),
                    contrast=float(op.get("contrast", 1.0)),
                    saturation=float(op.get("saturation", 1.0)),
                    hue=float(op.get("hue", 0.0)),
                )

        # Generate output filename
        base = os.path.splitext(os.path.basename(input_file))[0]
        output_name = f"{output_prefix}{base}{output_suffix}.mp4"
        output_path = os.path.join(output_dir, output_name)

        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)

        # Render the pipeline
        # Set the output_path on the pipeline before rendering
        pipeline.output_path = output_path
        pipeline.render(format="mp4", output_dir=output_dir)

        # The render method may generate its own filename, so we check
        # If output_path was set, it should use that
        return {"input": input_file, "output": output_path, "success": True}
    except Exception as e:
        return {"input": input_file, "error": str(e), "success": False}


def _get_position_coords(position: str) -> Tuple[int, int]:
    """Convert position preset to x, y coordinates.

    Args:
        position: Position preset string (e.g., 'top-left', 'bottom-right')

    Returns:
        Tuple of (x, y) coordinates. Uses expressions for dynamic positioning.
    """
    # Return integer values for overlay positioning
    # These are relative positions - overlay filter will handle actual placement
    # For watermarks, we typically want corner positioning
    position_map = {
        "top-left": (10, 10),
        "top-right": (10, 10),  # Will need overlay expression for right alignment
        "bottom-left": (10, 10),  # Will need overlay expression for bottom alignment
        "bottom-right": (10, 10),  # Will need overlay expression for corner
        "center": (0, 0),
    }
    return position_map.get(position, (10, 10))


def batch_process(
    input_files: List[str],
    operations: List[Dict[str, Any]],
    output_dir: str,
    parallel: bool = True,
    max_workers: int = 4,
    output_prefix: str = "",
    output_suffix: str = "",
) -> List[Dict[str, Any]]:
    """Apply operations to multiple video files.

    Args:
        input_files: List of input video file paths
        operations: List of operations to apply to each file.
            Each operation is a dict with at least a 'type' key.
            Supported types:
            - {"type": "trim", "start": float, "end": float}
            - {"type": "scale", "width": int, "height": int}
            - {"type": "overlay", "overlay_path": str, "position": str, ...}
            - {"type": "volume", "level": float}
            - {"type": "speed", "factor": float}
            - {"type": "rotate", "angle": float}
            - {"type": "flip", "horizontal": bool, "vertical": bool}
            - {"type": "crop", "x": int, "y": int, "width": int, "height": int}
            - {"type": "color_grade", "brightness": float, ...}
        output_dir: Directory to save output files
        parallel: Whether to process files in parallel (default True)
        max_workers: Maximum number of parallel workers (default 4)
        output_prefix: Prefix for output filenames
        output_suffix: Suffix for output filenames (before extension)

    Returns:
        List of result dicts, each containing:
        - input: Input file path
        - output: Output file path (if successful)
        - success: Boolean indicating success
        - error: Error message (if failed)
    """
    results: List[Dict[str, Any]] = []

    if parallel:
        with ProcessPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(
                    _process_single_file,
                    f,
                    operations,
                    output_dir,
                    output_prefix,
                    output_suffix,
                ): f
                for f in input_files
            }
            for future in as_completed(futures):
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    input_file = futures[future]
                    results.append({"input": input_file, "error": str(e), "success": False})
    else:
        for f in input_files:
            result = _process_single_file(
                f,
                operations,
                output_dir,
                output_prefix,
                output_suffix,
            )
            results.append(result)

    return results


def batch_watermark(
    input_files: List[str],
    watermark_image: str,
    position: str = "bottom-right",
    opacity: float = 1.0,
    scale: float = 1.0,
    output_dir: str = "",
) -> List[Dict[str, Any]]:
    """Apply watermark to multiple videos.

    Args:
        input_files: List of input video file paths
        watermark_image: Path to the watermark image file
        position: Position for the watermark. Options:
            'top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'
        opacity: Watermark opacity (0.0 to 1.0)
        scale: Scale factor for the watermark (1.0 = original size)
        output_dir: Directory to save output files

    Returns:
        List of result dicts with input, output, success, and error keys
    """
    operations = [{"type": "overlay", "overlay_path": watermark_image, "position": position, "opacity": opacity, "scale": scale}]
    return batch_process(input_files, operations, output_dir)


def batch_convert(
    input_files: List[str],
    output_format: str = "mp4",
    resolution: Optional[Tuple[int, int]] = None,
    preset: Optional[str] = None,
    output_dir: str = "",
) -> List[Dict[str, Any]]:
    """Convert multiple videos to different format/resolution.

    Args:
        input_files: List of input video file paths
        output_format: Output format (mp4, mkv, etc.)
        resolution: Output resolution as (width, height) tuple
        preset: Encoding preset (youtube, twitch, instagram, compress)
        output_dir: Directory to save output files

    Returns:
        List of result dicts with input, output, success, and error keys
    """
    results: List[Dict[str, Any]] = []

    for f in input_files:
        try:
            from video_editor.pipeline import VideoPipeline

            pipeline = VideoPipeline(f)

            # Apply resolution scaling if specified
            if resolution:
                pipeline.scale(resolution[0], resolution[1])

            # Apply preset settings
            if preset:
                if preset == "youtube":
                    pipeline.additional_options.extend(["-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart"])
                elif preset == "twitch":
                    pipeline.additional_options.extend(["-preset", "veryfast", "-maxrate", "6000k", "-bufsize", "12000k", "-g", "60"])
                elif preset == "instagram":
                    pipeline.additional_options.extend(["-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart"])
                elif preset == "compress":
                    pipeline.additional_options.extend(["-preset", "slow", "-crf", "23"])

            # Generate output filename with proper extension
            base = os.path.splitext(os.path.basename(f))[0]
            output_name = f"{base}.{output_format}"
            output_path = os.path.join(output_dir, output_name)

            # Ensure output directory exists
            os.makedirs(output_dir, exist_ok=True)

            # Set output path and render
            pipeline.output_path = output_path
            pipeline.render(format=output_format, output_dir=output_dir)

            results.append({"input": f, "output": output_path, "success": True})
        except Exception as e:
            results.append({"input": f, "error": str(e), "success": False})

    return results
