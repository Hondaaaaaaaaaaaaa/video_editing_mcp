"""
Pipeline architecture for video processing operations.
Implements the VideoPipeline class for chaining ffmpeg operations.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import tempfile
import uuid
from typing import Any, Dict, List, Optional, Tuple, Union

# Import Self from typing_extensions for Python < 3.11 compatibility
# Use typing_extensions unconditionally for broader compatibility
from typing_extensions import Self

from video_editor.pipeline.operations import (
    add_audio,
    add_ken_burns,
    add_text,
    apply_transition,
    apply_vst3,
    change_volume,
    chroma_key,
    color_grade,
    concat,
    crop,
    flip,
    overlay,
    remove_silences,
    rotate,
    scale,
)
from video_editor.timeline import TimelineTracker
from video_editor.utils.helpers import _is_gpu_available, _to_temp_file

# Setup logging
logger: logging.Logger = logging.getLogger("video_editor")

# Global pipelines registry
pipelines: Dict[str, VideoPipeline] = {}


class VideoPipeline:
    """Pipeline for batching ffmpeg filters and arguments."""

    # Type declarations for instance attributes
    is_temp_input: bool
    input_path: str
    _input_path: str  # Alias for export functions
    start_time: Optional[float]
    end_time: Optional[float]
    video_filters: List[str]
    audio_filters: List[str]
    complex_filters: List[str]
    additional_inputs: List[str]
    map_options: List[str]
    additional_options: List[str]
    output_path: Optional[str]
    timeline: TimelineTracker
    _stabilization_params: Optional[Dict[str, Any]]
    _operations: List[Dict[str, Any]]

    def __init__(self, input_media: Union[str, bytes]) -> None:
        self.is_temp_input = isinstance(input_media, (bytes, bytearray))
        self.input_path = (
            _to_temp_file(
                input_media,
                suffix=(os.path.splitext(input_media)[1] if isinstance(input_media, str) else "") or ".mp4",
            )
            if self.is_temp_input
            else str(input_media)
        )
        self.start_time = None
        self.end_time = None
        self.video_filters = []
        self.audio_filters = []
        self.complex_filters = []
        self.additional_inputs = []
        self.map_options = []
        self.additional_options = []
        self.output_path = None  # Store a custom output path when provided
        self._stabilization_params = None  # Store stabilization parameters for two-pass process
        self._operations: List[Dict[str, Any]] = []  # Track operations for export/templates
        self._input_path = self.input_path  # Alias for export functions
        self._duration_modified = False  # Track if filters change video duration (loop, boomerang)

        # Timeline tracker for cumulative operations
        self.timeline = TimelineTracker(self._get_input_duration())

    # Add operation methods from external module
    add_ken_burns = add_ken_burns
    add_text = add_text
    change_volume = change_volume
    color_grade = color_grade
    scale = scale
    overlay = overlay
    remove_silences = remove_silences
    rotate = rotate
    flip = flip
    crop = crop
    chroma_key = chroma_key
    add_audio = add_audio
    apply_transition = apply_transition
    apply_vst3 = apply_vst3
    concat = concat

    def add_animated_text(
        self,
        text: str,
        animation: str,
        duration: float,
        start_time: float,
        end_time: Optional[float] = None,
        position: str = "center",
        font_size: int = 48,
        color: str = "white",
        outline_color: Optional[str] = None,
        outline_width: int = 0,
    ) -> Self:
        """Add animated text overlay to the video.

        Args:
            text: Text to display
            animation: Animation type ('fade_in', 'fade_out', 'fade_in_out',
                      'slide_in_left', 'slide_in_right', 'slide_in_top',
                      'slide_in_bottom', 'typewriter', 'zoom_in', 'zoom_out', 'bounce')
            duration: Duration of the animation effect in seconds
            start_time: Start time in seconds when text appears
            end_time: End time in seconds when text disappears (optional)
            position: Position preset ('center', 'top-center', 'bottom-center',
                      'top-left', 'top-right', 'bottom-left', 'bottom-right')
            font_size: Font size in pixels
            color: Text color name or hex code
            outline_color: Outline/border color (optional)
            outline_width: Outline/border width in pixels

        Returns:
            Self for method chaining
        """
        # Map time points from the edited timeline to the original timeline
        original_start: Optional[float] = self._map_timeline_point(start_time)
        original_end: Optional[float] = self._map_timeline_point(end_time)

        # Escape text for FFmpeg drawtext filter
        # Escape single quotes and colons
        escaped_text: str = text.replace("'", "'\\''").replace(":", "\\:")
        escaped_text = escaped_text.replace("\\", "\\\\")

        # Get position expressions based on preset
        x_expr: str
        y_expr: str
        x_expr, y_expr = self._get_position_expressions(position)

        # Build the base drawtext filter parameters
        filter_parts: List[str] = [
            f"text='{escaped_text}'",
            f"fontsize={font_size}",
            f"fontcolor={color}",
        ]

        # Add outline if specified
        if outline_color and outline_width > 0:
            filter_parts.append(f"borderw={outline_width}")
            filter_parts.append(f"bordercolor={outline_color}")

        # Determine effective end_time for animations
        effective_end: float = original_end if original_end is not None else 999999.0
        effective_start: float = original_start if original_start is not None else start_time

        # Build animation-specific expressions
        if animation == "fade_in":
            # Alpha increases from 0 to 1 over duration
            alpha_expr: str = f"if(lt(t-{effective_start},{duration}),(t-{effective_start})/{duration},1)"
            filter_parts.append(f"alpha='{alpha_expr}'")
            filter_parts.append(f"x={x_expr}")
            filter_parts.append(f"y={y_expr}")
            enable_expr: str = f"gte(t,{effective_start})"
            if original_end is not None:
                enable_expr = f"between(t,{effective_start},{effective_end})"
            filter_parts.append(f"enable='{enable_expr}'")

        elif animation == "fade_out":
            # Alpha decreases from 1 to 0 over duration at the end
            alpha_expr = f"if(lt(t,{effective_end}-{duration}),1,1-(t-({effective_end}-{duration}))/{duration})"
            filter_parts.append(f"alpha='{alpha_expr}'")
            filter_parts.append(f"x={x_expr}")
            filter_parts.append(f"y={y_expr}")
            filter_parts.append(f"enable='between(t,{effective_start},{effective_end})'")

        elif animation == "fade_in_out":
            # Fade in at start, fade out at end
            alpha_expr = (
                f"if(lt(t-{effective_start},{duration}),"
                f"(t-{effective_start})/{duration},"
                f"if(gt(t,{effective_end}-{duration}),"
                f"1-(t-({effective_end}-{duration}))/{duration},1))"
            )
            filter_parts.append(f"alpha='{alpha_expr}'")
            filter_parts.append(f"x={x_expr}")
            filter_parts.append(f"y={y_expr}")
            filter_parts.append(f"enable='between(t,{effective_start},{effective_end})'")

        elif animation == "slide_in_left":
            # X position moves from off-screen left to final position
            x_anim: str = f"if(lt(t-{effective_start},{duration}),-tw+(tw+{x_expr})*(t-{effective_start})/{duration},{x_expr})"
            filter_parts.append(f"x='{x_anim}'")
            filter_parts.append(f"y={y_expr}")
            enable_expr = f"gte(t,{effective_start})"
            if original_end is not None:
                enable_expr = f"between(t,{effective_start},{effective_end})"
            filter_parts.append(f"enable='{enable_expr}'")

        elif animation == "slide_in_right":
            # X position moves from off-screen right to final position
            x_anim = f"if(lt(t-{effective_start},{duration}),w-(w-{x_expr}+tw)*(t-{effective_start})/{duration},{x_expr})"
            filter_parts.append(f"x='{x_anim}'")
            filter_parts.append(f"y={y_expr}")
            enable_expr = f"gte(t,{effective_start})"
            if original_end is not None:
                enable_expr = f"between(t,{effective_start},{effective_end})"
            filter_parts.append(f"enable='{enable_expr}'")

        elif animation == "slide_in_top":
            # Y position moves from off-screen top to final position
            y_anim: str = f"if(lt(t-{effective_start},{duration}),-th+({y_expr}+th)*(t-{effective_start})/{duration},{y_expr})"
            filter_parts.append(f"x={x_expr}")
            filter_parts.append(f"y='{y_anim}'")
            enable_expr = f"gte(t,{effective_start})"
            if original_end is not None:
                enable_expr = f"between(t,{effective_start},{effective_end})"
            filter_parts.append(f"enable='{enable_expr}'")

        elif animation == "slide_in_bottom":
            # Y position moves from off-screen bottom to final position
            y_anim = f"if(lt(t-{effective_start},{duration}),h-(h-{y_expr}+th)*(t-{effective_start})/{duration},{y_expr})"
            filter_parts.append(f"x={x_expr}")
            filter_parts.append(f"y='{y_anim}'")
            enable_expr = f"gte(t,{effective_start})"
            if original_end is not None:
                enable_expr = f"between(t,{effective_start},{effective_end})"
            filter_parts.append(f"enable='{enable_expr}'")

        elif animation == "typewriter":
            # Simplified typewriter - fade in effect for now
            filter_parts.append(f"x={x_expr}")
            filter_parts.append(f"y={y_expr}")
            alpha_expr = f"if(lt(t-{effective_start},{duration}),(t-{effective_start})/{duration},1)"
            filter_parts.append(f"alpha='{alpha_expr}'")
            enable_expr = f"gte(t,{effective_start})"
            if original_end is not None:
                enable_expr = f"between(t,{effective_start},{effective_end})"
            filter_parts.append(f"enable='{enable_expr}'")

        elif animation == "zoom_in":
            # Font size grows from small to target size over duration
            min_size: int = max(1, font_size // 4)
            fontsize_expr: str = (
                f"if(lt(t-{effective_start},{duration}),{min_size}+({font_size}-{min_size})*(t-{effective_start})/{duration},{font_size})"
            )
            filter_parts = [
                f"text='{escaped_text}'",
                f"fontsize='{fontsize_expr}'",
                f"fontcolor={color}",
            ]
            if outline_color and outline_width > 0:
                filter_parts.append(f"borderw={outline_width}")
                filter_parts.append(f"bordercolor={outline_color}")
            filter_parts.append(f"x={x_expr}")
            filter_parts.append(f"y={y_expr}")
            enable_expr = f"gte(t,{effective_start})"
            if original_end is not None:
                enable_expr = f"between(t,{effective_start},{effective_end})"
            filter_parts.append(f"enable='{enable_expr}'")

        elif animation == "zoom_out":
            # Font size shrinks from large to target size over duration
            max_size: int = font_size * 3
            fontsize_expr = f"if(lt(t-{effective_start},{duration}),{max_size}-({max_size}-{font_size})*(t-{effective_start})/{duration},{font_size})"
            filter_parts = [
                f"text='{escaped_text}'",
                f"fontsize='{fontsize_expr}'",
                f"fontcolor={color}",
            ]
            if outline_color and outline_width > 0:
                filter_parts.append(f"borderw={outline_width}")
                filter_parts.append(f"bordercolor={outline_color}")
            filter_parts.append(f"x={x_expr}")
            filter_parts.append(f"y={y_expr}")
            enable_expr = f"gte(t,{effective_start})"
            if original_end is not None:
                enable_expr = f"between(t,{effective_start},{effective_end})"
            filter_parts.append(f"enable='{enable_expr}'")

        elif animation == "bounce":
            # Y position bounces using sin() for bounce effect
            bounce_height: int = 100
            y_bounce: str = (
                f"if(lt(t-{effective_start},{duration}),"
                f"{y_expr}-{bounce_height}*abs(sin((t-{effective_start})/{duration}*3.14159*3))"
                f"*pow(0.5,(t-{effective_start})/{duration}*3),"
                f"{y_expr})"
            )
            filter_parts.append(f"x={x_expr}")
            filter_parts.append(f"y='{y_bounce}'")
            enable_expr = f"gte(t,{effective_start})"
            if original_end is not None:
                enable_expr = f"between(t,{effective_start},{effective_end})"
            filter_parts.append(f"enable='{enable_expr}'")

        else:
            # Unknown animation - just show static text
            filter_parts.append(f"x={x_expr}")
            filter_parts.append(f"y={y_expr}")
            enable_expr = f"gte(t,{effective_start})"
            if original_end is not None:
                enable_expr = f"between(t,{effective_start},{effective_end})"
            filter_parts.append(f"enable='{enable_expr}'")

        # Build the final drawtext filter string
        filter_str: str = "drawtext=" + ":".join(filter_parts)
        self.video_filters.append(filter_str)

        return self

    def _get_position_expressions(self, position: str) -> Tuple[str, str]:
        """Get X and Y position expressions for text positioning.

        Args:
            position: Position preset name

        Returns:
            Tuple of (x_expression, y_expression) for FFmpeg drawtext
        """
        position_map: Dict[str, Tuple[str, str]] = {
            "center": ("(w-text_w)/2", "(h-text_h)/2"),
            "top-center": ("(w-text_w)/2", "50"),
            "bottom-center": ("(w-text_w)/2", "h-text_h-50"),
            "top-left": ("50", "50"),
            "top-right": ("w-text_w-50", "50"),
            "bottom-left": ("50", "h-text_h-50"),
            "bottom-right": ("w-text_w-50", "h-text_h-50"),
        }

        return position_map.get(position, position_map["center"])

    def split_by_scenes(
        self,
        threshold: float = 30.0,
        output_dir: Optional[str] = None,
        prefix: str = "scene_",
        return_metadata: bool = False,
    ) -> Union[List[str], Dict[str, Any]]:
        """Split video by detected scene changes.

        Args:
            threshold: Detection threshold (lower = more sensitive)
            output_dir: Directory to save the split scenes (required)
            prefix: Prefix for output filenames
            return_metadata: If True, return metadata dict instead of just paths

        Returns:
            List of output file paths, or dict with 'scenes' and 'output_files' if return_metadata=True
        """
        from video_editor.analysis import detect_scenes

        if output_dir is None:
            raise ValueError("output_dir is required for split_by_scenes")

        os.makedirs(output_dir, exist_ok=True)

        scenes = detect_scenes(self.input_path, threshold)
        outputs: List[str] = []

        for i, scene in enumerate(scenes):
            output_path = os.path.join(output_dir, f"{prefix}{i + 1}.mp4")
            # Use ffmpeg to extract segment
            cmd: List[str] = ["ffmpeg", "-y", "-i", self.input_path, "-ss", str(scene["start"]), "-to", str(scene["end"]), "-c", "copy", output_path]
            subprocess.run(cmd, capture_output=True)
            outputs.append(output_path)
            scene["output"] = output_path

        if return_metadata:
            return {"scenes": scenes, "output_files": outputs}
        return outputs

    # ==================== Visual Effects Methods ====================

    def add_vignette(
        self,
        intensity: float = 0.5,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
    ) -> Self:
        """Add vignette effect that darkens the edges of the video.

        Args:
            intensity: Vignette intensity from 0.0 to 1.0 (default 0.5)
            start_time: Start time in seconds to apply the effect (None = from beginning)
            end_time: End time in seconds to apply the effect (None = until end)

        Returns:
            Self for method chaining
        """
        # Build the vignette filter string
        if start_time is not None and end_time is not None:
            filter_str = f"vignette=PI*{intensity}:enable='between(t,{start_time},{end_time})'"
        elif start_time is not None:
            filter_str = f"vignette=PI*{intensity}:enable='gte(t,{start_time})'"
        elif end_time is not None:
            filter_str = f"vignette=PI*{intensity}:enable='lte(t,{end_time})'"
        else:
            filter_str = f"vignette=PI*{intensity}"

        self.video_filters.append(filter_str)
        return self

    def add_film_grain(self, intensity: float = 0.3) -> Self:
        """Add film grain noise effect for vintage/cinematic look.

        Args:
            intensity: Grain intensity from 0.0 to 1.0 (default 0.3)

        Returns:
            Self for method chaining
        """
        # Convert intensity (0-1) to noise strength (0-50)
        noise_strength = int(intensity * 50)
        filter_str = f"noise=alls={noise_strength}:allf=t"
        self.video_filters.append(filter_str)
        return self

    def add_sepia(self, intensity: float = 1.0) -> Self:
        """Add sepia tone color effect.

        Args:
            intensity: Sepia intensity from 0.0 to 1.0 (default 1.0 = full sepia)

        Returns:
            Self for method chaining
        """
        # Standard sepia colorchannelmixer values
        # Full sepia: .393:.769:.189:0:.349:.686:.168:0:.272:.534:.131
        if intensity >= 1.0:
            filter_str = "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131"
        else:
            # Blend sepia with original based on intensity
            # Use the mix filter to blend original with sepia
            # Split input, apply sepia to one, then blend
            r_r = 1 - intensity + (0.393 * intensity)
            r_g = 0.769 * intensity
            r_b = 0.189 * intensity
            g_r = 0.349 * intensity
            g_g = 1 - intensity + (0.686 * intensity)
            g_b = 0.168 * intensity
            b_r = 0.272 * intensity
            b_g = 0.534 * intensity
            b_b = 1 - intensity + (0.131 * intensity)
            filter_str = f"colorchannelmixer={r_r:.3f}:{r_g:.3f}:{r_b:.3f}:0:{g_r:.3f}:{g_g:.3f}:{g_b:.3f}:0:{b_r:.3f}:{b_g:.3f}:{b_b:.3f}"

        self.video_filters.append(filter_str)
        return self

    def add_black_and_white(self) -> Self:
        """Convert video to black and white (grayscale).

        Returns:
            Self for method chaining
        """
        filter_str = "hue=s=0"
        self.video_filters.append(filter_str)
        return self

    def add_negative(self) -> Self:
        """Invert colors to create a negative effect.

        Returns:
            Self for method chaining
        """
        filter_str = "negate"
        self.video_filters.append(filter_str)
        return self

    def add_vintage(self) -> Self:
        """Add vintage/retro color effect with desaturation and color shift.

        Returns:
            Self for method chaining
        """
        # Use curves=vintage for the classic vintage look
        filter_str = "curves=vintage"
        self.video_filters.append(filter_str)
        return self

    def add_color_tint(self, tint: str = "warm") -> Self:
        """Add a color tint to the video.

        Args:
            tint: Color tint type - "warm" (orange/red) or "cool" (blue)

        Returns:
            Self for method chaining
        """
        if tint == "warm":
            # Add orange/red tint
            filter_str = "colorbalance=rs=0.1:gs=0.05:bs=-0.1"
        elif tint == "cool":
            # Add blue tint
            filter_str = "colorbalance=rs=-0.1:gs=0:bs=0.15"
        else:
            # Default to warm if unknown tint
            filter_str = "colorbalance=rs=0.1:gs=0.05:bs=-0.1"

        self.video_filters.append(filter_str)
        return self

    def add_letterbox_bars(self, bar_height: int = 50) -> Self:
        """Add cinematic letterbox black bars to top and bottom.

        Args:
            bar_height: Height of each bar in pixels (default 50)

        Returns:
            Self for method chaining
        """
        # Pad the video with black bars at top and bottom
        filter_str = f"pad=iw:ih+{bar_height * 2}:0:{bar_height}:black"
        self.video_filters.append(filter_str)
        return self

    def add_scan_lines(self, intensity: float = 0.3) -> Self:
        """Add CRT-style scan lines effect.

        Args:
            intensity: Scan line visibility from 0.0 to 1.0 (default 0.3)

        Returns:
            Self for method chaining
        """
        # Create scan lines using geq filter with alternating line brightness
        # The formula darkens every other line based on intensity
        darkness = 1.0 - intensity
        filter_str = f"geq=lum='if(mod(Y,2),lum(X,Y)*{darkness:.2f},lum(X,Y))':cb='cb(X,Y)':cr='cr(X,Y)'"
        self.video_filters.append(filter_str)
        return self

    def add_vhs_effect(self) -> Self:
        """Add VHS/retro video effect with noise, color shift, and slight blur.

        Returns:
            Self for method chaining
        """
        # Combine noise, color shift (rgbashift), and desaturation
        filter_str = "noise=alls=10:allf=t,rgbashift=rh=-2:bh=2,eq=saturation=0.9"
        self.video_filters.append(filter_str)
        return self

    # ==================== Borders and Padding Methods ====================

    def add_padding(
        self,
        top: int,
        right: int,
        bottom: int,
        left: int,
        color: str = "black",
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
    ) -> Self:
        """Add padding around the video.

        Args:
            top: Padding in pixels from the top
            right: Padding in pixels from the right
            bottom: Padding in pixels from the bottom
            left: Padding in pixels from the left
            color: Padding color (e.g., 'black', 'white', '#FF0000')
            start_time: Start time in seconds to apply the effect (None = from beginning)
            end_time: End time in seconds to apply the effect (None = until end)

        Returns:
            Self for method chaining
        """
        # Build the pad filter
        # pad=width=iw+left+right:height=ih+top+bottom:x=left:y=top:color=color
        filter_str = f"pad=width=iw+{left}+{right}:height=ih+{top}+{bottom}:x={left}:y={top}:color={color}"

        # Apply time constraints if specified
        if start_time is not None and end_time is not None:
            filter_str += f":enable='between(t,{start_time},{end_time})'"
        elif start_time is not None:
            filter_str += f":enable='gte(t,{start_time})'"
        elif end_time is not None:
            filter_str += f":enable='lte(t,{end_time})'"

        self.video_filters.append(filter_str)
        return self

    def add_border(
        self,
        width: int,
        color: str = "black",
    ) -> Self:
        """Add a uniform border around the video.

        This is a convenience method that adds equal padding on all sides.

        Args:
            width: Border width in pixels
            color: Border color (e.g., 'black', 'white', 'gold', '#FF0000')

        Returns:
            Self for method chaining
        """
        # Add padding to all sides equally
        return self.add_padding(
            top=width,
            right=width,
            bottom=width,
            left=width,
            color=color,
        )

    def add_letterbox(
        self,
        aspect_ratio: str,
        color: str = "black",
        blur_bars: bool = False,
    ) -> Self:
        """Add letterbox or pillarbox padding to achieve a target aspect ratio.

        This adds padding to convert the video to the target aspect ratio.
        If the target is wider than the source, horizontal padding (pillarbox) is added.
        If the target is taller than the source, vertical padding (letterbox) is added.

        Args:
            aspect_ratio: Target aspect ratio as string (e.g., '16:9', '4:3', '21:9', '9:16', '1:1')
            color: Padding color (e.g., 'black', 'white', '#333333')
            blur_bars: If True, use blurred video as background instead of solid color

        Returns:
            Self for method chaining
        """
        # Parse aspect ratio (supports both integer and decimal like "2.35:1")
        if ":" in aspect_ratio:
            w_ratio, h_ratio = map(float, aspect_ratio.split(":"))
            target_ratio = w_ratio / h_ratio
        else:
            raise ValueError(f"Invalid aspect ratio format: {aspect_ratio}. Use format like '16:9' or '2.35:1'")

        # Get current video dimensions
        width, height = self._get_video_dimensions()
        if width == 0 or height == 0:
            logger.warning("Could not determine video dimensions, using 640x480 as default")
            width, height = 640, 480

        current_ratio = width / height

        if blur_bars:
            # Use blurred video as background
            if target_ratio > current_ratio:
                # Need horizontal padding (pillarbox)
                new_width = int(height * target_ratio)
                # Ensure even dimensions
                new_width = new_width + (new_width % 2)
                complex_filter = f"[0:v]split[fg][bg];[bg]scale={new_width}:{height},boxblur=20[blurred];[blurred][fg]overlay=(W-w)/2:(H-h)/2[v]"
            else:
                # Need vertical padding (letterbox)
                new_height = int(width / target_ratio)
                # Ensure even dimensions
                new_height = new_height + (new_height % 2)
                complex_filter = f"[0:v]split[fg][bg];[bg]scale={width}:{new_height},boxblur=20[blurred];[blurred][fg]overlay=(W-w)/2:(H-h)/2[v]"

            self.complex_filters.append(complex_filter)
            self.map_options.extend(["-map", "[v]", "-map", "0:a?"])
        else:
            # Use solid color padding
            if target_ratio > current_ratio:
                # Need horizontal padding (pillarbox)
                new_width = int(height * target_ratio)
                # Ensure even dimensions
                new_width = new_width + (new_width % 2)
                pad_x = (new_width - width) // 2
                filter_str = f"pad={new_width}:{height}:{pad_x}:0:{color}"
            else:
                # Need vertical padding (letterbox)
                new_height = int(width / target_ratio)
                # Ensure even dimensions
                new_height = new_height + (new_height % 2)
                pad_y = (new_height - height) // 2
                filter_str = f"pad={width}:{new_height}:0:{pad_y}:{color}"

            self.video_filters.append(filter_str)

        return self

    # ==================== End Visual Effects Methods ====================

    def add_stabilization(
        self,
        shakiness: int = 5,
        accuracy: int = 15,
        smoothing: int = 10,
        zoom: int = 0,
    ) -> Self:
        """Add video stabilization using FFmpeg's vidstab filters.

        This is a two-pass process:
        1. Pass 1 (detect): Analyzes the video to detect motion
        2. Pass 2 (transform): Applies stabilization based on detected motion

        Args:
            shakiness: How shaky the video is, 1-10 (default 5)
            accuracy: Detection accuracy, 1-15 (default 15)
            smoothing: Number of frames for smoothing (default 10)
            zoom: Percentage to zoom in to hide borders (default 0)

        Returns:
            Self for method chaining
        """
        self._stabilization_params = {
            "shakiness": shakiness,
            "accuracy": accuracy,
            "smoothing": smoothing,
            "zoom": zoom,
        }
        return self

    def _run_stabilization_detect(self, trf_path: str) -> None:
        """Run the first pass of video stabilization (motion detection).

        Args:
            trf_path: Path to write the transforms file
        """
        if self._stabilization_params is None:
            return

        shakiness = self._stabilization_params["shakiness"]
        accuracy = self._stabilization_params["accuracy"]

        # Escape path for FFmpeg filter (Windows compatibility)
        # FFmpeg filters use : as option separator, so we quote the path value
        escaped_trf_path = trf_path.replace("\\", "/")

        # Build the detect command - use single quotes around the path value
        cmd: List[str] = [
            "ffmpeg",
            "-y",
            "-i",
            self.input_path,
            "-vf",
            f"vidstabdetect=shakiness={shakiness}:accuracy={accuracy}:result='{escaped_trf_path}'",
            "-f",
            "null",
            "-",
        ]

        logger.info(f"Running stabilization detect pass: {' '.join(cmd)}")

        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            error_msg = result.stderr.decode() if result.stderr else "Unknown error"
            logger.error(f"Stabilization detect pass failed: {error_msg}")
            raise RuntimeError(f"Stabilization detect pass failed: {error_msg}")

    def render(
        self,
        output_dir: Optional[str] = None,
        format: str = "mp4",
        video_codec: str = "libx264",
        audio_codec: str = "aac",
        resolution: Optional[str] = None,
        frame_rate: Optional[float] = None,
        hardware_accel: bool = False,
        preset: str = "ultrafast",
    ) -> str:
        """Render the pipeline to an output file.

        Args:
            output_dir: Directory to save the output file
            format: Output format (mp4, mov, etc.)
            video_codec: Video codec (libx264, hevc, etc.)
            audio_codec: Audio codec (aac, mp3, etc.)
            resolution: Output resolution (e.g., 1920x1080)
            frame_rate: Output frame rate (e.g., 30)
            hardware_accel: Whether to use hardware acceleration
            preset: Encoding preset (fast, slow, etc.)

        Returns:
            Path to the rendered output file
        """
        # Handle audio replacement if set
        if hasattr(self, "_replacement_audio_path"):
            return self._render_with_audio_replacement(
                format=format,
                video_codec=video_codec,
                output_dir=output_dir,
            )

        # Handle stabilization (two-pass process)
        trf_file: Optional[str] = None
        if self._stabilization_params is not None:
            # Create a temporary file for the transforms
            trf_fd, trf_file = tempfile.mkstemp(suffix=".trf")
            os.close(trf_fd)

            try:
                # Run the detection pass
                self._run_stabilization_detect(trf_file)

                # Add the transform filter for the main render
                smoothing = self._stabilization_params["smoothing"]
                zoom = self._stabilization_params["zoom"]
                # Escape path for FFmpeg filter (Windows compatibility)
                # FFmpeg filters use : as option separator, so we quote the path value
                escaped_trf_file = trf_file.replace("\\", "/")
                self.video_filters.append(f"vidstabtransform=input='{escaped_trf_file}':smoothing={smoothing}:zoom={zoom}")
            except Exception:
                # Clean up on error
                if trf_file and os.path.exists(trf_file):
                    os.remove(trf_file)
                raise

        try:
            # Determine output path
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)
                output_filename = f"output_{uuid.uuid4().hex[:8]}.{format}"
                final_output_path = os.path.join(output_dir, output_filename)
                self.output_path = final_output_path
            else:
                final_output_path = self.build_output_path(self.input_path, format)

            # Build the ffmpeg command
            cmd, final_output_path = self.build_cmd(
                format=format,
                video_codec=video_codec,
                audio_codec=audio_codec,
                resolution=resolution,
                frame_rate=frame_rate,
                hardware_accel=hardware_accel,
                preset=preset,
                output_path=final_output_path,
            )

            # Log the command
            logger.info(f"Running FFmpeg command: {' '.join(cmd)}")

            # Run the command
            p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

            # Wait for completion
            stdout, stderr = p.communicate()

            if p.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown FFmpeg error"
                logger.error(f"FFmpeg error: {error_msg}")
                raise RuntimeError(f"FFmpeg error: {error_msg}")

            logger.info(f"Video processing complete. Output: {final_output_path}")

            # Handle SRT sidecar file generation if add_subtitles was called with burn_in=False
            if hasattr(self, "_subtitle_segments") and self._subtitle_segments:
                srt_path = final_output_path.replace(f".{format}", ".srt")
                self._segments_to_srt(self._subtitle_segments, srt_path)
                logger.info(f"SRT sidecar created: {srt_path}")

            return final_output_path

        finally:
            # Clean up temp files
            if trf_file and os.path.exists(trf_file):
                try:
                    os.remove(trf_file)
                except OSError:
                    pass

    def _get_input_duration(self) -> Optional[float]:
        """Get the duration of the input video."""
        if not os.path.exists(self.input_path):
            return None

        try:
            duration_cmd: List[str] = [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                self.input_path,
            ]
            return float(subprocess.check_output(duration_cmd).decode().strip())
        except (subprocess.SubprocessError, ValueError):
            logger.warning(f"Could not determine duration of input media: {self.input_path}")
            return None

    def _get_video_dimensions(self) -> Tuple[int, int]:
        """Get the width and height of the input video.

        Returns:
            Tuple of (width, height) in pixels. Returns (0, 0) if cannot determine.
        """
        if not os.path.exists(self.input_path):
            return (0, 0)

        try:
            cmd: List[str] = [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height",
                "-of",
                "csv=p=0:s=x",
                self.input_path,
            ]
            result = subprocess.check_output(cmd).decode().strip()
            if "x" in result:
                width, height = result.split("x")
                return (int(width), int(height))
            return (0, 0)
        except (subprocess.SubprocessError, ValueError):
            logger.warning(f"Could not determine dimensions of input media: {self.input_path}")
            return (0, 0)

    def _map_timeline_point(self, time_point: Optional[float]) -> Optional[float]:
        """Map a time point from the edited timeline to the original timeline."""
        if time_point is None:
            return None
        return self.timeline.map_timeline_to_original(time_point)

    def trim(self, start_time: float, end_time: float) -> None:
        """Set trim points for the video."""
        self.start_time = start_time
        self.end_time = end_time

    def change_speed(
        self,
        speed: float,
        preserve_audio_pitch: bool = True,
        max_speed: float = 16.0,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
    ) -> Self:
        """Change playback speed.

        Args:
            speed: Speed multiplier (1.0 = normal, 2.0 = double speed, 0.5 = half speed)
            preserve_audio_pitch: If True, maintains audio pitch while changing speed
            max_speed: Maximum allowed speed (very high speeds can cause processing issues)
            start_time: Start time in seconds to apply the effect (None = from beginning)
            end_time: End time in seconds to apply the effect (None = until end)
        """
        # Map time points from the edited timeline to the original timeline
        original_start: Optional[float] = self._map_timeline_point(start_time)
        original_end: Optional[float] = self._map_timeline_point(end_time)

        # Limit maximum speed to avoid freezing
        if speed > max_speed:
            logger.warning(f"Speed {speed} exceeds maximum of {max_speed}. Limiting to {max_speed}.")
            speed = max_speed

        # Register the speed change with the timeline tracker
        if start_time is not None and end_time is not None:
            self.timeline.register_speed_change(start_time, end_time, speed)

        # Instead of directly applying speed to the entire video, we need to handle time segments
        if original_start is not None or original_end is not None:
            # We need to use complex filtergraph for segmented speed changes
            # Split the video into segments, change speed for the middle segment, then concatenate
            complex_filter: str = ""

            # Setup video stream splits for before, during, and after effect
            if original_start is not None and original_start > 0:
                complex_filter += f"[0:v]trim=0:{original_start},setpts=PTS-STARTPTS[v1];"
                if original_end is not None:
                    complex_filter += f"[0:v]trim={original_start}:{original_end},setpts=PTS-STARTPTS,setpts=PTS/{speed}[v2];"
                    complex_filter += f"[0:v]trim={original_end}:,setpts=PTS-STARTPTS[v3];"
                    complex_filter += "[v1][v2][v3]concat=n=3:v=1:a=0[v];"
                else:
                    complex_filter += f"[0:v]trim={original_start}:,setpts=PTS-STARTPTS,setpts=PTS/{speed}[v2];"
                    complex_filter += "[v1][v2]concat=n=2:v=1:a=0[v];"
            elif original_end is not None:
                complex_filter += f"[0:v]trim=0:{original_end},setpts=PTS-STARTPTS,setpts=PTS/{speed}[v1];"
                complex_filter += f"[0:v]trim={original_end}:,setpts=PTS-STARTPTS[v2];"
                complex_filter += "[v1][v2]concat=n=2:v=1:a=0[v];"

            # Handle audio similarly
            if preserve_audio_pitch:
                atempo: float = speed
                parts: List[str] = []

                if atempo < 0.5 or atempo > 2.0:
                    # Handle very slow speeds
                    while atempo < 0.5:
                        parts.append("0.5")
                        atempo /= 0.5  # Equivalent to atempo *= 2.0

                    # Handle fast speeds
                    while atempo > 2.0:
                        parts.append("2.0")
                        atempo /= 2.0

                    # Add the remaining factor
                    if abs(atempo - 1.0) > 0.01:  # Only add if not ~1.0
                        parts.append(f"{atempo:.3f}")
                else:
                    parts.append(f"{atempo:.3f}")

                atempo_str: str = ",".join(f"atempo={p}" for p in parts)

                if original_start is not None and original_start > 0:
                    complex_filter += f"[0:a]atrim=0:{original_start},asetpts=PTS-STARTPTS[a1];"
                    if original_end is not None:
                        complex_filter += f"[0:a]atrim={original_start}:{original_end},asetpts=PTS-STARTPTS,{atempo_str}[a2];"
                        complex_filter += f"[0:a]atrim={original_end}:,asetpts=PTS-STARTPTS[a3];"
                        complex_filter += "[a1][a2][a3]concat=n=3:v=0:a=1[a]"
                    else:
                        complex_filter += f"[0:a]atrim={original_start}:,asetpts=PTS-STARTPTS,{atempo_str}[a2];"
                        complex_filter += "[a1][a2]concat=n=2:v=0:a=1[a]"
                elif original_end is not None:
                    complex_filter += f"[0:a]atrim=0:{original_end},asetpts=PTS-STARTPTS,{atempo_str}[a1];"
                    complex_filter += f"[0:a]atrim={original_end}:,asetpts=PTS-STARTPTS[a2];"
                    complex_filter += "[a1][a2]concat=n=2:v=0:a=1[a]"
            else:
                # Simple audio speed change without pitch preservation
                audio_rate_cmd: str = f"asetrate=44100*{speed}"

                if original_start is not None and original_start > 0:
                    complex_filter += f"[0:a]atrim=0:{original_start},asetpts=PTS-STARTPTS[a1];"
                    if original_end is not None:
                        complex_filter += f"[0:a]atrim={original_start}:{original_end},asetpts=PTS-STARTPTS,{audio_rate_cmd}[a2];"
                        complex_filter += f"[0:a]atrim={original_end}:,asetpts=PTS-STARTPTS[a3];"
                        complex_filter += "[a1][a2][a3]concat=n=3:v=0:a=1[a]"
                    else:
                        complex_filter += f"[0:a]atrim={original_start}:,asetpts=PTS-STARTPTS,{audio_rate_cmd}[a2];"
                        complex_filter += "[a1][a2]concat=n=2:v=0:a=1[a]"
                elif original_end is not None:
                    complex_filter += f"[0:a]atrim=0:{original_end},asetpts=PTS-STARTPTS,{audio_rate_cmd}[a1];"
                    complex_filter += f"[0:a]atrim={original_end}:,asetpts=PTS-STARTPTS[a2];"
                    complex_filter += "[a1][a2]concat=n=2:v=0:a=1[a]"

            # Add the complex filter if it's not empty
            if complex_filter:
                self.complex_filters.append(complex_filter)
                self.map_options.extend(["-map", "[v]", "-map", "[a]"])

        else:
            # Whole video speed change (simpler approach)
            self.video_filters.append(f"setpts=PTS/{speed}")

            if preserve_audio_pitch:
                atempo = speed
                parts = []

                if atempo < 0.5 or atempo > 2.0:
                    # FFmpeg atempo filter only works between 0.5 and 2.0
                    # Chain multiple atempo filters for more extreme speeds

                    # Handle very slow speeds
                    while atempo < 0.5:
                        parts.append("atempo=0.5")
                        atempo /= 0.5  # Equivalent to atempo *= 2.0

                    # Handle fast speeds
                    while atempo > 2.0:
                        parts.append("atempo=2.0")
                        atempo /= 2.0

                    # Add the remaining factor
                    if abs(atempo - 1.0) > 0.01:  # Only add if not ~1.0
                        parts.append(f"atempo={atempo:.3f}")
                else:
                    parts.append(f"atempo={atempo:.3f}")

                self.audio_filters.append(",".join(parts))
            else:
                self.audio_filters.append(f"asetrate=44100*{speed}")

        return self

    def delete_segment(self, start_time: float, end_time: float) -> Self:
        """Delete a segment of the video/audio.

        Args:
            start_time: Start time in seconds of segment to delete
            end_time: End time in seconds of segment to delete
        """
        # Map time points from the edited timeline to the original timeline
        original_start: Optional[float] = self._map_timeline_point(start_time)
        original_end: Optional[float] = self._map_timeline_point(end_time)

        # Register the deletion with the timeline tracker
        self.timeline.register_deletion(start_time, end_time)

        # Need to use complex filtergraph for segment deletion
        complex_filter: str = ""

        # Split into segments and concatenate, skipping the middle segment
        if original_start is not None and original_start > 0:
            complex_filter += f"[0:v]trim=0:{original_start},setpts=PTS-STARTPTS[v1];"
            complex_filter += f"[0:v]trim={original_end}:,setpts=PTS-STARTPTS[v2];"
            complex_filter += "[v1][v2]concat=n=2:v=1:a=0[v];"

            # Do the same for audio
            complex_filter += f"[0:a]atrim=0:{original_start},asetpts=PTS-STARTPTS[a1];"
            complex_filter += f"[0:a]atrim={original_end}:,asetpts=PTS-STARTPTS[a2];"
            complex_filter += "[a1][a2]concat=n=2:v=0:a=1[a]"
        else:
            # If deleting from the beginning, just trim
            complex_filter += f"[0:v]trim={original_end}:,setpts=PTS-STARTPTS[v];"
            complex_filter += f"[0:a]atrim={original_end}:,asetpts=PTS-STARTPTS[a]"

        # Add the complex filter
        self.complex_filters.append(complex_filter)
        self.map_options.extend(["-map", "[v]", "-map", "[a]"])

        return self

    def add_blur_region(
        self,
        x: int,
        y: int,
        width: int,
        height: int,
        intensity: int = 20,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
    ) -> Self:
        """Add a blur effect to a rectangular region of the video.

        Args:
            x: X coordinate of the top-left corner
            y: Y coordinate of the top-left corner
            width: Width of the blur region
            height: Height of the blur region
            intensity: Blur intensity (default 20)
            start_time: Start time in seconds (None = from beginning)
            end_time: End time in seconds (None = until end)

        Returns:
            Self for method chaining
        """
        # Map time points from the edited timeline to the original timeline
        original_start: Optional[float] = self._map_timeline_point(start_time)
        original_end: Optional[float] = self._map_timeline_point(end_time)

        # Generate unique labels for this blur region
        region_id = len([f for f in self.complex_filters if "boxblur" in f or "scale=iw/" in f])
        main_label = f"main{region_id}"
        blur_label = f"blur{region_id}"
        blurred_label = f"blurred{region_id}"
        out_label = f"vout{region_id}"

        # Determine input label - if we have previous blur/pixelate filters, chain from last output
        if region_id > 0:
            input_label = f"[vout{region_id - 1}]"
        else:
            input_label = "[0:v]"

        # Build the complex filter for blur region
        # Split the video, crop the region, blur it, overlay back
        complex_filter = f"{input_label}split[{main_label}][{blur_label}];"
        complex_filter += f"[{blur_label}]crop={width}:{height}:{x}:{y},boxblur={intensity}[{blurred_label}];"

        # Build overlay with optional time constraints
        overlay_filter = f"[{main_label}][{blurred_label}]overlay={x}:{y}"

        if original_start is not None or original_end is not None:
            if original_start is not None and original_end is not None:
                overlay_filter += f":enable='between(t,{original_start},{original_end})'"
            elif original_start is not None:
                overlay_filter += f":enable='gte(t,{original_start})'"
            elif original_end is not None:
                overlay_filter += f":enable='lte(t,{original_end})'"

        complex_filter += f"{overlay_filter}[{out_label}]"

        self.complex_filters.append(complex_filter)

        # Update map options to use the latest output label
        self.map_options = ["-map", f"[{out_label}]", "-map", "0:a?"]

        return self

    def add_pixelate_region(
        self,
        x: int,
        y: int,
        width: int,
        height: int,
        block_size: int = 10,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
    ) -> Self:
        """Add a pixelate/mosaic effect to a rectangular region of the video.

        Args:
            x: X coordinate of the top-left corner
            y: Y coordinate of the top-left corner
            width: Width of the pixelate region
            height: Height of the pixelate region
            block_size: Size of the pixelation blocks (default 10)
            start_time: Start time in seconds (None = from beginning)
            end_time: End time in seconds (None = until end)

        Returns:
            Self for method chaining
        """
        # Map time points from the edited timeline to the original timeline
        original_start: Optional[float] = self._map_timeline_point(start_time)
        original_end: Optional[float] = self._map_timeline_point(end_time)

        # Generate unique labels for this pixelate region
        region_id = len([f for f in self.complex_filters if "boxblur" in f or "scale=iw/" in f])
        main_label = f"main{region_id}"
        pix_label = f"pix{region_id}"
        pixelated_label = f"pixelated{region_id}"
        out_label = f"vout{region_id}"

        # Determine input label - if we have previous blur/pixelate filters, chain from last output
        if region_id > 0:
            input_label = f"[vout{region_id - 1}]"
        else:
            input_label = "[0:v]"

        # Build the complex filter for pixelate region
        # Split the video, crop the region, scale down and back up with nearest neighbor, overlay back
        complex_filter = f"{input_label}split[{main_label}][{pix_label}];"
        complex_filter += (
            f"[{pix_label}]crop={width}:{height}:{x}:{y},"
            f"scale=iw/{block_size}:ih/{block_size},scale={width}:{height}:flags=neighbor[{pixelated_label}];"
        )

        # Build overlay with optional time constraints
        overlay_filter = f"[{main_label}][{pixelated_label}]overlay={x}:{y}"

        if original_start is not None or original_end is not None:
            if original_start is not None and original_end is not None:
                overlay_filter += f":enable='between(t,{original_start},{original_end})'"
            elif original_start is not None:
                overlay_filter += f":enable='gte(t,{original_start})'"
            elif original_end is not None:
                overlay_filter += f":enable='lte(t,{original_end})'"

        complex_filter += f"{overlay_filter}[{out_label}]"

        self.complex_filters.append(complex_filter)

        # Update map options to use the latest output label
        self.map_options = ["-map", f"[{out_label}]", "-map", "0:a?"]

        return self

    def extract_frames(
        self,
        timestamps: List[float],
        output_dir: str,
        format: str = "png",
    ) -> List[str]:
        """Extract frames at specific timestamps.

        Args:
            timestamps: List of timestamps (in seconds) to extract frames at
            output_dir: Directory to save extracted frames
            format: Output image format (png or jpg)

        Returns:
            List of output file paths, sorted by timestamp
        """
        os.makedirs(output_dir, exist_ok=True)
        output_paths: List[str] = []

        # Sort timestamps so output is returned in order
        sorted_timestamps = sorted(timestamps)

        for i, ts in enumerate(sorted_timestamps):
            output_path = os.path.join(output_dir, f"frame_{i:03d}_{ts:.3f}.{format}")

            cmd: List[str] = ["ffmpeg", "-y", "-ss", str(ts), "-i", self.input_path, "-frames:v", "1", output_path]

            result = subprocess.run(cmd, capture_output=True)
            if result.returncode != 0:
                error_msg = result.stderr.decode() if result.stderr else "Unknown error"
                logger.warning(f"Failed to extract frame at {ts}s: {error_msg}")
                continue

            if os.path.exists(output_path):
                output_paths.append(output_path)

        return output_paths

    def extract_keyframes(
        self,
        output_dir: str,
        max_frames: int = 10,
    ) -> List[str]:
        """Extract only I-frames (keyframes) from the video.

        Args:
            output_dir: Directory to save extracted keyframes
            max_frames: Maximum number of keyframes to extract

        Returns:
            List of output file paths
        """
        os.makedirs(output_dir, exist_ok=True)

        output_pattern = os.path.join(output_dir, "keyframe_%03d.png")

        cmd: List[str] = [
            "ffmpeg",
            "-y",
            "-i",
            self.input_path,
            "-vf",
            "select='eq(pict_type,I)'",
            "-vsync",
            "vfr",
            "-frames:v",
            str(max_frames),
            output_pattern,
        ]

        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            error_msg = result.stderr.decode() if result.stderr else "Unknown error"
            logger.warning(f"Failed to extract keyframes: {error_msg}")

        # Collect all generated files
        output_paths: List[str] = []
        for i in range(1, max_frames + 1):
            path = os.path.join(output_dir, f"keyframe_{i:03d}.png")
            if os.path.exists(path):
                output_paths.append(path)
            else:
                break

        return output_paths

    def generate_thumbnails(
        self,
        interval: float,
        output_dir: str,
        size: Optional[Tuple[int, int]] = None,
        include_timestamps: bool = False,
    ) -> List[str]:
        """Generate thumbnails at regular intervals.

        Args:
            interval: Interval in seconds between thumbnails
            output_dir: Directory to save thumbnails
            size: Optional (width, height) tuple for thumbnail size
            include_timestamps: Whether to include timestamp information

        Returns:
            List of output file paths
        """
        os.makedirs(output_dir, exist_ok=True)

        output_pattern = os.path.join(output_dir, "thumb_%03d.png")

        # Build the video filter string
        vf_parts: List[str] = [f"fps=1/{interval}"]
        if size is not None:
            w, h = size
            vf_parts.append(f"scale={w}:{h}")

        vf_string = ",".join(vf_parts)

        cmd: List[str] = ["ffmpeg", "-y", "-i", self.input_path, "-vf", vf_string, output_pattern]

        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            error_msg = result.stderr.decode() if result.stderr else "Unknown error"
            logger.warning(f"Failed to generate thumbnails: {error_msg}")

        # Collect all generated files
        output_paths: List[str] = []
        i = 1
        while True:
            path = os.path.join(output_dir, f"thumb_{i:03d}.png")
            if os.path.exists(path):
                output_paths.append(path)
                i += 1
            else:
                break

        return output_paths

    def generate_thumbnail_grid(
        self,
        columns: int,
        rows: int,
        output_path: str,
    ) -> str:
        """Generate a contact sheet / thumbnail grid.

        Args:
            columns: Number of columns in the grid
            rows: Number of rows in the grid
            output_path: Path for the output grid image

        Returns:
            Path to the generated grid image
        """
        # Ensure output directory exists
        output_dir = os.path.dirname(output_path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)

        total_frames = columns * rows

        # Get video duration to calculate intervals
        duration = self._get_input_duration()
        if duration is None:
            duration = 10.0  # Fallback default

        # Calculate interval to spread frames evenly
        interval = duration / (total_frames + 1)

        # Use FFmpeg tile filter to create the grid
        # select filter picks frames at intervals, tile combines them
        vf_string = f"select='not(mod(n,{int(30 * interval)}))',scale=160:-1,tile={columns}x{rows}"

        cmd: List[str] = ["ffmpeg", "-y", "-i", self.input_path, "-frames:v", "1", "-vf", vf_string, output_path]

        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            error_msg = result.stderr.decode() if result.stderr else "Unknown error"
            logger.warning(f"Failed to generate thumbnail grid: {error_msg}")

            # Try alternative approach using Pillow
            try:
                from PIL import Image

                # First extract individual thumbnails
                temp_thumb_dir = tempfile.mkdtemp()
                try:
                    # Generate thumbnails at intervals
                    thumbnails = self.generate_thumbnails(interval=interval, output_dir=temp_thumb_dir, size=(160, 120))

                    if thumbnails:
                        # Calculate grid dimensions
                        thumb_width = 160
                        thumb_height = 120
                        grid_width = columns * thumb_width
                        grid_height = rows * thumb_height

                        # Create grid image
                        grid_image = Image.new("RGB", (grid_width, grid_height))

                        for idx, thumb_path in enumerate(thumbnails[:total_frames]):
                            row = idx // columns
                            col = idx % columns
                            x = col * thumb_width
                            y = row * thumb_height

                            thumb_img = Image.open(thumb_path)
                            thumb_resized = thumb_img.resize((thumb_width, thumb_height))
                            grid_image.paste(thumb_resized, (x, y))

                        grid_image.save(output_path)
                finally:
                    # Clean up temp directory
                    import shutil

                    shutil.rmtree(temp_thumb_dir, ignore_errors=True)

            except ImportError:
                logger.error("Pillow not available for fallback grid generation")
                raise RuntimeError(f"Failed to generate thumbnail grid: {error_msg}")

        return output_path

    def add_pip(
        self,
        pip_video: str,
        position: Union[str, Tuple[int, int]],
        size: Union[float, Tuple[int, int]],
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        border_width: int = 0,
        border_color: str = "white",
    ) -> Self:
        """Add a Picture-in-Picture overlay to the video.

        Args:
            pip_video: Path to the video to use as PiP overlay
            position: Position preset string ("top-left", "top-right", "bottom-left",
                     "bottom-right", "center") or tuple (x, y) for custom position
            size: Float 0.0-1.0 for fraction of main video size, or tuple (width, height)
                  for exact pixel dimensions
            start_time: Start time in seconds for PiP (None = from beginning)
            end_time: End time in seconds for PiP (None = until end)
            border_width: Width of border around PiP in pixels (default 0)
            border_color: Color of border (default "white")

        Returns:
            Self for method chaining
        """
        if not os.path.exists(pip_video):
            raise FileNotFoundError(f"PiP video not found: {pip_video}")

        self.additional_inputs.append(pip_video)
        input_index: int = len(self.additional_inputs)

        if isinstance(size, float):
            scale_expr: str = f"scale=iw*{size}:ih*{size}"
        else:
            w, h = size
            scale_expr = f"scale={w}:{h}"

        position_map: Dict[str, str] = {
            "top-left": "10:10",
            "top-right": "main_w-overlay_w-10:10",
            "bottom-left": "10:main_h-overlay_h-10",
            "bottom-right": "main_w-overlay_w-10:main_h-overlay_h-10",
            "center": "(main_w-overlay_w)/2:(main_h-overlay_h)/2",
        }

        if isinstance(position, str):
            pos_expr: str = position_map.get(position, "10:10")
        else:
            x, y = position
            pos_expr = f"{x}:{y}"

        complex_filter: str
        if border_width > 0:
            pad_w: int = border_width * 2
            pad_h: int = border_width * 2
            complex_filter = f"[{input_index}:v]{scale_expr},pad=iw+{pad_w}:ih+{pad_h}:{border_width}:{border_width}:color={border_color}[pip];"
        else:
            complex_filter = f"[{input_index}:v]{scale_expr}[pip];"

        enable_expr: str = ""
        if start_time is not None or end_time is not None:
            if start_time is not None and end_time is not None:
                enable_expr = f":enable='between(t,{start_time},{end_time})'"
            elif start_time is not None:
                enable_expr = f":enable='gte(t,{start_time})'"
            elif end_time is not None:
                enable_expr = f":enable='lte(t,{end_time})'"

        complex_filter += f"[0:v][pip]overlay={pos_expr}{enable_expr}[v]"
        self.complex_filters.append(complex_filter)
        self.map_options = ["-map", "[v]", "-map", "0:a?"]
        return self

    def add_split_screen(
        self,
        videos: List[str],
        layout: str,
        ratios: Optional[List[float]] = None,
        gap: int = 0,
        gap_color: str = "black",
    ) -> Self:
        """Add a split screen layout combining multiple videos.

        Args:
            videos: List of video paths to combine (main video is always included)
            layout: Layout type ("horizontal", "vertical", "grid_2x2", "grid_3x3")
            ratios: Optional list of ratios for each video (e.g., [0.7, 0.3] for 70/30 split)
            gap: Gap in pixels between videos (default 0)
            gap_color: Color of gap (default "black")

        Returns:
            Self for method chaining
        """
        for video_path in videos:
            if not os.path.exists(video_path):
                raise FileNotFoundError(f"Video not found: {video_path}")

        for video_path in videos:
            self.additional_inputs.append(video_path)

        total_videos: int = 1 + len(videos)
        complex_filter: str

        if layout == "horizontal":
            if ratios is not None and len(ratios) >= 2:
                filter_parts: List[str] = []
                for i in range(total_videos):
                    ratio: float = ratios[i] if i < len(ratios) else ratios[-1]
                    if gap > 0 and i < total_videos - 1:
                        filter_parts.append(f"[{i}:v]scale=iw*{ratio}:ih,pad=iw+{gap}:ih:0:0:color={gap_color}[v{i}]")
                    else:
                        filter_parts.append(f"[{i}:v]scale=iw*{ratio}:ih[v{i}]")
                complex_filter = ";".join(filter_parts) + ";"
                input_labels: str = "".join([f"[v{i}]" for i in range(total_videos)])
                complex_filter += f"{input_labels}hstack=inputs={total_videos}[v]"
            else:
                if gap > 0:
                    filter_parts = []
                    for i in range(total_videos):
                        if i < total_videos - 1:
                            filter_parts.append(f"[{i}:v]pad=iw+{gap}:ih:0:0:color={gap_color}[v{i}]")
                        else:
                            filter_parts.append(f"[{i}:v]copy[v{i}]")
                    complex_filter = ";".join(filter_parts) + ";"
                    input_labels = "".join([f"[v{i}]" for i in range(total_videos)])
                    complex_filter += f"{input_labels}hstack=inputs={total_videos}[v]"
                else:
                    input_labels = "".join([f"[{i}:v]" for i in range(total_videos)])
                    complex_filter = f"{input_labels}hstack=inputs={total_videos}[v]"

        elif layout == "vertical":
            if gap > 0:
                filter_parts = []
                for i in range(total_videos):
                    if i < total_videos - 1:
                        filter_parts.append(f"[{i}:v]pad=iw:ih+{gap}:0:0:color={gap_color}[v{i}]")
                    else:
                        filter_parts.append(f"[{i}:v]copy[v{i}]")
                complex_filter = ";".join(filter_parts) + ";"
                input_labels = "".join([f"[v{i}]" for i in range(total_videos)])
                complex_filter += f"{input_labels}vstack=inputs={total_videos}[v]"
            else:
                input_labels = "".join([f"[{i}:v]" for i in range(total_videos)])
                complex_filter = f"{input_labels}vstack=inputs={total_videos}[v]"

        elif layout == "grid_2x2":
            if total_videos < 4:
                raise ValueError(f"grid_2x2 requires 4 videos, got {total_videos}")
            if gap > 0:
                filter_parts = []
                filter_parts.append(f"[0:v]pad=iw+{gap}:ih+{gap}:0:0:color={gap_color}[v0]")
                filter_parts.append(f"[1:v]pad=iw:ih+{gap}:0:0:color={gap_color}[v1]")
                filter_parts.append(f"[2:v]pad=iw+{gap}:ih:0:0:color={gap_color}[v2]")
                filter_parts.append("[3:v]copy[v3]")
                complex_filter = ";".join(filter_parts) + ";"
                complex_filter += "[v0][v1][v2][v3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0[v]"
            else:
                complex_filter = "[0:v][1:v][2:v][3:v]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0[v]"

        elif layout == "grid_3x3":
            if total_videos < 9:
                raise ValueError(f"grid_3x3 requires 9 videos, got {total_videos}")
            if gap > 0:
                filter_parts = []
                for row in range(3):
                    for col in range(3):
                        idx: int = row * 3 + col
                        pad_right: int = gap if col < 2 else 0
                        pad_bottom: int = gap if row < 2 else 0
                        if pad_right > 0 or pad_bottom > 0:
                            filter_parts.append(f"[{idx}:v]pad=iw+{pad_right}:ih+{pad_bottom}:0:0:color={gap_color}[v{idx}]")
                        else:
                            filter_parts.append(f"[{idx}:v]copy[v{idx}]")
                complex_filter = ";".join(filter_parts) + ";"
                layout_9grid = "0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0|0_h0+h3|w0_h0+h3|w0+w1_h0+h3"
                complex_filter += f"[v0][v1][v2][v3][v4][v5][v6][v7][v8]xstack=inputs=9:layout={layout_9grid}[v]"
            else:
                layout_9grid = "0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0|0_h0+h3|w0_h0+h3|w0+w1_h0+h3"
                complex_filter = f"[0:v][1:v][2:v][3:v][4:v][5:v][6:v][7:v][8:v]xstack=inputs=9:layout={layout_9grid}[v]"

        else:
            raise ValueError(f"Unknown layout: {layout}")

        self.complex_filters.append(complex_filter)
        self.map_options = ["-map", "[v]", "-map", "0:a?"]
        return self

    def extract_audio(
        self,
        format: str = "mp3",
        output_dir: Optional[str] = None,
    ) -> str:
        """Extract audio track from video.

        Args:
            format: Output audio format (mp3, wav, flac, aac)
            output_dir: Directory to save the extracted audio (default: render/ subdirectory)

        Returns:
            Path to the extracted audio file
        """
        # Codec mapping
        codec_map: Dict[str, str] = {
            "mp3": "libmp3lame",
            "wav": "pcm_s16le",
            "flac": "flac",
            "aac": "aac",
        }

        codec: str = codec_map.get(format, "libmp3lame")

        # Determine output directory
        if output_dir is None:
            base_dir: str = os.path.dirname(self.input_path)
            output_dir = os.path.join(base_dir, "render")

        os.makedirs(output_dir, exist_ok=True)

        # Generate output filename
        input_filename: str = os.path.basename(self.input_path).split(".")[0]
        output_filename: str = f"{input_filename}_audio_{uuid.uuid4().hex[:8]}.{format}"
        output_path: str = os.path.join(output_dir, output_filename)

        # Build FFmpeg command
        cmd: List[str] = ["ffmpeg", "-y", "-i", self.input_path, "-vn", "-acodec", codec, output_path]

        logger.info(f"Extracting audio: {' '.join(cmd)}")

        result: subprocess.CompletedProcess[bytes] = subprocess.run(cmd, capture_output=True)

        if result.returncode != 0:
            error_msg: str = result.stderr.decode() if result.stderr else "Unknown error"
            logger.error(f"Failed to extract audio: {error_msg}")
            raise RuntimeError(f"Failed to extract audio: {error_msg}")

        return output_path

    def replace_audio(
        self,
        audio_path: str,
        loop: bool = False,
        volume: float = 1.0,
    ) -> Self:
        """Replace video's audio track with a new audio file.

        Args:
            audio_path: Path to the replacement audio file
            loop: Whether to loop the audio if it's shorter than the video
            volume: Volume multiplier for the replacement audio (1.0 = original)

        Returns:
            Self for method chaining
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        # Store audio replacement info for use during render
        self._replacement_audio_path: str = audio_path
        self._replacement_audio_loop: bool = loop
        self._replacement_audio_volume: float = volume

        return self

    def add_motion_blur(self, intensity: float = 0.5) -> Self:
        """Add motion blur effect using tmix filter.

        Args:
            intensity: Blur intensity from 0.0 to 1.0 (default 0.5)
                      Controls number of frames blended (1-6 frames)

        Returns:
            Self for method chaining
        """
        # Use tmix to blend frames - intensity controls number of frames
        frames = int(intensity * 5) + 1  # 1-6 frames
        filter_str = f"tmix=frames={frames}"
        self.video_filters.append(filter_str)
        return self

    def add_sharpen(
        self,
        amount: float = 1.5,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
    ) -> Self:
        """Add sharpen effect using unsharp filter.

        Args:
            amount: Sharpen amount (default 1.5)
                   1.2 = light, 1.5 = moderate, 2.5 = strong
            start_time: Start time in seconds to apply the effect (None = from beginning)
            end_time: End time in seconds to apply the effect (None = until end)

        Returns:
            Self for method chaining
        """
        # FFmpeg unsharp filter: unsharp=lx:ly:la:cx:cy:ca
        # lx/ly: luma matrix size, la: luma amount
        # cx/cy: chroma matrix size, ca: chroma amount
        filter_str = f"unsharp=5:5:{amount}:5:5:{amount}"

        if start_time is not None and end_time is not None:
            filter_str += f":enable='between(t,{start_time},{end_time})'"
        elif start_time is not None:
            filter_str += f":enable='gte(t,{start_time})'"
        elif end_time is not None:
            filter_str += f":enable='lte(t,{end_time})'"

        self.video_filters.append(filter_str)
        return self

    def add_denoise(self, strength: float = 0.5, temporal: bool = False) -> Self:
        """Add denoise effect using hqdn3d filter.

        Args:
            strength: Denoise strength from 0.0 to 1.0 (default 0.5)
            temporal: Enable temporal denoising (uses multiple frames)

        Returns:
            Self for method chaining
        """
        # hqdn3d filter: hqdn3d=luma_spatial:chroma_spatial:luma_tmp:chroma_tmp
        ls = strength * 8  # luma spatial
        cs = strength * 6  # chroma spatial
        lt = strength * 12 if temporal else 0  # luma temporal
        ct = strength * 9 if temporal else 0  # chroma temporal

        filter_str = f"hqdn3d={ls}:{cs}:{lt}:{ct}"
        self.video_filters.append(filter_str)
        return self

    def add_soften(self, amount: float = 0.5) -> Self:
        """Add soften/light blur effect using smartblur filter.

        Args:
            amount: Soften amount from 0.0 to 1.0+ (default 0.5)

        Returns:
            Self for method chaining
        """
        # smartblur filter for soft focus effect
        filter_str = f"smartblur={amount}:0.5"
        self.video_filters.append(filter_str)
        return self

    def add_gaussian_blur(self, sigma: float = 2.0) -> Self:
        """Add Gaussian blur effect using gblur filter.

        Args:
            sigma: Blur sigma/radius (default 2.0)
                  Higher values = more blur

        Returns:
            Self for method chaining
        """
        filter_str = f"gblur=sigma={sigma}"
        self.video_filters.append(filter_str)
        return self

    def add_box_blur(self, radius: int = 5) -> Self:
        """Add box blur effect using boxblur filter.

        Args:
            radius: Blur radius in pixels (default 5)

        Returns:
            Self for method chaining
        """
        filter_str = f"boxblur={radius}:{radius}"
        self.video_filters.append(filter_str)
        return self

    def add_reverse(
        self,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        reverse_audio: bool = True,
    ) -> Self:
        """Reverse video playback (play backwards).

        Args:
            start_time: Start time in seconds for segment reversal (None = from beginning)
            end_time: End time in seconds for segment reversal (None = until end)
            reverse_audio: Whether to also reverse the audio track (default True)

        Returns:
            Self for method chaining

        Note:
            The reverse filter loads the entire video into memory, so for very long
            videos, consider using segment reversal to limit memory usage.
        """
        # Map time points from the edited timeline to the original timeline
        original_start: Optional[float] = self._map_timeline_point(start_time)
        original_end: Optional[float] = self._map_timeline_point(end_time)

        if original_start is None and original_end is None:
            # Reverse entire video
            self.video_filters.append("reverse")
            if reverse_audio:
                self.audio_filters.append("areverse")
        else:
            # Reverse only a segment - need to use complex filtergraph
            # Split into: before segment, reversed segment, after segment
            complex_filter: str = ""

            if original_start is not None and original_start > 0:
                # Part before segment
                complex_filter += f"[0:v]trim=0:{original_start},setpts=PTS-STARTPTS[v1];"
                if original_end is not None:
                    # Middle segment (reversed)
                    complex_filter += f"[0:v]trim={original_start}:{original_end},setpts=PTS-STARTPTS,reverse[v2];"
                    # Part after segment
                    complex_filter += f"[0:v]trim={original_end}:,setpts=PTS-STARTPTS[v3];"
                    complex_filter += "[v1][v2][v3]concat=n=3:v=1:a=0[v];"
                else:
                    # Reverse from start_time to end
                    complex_filter += f"[0:v]trim={original_start}:,setpts=PTS-STARTPTS,reverse[v2];"
                    complex_filter += "[v1][v2]concat=n=2:v=1:a=0[v];"
            elif original_end is not None:
                # Reverse from beginning to end_time
                complex_filter += f"[0:v]trim=0:{original_end},setpts=PTS-STARTPTS,reverse[v1];"
                complex_filter += f"[0:v]trim={original_end}:,setpts=PTS-STARTPTS[v2];"
                complex_filter += "[v1][v2]concat=n=2:v=1:a=0[v];"

            # Handle audio similarly
            if reverse_audio:
                if original_start is not None and original_start > 0:
                    complex_filter += f"[0:a]atrim=0:{original_start},asetpts=PTS-STARTPTS[a1];"
                    if original_end is not None:
                        complex_filter += f"[0:a]atrim={original_start}:{original_end},asetpts=PTS-STARTPTS,areverse[a2];"
                        complex_filter += f"[0:a]atrim={original_end}:,asetpts=PTS-STARTPTS[a3];"
                        complex_filter += "[a1][a2][a3]concat=n=3:v=0:a=1[a]"
                    else:
                        complex_filter += f"[0:a]atrim={original_start}:,asetpts=PTS-STARTPTS,areverse[a2];"
                        complex_filter += "[a1][a2]concat=n=2:v=0:a=1[a]"
                elif original_end is not None:
                    complex_filter += f"[0:a]atrim=0:{original_end},asetpts=PTS-STARTPTS,areverse[a1];"
                    complex_filter += f"[0:a]atrim={original_end}:,asetpts=PTS-STARTPTS[a2];"
                    complex_filter += "[a1][a2]concat=n=2:v=0:a=1[a]"
            else:
                # Keep audio forward - just copy it as-is
                if original_start is not None and original_start > 0:
                    complex_filter += f"[0:a]atrim=0:{original_start},asetpts=PTS-STARTPTS[a1];"
                    if original_end is not None:
                        complex_filter += f"[0:a]atrim={original_start}:{original_end},asetpts=PTS-STARTPTS[a2];"
                        complex_filter += f"[0:a]atrim={original_end}:,asetpts=PTS-STARTPTS[a3];"
                        complex_filter += "[a1][a2][a3]concat=n=3:v=0:a=1[a]"
                    else:
                        complex_filter += f"[0:a]atrim={original_start}:,asetpts=PTS-STARTPTS[a2];"
                        complex_filter += "[a1][a2]concat=n=2:v=0:a=1[a]"
                elif original_end is not None:
                    complex_filter += f"[0:a]atrim=0:{original_end},asetpts=PTS-STARTPTS[a1];"
                    complex_filter += f"[0:a]atrim={original_end}:,asetpts=PTS-STARTPTS[a2];"
                    complex_filter += "[a1][a2]concat=n=2:v=0:a=1[a]"

            self.complex_filters.append(complex_filter)
            self.map_options.extend(["-map", "[v]", "-map", "[a]"])

        return self

    def add_loop(
        self,
        count: int,
        segment_start: Optional[float] = None,
        segment_end: Optional[float] = None,
        in_place: bool = False,
        crossfade: float = 0,
    ) -> Self:
        """Loop/repeat video or a segment multiple times.

        Args:
            count: Number of times to repeat (2 = play twice total, 3 = play 3 times, etc.)
            segment_start: Start time in seconds for segment looping (None = from beginning)
            segment_end: End time in seconds for segment looping (None = until end)
            in_place: If True, replace the segment with looped version; if False, append loops
            crossfade: Duration in seconds for crossfade between repetitions (0 = no crossfade)

        Returns:
            Self for method chaining
        """
        if count < 1:
            return self

        # Mark that this filter changes video duration (so -to is not used)
        self._duration_modified = True

        # Map time points from the edited timeline to the original timeline
        original_start: Optional[float] = self._map_timeline_point(segment_start)
        original_end: Optional[float] = self._map_timeline_point(segment_end)

        if original_start is None and original_end is None:
            # Loop entire video
            if crossfade > 0:
                # Get video duration for crossfade offset calculation
                duration = self._get_input_duration()
                if duration is None:
                    duration = 10.0  # Fallback

                # Build crossfade chain for video
                complex_filter: str = ""

                # For crossfade, we need to chain xfade filters
                # First copy of video
                prev_label = "0:v"
                for i in range(count - 1):
                    offset = duration * (i + 1) - crossfade
                    out_label = f"vx{i}"
                    complex_filter += f"[{prev_label}][0:v]xfade=transition=fade:duration={crossfade}:offset={offset}[{out_label}];"
                    prev_label = out_label

                # Rename final output to [v]
                complex_filter = complex_filter[:-1]  # Remove trailing semicolon
                complex_filter = complex_filter.replace(f"[{prev_label}]", "[v]") + ";"

                # Audio crossfade
                prev_label = "0:a"
                for i in range(count - 1):
                    offset = duration * (i + 1) - crossfade
                    out_label = f"ax{i}"
                    complex_filter += f"[{prev_label}][0:a]acrossfade=d={crossfade}:c1=tri:c2=tri[{out_label}];"
                    prev_label = out_label

                # Rename final output to [a]
                complex_filter = complex_filter[:-1]  # Remove trailing semicolon
                complex_filter = complex_filter.replace(f"[{prev_label}]", "[a]")

                self.complex_filters.append(complex_filter)
                self.map_options.extend(["-map", "[v]", "-map", "[a]"])
            else:
                # Simple loop using concat
                complex_filter = ""
                # Create concat inputs for video
                video_inputs = "[0:v]" * count
                audio_inputs = "[0:a]" * count
                complex_filter = f"{video_inputs}concat=n={count}:v=1:a=0[v];{audio_inputs}concat=n={count}:v=0:a=1[a]"

                self.complex_filters.append(complex_filter)
                self.map_options.extend(["-map", "[v]", "-map", "[a]"])
        else:
            # Loop only a segment
            complex_filter = ""

            if in_place:
                # Replace segment with looped version
                # Structure: [before][looped_segment][after]
                if original_start is not None and original_start > 0:
                    complex_filter += f"[0:v]trim=0:{original_start},setpts=PTS-STARTPTS[v_before];"
                    complex_filter += f"[0:a]atrim=0:{original_start},asetpts=PTS-STARTPTS[a_before];"

                # Extract and loop the segment
                if original_start is not None and original_end is not None:
                    # Create multiple copies of the segment
                    for i in range(count):
                        complex_filter += f"[0:v]trim={original_start}:{original_end},setpts=PTS-STARTPTS[vseg{i}];"
                        complex_filter += f"[0:a]atrim={original_start}:{original_end},asetpts=PTS-STARTPTS[aseg{i}];"

                    # Concat the segment copies
                    v_seg_labels = "".join([f"[vseg{i}]" for i in range(count)])
                    a_seg_labels = "".join([f"[aseg{i}]" for i in range(count)])
                    complex_filter += f"{v_seg_labels}concat=n={count}:v=1:a=0[v_seg];"
                    complex_filter += f"{a_seg_labels}concat=n={count}:v=0:a=1[a_seg];"

                    # Add after segment if exists
                    if original_end is not None:
                        complex_filter += f"[0:v]trim={original_end}:,setpts=PTS-STARTPTS[v_after];"
                        complex_filter += f"[0:a]atrim={original_end}:,asetpts=PTS-STARTPTS[a_after];"

                    # Concat all parts
                    if original_start is not None and original_start > 0:
                        complex_filter += "[v_before][v_seg][v_after]concat=n=3:v=1:a=0[v];"
                        complex_filter += "[a_before][a_seg][a_after]concat=n=3:v=0:a=1[a]"
                    else:
                        complex_filter += "[v_seg][v_after]concat=n=2:v=1:a=0[v];"
                        complex_filter += "[a_seg][a_after]concat=n=2:v=0:a=1[a]"
            else:
                # Append looped segment after original (default behavior)
                # Structure: [full_video][looped_segment * (count-1)]
                # The segment is played once as part of the video, then repeated (count-1) more times

                # First, keep the entire original video
                complex_filter += "[0:v]copy[v_orig];"
                complex_filter += "[0:a]acopy[a_orig];"

                # Extract and loop the segment (count-1) times since it's already in the original
                if original_start is not None and original_end is not None:
                    for i in range(count - 1):
                        complex_filter += f"[0:v]trim={original_start}:{original_end},setpts=PTS-STARTPTS[vseg{i}];"
                        complex_filter += f"[0:a]atrim={original_start}:{original_end},asetpts=PTS-STARTPTS[aseg{i}];"

                    if count > 1:
                        v_seg_labels = "".join([f"[vseg{i}]" for i in range(count - 1)])
                        a_seg_labels = "".join([f"[aseg{i}]" for i in range(count - 1)])
                        complex_filter += f"[v_orig]{v_seg_labels}concat=n={count}:v=1:a=0[v];"
                        complex_filter += f"[a_orig]{a_seg_labels}concat=n={count}:v=0:a=1[a]"
                    else:
                        complex_filter += "[v_orig]copy[v];"
                        complex_filter += "[a_orig]acopy[a]"
                elif original_start is not None:
                    # Loop from start_time to end
                    for i in range(count - 1):
                        complex_filter += f"[0:v]trim={original_start}:,setpts=PTS-STARTPTS[vseg{i}];"
                        complex_filter += f"[0:a]atrim={original_start}:,asetpts=PTS-STARTPTS[aseg{i}];"

                    if count > 1:
                        v_seg_labels = "".join([f"[vseg{i}]" for i in range(count - 1)])
                        a_seg_labels = "".join([f"[aseg{i}]" for i in range(count - 1)])
                        complex_filter += f"[v_orig]{v_seg_labels}concat=n={count}:v=1:a=0[v];"
                        complex_filter += f"[a_orig]{a_seg_labels}concat=n={count}:v=0:a=1[a]"
                    else:
                        complex_filter += "[v_orig]copy[v];"
                        complex_filter += "[a_orig]acopy[a]"
                elif original_end is not None:
                    # Loop from beginning to end_time
                    for i in range(count - 1):
                        complex_filter += f"[0:v]trim=0:{original_end},setpts=PTS-STARTPTS[vseg{i}];"
                        complex_filter += f"[0:a]atrim=0:{original_end},asetpts=PTS-STARTPTS[aseg{i}];"

                    if count > 1:
                        v_seg_labels = "".join([f"[vseg{i}]" for i in range(count - 1)])
                        a_seg_labels = "".join([f"[aseg{i}]" for i in range(count - 1)])
                        complex_filter += f"[v_orig]{v_seg_labels}concat=n={count}:v=1:a=0[v];"
                        complex_filter += f"[a_orig]{a_seg_labels}concat=n={count}:v=0:a=1[a]"
                    else:
                        complex_filter += "[v_orig]copy[v];"
                        complex_filter += "[a_orig]acopy[a]"

            self.complex_filters.append(complex_filter)
            self.map_options.extend(["-map", "[v]", "-map", "[a]"])

        return self

    def add_boomerang(
        self,
        segment_start: Optional[float] = None,
        segment_end: Optional[float] = None,
    ) -> Self:
        """Create a boomerang effect (play forward then backward).

        Like Instagram's boomerang feature - plays the video forward then in reverse.

        Args:
            segment_start: Start time in seconds (None = from beginning)
            segment_end: End time in seconds (None = until end)

        Returns:
            Self for method chaining
        """
        # Mark that this filter changes video duration (so -to is not used)
        self._duration_modified = True

        # Map time points from the edited timeline to the original timeline
        original_start: Optional[float] = self._map_timeline_point(segment_start)
        original_end: Optional[float] = self._map_timeline_point(segment_end)

        if original_start is None and original_end is None:
            # Boomerang entire video: play forward, then play reversed
            complex_filter: str = (
                "[0:v]split[v1][v2];[v2]reverse[vr];[v1][vr]concat=n=2:v=1:a=0[v];[0:a]asplit[a1][a2];[a2]areverse[ar];[a1][ar]concat=n=2:v=0:a=1[a]"
            )
            self.complex_filters.append(complex_filter)
            self.map_options.extend(["-map", "[v]", "-map", "[a]"])
        else:
            # Boomerang only a segment
            complex_filter = ""

            # Handle the before, boomerang, and after segments
            if original_start is not None and original_start > 0:
                # Part before segment
                complex_filter += f"[0:v]trim=0:{original_start},setpts=PTS-STARTPTS[v_before];"
                complex_filter += f"[0:a]atrim=0:{original_start},asetpts=PTS-STARTPTS[a_before];"

            if original_start is not None and original_end is not None:
                # The boomerang segment (forward + reverse)
                complex_filter += f"[0:v]trim={original_start}:{original_end},setpts=PTS-STARTPTS,split[vs1][vs2];"
                complex_filter += "[vs2]reverse[vsr];"
                complex_filter += "[vs1][vsr]concat=n=2:v=1:a=0[v_boom];"
                complex_filter += f"[0:a]atrim={original_start}:{original_end},asetpts=PTS-STARTPTS,asplit[as1][as2];"
                complex_filter += "[as2]areverse[asr];"
                complex_filter += "[as1][asr]concat=n=2:v=0:a=1[a_boom];"

                # Part after segment
                complex_filter += f"[0:v]trim={original_end}:,setpts=PTS-STARTPTS[v_after];"
                complex_filter += f"[0:a]atrim={original_end}:,asetpts=PTS-STARTPTS[a_after];"

                # Concat all parts
                if original_start > 0:
                    complex_filter += "[v_before][v_boom][v_after]concat=n=3:v=1:a=0[v];"
                    complex_filter += "[a_before][a_boom][a_after]concat=n=3:v=0:a=1[a]"
                else:
                    complex_filter += "[v_boom][v_after]concat=n=2:v=1:a=0[v];"
                    complex_filter += "[a_boom][a_after]concat=n=2:v=0:a=1[a]"
            elif original_start is not None:
                # Boomerang from start_time to end
                complex_filter += f"[0:v]trim={original_start}:,setpts=PTS-STARTPTS,split[vs1][vs2];"
                complex_filter += "[vs2]reverse[vsr];"
                complex_filter += "[vs1][vsr]concat=n=2:v=1:a=0[v_boom];"
                complex_filter += f"[0:a]atrim={original_start}:,asetpts=PTS-STARTPTS,asplit[as1][as2];"
                complex_filter += "[as2]areverse[asr];"
                complex_filter += "[as1][asr]concat=n=2:v=0:a=1[a_boom];"

                if original_start > 0:
                    complex_filter += "[v_before][v_boom]concat=n=2:v=1:a=0[v];"
                    complex_filter += "[a_before][a_boom]concat=n=2:v=0:a=1[a]"
                else:
                    complex_filter += "[v_boom]copy[v];"
                    complex_filter += "[a_boom]acopy[a]"
            elif original_end is not None:
                # Boomerang from beginning to end_time
                complex_filter += f"[0:v]trim=0:{original_end},setpts=PTS-STARTPTS,split[vs1][vs2];"
                complex_filter += "[vs2]reverse[vsr];"
                complex_filter += "[vs1][vsr]concat=n=2:v=1:a=0[v_boom];"
                complex_filter += f"[0:a]atrim=0:{original_end},asetpts=PTS-STARTPTS,asplit[as1][as2];"
                complex_filter += "[as2]areverse[asr];"
                complex_filter += "[as1][asr]concat=n=2:v=0:a=1[a_boom];"

                # Part after
                complex_filter += f"[0:v]trim={original_end}:,setpts=PTS-STARTPTS[v_after];"
                complex_filter += f"[0:a]atrim={original_end}:,asetpts=PTS-STARTPTS[a_after];"
                complex_filter += "[v_boom][v_after]concat=n=2:v=1:a=0[v];"
                complex_filter += "[a_boom][a_after]concat=n=2:v=0:a=1[a]"

            self.complex_filters.append(complex_filter)
            self.map_options.extend(["-map", "[v]", "-map", "[a]"])

        return self

    def add_audio_track(
        self,
        audio_path: str,
        start_time: float = 0,
        volume: float = 1.0,
    ) -> Self:
        """Add an additional audio track to the video.

        Args:
            audio_path: Path to the audio file
            start_time: When to start the audio (in seconds)
            volume: Volume level for the added audio

        Returns:
            Self for method chaining
        """
        # Use the add_audio method from operations
        self.add_audio(audio_path, start_time, volume)
        return self

    def add_audio_ducking(
        self,
        duck_amount: float = 0.3,
        threshold: float = -20,
        attack: float = 0.1,
        release: float = 0.5,
        music_path: Optional[str] = None,
    ) -> Self:
        """Add audio ducking to automatically lower background music when speech is detected.

        Audio ducking uses sidechain compression to reduce the volume of background
        music or secondary audio tracks when the primary audio (speech) is present.

        Args:
            duck_amount: How much to duck the music (0.0-1.0, lower = more ducking)
            threshold: dB threshold for speech detection (e.g., -20)
            attack: Attack time in seconds (how fast ducking kicks in)
            release: Release time in seconds (how fast volume returns)
            music_path: Optional path to external music file to add and duck

        Returns:
            Self for method chaining
        """
        if music_path:
            # Add external music file and apply sidechain compression
            if not os.path.exists(music_path):
                raise FileNotFoundError(f"Music file not found: {music_path}")

            self.additional_inputs.append(music_path)
            input_index: int = len(self.additional_inputs)

            # Build complex filter for sidechain compression
            # The music track gets ducked when the main audio (speech) is detected
            # sidechaincompress: [audio_to_compress][sidechain_control_signal]
            # Convert threshold from dB to ratio for sidechaincompress
            threshold_ratio: float = 10 ** (threshold / 20)

            # Calculate ratio from duck_amount (inverse relationship)
            # duck_amount of 0.3 means reduce to 30%, so ratio should be high
            ratio: float = 1 / duck_amount if duck_amount > 0 else 20

            # Correct sidechain filter:
            # - Music input is compressed based on main audio level
            # - Then mixed with original audio
            complex_filter: str = (
                f"[{input_index}:a][0:a]sidechaincompress=threshold={threshold_ratio}:ratio={ratio}:"
                f"attack={int(attack * 1000)}:release={int(release * 1000)}[ducked];"
                f"[0:a][ducked]amix=inputs=2:duration=first[a]"
            )

            self.complex_filters.append(complex_filter)
            self.map_options.extend(["-map", "0:v", "-map", "[a]"])
        else:
            # Apply ducking to existing mixed audio using a compressor
            # This approach uses acompressor to reduce dynamic range
            # When speech (louder) is present, it compresses less
            # When music only (quieter), it compresses more
            comp_threshold_ratio: float = 10 ** (threshold / 20)
            comp_ratio: float = 1 / duck_amount if duck_amount > 0 else 20

            # Use sidechaincompress on the audio track itself
            # This will duck the overall audio based on its own loudness
            filter_str: str = (
                f"acompressor=threshold={comp_threshold_ratio}:ratio={comp_ratio}:attack={int(attack * 1000)}:release={int(release * 1000)}:makeup=1"
            )
            self.audio_filters.append(filter_str)

        return self

    def add_sidechain_compression(
        self,
        ratio: float = 4.0,
        threshold: float = -20,
        attack: float = 0.01,
        release: float = 0.5,
    ) -> Self:
        """Add sidechain compression to audio tracks.

        Sidechain compression allows one audio signal to control the compression
        of another. This is commonly used for ducking music under voiceovers.

        Args:
            ratio: Compression ratio (e.g., 4.0 means 4:1 compression)
            threshold: dB threshold for compression to engage (e.g., -20)
            attack: Attack time in seconds
            release: Release time in seconds

        Returns:
            Self for method chaining
        """
        # Convert threshold from dB to linear ratio for FFmpeg
        threshold_ratio: float = 10 ** (threshold / 20)

        # Check if we have additional audio inputs (like music tracks)
        if len(self.additional_inputs) > 0:
            # Find the last audio input index
            input_index: int = len(self.additional_inputs)

            # Build sidechain compression filter
            # Use video's original audio as sidechain, compress additional audio
            # sidechaincompress: [audio_to_compress][sidechain_control_signal]
            complex_filter: str = (
                f"[{input_index}:a][0:a]sidechaincompress=threshold={threshold_ratio}:ratio={ratio}:"
                f"attack={int(attack * 1000)}:release={int(release * 1000)}[compressed];"
                f"[0:a][compressed]amix=inputs=2:duration=first[a]"
            )

            # Clear existing complex filters that might conflict
            # and add our sidechain filter
            self.complex_filters = [cf for cf in self.complex_filters if "amix" not in cf and "sidechaincompress" not in cf]
            self.complex_filters.append(complex_filter)

            # Update map options
            self.map_options = ["-map", "0:v", "-map", "[a]"]
        else:
            # No additional inputs, apply compression to main audio
            filter_str: str = (
                f"acompressor=threshold={threshold_ratio}:ratio={ratio}:attack={int(attack * 1000)}:release={int(release * 1000)}:makeup=1"
            )
            self.audio_filters.append(filter_str)

        return self

    def add_loudness_normalization(
        self,
        target_lufs: float = -14.0,
        true_peak: float = -1.0,
        preset: Optional[str] = None,
    ) -> Self:
        """Apply loudness normalization using EBU R128 standard.

        Normalizes audio to a target loudness level (LUFS) while respecting
        true peak limits. Uses FFmpeg's loudnorm filter.

        Args:
            target_lufs: Target integrated loudness in LUFS (default -14)
            true_peak: Maximum true peak in dBTP (default -1)
            preset: Optional preset name ("youtube", "podcast", "broadcast")
                   If provided, overrides target_lufs and true_peak

        Returns:
            Self for method chaining
        """

        # Apply preset values if specified
        presets: Dict[str, Dict[str, float]] = {
            "youtube": {"target_lufs": -14.0, "true_peak": -1.0},
            "podcast": {"target_lufs": -16.0, "true_peak": -1.0},
            "broadcast": {"target_lufs": -24.0, "true_peak": -2.0},
        }

        if preset and preset in presets:
            target_lufs = presets[preset]["target_lufs"]
            true_peak = presets[preset]["true_peak"]

        # FFmpeg loudnorm filter
        # I = integrated loudness target
        # TP = true peak limit
        # LRA = loudness range (11 is a common default)
        filter_str = f"loudnorm=I={target_lufs}:TP={true_peak}:LRA=11"
        self.audio_filters.append(filter_str)

        # Track operation
        self._operations.append(
            {
                "type": "loudness_normalization",
                "target_lufs": target_lufs,
                "true_peak": true_peak,
                "preset": preset,
            }
        )

        return self

    def add_peak_normalization(self, target_db: float = 0.0) -> Self:
        """Apply peak normalization to audio.

        Normalizes audio so that the peak reaches the target level.
        Uses FFmpeg's dynaudnorm filter for dynamic normalization.

        Args:
            target_db: Target peak level in dB (default 0.0)
                      Use negative values for headroom (e.g., -3.0)

        Returns:
            Self for method chaining
        """
        import math

        # dynaudnorm provides dynamic audio normalization
        # p = target peak (as ratio, 1.0 = 0dB)
        # Convert dB to ratio: ratio = 10^(dB/20)
        peak_ratio = math.pow(10, target_db / 20.0)

        # Clamp ratio to valid range (0.0 to 1.0)
        peak_ratio = max(0.0, min(1.0, peak_ratio))

        filter_str = f"dynaudnorm=p={peak_ratio:.4f}"
        self.audio_filters.append(filter_str)

        return self

    # ========== Advanced Audio Features ==========

    def add_audio_layer(
        self,
        audio_path: str,
        start_time: float = 0,
        end_time: Optional[float] = None,
        volume: float = 1.0,
        fade_in: float = 0,
        fade_out: float = 0,
    ) -> Self:
        """Add an audio layer with precise timing and fade controls.

        Adds an audio file as a layer that will be mixed with the video's audio.
        Supports precise start/end timing and fade in/out effects.
        Multiple layers are properly mixed together.

        Args:
            audio_path: Path to the audio file to add
            start_time: When to start playing the audio (in seconds from video start)
            end_time: When to stop playing the audio (None for full duration)
            volume: Volume level (1.0 = original, 0.5 = half, 2.0 = double)
            fade_in: Fade in duration in seconds (0 for no fade)
            fade_out: Fade out duration in seconds (0 for no fade)

        Returns:
            Self for method chaining

        Example:
            >>> pipeline.add_audio_layer("music.mp3", start_time=5.0, volume=0.5, fade_in=1.0)
            >>> pipeline.add_audio_layer("sfx.wav", start_time=10.0, end_time=15.0, fade_out=0.5)
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        # Initialize audio layers list if needed
        if not hasattr(self, '_audio_layers'):
            self._audio_layers: List[Dict[str, Any]] = []

        # Add audio to additional inputs
        self.additional_inputs.append(audio_path)
        input_index: int = len(self.additional_inputs)

        # Store layer configuration
        self._audio_layers.append({
            'input_index': input_index,
            'start_time': start_time,
            'end_time': end_time,
            'volume': volume,
            'fade_in': fade_in,
            'fade_out': fade_out,
        })

        # Rebuild the combined audio filter
        self._build_audio_layers_filter()

        # Track operation
        self._operations.append({
            "type": "add_audio_layer",
            "audio_path": audio_path,
            "start_time": start_time,
            "end_time": end_time,
            "volume": volume,
            "fade_in": fade_in,
            "fade_out": fade_out,
        })

        return self

    def _build_audio_layers_filter(self) -> None:
        """Build a combined filter for all audio layers."""
        if not hasattr(self, '_audio_layers') or not self._audio_layers:
            return

        # Remove any previous audio layer filters
        self.complex_filters = [f for f in self.complex_filters if 'amix=' not in f and 'layer' not in f]

        filter_parts: List[str] = []
        layer_labels: List[str] = []

        # Process each layer
        for i, layer in enumerate(self._audio_layers):
            input_idx = layer['input_index']
            start_time = layer['start_time']
            end_time = layer['end_time']
            volume = layer['volume']
            fade_in = layer['fade_in']
            fade_out = layer['fade_out']

            label = f"layer{i}"
            layer_labels.append(f"[{label}]")

            # Build filter chain for this layer
            filters: List[str] = []

            # Apply trim if end_time specified
            if end_time is not None:
                duration = end_time - start_time
                filters.append(f"atrim=0:{duration}")
                filters.append("asetpts=PTS-STARTPTS")

            # Apply delay for start_time positioning
            if start_time > 0:
                delay_ms = int(start_time * 1000)
                filters.append(f"adelay={delay_ms}|{delay_ms}")

            # Apply volume
            if volume != 1.0:
                filters.append(f"volume={volume}")

            # Apply fade in
            if fade_in > 0:
                filters.append(f"afade=t=in:st=0:d={fade_in}")

            # Apply fade out
            if fade_out > 0:
                if end_time is not None:
                    duration = end_time - start_time
                    fade_start = max(0, duration - fade_out)
                else:
                    fade_start = 999999 - fade_out
                filters.append(f"afade=t=out:st={fade_start}:d={fade_out}")

            # Build filter chain for this layer
            if filters:
                filter_chain = ",".join(filters)
                filter_parts.append(f"[{input_idx}:a]{filter_chain}[{label}]")
            else:
                filter_parts.append(f"[{input_idx}:a]acopy[{label}]")

        # Build the final mix
        # All layers plus the original audio mixed together
        num_inputs = len(self._audio_layers) + 1  # +1 for original audio
        all_inputs = "[0:a]" + "".join(layer_labels)
        filter_parts.append(f"{all_inputs}amix=inputs={num_inputs}:duration=longest[a]")

        # Combine all filter parts
        complex_filter = ";".join(filter_parts)
        self.complex_filters.append(complex_filter)
        self.map_options = ["-map", "0:v", "-map", "[a]"]

    def add_sound_effect(
        self,
        audio_path: str,
        at_time: float,
        volume: float = 1.0,
    ) -> Self:
        """Add a sound effect at a specific time.

        Convenience method for adding short audio clips (sound effects, dings, etc.)
        at precise moments in the video.

        Args:
            audio_path: Path to the sound effect audio file
            at_time: When to play the sound effect (in seconds)
            volume: Volume level (1.0 = original)

        Returns:
            Self for method chaining

        Example:
            >>> pipeline.add_sound_effect("ding.wav", at_time=5.0)
            >>> pipeline.add_sound_effect("whoosh.mp3", at_time=10.5, volume=0.8)
        """
        return self.add_audio_layer(
            audio_path=audio_path,
            start_time=at_time,
            volume=volume,
            fade_in=0,
            fade_out=0,
        )

    def add_audio_fade_in(
        self,
        duration: float = 1.0,
        start_time: float = 0,
        curve: str = "tri",
    ) -> Self:
        """Add a fade in effect to the audio.

        Gradually increases the audio volume from silence to full volume.

        Args:
            duration: Duration of the fade in seconds
            start_time: When to start the fade (in seconds from video start)
            curve: Fade curve type. Options: 'tri' (triangular/linear), 'qsin' (quarter sine),
                   'hsin' (half sine), 'log' (logarithmic), 'exp' (exponential), etc.

        Returns:
            Self for method chaining

        Example:
            >>> pipeline.add_audio_fade_in(duration=2.0)
            >>> pipeline.add_audio_fade_in(duration=1.5, start_time=5.0, curve="qsin")
        """
        # Map to original timeline
        original_start: float = self._map_timeline_point(start_time) or start_time

        filter_str = f"afade=t=in:st={original_start}:d={duration}:curve={curve}"
        self.audio_filters.append(filter_str)

        # Track operation
        self._operations.append({
            "type": "audio_fade_in",
            "duration": duration,
            "start_time": start_time,
            "curve": curve,
        })

        return self

    def add_audio_fade_out(
        self,
        duration: float = 1.0,
        end_time: Optional[float] = None,
        curve: str = "tri",
    ) -> Self:
        """Add a fade out effect to the audio.

        Gradually decreases the audio volume to silence.

        Args:
            duration: Duration of the fade in seconds
            end_time: When the fade should complete (None for end of video).
                      The fade starts at (end_time - duration).
            curve: Fade curve type. Options: 'tri' (triangular/linear), 'qsin' (quarter sine),
                   'hsin' (half sine), 'log' (logarithmic), 'exp' (exponential), etc.

        Returns:
            Self for method chaining

        Example:
            >>> pipeline.add_audio_fade_out(duration=2.0)
            >>> pipeline.add_audio_fade_out(duration=1.5, end_time=30.0)
        """
        # Calculate the start time of the fade
        if end_time is not None:
            original_end: float = self._map_timeline_point(end_time) or end_time
            fade_start = original_end - duration
        else:
            # Fade at the very end - use the video duration
            video_duration = self._get_input_duration() or 0
            if self.end_time is not None:
                video_duration = self.end_time - (self.start_time or 0)
            fade_start = max(0, video_duration - duration)

        filter_str = f"afade=t=out:st={fade_start}:d={duration}:curve={curve}"
        self.audio_filters.append(filter_str)

        # Track operation
        self._operations.append({
            "type": "audio_fade_out",
            "duration": duration,
            "end_time": end_time,
            "curve": curve,
        })

        return self

    def add_audio_crossfade(
        self,
        at_time: float,
        duration: float = 1.0,
        curve1: str = "tri",
        curve2: str = "tri",
    ) -> Self:
        """Add a crossfade between audio segments at a specific time.

        Creates a smooth transition by fading out before the specified time
        and fading in after it. This is useful for creating seamless audio
        transitions between different sections of the video.

        Args:
            at_time: The center point of the crossfade (in seconds)
            duration: Total duration of the crossfade (half before, half after at_time)
            curve1: Fade out curve type
            curve2: Fade in curve type

        Returns:
            Self for method chaining

        Example:
            >>> pipeline.add_audio_crossfade(at_time=10.0, duration=0.5)
        """
        # Map to original timeline
        original_time: float = self._map_timeline_point(at_time) or at_time

        # Calculate fade out and fade in timing
        half_duration = duration / 2
        fade_out_start = original_time - half_duration
        fade_in_start = original_time

        # Add both fades as a combined filter
        # Using volume with enable expressions for precise control
        filter_str = (
            f"afade=t=out:st={fade_out_start}:d={half_duration}:curve={curve1},"
            f"afade=t=in:st={fade_in_start}:d={half_duration}:curve={curve2}"
        )
        self.audio_filters.append(filter_str)

        # Track operation
        self._operations.append({
            "type": "audio_crossfade",
            "at_time": at_time,
            "duration": duration,
            "curve1": curve1,
            "curve2": curve2,
        })

        return self

    def modify_audio_segment(
        self,
        start_time: float,
        end_time: float,
        volume: Optional[float] = None,
        pitch: Optional[float] = None,
        speed: Optional[float] = None,
        eq: Optional[Dict[str, float]] = None,
    ) -> Self:
        """Modify audio within a specific time segment.

        Apply various audio modifications to only a portion of the video's audio track.
        Multiple modifications can be applied at once.

        Args:
            start_time: Start of the segment to modify (in seconds)
            end_time: End of the segment to modify (in seconds)
            volume: Volume multiplier (1.0 = unchanged, 0.5 = half, 2.0 = double)
            pitch: Pitch shift in semitones (positive = higher, negative = lower)
            speed: Speed multiplier (1.0 = normal, 2.0 = double speed) - does not affect pitch
            eq: Equalizer settings as dict with frequency bands:
                {'bass': 1.0, 'mid': 1.0, 'treble': 1.0} (1.0 = unchanged)

        Returns:
            Self for method chaining

        Example:
            >>> pipeline.modify_audio_segment(5.0, 10.0, volume=0.5)  # Quieter section
            >>> pipeline.modify_audio_segment(0, 5, pitch=2)  # Raise pitch 2 semitones
            >>> pipeline.modify_audio_segment(10, 20, speed=1.5)  # Speed up 50%
        """
        # Map to original timeline
        original_start: float = self._map_timeline_point(start_time) or start_time
        original_end: float = self._map_timeline_point(end_time) or end_time

        # Build filter expression with enable for time range
        filters: List[str] = []

        if volume is not None:
            filter_str = f"volume={volume}:enable='between(t,{original_start},{original_end})'"
            filters.append(filter_str)

        if pitch is not None:
            # Pitch shift using asetrate and atempo
            # asetrate changes pitch, then atempo compensates for speed change
            pitch_factor = 2 ** (pitch / 12)  # Convert semitones to frequency ratio
            # We use aresample to resample after rate change
            # This is a simplified approach - for the segment only, we'd need complex filtering
            # Using rubberband if available, otherwise asetrate method
            filter_str = f"asetrate=44100*{pitch_factor}:enable='between(t,{original_start},{original_end})'"
            filters.append(filter_str)

        if speed is not None and speed != 1.0:
            # Speed change without pitch change using atempo
            # atempo only supports 0.5 to 2.0, so we chain multiple if needed
            tempo_filters = self._build_tempo_chain(speed)
            for tf in tempo_filters:
                filter_str = f"{tf}:enable='between(t,{original_start},{original_end})'"
                filters.append(filter_str)

        if eq is not None:
            # Apply basic 3-band EQ using FFmpeg's equalizer filter
            bass = eq.get("bass", 1.0)
            mid = eq.get("mid", 1.0)
            treble = eq.get("treble", 1.0)

            # Convert gains to dB (factor 1.0 = 0dB)
            import math
            bass_db = 20 * math.log10(bass) if bass > 0 else -60
            mid_db = 20 * math.log10(mid) if mid > 0 else -60
            treble_db = 20 * math.log10(treble) if treble > 0 else -60

            # Apply EQ at standard frequencies
            eq_filter = (
                f"equalizer=f=100:t=h:w=200:g={bass_db},"
                f"equalizer=f=1000:t=h:w=1000:g={mid_db},"
                f"equalizer=f=8000:t=h:w=4000:g={treble_db}"
            )
            # Note: enable doesn't work well with chained equalizers, apply to whole
            # For segment-specific EQ, we'd need asplit/concat approach
            filter_str = f"{eq_filter}:enable='between(t,{original_start},{original_end})'"
            filters.append(filter_str)

        # Add all filters
        for f in filters:
            self.audio_filters.append(f)

        # Track operation
        self._operations.append({
            "type": "modify_audio_segment",
            "start_time": start_time,
            "end_time": end_time,
            "volume": volume,
            "pitch": pitch,
            "speed": speed,
            "eq": eq,
        })

        return self

    def _build_tempo_chain(self, speed: float) -> List[str]:
        """Build atempo filter chain for speed changes.

        atempo only supports values between 0.5 and 2.0, so we chain
        multiple filters for larger changes.

        Args:
            speed: Target speed multiplier

        Returns:
            List of atempo filter strings
        """
        filters: List[str] = []
        remaining = speed

        while remaining > 2.0:
            filters.append("atempo=2.0")
            remaining /= 2.0

        while remaining < 0.5:
            filters.append("atempo=0.5")
            remaining /= 0.5

        if remaining != 1.0:
            filters.append(f"atempo={remaining}")

        return filters

    def change_pitch(
        self,
        semitones: float,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
    ) -> Self:
        """Change the pitch of the audio.

        Shifts the audio pitch up or down by the specified number of semitones.
        Can be applied to the entire video or just a segment.

        Args:
            semitones: Number of semitones to shift (positive = higher, negative = lower)
            start_time: Start of segment to modify (None for entire video)
            end_time: End of segment to modify (None for entire video)

        Returns:
            Self for method chaining

        Example:
            >>> pipeline.change_pitch(semitones=2)  # Raise pitch 2 semitones
            >>> pipeline.change_pitch(semitones=-3, start_time=5, end_time=10)  # Lower pitch in segment
        """
        # Calculate the frequency multiplier
        # Each semitone is a factor of 2^(1/12)
        pitch_factor = 2 ** (semitones / 12)

        # Build the filter using asetrate (changes pitch) and aresample (fixes duration)
        # Note: This approach changes both pitch and speed, then compensates
        # For a cleaner result, we use rubberband if available
        if start_time is not None and end_time is not None:
            original_start: float = self._map_timeline_point(start_time) or start_time
            original_end: float = self._map_timeline_point(end_time) or end_time

            # Use asetrate with enable expression
            # After asetrate, we need atempo to compensate for duration change
            tempo_compensation = 1 / pitch_factor

            # Build atempo chain for compensation
            tempo_filters = self._build_tempo_chain(tempo_compensation)
            tempo_chain = ",".join(tempo_filters) if tempo_filters else ""

            filter_str = f"asetrate=44100*{pitch_factor}:enable='between(t,{original_start},{original_end})'"
            self.audio_filters.append(filter_str)

            if tempo_chain:
                for tf in tempo_filters:
                    comp_filter = f"{tf}:enable='between(t,{original_start},{original_end})'"
                    self.audio_filters.append(comp_filter)
        else:
            # Apply to entire audio
            tempo_compensation = 1 / pitch_factor
            tempo_filters = self._build_tempo_chain(tempo_compensation)

            self.audio_filters.append(f"asetrate=44100*{pitch_factor}")
            self.audio_filters.append("aresample=44100")
            for tf in tempo_filters:
                self.audio_filters.append(tf)

        # Track operation
        self._operations.append({
            "type": "change_pitch",
            "semitones": semitones,
            "start_time": start_time,
            "end_time": end_time,
        })

        return self

    def change_audio_speed(
        self,
        factor: float,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
    ) -> Self:
        """Change the speed of the audio without affecting pitch.

        Speeds up or slows down the audio while maintaining the original pitch.
        Note: This affects audio duration. When applied to a segment, the
        segment's duration changes which may cause audio sync issues.

        Args:
            factor: Speed multiplier (1.0 = normal, 2.0 = double speed, 0.5 = half speed)
            start_time: Start of segment to modify (None for entire video)
            end_time: End of segment to modify (None for entire video)

        Returns:
            Self for method chaining

        Example:
            >>> pipeline.change_audio_speed(factor=1.5)  # 50% faster
            >>> pipeline.change_audio_speed(factor=0.75, start_time=10, end_time=15)  # Slow down segment
        """
        if factor <= 0:
            raise ValueError("Speed factor must be positive")

        # Build atempo filter chain
        tempo_filters = self._build_tempo_chain(factor)

        if start_time is not None and end_time is not None:
            original_start: float = self._map_timeline_point(start_time) or start_time
            original_end: float = self._map_timeline_point(end_time) or end_time

            for tf in tempo_filters:
                filter_str = f"{tf}:enable='between(t,{original_start},{original_end})'"
                self.audio_filters.append(filter_str)
        else:
            # Apply to entire audio
            for tf in tempo_filters:
                self.audio_filters.append(tf)

        # Track operation
        self._operations.append({
            "type": "change_audio_speed",
            "factor": factor,
            "start_time": start_time,
            "end_time": end_time,
        })

        return self

    def isolate_vocals(
        self,
        output_dir: Optional[str] = None,
        model: str = "htdemucs",
    ) -> str:
        """Extract vocals from the video's audio track.

        Uses Demucs neural network to separate vocals from the background music/sounds.

        Args:
            output_dir: Directory to save the vocals audio file.
                       If None, uses a temporary directory.
            model: Demucs model to use. Options:
                   - 'htdemucs': Best quality (default)
                   - 'htdemucs_ft': Fine-tuned, slightly better
                   - 'htdemucs_6s': 6 stems (includes guitar, piano)

        Returns:
            Path to the extracted vocals audio file

        Example:
            >>> vocals_path = pipeline.isolate_vocals()
            >>> vocals_path = pipeline.isolate_vocals(output_dir="./stems")
        """
        from video_editor.audio.voice_isolation import isolate_vocals_from_video

        return isolate_vocals_from_video(
            video_path=self.input_path,
            output_dir=output_dir,
            model=model,
        )

    def isolate_music(
        self,
        output_dir: Optional[str] = None,
        model: str = "htdemucs",
    ) -> str:
        """Extract background music/instrumental from the video's audio track.

        Uses Demucs neural network to separate the instrumental track
        (everything except vocals).

        Args:
            output_dir: Directory to save the instrumental audio file.
                       If None, uses a temporary directory.
            model: Demucs model to use.

        Returns:
            Path to the extracted instrumental audio file

        Example:
            >>> music_path = pipeline.isolate_music()
        """
        from video_editor.audio.voice_isolation import isolate_instrumental_from_video

        return isolate_instrumental_from_video(
            video_path=self.input_path,
            output_dir=output_dir,
            model=model,
        )

    def isolate_stems(
        self,
        output_dir: Optional[str] = None,
        stems: Optional[List[str]] = None,
        model: str = "htdemucs",
    ) -> Dict[str, str]:
        """Separate audio into multiple stems (vocals, drums, bass, other).

        Uses Demucs neural network for full stem separation.

        Args:
            output_dir: Directory to save the stem audio files.
            stems: List of stems to extract. Default is all available:
                   ['vocals', 'drums', 'bass', 'other']
            model: Demucs model to use.

        Returns:
            Dictionary mapping stem names to file paths

        Example:
            >>> stems = pipeline.isolate_stems()
            >>> print(stems['vocals'])  # Path to vocals file
            >>> print(stems['drums'])   # Path to drums file
        """
        from video_editor.audio.voice_isolation import VoiceIsolator, VoiceIsolationError

        # First extract audio from video
        if output_dir is None:
            output_dir = tempfile.mkdtemp(prefix="stems_")
        else:
            os.makedirs(output_dir, exist_ok=True)

        # Extract audio
        audio_path = os.path.join(output_dir, "extracted_audio.wav")
        cmd = [
            "ffmpeg", "-y",
            "-i", self.input_path,
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "44100",
            "-ac", "2",
            audio_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise VoiceIsolationError(f"Failed to extract audio: {result.stderr}")

        # Separate stems
        isolator = VoiceIsolator(model=model)
        return isolator.separate_stems(audio_path, output_dir, stems)

    def remove_vocals(self) -> Self:
        """Remove vocals from the video, keeping only instrumental.

        Creates a version of the video with vocals removed. The video track
        is unchanged, only the audio is processed.

        Returns:
            Self for method chaining

        Example:
            >>> pipeline.remove_vocals().render()
        """
        # Get instrumental track
        instrumental_path = self.isolate_music()

        # Replace the audio with instrumental
        return self.replace_audio(instrumental_path)

    def keep_only_vocals(self) -> Self:
        """Keep only vocals in the video, removing background music.

        Creates a version of the video with only vocals. The video track
        is unchanged, only the audio is processed.

        Returns:
            Self for method chaining

        Example:
            >>> pipeline.keep_only_vocals().render()
        """
        # Get vocals track
        vocals_path = self.isolate_vocals()

        # Replace the audio with vocals
        return self.replace_audio(vocals_path)

    def apply_vst_plugin(
        self,
        plugin_path: str,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        params: Optional[Dict[str, float]] = None,
    ) -> Self:
        """Apply a VST plugin to the audio track.

        Process the audio through a VST3 or VST2 plugin for professional
        audio effects like compression, EQ, reverb, etc.

        Args:
            plugin_path: Path to the VST plugin file, or plugin name to search for
            start_time: Start of segment to process (None for entire video)
            end_time: End of segment to process (None for entire video)
            params: Dictionary of plugin parameter names and values to set

        Returns:
            Self for method chaining

        Example:
            >>> pipeline.apply_vst_plugin("/path/to/compressor.vst3", params={'threshold': -20})
            >>> pipeline.apply_vst_plugin("OTT.vst3", start_time=10, end_time=30)
        """
        from video_editor.audio.vst_processor import VSTProcessor, VSTError

        processor = VSTProcessor()

        # Find the plugin if name given instead of path
        if not os.path.exists(plugin_path):
            plugin_info = processor.find_plugin(plugin_path)
            if plugin_info is None:
                raise VSTError(f"Plugin not found: {plugin_path}")
            plugin_path = plugin_info.path

        # Extract audio from video
        temp_dir = tempfile.mkdtemp(prefix="vst_")
        audio_path = os.path.join(temp_dir, "audio.wav")

        cmd = [
            "ffmpeg", "-y",
            "-i", self.input_path,
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "44100",
            "-ac", "2",
            audio_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise VSTError(f"Failed to extract audio: {result.stderr}")

        # Process with VST
        if start_time is not None and end_time is not None:
            processed_path = processor.process_audio_segment(
                audio_path=audio_path,
                plugin_path=plugin_path,
                start_time=start_time,
                end_time=end_time,
                parameters=params,
            )
        else:
            processed_path = processor.process_audio(
                audio_path=audio_path,
                plugin_path=plugin_path,
                parameters=params,
            )

        # Replace audio with processed version
        self.replace_audio(processed_path)

        # Track operation
        self._operations.append({
            "type": "apply_vst_plugin",
            "plugin_path": plugin_path,
            "start_time": start_time,
            "end_time": end_time,
            "params": params,
        })

        return self

    @staticmethod
    def list_available_vst_plugins() -> List[Dict[str, str]]:
        """List all available VST plugins on the system.

        Searches standard VST plugin directories for the current platform.

        Returns:
            List of dicts with 'name', 'path', and 'type' keys

        Example:
            >>> plugins = VideoPipeline.list_available_vst_plugins()
            >>> for p in plugins:
            ...     print(f"{p['name']} ({p['type']})")
        """
        from video_editor.audio.vst_processor import list_available_vst_plugins
        return list_available_vst_plugins()

    @staticmethod
    def get_vst_plugin_parameters(plugin_path: str) -> Dict[str, Tuple[float, float, float]]:
        """Get available parameters for a VST plugin.

        Args:
            plugin_path: Path to the VST plugin file

        Returns:
            Dictionary mapping parameter names to (min, max, default) tuples

        Example:
            >>> params = VideoPipeline.get_vst_plugin_parameters("/path/to/plugin.vst3")
            >>> print(params['threshold'])  # (-60.0, 0.0, -20.0)
        """
        from video_editor.audio.vst_processor import get_vst_plugin_parameters
        return get_vst_plugin_parameters(plugin_path)

    def detect_speech(
        self,
        sensitivity: float = 0.5,
        min_speech_duration: float = 0.25,
        min_silence_duration: float = 0.5,
        speech_pad: float = 0.1,
        backend: str = "auto",
    ) -> List[Tuple[float, float]]:
        """Detect speech segments in the video's audio track.

        Uses Voice Activity Detection (VAD) to accurately distinguish
        between actual speech and background noise/music/silence.

        Args:
            sensitivity: Detection sensitivity (0.0-1.0).
                        Higher = more sensitive (detects quieter speech).
                        Lower = less sensitive (only clear speech).
            min_speech_duration: Minimum segment duration to be considered speech (seconds).
            min_silence_duration: Minimum gap to split speech segments (seconds).
            speech_pad: Padding to add around detected speech (seconds).
            backend: VAD backend to use:
                    - "auto": Automatically select best available
                    - "silero": Silero VAD (most accurate, requires torch)
                    - "webrtc": WebRTC VAD (fast, requires webrtcvad)
                    - "energy": Energy-based (fallback, always available)

        Returns:
            List of (start_time, end_time) tuples representing speech segments

        Example:
            >>> segments = pipeline.detect_speech(sensitivity=0.6)
            >>> for start, end in segments:
            ...     print(f"Speech from {start:.2f}s to {end:.2f}s")
        """
        from video_editor.audio.speech_detection import detect_speech_segments

        return detect_speech_segments(
            input_path=self.input_path,
            sensitivity=sensitivity,
            min_speech_duration=min_speech_duration,
            min_silence_duration=min_silence_duration,
            speech_pad=speech_pad,
            backend=backend,
        )

    def remove_non_speech(
        self,
        sensitivity: float = 0.5,
        min_speech_duration: float = 0.25,
        min_silence_duration: float = 0.5,
        speech_pad: float = 0.15,
        backend: str = "auto",
        denoise: bool = False,
        denoise_strength: float = 0.5,
    ) -> Self:
        """Remove segments without speech from the video.

        Uses Voice Activity Detection (VAD) to accurately detect speech
        and remove all non-speech segments. This is much more accurate than
        simple amplitude-based silence detection.

        Unlike `remove_silences()` which only checks audio amplitude, this method:
        - Distinguishes between actual speech and background noise
        - Works well even with music or ambient sounds
        - Uses ML-based detection for high accuracy

        Args:
            sensitivity: Detection sensitivity (0.0-1.0).
                        Higher = more sensitive (keeps more audio).
                        Lower = less sensitive (more aggressive removal).
            min_speech_duration: Minimum segment duration to keep (seconds).
            min_silence_duration: Minimum non-speech gap to remove (seconds).
            speech_pad: Padding to keep around speech (seconds).
            backend: VAD backend to use:
                    - "auto": Automatically select best available
                    - "silero": Silero VAD (most accurate, requires torch)
                    - "webrtc": WebRTC VAD (fast, requires webrtcvad)
                    - "energy": Energy-based (fallback, always available)
            denoise: Apply noise reduction before detection (improves accuracy).
            denoise_strength: Strength of noise reduction (0.0-1.0).

        Returns:
            Self for method chaining

        Example:
            >>> pipeline.remove_non_speech(sensitivity=0.6)
            >>> pipeline.remove_non_speech(sensitivity=0.5, denoise=True)
        """
        from video_editor.audio.speech_detection import get_non_speech_segments

        # Optionally apply denoising first for better detection
        if denoise:
            # Use FFmpeg's noise reduction
            # Map strength to FFmpeg's noise reduction parameters
            nr_strength = int(denoise_strength * 50)  # 0-50 range
            self.audio_filters.append(f"anlmdn=s={nr_strength}:p=0.002:r=0.015:m=15")

        # Detect non-speech segments
        logger.info("Detecting speech segments using VAD...")

        non_speech = get_non_speech_segments(
            input_path=self.input_path,
            sensitivity=sensitivity,
            min_speech_duration=min_speech_duration,
            min_silence_duration=min_silence_duration,
            speech_pad=speech_pad,
            backend=backend,
        )

        if not non_speech:
            logger.info("No non-speech segments detected")
            return self

        logger.info(f"Found {len(non_speech)} non-speech segments to remove")

        # Remove each non-speech segment (in reverse order to maintain timeline)
        for start, end in reversed(non_speech):
            # Only remove segments longer than min_silence_duration
            if end - start >= min_silence_duration:
                self.delete_segment(start, end)

        # Track operation
        self._operations.append({
            "type": "remove_non_speech",
            "sensitivity": sensitivity,
            "min_speech_duration": min_speech_duration,
            "min_silence_duration": min_silence_duration,
            "backend": backend,
            "denoise": denoise,
        })

        return self

    def smart_silence_removal(
        self,
        mode: str = "speech",
        sensitivity: float = 0.5,
        min_silence_duration: float = 0.5,
        padding: float = 0.15,
        denoise: bool = True,
    ) -> Self:
        """Smart silence removal with multiple detection modes.

        Provides an easy-to-use interface for removing silent/non-speech
        segments with sensible defaults.

        Args:
            mode: Detection mode:
                 - "speech": Use VAD to detect speech (most accurate)
                 - "amplitude": Use amplitude-based detection (faster)
                 - "hybrid": Combine both methods
            sensitivity: How aggressive to be (0.0-1.0).
                        Lower = more aggressive removal.
            min_silence_duration: Minimum silence length to remove (seconds).
            padding: Amount of silence to keep around speech (seconds).
            denoise: Apply noise reduction first (recommended for noisy audio).

        Returns:
            Self for method chaining

        Example:
            >>> # For podcasts/interviews (clear speech)
            >>> pipeline.smart_silence_removal(mode="speech", sensitivity=0.5)

            >>> # For noisy recordings
            >>> pipeline.smart_silence_removal(mode="speech", denoise=True)

            >>> # Quick processing (less accurate)
            >>> pipeline.smart_silence_removal(mode="amplitude", sensitivity=0.3)
        """
        if mode == "speech":
            return self.remove_non_speech(
                sensitivity=sensitivity,
                min_silence_duration=min_silence_duration,
                speech_pad=padding,
                denoise=denoise,
                backend="auto",
            )
        elif mode == "amplitude":
            # Use existing remove_silences
            noise_threshold = -50 + (sensitivity * 30)  # Map to dB
            self.remove_silences(
                noise_threshold=noise_threshold,
                min_silence_duration=min_silence_duration,
                padding=padding,
            )
            return self
        elif mode == "hybrid":
            # First pass: remove obvious silences
            noise_threshold = -50 + (sensitivity * 30)
            self.remove_silences(
                noise_threshold=noise_threshold,
                min_silence_duration=min_silence_duration * 2,
                padding=padding,
            )
            # Second pass: use VAD for remaining
            return self.remove_non_speech(
                sensitivity=sensitivity,
                min_silence_duration=min_silence_duration,
                speech_pad=padding,
                denoise=denoise,
            )
        else:
            raise ValueError(f"Unknown mode: {mode}. Use 'speech', 'amplitude', or 'hybrid'")

    def cut_silences(
        self,
        noise_threshold_db: float = -30.0,
        min_silence_duration: float = 0.3,
        padding: float = 0.1,
        method: str = "auto",
        output_dir: Optional[str] = None,
    ) -> str:
        """Cut silent segments from video using professional tools.

        This is the RECOMMENDED method for silence removal. It uses:
        1. auto-editor (if installed) - gold standard, most reliable
        2. FFmpeg select/aselect filters - proper fallback method

        Unlike other methods, this actually produces a shorter video
        with silent parts removed.

        Args:
            noise_threshold_db: Audio threshold in dB (e.g., -30 means -30dB).
                               Lower = more sensitive, catches quieter sounds.
                               Higher = less sensitive, only catches loud sounds.
            min_silence_duration: Minimum silence duration to remove (seconds).
            padding: Keep this much audio around speech (seconds).
            method: "auto" (best available), "auto-editor", or "ffmpeg"
            output_dir: Output directory (uses temp if None)

        Returns:
            Path to the output video with silences removed

        Example:
            >>> # Basic usage - auto-selects best method
            >>> output = pipeline.cut_silences()

            >>> # More aggressive (catches more silence)
            >>> output = pipeline.cut_silences(noise_threshold_db=-25)

            >>> # Less aggressive (only removes very quiet parts)
            >>> output = pipeline.cut_silences(noise_threshold_db=-40)

            >>> # Force auto-editor method
            >>> output = pipeline.cut_silences(method="auto-editor")

        Note:
            Install auto-editor for best results: pip install auto-editor
        """
        from video_editor.audio.silence_removal import remove_silence, is_auto_editor_available

        # Determine output path
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
            base = os.path.splitext(os.path.basename(self.input_path))[0]
            output_path = os.path.join(output_dir, f"{base}_no_silence.mp4")
        else:
            output_path = None  # Will be auto-generated

        logger.info(f"Cutting silences using {method} method...")
        if method == "auto":
            logger.info(f"auto-editor available: {is_auto_editor_available()}")

        result = remove_silence(
            video_path=self.input_path,
            output_path=output_path,
            method=method,
            noise_threshold_db=noise_threshold_db,
            min_silence_duration=min_silence_duration,
            padding=padding,
        )

        logger.info(f"Silence removal complete: {result}")
        return result

    def speed_up_silences(
        self,
        silent_speed: float = 6.0,
        noise_threshold_db: float = -30.0,
        padding: float = 0.1,
        output_dir: Optional[str] = None,
    ) -> str:
        """Speed up silent parts instead of removing them.

        Creates a more natural feel than hard cuts - silences play
        at high speed instead of being completely removed.

        Requires auto-editor: pip install auto-editor

        Args:
            silent_speed: Speed multiplier for silent parts.
                         6.0 = 6x speed (recommended)
                         99999 = effectively cut (same as cut_silences)
            noise_threshold_db: Audio threshold in dB.
            padding: Keep this much normal audio around speech.
            output_dir: Output directory (uses temp if None)

        Returns:
            Path to output video

        Example:
            >>> # Speed up silences 6x (natural feel)
            >>> output = pipeline.speed_up_silences(silent_speed=6)

            >>> # Speed up silences 3x (very smooth)
            >>> output = pipeline.speed_up_silences(silent_speed=3)
        """
        from video_editor.audio.silence_removal import speed_up_silence

        # Determine output path
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
            base = os.path.splitext(os.path.basename(self.input_path))[0]
            output_path = os.path.join(output_dir, f"{base}_fast_silence.mp4")
        else:
            output_path = None

        return speed_up_silence(
            video_path=self.input_path,
            output_path=output_path,
            silent_speed=silent_speed,
            noise_threshold_db=noise_threshold_db,
            padding=padding,
        )

    @staticmethod
    def check_silence_removal_tools() -> Dict[str, bool]:
        """Check which silence removal tools are available.

        Returns:
            Dict with tool availability status
        """
        from video_editor.audio.silence_removal import is_auto_editor_available

        return {
            "auto-editor": is_auto_editor_available(),
            "ffmpeg": True,  # FFmpeg is required for the pipeline
        }

    def _render_with_audio_replacement(
        self,
        format: str = "mp4",
        video_codec: str = "libx264",
        output_dir: Optional[str] = None,
    ) -> str:
        """Render with audio replacement.

        Internal method used when replace_audio has been called.
        """
        audio_path: str = self._replacement_audio_path
        loop: bool = self._replacement_audio_loop
        volume: float = self._replacement_audio_volume

        # Determine output path
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
            input_filename: str = os.path.basename(self.input_path).split(".")[0]
            output_filename: str = f"{input_filename}_edited_{uuid.uuid4().hex[:8]}.{format}"
            final_output_path: str = os.path.join(output_dir, output_filename)
        else:
            final_output_path = self.build_output_path(self.input_path, format)

        # Build FFmpeg command for audio replacement
        cmd: List[str] = ["ffmpeg", "-y"]

        # Add video input
        cmd.extend(["-i", self.input_path])

        # Add audio input with loop option if needed
        if loop:
            cmd.extend(["-stream_loop", "-1"])
        cmd.extend(["-i", audio_path])

        # Copy video stream, map video from first input and audio from second
        cmd.extend(["-c:v", "copy"])
        cmd.extend(["-map", "0:v"])
        cmd.extend(["-map", "1:a"])

        # Apply volume filter if needed
        if volume != 1.0:
            cmd.extend(["-af", f"volume={volume}"])
            cmd.extend(["-c:a", "aac"])
        else:
            cmd.extend(["-c:a", "aac"])

        # Use shortest to match video duration
        cmd.append("-shortest")

        cmd.append(final_output_path)

        logger.info(f"Running FFmpeg command: {' '.join(cmd)}")

        p: subprocess.Popen[bytes] = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        stdout: bytes
        stderr: bytes
        stdout, stderr = p.communicate()

        if p.returncode != 0:
            error_msg: str = stderr.decode() if stderr else "Unknown FFmpeg error"
            logger.error(f"FFmpeg error: {error_msg}")
            raise RuntimeError(f"FFmpeg error: {error_msg}")

        logger.info(f"Video processing complete. Output: {final_output_path}")

        return final_output_path

    def transcribe_audio(
        self,
        language: Optional[str] = "en",
        model_size: str = "base",
        include_confidence: bool = False,
    ) -> List[Dict[str, Any]]:
        """Transcribe audio from the video using Whisper.

        Args:
            language: Language code (e.g., "en", "es") or None for auto-detection
            model_size: Whisper model size (tiny, base, small, medium, large)
            include_confidence: Whether to include confidence scores in segments

        Returns:
            List of segment dictionaries with text, start, end, and optionally confidence
        """
        from faster_whisper import WhisperModel
        import shutil

        # Extract audio to a temporary file
        temp_dir = tempfile.mkdtemp()
        try:
            audio_path = self.extract_audio(format="wav", output_dir=temp_dir)

            # Load model with auto GPU detection
            model = WhisperModel(model_size, device="auto", compute_type="auto")

            # Transcribe - language=None enables auto-detection
            segments_iter, info = model.transcribe(
                audio_path,
                language=language,
            )

            # Convert to list of dictionaries
            segments: List[Dict[str, Any]] = []
            for seg in segments_iter:
                segment_dict: Dict[str, Any] = {
                    "text": seg.text,
                    "start": seg.start,
                    "end": seg.end,
                }
                if include_confidence:
                    segment_dict["confidence"] = getattr(seg, "avg_logprob", None)
                segments.append(segment_dict)

            return segments

        finally:
            # Clean up temp directory
            shutil.rmtree(temp_dir, ignore_errors=True)

    def _segments_to_srt(
        self,
        segments: List[Dict[str, Any]],
        output_path: str,
    ) -> None:
        """Convert segments to SRT file format.

        Args:
            segments: List of segment dictionaries with text, start, end
            output_path: Path to save the SRT file
        """
        import pysrt

        subs = pysrt.SubRipFile()
        for i, seg in enumerate(segments):
            sub = pysrt.SubRipItem(
                index=i + 1,
                start=pysrt.SubRipTime(seconds=seg["start"]),
                end=pysrt.SubRipTime(seconds=seg["end"]),
                text=seg["text"].strip(),
            )
            subs.append(sub)
        subs.save(output_path, encoding="utf-8")

    def add_subtitles(
        self,
        language: str = "en",
        burn_in: bool = True,
        model_size: str = "tiny",
        font_size: int = 24,
        font_color: str = "white",
        outline_color: str = "black",
    ) -> Self:
        """Auto-generate and add subtitles to the video.

        Args:
            language: Language code for transcription
            burn_in: If True, burn subtitles into video; if False, create SRT sidecar
            model_size: Whisper model size for transcription
            font_size: Font size for burned-in subtitles
            font_color: Font color for burned-in subtitles
            outline_color: Outline color for burned-in subtitles

        Returns:
            Self for method chaining
        """
        # Transcribe audio
        segments = self.transcribe_audio(
            language=language,
            model_size=model_size,
        )

        if burn_in:
            # Burn subtitles into video using drawtext filter
            for seg in segments:
                # Escape special characters in text for FFmpeg
                text = seg["text"].strip()
                # FFmpeg drawtext escaping
                text = text.replace("\\", "\\\\\\\\")  # Escape backslashes first
                text = text.replace("'", "'\\''")  # Escape single quotes
                text = text.replace(":", "\\:")  # Escape colons

                # Build drawtext filter for this segment
                filter_str = (
                    f"drawtext=text='{text}':"
                    f"fontsize={font_size}:"
                    f"fontcolor={font_color}:"
                    f"borderw=2:"
                    f"bordercolor={outline_color}:"
                    f"x=(w-text_w)/2:"
                    f"y=h-th-50:"
                    f"enable='between(t,{seg['start']},{seg['end']})'"
                )
                self.video_filters.append(filter_str)
        else:
            # Store segments to generate SRT file during render
            self._subtitle_segments: List[Dict[str, Any]] = segments

        return self

    def add_srt_subtitles(
        self,
        srt_path: str,
        burn_in: bool = True,
        position: str = "bottom",
        embed: bool = False,
    ) -> Self:
        """Add existing SRT subtitles to the video.

        Args:
            srt_path: Path to the SRT file
            burn_in: If True, burn subtitles into video
            position: Position for subtitles (top, bottom)
            embed: If True, embed as soft subtitles (overrides burn_in)

        Returns:
            Self for method chaining
        """
        if not os.path.exists(srt_path):
            raise FileNotFoundError(f"SRT file not found: {srt_path}")

        if embed:
            # Add SRT file as additional input and embed as soft subtitle
            self.additional_inputs.append(srt_path)
            input_index = len(self.additional_inputs)

            # Map the subtitle stream
            self.map_options.extend(["-map", f"{input_index}:s?"])

            # Store for later - codec will be set during build_cmd
            self._embed_subtitles: bool = True
            self._srt_path: str = srt_path
        elif burn_in:
            # Burn subtitles using the subtitles filter
            # Need to escape path for FFmpeg (Windows paths need special handling)
            escaped_path = srt_path.replace("\\", "/").replace(":", "\\:")

            # Calculate vertical position
            if position == "top":
                force_style = "MarginV=50"
            else:
                force_style = "MarginV=30"

            filter_str = f"subtitles='{escaped_path}':force_style='{force_style}'"
            self.video_filters.append(filter_str)

        return self

    def build_output_path(self, input_path: str, format: str) -> str:
        """Build an output path for the rendered file.

        Args:
            input_path: Input path or descriptor
            format: Output format

        Returns:
            Full path for the rendered output file
        """
        # If a custom output path was specified, use that
        if self.output_path:
            return self.output_path

        # Create a directory structure in the same location as the input
        if isinstance(input_path, str) and os.path.exists(input_path):
            base_dir: str = os.path.dirname(input_path)
            filename: str = os.path.basename(input_path).split(".")[0]
            output_dir: str = os.path.join(base_dir, "render")

            os.makedirs(output_dir, exist_ok=True)

            output_filename: str = f"{filename}_edited_{uuid.uuid4().hex[:8]}.{format}"
            return os.path.join(output_dir, output_filename)
        else:
            # If input is not a path or doesn't exist, use temp dir
            temp_dir: str = tempfile.gettempdir()
            output_filename = f"output_{uuid.uuid4().hex[:8]}.{format}"
            return os.path.join(temp_dir, output_filename)

    # ========== Operations that track for templates/export ==========

    def add_trim(self, start_time: float, end_time: Optional[float] = None) -> Self:
        """Add a trim operation and track it."""
        self.trim(start_time, end_time if end_time is not None else start_time)
        self._operations.append(
            {
                "type": "trim",
                "start": start_time,
                "end": end_time,
                "start_time": start_time,
                "end_time": end_time,
            }
        )
        return self

    def add_scale(self, width: int, height: int) -> Self:
        """Add a scale operation and track it."""
        self.scale(width, height)
        self._operations.append(
            {
                "type": "scale",
                "width": width,
                "height": height,
            }
        )
        return self

    def add_segment_deletion(self, start_time: float, end_time: float) -> Self:
        """Add a segment deletion operation and track it."""
        self.delete_segment(start_time, end_time)
        self._operations.append(
            {
                "type": "segment_deletion",
                "start": start_time,
                "end": end_time,
            }
        )
        return self

    # ========== Template support ==========

    def apply_template(
        self,
        template_name: str,
        template_dir: str = "",
        overrides: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Apply a saved template to this pipeline."""
        from video_editor.templates import load_template

        loaded = load_template(template_name, template_dir)
        operations = loaded if isinstance(loaded, list) else []

        for op in operations:
            if overrides:
                op = self._substitute_vars(op, overrides)

            op_type = op.get("type")
            if op_type == "trim":
                self.add_trim(op.get("start", 0), op.get("end"))
            elif op_type == "scale":
                width = op.get("width")
                height = op.get("height")
                if width is not None and height is not None:
                    self.add_scale(width, height)
            elif op_type == "loudness_normalization":
                self.add_loudness_normalization(op.get("target_lufs", -14))

    def _substitute_vars(self, op: Dict[str, Any], overrides: Dict[str, Any]) -> Dict[str, Any]:
        """Substitute ${var} placeholders with override values."""
        result: Dict[str, Any] = {}
        for k, v in op.items():
            if isinstance(v, str) and v.startswith("${") and v.endswith("}"):
                var_name = v[2:-1]
                result[k] = overrides.get(var_name, v)
            else:
                result[k] = v
        return result

    # ========== EDL Export ==========

    def export_edl(self, output_path: str, format: str = "cmx3600") -> None:
        """Export timeline as EDL (Edit Decision List)."""
        with open(output_path, "w") as f:
            f.write("TITLE: VEMCP Export\n")
            f.write("FCM: NON-DROP FRAME\n\n")

            edit_num = 1
            for op in self._operations:
                if op.get("type") in ["trim", "segment_deletion"]:
                    start_tc = self._seconds_to_timecode(op.get("start", 0))
                    end_tc = self._seconds_to_timecode(op.get("end", 0))

                    f.write(f"{edit_num:03d}  AX       V     C        ")
                    f.write(f"{start_tc} {end_tc} {start_tc} {end_tc}\n")
                    edit_num += 1

    def _seconds_to_timecode(self, seconds: float | None, fps: float = 30.0) -> str:
        """Convert seconds to SMPTE timecode HH:MM:SS:FF."""
        if seconds is None:
            seconds = 0.0
        total_frames = int(seconds * fps)
        frames = total_frames % int(fps)
        total_seconds = total_frames // int(fps)
        secs = total_seconds % 60
        total_minutes = total_seconds // 60
        mins = total_minutes % 60
        hours = total_minutes // 60
        return f"{hours:02d}:{mins:02d}:{secs:02d}:{frames:02d}"

    # ========== Timeline JSON Export/Import ==========

    def export_timeline_json(self, output_path: str, include_metadata: bool = False) -> None:
        """Export timeline as JSON."""
        data: Dict[str, Any] = {"operations": self._operations}

        if include_metadata:
            data["source"] = self._input_path
            data["duration"] = self._get_duration()

        with open(output_path, "w") as f:
            json.dump(data, f, indent=2)

    def _get_duration(self) -> Optional[float]:
        """Get duration of the input video."""
        return self._get_input_duration()

    @classmethod
    def from_timeline_json(cls, json_path: str) -> "VideoPipeline":
        """Create pipeline from JSON timeline."""
        with open(json_path, "r") as f:
            data = json.load(f)

        pipeline = cls(data["source"])
        pipeline.apply_operations(data.get("operations", []))
        return pipeline

    def apply_operations(self, operations: List[Dict[str, Any]]) -> None:
        """Apply a list of operations."""
        for op in operations:
            op_type = op.get("type")
            if op_type == "trim":
                self.add_trim(
                    op.get("start_time", op.get("start", 0)),
                    op.get("end_time", op.get("end")),
                )
            elif op_type == "scale":
                width = op.get("width")
                height = op.get("height")
                if width is not None and height is not None:
                    self.add_scale(width, height)
            elif op_type == "loudness_normalization":
                self.add_loudness_normalization(op.get("target_lufs", -14))
            elif op_type == "segment_deletion":
                self.add_segment_deletion(op.get("start", 0), op.get("end", 0))

    # ========== Project Save/Load ==========

    def save_project(self, output_path: str) -> None:
        """Save complete project state."""
        data = {
            "version": "1.0",
            "source": self._input_path,
            "operations": self._operations,
        }
        with open(output_path, "w") as f:
            json.dump(data, f, indent=2)

    @classmethod
    def load_project(cls, project_path: str) -> "VideoPipeline":
        """Load project from file."""
        with open(project_path, "r") as f:
            data = json.load(f)

        pipeline = cls(data["source"])
        pipeline.apply_operations(data.get("operations", []))
        return pipeline

    def build_cmd(
        self,
        format: str,
        video_codec: str,
        audio_codec: str,
        resolution: Optional[str] = None,
        frame_rate: Optional[float] = None,
        hardware_accel: bool = False,
        preset: Optional[str] = None,
        output_path: Optional[str] = None,
    ) -> Tuple[List[str], str]:
        """
        Build the FFmpeg command based on all filters and options.

        Args:
            format: Output format (mp4, mov, etc.)
            video_codec: Video codec (libx264, hevc, etc.)
            audio_codec: Audio codec (aac, mp3, etc.)
            resolution: Output resolution (e.g., 1920x1080)
            frame_rate: Output frame rate (e.g., 30)
            hardware_accel: Whether to use hardware acceleration
            preset: Encoding preset (fast, slow, etc.)
            output_path: Custom output path

        Returns:
            (command, output_path) tuple
        """
        if output_path:
            self.output_path = output_path

        # Build the output path
        output: str = self.build_output_path(self.input_path, format)

        # Start building the command
        cmd: List[str] = ["ffmpeg", "-y"]

        # Add input file and trim options
        # When duration is modified by loop/boomerang, use -t (input duration limit)
        # instead of -to (output limit) so the concat filter can reference the input multiple times
        if self.start_time is not None:
            cmd.extend(["-ss", str(self.start_time)])

        if self._duration_modified and self.end_time is not None:
            # Use -t (duration) as input option so concat can reference multiple times
            duration = self.end_time - (self.start_time or 0)
            cmd.extend(["-t", str(duration)])

        cmd.extend(["-i", self.input_path])

        # Only apply -to if we haven't modified duration with filters like loop/boomerang
        if self.end_time is not None and not self._duration_modified:
            cmd.extend(["-to", str(self.end_time)])

        # Add additional inputs
        for additional_input_path in self.additional_inputs:
            cmd.extend(["-i", additional_input_path])

        # Determine if we use hardware acceleration
        if hardware_accel and _is_gpu_available():
            # Use NVIDIA hardware acceleration if available
            cmd.extend(["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"])
            if video_codec == "libx264":
                video_codec = "h264_nvenc"
            elif video_codec == "libx265":
                video_codec = "hevc_nvenc"

        # Add codec options
        cmd.extend(["-c:v", video_codec])
        cmd.extend(["-c:a", audio_codec])

        # Add subtitle codec if embedding subtitles
        if hasattr(self, "_embed_subtitles") and self._embed_subtitles:
            if format == "mkv":
                cmd.extend(["-c:s", "srt"])
            else:
                cmd.extend(["-c:s", "mov_text"])

        # Add resolution if specified
        if resolution:
            cmd.extend(["-s", resolution])

        # Add frame rate if specified
        if frame_rate:
            cmd.extend(["-r", str(frame_rate)])

        # Add preset if specified
        if preset:
            cmd.extend(["-preset", preset])

        # Add map options (for complex filters)
        if self.map_options:
            cmd.extend(self.map_options)
        else:
            # Standard mapping for simple filters
            cmd.extend(["-map", "0:v", "-map", "0:a?"])

        # Add all the filter chains
        # Handle complex filters first
        if self.complex_filters:
            complex_str: str = ";".join(self.complex_filters)
            cmd.extend(["-filter_complex", complex_str])
        else:
            # Add simple video filters
            if self.video_filters:
                cmd.extend(["-vf", ",".join(self.video_filters)])

            # Add simple audio filters
            if self.audio_filters:
                cmd.extend(["-af", ",".join(self.audio_filters)])

        # Add any additional custom options
        cmd.extend(self.additional_options)

        # Finally add the output file
        cmd.append(output)

        return (cmd, output)


