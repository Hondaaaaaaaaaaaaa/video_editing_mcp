"""
VST3/VST2 plugin support using Pedalboard.

Provides capabilities to:
- Discover available VST plugins on the system
- Load and apply VST plugins to audio
- Get and set plugin parameters
"""

from __future__ import annotations

import os
import platform
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Optional


class VSTError(Exception):
    """Exception raised when VST processing fails."""

    pass


@dataclass
class VSTPluginInfo:
    """Information about a VST plugin."""

    name: str
    path: str
    plugin_type: str  # 'vst3' or 'vst2'
    manufacturer: Optional[str] = None
    version: Optional[str] = None


@dataclass
class VSTParameter:
    """Information about a VST plugin parameter."""

    name: str
    index: int
    min_value: float
    max_value: float
    default_value: float
    current_value: float
    label: str = ""  # Unit label (dB, Hz, ms, etc.)


class VSTProcessor:
    """Handles VST plugin loading and audio processing."""

    # Default VST search paths by platform
    VST_PATHS: dict[str, list[str]] = {
        "Windows": [
            r"C:\Program Files\Common Files\VST3",
            r"C:\Program Files\VSTPlugins",
            r"C:\Program Files (x86)\Common Files\VST3",
            r"C:\Program Files (x86)\VSTPlugins",
            os.path.expandvars(r"%LOCALAPPDATA%\Programs\Common\VST3"),
        ],
        "Darwin": [  # macOS
            "/Library/Audio/Plug-Ins/VST3",
            "/Library/Audio/Plug-Ins/VST",
            os.path.expanduser("~/Library/Audio/Plug-Ins/VST3"),
            os.path.expanduser("~/Library/Audio/Plug-Ins/VST"),
        ],
        "Linux": [
            os.path.expanduser("~/.vst3"),
            os.path.expanduser("~/.vst"),
            "/usr/lib/vst3",
            "/usr/lib/vst",
            "/usr/local/lib/vst3",
            "/usr/local/lib/vst",
        ],
    }

    def __init__(self) -> None:
        """Initialize VST processor."""
        self._check_pedalboard()

    def _check_pedalboard(self) -> None:
        """Check if Pedalboard is available."""
        import importlib.util

        if importlib.util.find_spec("pedalboard") is None:
            raise VSTError(
                "Pedalboard is not installed. Install it with: pip install pedalboard"
            )

    @classmethod
    def get_vst_search_paths(cls) -> list[str]:
        """Get VST search paths for the current platform.

        Returns:
            List of directory paths to search for VST plugins.
        """
        system = platform.system()
        paths = cls.VST_PATHS.get(system, [])
        # Filter to only existing directories
        return [p for p in paths if os.path.isdir(p)]

    @classmethod
    def discover_plugins(
        cls,
        search_paths: Optional[list[str]] = None,
        include_vst2: bool = True,
    ) -> list[VSTPluginInfo]:
        """Discover available VST plugins on the system.

        Args:
            search_paths: Custom paths to search. Uses default paths if None.
            include_vst2: Whether to include VST2 plugins (in addition to VST3).

        Returns:
            List of discovered plugin information.
        """
        if search_paths is None:
            search_paths = cls.get_vst_search_paths()

        plugins: list[VSTPluginInfo] = []
        seen_paths: set[str] = set()

        for search_path in search_paths:
            if not os.path.isdir(search_path):
                continue

            for root, dirs, files in os.walk(search_path):
                # Look for .vst3 directories/bundles
                for dirname in dirs:
                    if dirname.endswith(".vst3"):
                        full_path = os.path.join(root, dirname)
                        if full_path not in seen_paths:
                            seen_paths.add(full_path)
                            name = dirname[:-5]  # Remove .vst3
                            plugins.append(
                                VSTPluginInfo(
                                    name=name,
                                    path=full_path,
                                    plugin_type="vst3",
                                )
                            )

                # Look for .vst files (VST2 on some platforms)
                if include_vst2:
                    for dirname in dirs:
                        if dirname.endswith(".vst"):
                            full_path = os.path.join(root, dirname)
                            if full_path not in seen_paths:
                                seen_paths.add(full_path)
                                name = dirname[:-4]  # Remove .vst
                                plugins.append(
                                    VSTPluginInfo(
                                        name=name,
                                        path=full_path,
                                        plugin_type="vst2",
                                    )
                                )

                    # Look for .dll files on Windows (VST2)
                    if platform.system() == "Windows":
                        for filename in files:
                            if filename.endswith(".dll"):
                                full_path = os.path.join(root, filename)
                                if full_path not in seen_paths:
                                    seen_paths.add(full_path)
                                    name = filename[:-4]  # Remove .dll
                                    plugins.append(
                                        VSTPluginInfo(
                                            name=name,
                                            path=full_path,
                                            plugin_type="vst2",
                                        )
                                    )

        return sorted(plugins, key=lambda p: p.name.lower())

    @classmethod
    def find_plugin(cls, name: str) -> Optional[VSTPluginInfo]:
        """Find a plugin by name.

        Args:
            name: Plugin name (case-insensitive) or full path.

        Returns:
            Plugin info if found, None otherwise.
        """
        # If it's a path, check if it exists
        if os.path.exists(name):
            basename = os.path.basename(name)
            if basename.endswith(".vst3"):
                return VSTPluginInfo(
                    name=basename[:-5],
                    path=name,
                    plugin_type="vst3",
                )
            elif basename.endswith((".vst", ".dll")):
                return VSTPluginInfo(
                    name=basename.rsplit(".", 1)[0],
                    path=name,
                    plugin_type="vst2",
                )

        # Search in default paths
        plugins = cls.discover_plugins()
        name_lower = name.lower()

        for plugin in plugins:
            if plugin.name.lower() == name_lower:
                return plugin

        return None

    def load_plugin(
        self,
        plugin_path: str,
        sample_rate: float = 44100.0,
    ) -> Any:
        """Load a VST plugin.

        Args:
            plugin_path: Path to the plugin file.
            sample_rate: Sample rate for processing.

        Returns:
            Loaded Pedalboard plugin object.
        """
        from pedalboard import load_plugin

        try:
            plugin = load_plugin(plugin_path)
            return plugin
        except Exception as e:
            raise VSTError(f"Failed to load plugin '{plugin_path}': {e}")

    def get_plugin_parameters(
        self,
        plugin_path: str,
    ) -> dict[str, VSTParameter]:
        """Get available parameters for a VST plugin.

        Args:
            plugin_path: Path to the plugin file.

        Returns:
            Dictionary mapping parameter names to VSTParameter objects.
        """
        plugin = self.load_plugin(plugin_path)
        params: dict[str, VSTParameter] = {}

        # Pedalboard exposes parameters as attributes
        for i, name in enumerate(plugin.parameters.keys()):
            param = plugin.parameters[name]

            # Try to get range information
            try:
                min_val = param.min_value if hasattr(param, 'min_value') else 0.0
                max_val = param.max_value if hasattr(param, 'max_value') else 1.0
                default = getattr(param, 'default_value', (min_val + max_val) / 2)
                current = param.raw_value if hasattr(param, 'raw_value') else default
                label = getattr(param, 'label', '')
            except Exception:
                min_val, max_val, default, current, label = 0.0, 1.0, 0.5, 0.5, ''

            params[name] = VSTParameter(
                name=name,
                index=i,
                min_value=min_val,
                max_value=max_val,
                default_value=default,
                current_value=current,
                label=label,
            )

        return params

    def process_audio(
        self,
        audio_path: str,
        plugin_path: str,
        output_path: Optional[str] = None,
        parameters: Optional[dict[str, float]] = None,
        sample_rate: float = 44100.0,
        progress_callback: Optional[Callable[[float, str], None]] = None,
    ) -> str:
        """Process audio file through a VST plugin.

        Args:
            audio_path: Path to input audio file.
            plugin_path: Path to VST plugin.
            output_path: Path for output file. Uses temp file if None.
            parameters: Dictionary of parameter name -> value to set.
            sample_rate: Sample rate for processing.
            progress_callback: Optional callback(progress, message).

        Returns:
            Path to processed audio file.
        """
        from pedalboard import load_plugin
        from pedalboard.io import AudioFile

        if progress_callback:
            progress_callback(0.0, "Loading plugin...")

        # Load the plugin
        plugin = load_plugin(plugin_path)

        # Set parameters if provided
        if parameters:
            if progress_callback:
                progress_callback(0.1, "Setting plugin parameters...")

            for name, value in parameters.items():
                if hasattr(plugin, name):
                    setattr(plugin, name, value)
                elif name in plugin.parameters:
                    plugin.parameters[name].raw_value = value

        if progress_callback:
            progress_callback(0.2, "Processing audio...")

        # Determine output path
        if output_path is None:
            suffix = Path(audio_path).suffix or ".wav"
            fd, output_path = tempfile.mkstemp(suffix=suffix, prefix="vst_processed_")
            os.close(fd)

        # Process the audio
        with AudioFile(audio_path) as input_file:
            actual_sample_rate = input_file.samplerate
            num_channels = input_file.num_channels

            with AudioFile(
                output_path,
                "w",
                samplerate=actual_sample_rate,
                num_channels=num_channels,
            ) as output_file:
                # Process in chunks for memory efficiency
                chunk_size = actual_sample_rate  # 1 second chunks
                total_frames = input_file.frames
                frames_processed = 0

                while input_file.tell() < total_frames:
                    audio = input_file.read(chunk_size)
                    processed = plugin.process(audio, actual_sample_rate)
                    output_file.write(processed)

                    frames_processed += len(audio[0]) if audio.ndim > 1 else len(audio)
                    if progress_callback:
                        progress = 0.2 + 0.7 * (frames_processed / total_frames)
                        progress_callback(progress, "Processing audio...")

        if progress_callback:
            progress_callback(1.0, "Processing complete")

        return output_path

    def process_audio_segment(
        self,
        audio_path: str,
        plugin_path: str,
        start_time: float,
        end_time: float,
        output_path: Optional[str] = None,
        parameters: Optional[dict[str, float]] = None,
        progress_callback: Optional[Callable[[float, str], None]] = None,
    ) -> str:
        """Process only a segment of audio through a VST plugin.

        The segment is processed and then recombined with the original audio.

        Args:
            audio_path: Path to input audio file.
            plugin_path: Path to VST plugin.
            start_time: Start time of segment in seconds.
            end_time: End time of segment in seconds.
            output_path: Path for output file. Uses temp file if None.
            parameters: Dictionary of parameter name -> value to set.
            progress_callback: Optional callback(progress, message).

        Returns:
            Path to processed audio file.
        """
        from pedalboard import load_plugin
        from pedalboard.io import AudioFile

        if progress_callback:
            progress_callback(0.0, "Loading plugin...")

        plugin = load_plugin(plugin_path)

        if parameters:
            for name, value in parameters.items():
                if hasattr(plugin, name):
                    setattr(plugin, name, value)
                elif name in plugin.parameters:
                    plugin.parameters[name].raw_value = value

        if progress_callback:
            progress_callback(0.1, "Reading audio...")

        # Read the entire audio file
        with AudioFile(audio_path) as f:
            sample_rate = f.samplerate
            num_channels = f.num_channels
            audio = f.read(f.frames)

        # Calculate sample positions
        start_sample = int(start_time * sample_rate)
        end_sample = int(end_time * sample_rate)

        # Clamp to valid range
        start_sample = max(0, start_sample)
        end_sample = min(audio.shape[1] if audio.ndim > 1 else len(audio), end_sample)

        if progress_callback:
            progress_callback(0.3, "Processing segment...")

        # Extract and process segment
        if audio.ndim > 1:
            segment = audio[:, start_sample:end_sample]
        else:
            segment = audio[start_sample:end_sample]

        processed_segment = plugin.process(segment, sample_rate)

        if progress_callback:
            progress_callback(0.7, "Reconstructing audio...")

        # Replace segment in original audio
        if audio.ndim > 1:
            audio[:, start_sample:end_sample] = processed_segment
        else:
            audio[start_sample:end_sample] = processed_segment

        # Determine output path
        if output_path is None:
            suffix = Path(audio_path).suffix or ".wav"
            fd, output_path = tempfile.mkstemp(suffix=suffix, prefix="vst_segment_")
            os.close(fd)

        if progress_callback:
            progress_callback(0.9, "Saving audio...")

        # Write output
        with AudioFile(
            output_path,
            "w",
            samplerate=sample_rate,
            num_channels=num_channels,
        ) as f:
            f.write(audio)

        if progress_callback:
            progress_callback(1.0, "Complete")

        return output_path


def list_available_vst_plugins() -> list[dict[str, str]]:
    """List all available VST plugins on the system.

    Convenience function that returns plugins in a simple format.

    Returns:
        List of dicts with 'name', 'path', and 'type' keys.
    """
    try:
        plugins = VSTProcessor.discover_plugins()
        return [
            {"name": p.name, "path": p.path, "type": p.plugin_type}
            for p in plugins
        ]
    except VSTError:
        return []


def get_vst_plugin_parameters(plugin_path: str) -> dict[str, tuple[float, float, float]]:
    """Get available parameters for a VST plugin.

    Convenience function that returns parameters in a simple format.

    Args:
        plugin_path: Path to the plugin file.

    Returns:
        Dictionary mapping parameter names to (min, max, default) tuples.
    """
    try:
        processor = VSTProcessor()
        params = processor.get_plugin_parameters(plugin_path)
        return {
            name: (p.min_value, p.max_value, p.default_value)
            for name, p in params.items()
        }
    except VSTError:
        return {}
