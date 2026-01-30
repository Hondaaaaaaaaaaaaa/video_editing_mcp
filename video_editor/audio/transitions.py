"""
Audio transition helpers for fade effects and crossfades.

Provides utility functions for building FFmpeg audio filter expressions
for various transition types.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class AudioFade:
    """Represents an audio fade configuration."""

    fade_type: str  # 'in' or 'out'
    start_time: float
    duration: float
    curve: str = "tri"  # Fade curve type: tri, qsin, hsin, esin, log, ipar, qua, cub, squ, cbr, par, exp, iqsin, ihsin, dese, desi, losi, sinc, isinc

    def to_filter(self) -> str:
        """Convert to FFmpeg afade filter string."""
        return f"afade=t={self.fade_type}:st={self.start_time}:d={self.duration}:curve={self.curve}"


@dataclass
class AudioCrossfade:
    """Represents an audio crossfade configuration."""

    duration: float
    curve1: str = "tri"  # Fade out curve for first audio
    curve2: str = "tri"  # Fade in curve for second audio

    def to_filter(self) -> str:
        """Convert to FFmpeg acrossfade filter string."""
        return f"acrossfade=d={self.duration}:c1={self.curve1}:c2={self.curve2}"


class AudioTransitionHelper:
    """Helper class for building audio transition filters."""

    # Available fade curves in FFmpeg
    FADE_CURVES: list[str] = [
        "tri",    # triangular, linear slope (default)
        "qsin",   # quarter of sine wave
        "hsin",   # half of sine wave
        "esin",   # exponential sine wave
        "log",    # logarithmic
        "ipar",   # inverted parabola
        "qua",    # quadratic
        "cub",    # cubic
        "squ",    # square root
        "cbr",    # cubic root
        "par",    # parabola
        "exp",    # exponential
        "iqsin",  # inverted quarter of sine wave
        "ihsin",  # inverted half of sine wave
        "dese",   # double-exponential seat
        "desi",   # double-exponential sigmoid
        "losi",   # logistic sigmoid
        "sinc",   # sine cardinal function
        "isinc",  # inverted sine cardinal function
    ]

    @staticmethod
    def fade_in(
        duration: float,
        start_time: float = 0.0,
        curve: str = "tri"
    ) -> str:
        """Generate FFmpeg filter for fade in effect.

        Args:
            duration: Duration of the fade in seconds.
            start_time: Start time for the fade in seconds.
            curve: Fade curve type.

        Returns:
            FFmpeg afade filter string.
        """
        return f"afade=t=in:st={start_time}:d={duration}:curve={curve}"

    @staticmethod
    def fade_out(
        duration: float,
        start_time: float,
        curve: str = "tri"
    ) -> str:
        """Generate FFmpeg filter for fade out effect.

        Args:
            duration: Duration of the fade in seconds.
            start_time: Start time for the fade in seconds.
            curve: Fade curve type.

        Returns:
            FFmpeg afade filter string.
        """
        return f"afade=t=out:st={start_time}:d={duration}:curve={curve}"

    @staticmethod
    def crossfade(
        duration: float,
        curve1: str = "tri",
        curve2: str = "tri"
    ) -> str:
        """Generate FFmpeg filter for crossfade between two audio streams.

        Args:
            duration: Duration of the crossfade in seconds.
            curve1: Fade out curve for first audio.
            curve2: Fade in curve for second audio.

        Returns:
            FFmpeg acrossfade filter string.
        """
        return f"acrossfade=d={duration}:c1={curve1}:c2={curve2}"

    @staticmethod
    def volume_with_time_range(
        volume: float,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None
    ) -> str:
        """Generate FFmpeg volume filter with optional time range.

        Args:
            volume: Volume level (1.0 = original, 0.5 = half, 2.0 = double).
            start_time: Start time to apply volume change (None for from beginning).
            end_time: End time to apply volume change (None for until end).

        Returns:
            FFmpeg volume filter string with enable expression if time range specified.
        """
        filter_str = f"volume={volume}"

        if start_time is not None and end_time is not None:
            filter_str += f":enable='between(t,{start_time},{end_time})'"
        elif start_time is not None:
            filter_str += f":enable='gte(t,{start_time})'"
        elif end_time is not None:
            filter_str += f":enable='lte(t,{end_time})'"

        return filter_str

    @staticmethod
    def build_layered_audio_filter(
        layers: list[dict[str, Any]],
        output_label: str = "a"
    ) -> tuple[str, list[str]]:
        """Build complex filter for multiple audio layers.

        Args:
            layers: List of layer configurations, each containing:
                - input_index: Index of the input (0 for main video, 1+ for additional)
                - start_time: Start time in output timeline (optional)
                - end_time: End time in output timeline (optional)
                - volume: Volume level (default 1.0)
                - fade_in: Fade in duration (optional)
                - fade_out: Fade out duration (optional)
            output_label: Label for the final mixed output.

        Returns:
            Tuple of (filter_complex string, map_options list).
        """
        if not layers:
            return "", []

        filter_parts: list[str] = []
        layer_labels: list[str] = []

        for i, layer in enumerate(layers):
            input_idx = layer.get("input_index", 0)
            volume = layer.get("volume", 1.0)
            start_time = layer.get("start_time")
            fade_in = layer.get("fade_in", 0)
            fade_out = layer.get("fade_out", 0)
            duration = layer.get("duration")

            label = f"layer{i}"
            layer_labels.append(f"[{label}]")

            # Build filter chain for this layer
            filters: list[str] = []

            # Delay if start_time specified
            if start_time and start_time > 0:
                delay_ms = int(start_time * 1000)
                filters.append(f"adelay={delay_ms}|{delay_ms}")

            # Volume adjustment
            if volume != 1.0:
                filters.append(f"volume={volume}")

            # Fade in
            if fade_in > 0:
                filters.append(f"afade=t=in:st=0:d={fade_in}")

            # Fade out (need to calculate start time)
            if fade_out > 0 and duration:
                fade_out_start = duration - fade_out
                if fade_out_start > 0:
                    filters.append(f"afade=t=out:st={fade_out_start}:d={fade_out}")

            # Combine filters for this layer
            if filters:
                filter_chain = ",".join(filters)
                filter_parts.append(f"[{input_idx}:a]{filter_chain}[{label}]")
            else:
                filter_parts.append(f"[{input_idx}:a]acopy[{label}]")

        # Mix all layers together
        num_layers = len(layers)
        if num_layers > 1:
            mix_input = "".join(layer_labels)
            filter_parts.append(f"{mix_input}amix=inputs={num_layers}:duration=longest[{output_label}]")
        else:
            # Single layer, just rename the output
            filter_parts[-1] = filter_parts[-1].replace(f"[{layer_labels[0][1:-1]}]", f"[{output_label}]")

        filter_complex = ";".join(filter_parts)
        map_options = ["-map", "0:v", "-map", f"[{output_label}]"]

        return filter_complex, map_options