def pipeline_render(
    pipeline_id: str,
    format: Optional[str] = None,
    video_codec: Optional[str] = None,
    audio_codec: Optional[str] = None,
    resolution: Optional[str] = None,
    frame_rate: Optional[float] = None,
    hardware_accel: bool = False,
    preset: Optional[str] = None,
    output_path: Optional[str] = None,
) -> Union[bytes, str]:
    """
    Render a pipeline to a file or bytes.

    Args:
        pipeline_id: Pipeline ID to render
        format: Output format (mp4, mov, etc.)
        video_codec: Video codec (libx264, hevc, etc.)
        audio_codec: Audio codec (aac, mp3, etc.)
        resolution: Output resolution (e.g., 1920x1080)
        frame_rate: Output frame rate (e.g., 30)
        hardware_accel: Whether to use hardware acceleration
        preset: Encoding preset (fast, slow, etc.)
        output_path: Custom output path

    Returns:
        Path to rendered file or bytes of the rendered file if input was bytes
    """
    if pipeline_id not in pipelines:
        raise ValueError(f"Pipeline ID not found: {pipeline_id}")

    pipeline: VideoPipeline = pipelines[pipeline_id]

    # Set defaults if not specified
    final_format: str = format if format else "mp4"
    final_video_codec: str = video_codec if video_codec else "libx264"
    final_audio_codec: str = audio_codec if audio_codec else "aac"

    # Build the ffmpeg command
    cmd: List[str]
    final_output_path: str
    cmd, final_output_path = pipeline.build_cmd(
        format=final_format,
        video_codec=final_video_codec,
        audio_codec=final_audio_codec,
        resolution=resolution,
        frame_rate=frame_rate,
        hardware_accel=hardware_accel,
        preset=preset,
        output_path=output_path,
    )

    # Log the command
    logger.info(f"Running FFmpeg command: {' '.join(cmd)}")

    try:
        # Run the command
        p: subprocess.Popen[bytes] = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        # Wait for completion
        stdout: bytes
        stderr: bytes
        stdout, stderr = p.communicate()

        if p.returncode != 0:
            error_msg: str = stderr.decode() if stderr else "Unknown FFmpeg error"
            logger.error(f"FFmpeg error: {error_msg}")
            raise RuntimeError(f"FFmpeg error: {error_msg}")

        logger.info(f"Video processing complete. Output: {final_output_path}")

        # If input was bytes, return output as bytes too
        if pipeline.is_temp_input:
            with open(final_output_path, "rb") as f:
                result: bytes = f.read()

            # Clean up temporary output
            try:
                os.remove(final_output_path)
            except OSError:
                pass

            return result
        else:
            # Otherwise return the path
            return final_output_path

    except Exception as e:
        logger.error(f"Failed to process video: {str(e)}")
        raise


def create_slideshow(
    images: List[str],
    duration_per_image: float,
    output_path: str,
    transition: Optional[str] = None,
    transition_duration: float = 0.5,
    ken_burns: bool = False,
    audio_path: Optional[str] = None,
    resolution: Optional[Tuple[int, int]] = None,
) -> str:
    """Create a slideshow video from a list of images.

    Args:
        images: List of image file paths
        duration_per_image: Duration in seconds to show each image
        output_path: Output video file path
        transition: Transition type between images ("fade", "dissolve", etc.)
        transition_duration: Duration of transitions in seconds
        ken_burns: Whether to apply Ken Burns effect to each image
        audio_path: Optional background audio file path
        resolution: Optional (width, height) tuple for output resolution

    Returns:
        Path to the output video file
    """
    if not images:
        raise ValueError("At least one image is required")

    # Set default resolution
    if resolution is None:
        width, height = 1920, 1080
    else:
        width, height = resolution

    # Create temporary directory for intermediate files
    temp_dir = tempfile.mkdtemp()
    segments: List[str] = []

    try:
        # Create video segment for each image
        for i, img in enumerate(images):
            if not os.path.exists(img):
                raise FileNotFoundError(f"Image not found: {img}")

            seg_path = os.path.join(temp_dir, f"segment_{i:03d}.mp4")

            # Build FFmpeg command for this segment
            cmd: List[str] = [
                "ffmpeg",
                "-y",
                "-loop",
                "1",
                "-i",
                img,
                "-t",
                str(duration_per_image),
            ]

            # Build video filter chain
            vf_parts: List[str] = []

            # Scale to fit output resolution while maintaining aspect ratio
            vf_parts.append(f"scale={width}:{height}:force_original_aspect_ratio=decrease")
            vf_parts.append(f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2")

            if ken_burns:
                # Apply Ken Burns effect
                # Alternate between different pan directions for variety
                pan_directions = ["center", "left_to_right", "right_to_left", "top_to_bottom", "bottom_to_top"]
                pan_dir = pan_directions[i % len(pan_directions)]

                # Calculate zoom values - alternate between zoom in and zoom out
                if i % 2 == 0:
                    zoom_start, zoom_end = 1.0, 1.3
                else:
                    zoom_start, zoom_end = 1.3, 1.0

                # Calculate total frames
                fps = 30
                total_frames = fps * duration_per_image
                zoom_delta = zoom_end - zoom_start

                # Build zoom expression
                if abs(zoom_delta) > 0.001:
                    zoom_expr = f"{zoom_start}+({zoom_delta})*on/{total_frames}"
                else:
                    zoom_expr = f"{zoom_start}"

                # Build pan expressions based on direction
                if pan_dir == "center":
                    x_expr = "(iw-iw/zoom)/2"
                    y_expr = "(ih-ih/zoom)/2"
                elif pan_dir == "left_to_right":
                    x_expr = f"(iw-iw/zoom)*on/{total_frames}"
                    y_expr = "(ih-ih/zoom)/2"
                elif pan_dir == "right_to_left":
                    x_expr = f"(iw-iw/zoom)*(1-on/{total_frames})"
                    y_expr = "(ih-ih/zoom)/2"
                elif pan_dir == "top_to_bottom":
                    x_expr = "(iw-iw/zoom)/2"
                    y_expr = f"(ih-ih/zoom)*on/{total_frames}"
                else:  # bottom_to_top
                    x_expr = "(iw-iw/zoom)/2"
                    y_expr = f"(ih-ih/zoom)*(1-on/{total_frames})"

                # Clear previous filters and use zoompan instead
                vf_parts = [
                    "scale=8000:-1",  # Scale up for better zoompan quality
                    f"zoompan=z='{zoom_expr}':x='{x_expr}':y='{y_expr}':d=1:s={width}x{height}:fps={fps}",
                ]

            if vf_parts:
                cmd.extend(["-vf", ",".join(vf_parts)])

            # Output settings
            cmd.extend(
                [
                    "-c:v",
                    "libx264",
                    "-preset",
                    "fast",
                    "-pix_fmt",
                    "yuv420p",
                    "-r",
                    "30",
                ]
            )

            # Add silent audio track for concatenation
            cmd.extend(
                [
                    "-f",
                    "lavfi",
                    "-i",
                    "anullsrc=r=44100:cl=stereo",
                    "-shortest",
                ]
            )

            cmd.append(seg_path)

            logger.info(f"Creating segment {i + 1}/{len(images)}: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True)
            if result.returncode != 0:
                error_msg = result.stderr.decode() if result.stderr else "Unknown error"
                raise RuntimeError(f"Failed to create segment {i}: {error_msg}")

            segments.append(seg_path)

        # Now concatenate all segments
        if len(segments) == 1:
            # Single image, just copy to output
            final_video = segments[0]
        elif transition and len(segments) > 1:
            # Apply transitions between segments using xfade
            final_video = _apply_slideshow_transitions(segments, transition, transition_duration, temp_dir, width, height)
        else:
            # Simple concatenation without transitions
            final_video = _concat_segments(segments, temp_dir)

        # Add audio if provided
        if audio_path:
            final_video = _add_audio_to_slideshow(final_video, audio_path, temp_dir)

        # Move final video to output path
        import shutil

        os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
        shutil.copy(final_video, output_path)

        return output_path

    finally:
        # Clean up temporary files
        import shutil

        shutil.rmtree(temp_dir, ignore_errors=True)


def _concat_segments(segments: List[str], temp_dir: str) -> str:
    """Concatenate video segments using FFmpeg concat demuxer."""
    # Create concat list file
    concat_list_path = os.path.join(temp_dir, "concat_list.txt")
    with open(concat_list_path, "w") as f:
        for seg in segments:
            # Escape special characters in path
            escaped_path = seg.replace("\\", "/").replace("'", "'\\''")
            f.write(f"file '{escaped_path}'\n")

    output_path = os.path.join(temp_dir, "concat_output.mp4")

    cmd: List[str] = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list_path, "-c", "copy", output_path]

    logger.info(f"Concatenating segments: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        error_msg = result.stderr.decode() if result.stderr else "Unknown error"
        raise RuntimeError(f"Failed to concatenate segments: {error_msg}")

    return output_path


def _apply_slideshow_transitions(
    segments: List[str],
    transition: str,
    transition_duration: float,
    temp_dir: str,
    width: int,
    height: int,
) -> str:
    """Apply transitions between video segments using xfade filter."""
    if len(segments) < 2:
        return segments[0] if segments else ""

    # Map transition names to xfade transition types
    transition_map = {
        "fade": "fade",
        "dissolve": "dissolve",
        "wipe": "wipeleft",
        "slide": "slideleft",
        "circle": "circleopen",
    }
    xfade_transition = transition_map.get(transition, "fade")

    # Get duration of each segment
    def get_duration(path: str) -> float:
        cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode == 0:
            return float(result.stdout.decode().strip())
        return 3.0  # Default fallback

    # Build complex filter for xfade chain
    current_input = segments[0]

    for i in range(1, len(segments)):
        next_segment = segments[i]
        output_path = os.path.join(temp_dir, f"xfade_{i}.mp4")

        # Get duration of current input
        current_duration = get_duration(current_input)
        offset = current_duration - transition_duration

        # Build xfade filter command
        cmd: List[str] = [
            "ffmpeg",
            "-y",
            "-i",
            current_input,
            "-i",
            next_segment,
            "-filter_complex",
            f"[0:v][1:v]xfade=transition={xfade_transition}:duration={transition_duration}:offset={offset}[v];"
            f"[0:a][1:a]acrossfade=d={transition_duration}[a]",
            "-map",
            "[v]",
            "-map",
            "[a]",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            output_path,
        ]

        logger.info(f"Applying transition {i}/{len(segments) - 1}: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            error_msg = result.stderr.decode() if result.stderr else "Unknown error"
            raise RuntimeError(f"Failed to apply transition: {error_msg}")

        current_input = output_path

    return current_input


def _add_audio_to_slideshow(video_path: str, audio_path: str, temp_dir: str) -> str:
    """Add audio track to slideshow video."""
    output_path = os.path.join(temp_dir, "with_audio.mp4")

    # Build command with audio (uses -shortest to match video duration)
    cmd_audio: List[str] = [
        "ffmpeg",
        "-y",
        "-i",
        video_path,
        "-stream_loop",
        "-1",  # Loop audio if needed
        "-i",
        audio_path,
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-shortest",  # Match video duration
        output_path,
    ]

    logger.info(f"Adding audio: {' '.join(cmd_audio)}")
    result = subprocess.run(cmd_audio, capture_output=True)
    if result.returncode != 0:
        error_msg = result.stderr.decode() if result.stderr else "Unknown error"
        raise RuntimeError(f"Failed to add audio: {error_msg}")

    return output_path
