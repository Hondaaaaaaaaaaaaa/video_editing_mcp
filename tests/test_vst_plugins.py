"""
Tests for VST plugin support using Pedalboard.

Note: These tests require the pedalboard package to be installed.
Tests will be skipped if pedalboard is not available.

Run with: uv run pytest tests/test_vst_plugins.py -v
"""

from __future__ import annotations

import os

import pytest

from conftest import requires_ffmpeg


def pedalboard_available() -> bool:
    """Check if Pedalboard is available."""
    import importlib.util

    return importlib.util.find_spec("pedalboard") is not None


requires_pedalboard = pytest.mark.skipif(
    not pedalboard_available(),
    reason="Pedalboard not installed"
)


@requires_ffmpeg
class TestVSTProcessor:
    """Tests for the VSTProcessor class."""

    def test_vst_processor_init(self) -> None:
        """VSTProcessor should initialize correctly or raise if pedalboard missing."""
        if not pedalboard_available():
            from video_editor.audio.vst_processor import VSTProcessor, VSTError

            with pytest.raises(VSTError) as exc_info:
                VSTProcessor()

            assert "pedalboard" in str(exc_info.value).lower()
        else:
            from video_editor.audio.vst_processor import VSTProcessor

            processor = VSTProcessor()
            assert processor is not None

    @requires_pedalboard
    def test_get_vst_search_paths(self) -> None:
        """Should return valid search paths for the current platform."""
        from video_editor.audio.vst_processor import VSTProcessor

        paths = VSTProcessor.get_vst_search_paths()

        assert isinstance(paths, list)
        # All returned paths should exist
        for path in paths:
            assert os.path.isdir(path)

    @requires_pedalboard
    def test_vst_paths_by_platform(self) -> None:
        """VST_PATHS should have entries for major platforms."""
        from video_editor.audio.vst_processor import VSTProcessor

        assert "Windows" in VSTProcessor.VST_PATHS
        assert "Darwin" in VSTProcessor.VST_PATHS  # macOS
        assert "Linux" in VSTProcessor.VST_PATHS

    @requires_pedalboard
    def test_discover_plugins(self) -> None:
        """Should discover plugins without error (may be empty)."""
        from video_editor.audio.vst_processor import VSTProcessor

        plugins = VSTProcessor.discover_plugins()

        assert isinstance(plugins, list)
        # Each plugin should have required fields
        for plugin in plugins:
            assert hasattr(plugin, "name")
            assert hasattr(plugin, "path")
            assert hasattr(plugin, "plugin_type")
            assert plugin.plugin_type in ("vst3", "vst2")

    @requires_pedalboard
    def test_discover_plugins_sorted(self) -> None:
        """Discovered plugins should be sorted by name."""
        from video_editor.audio.vst_processor import VSTProcessor

        plugins = VSTProcessor.discover_plugins()

        if len(plugins) > 1:
            names = [p.name.lower() for p in plugins]
            assert names == sorted(names)

    @requires_pedalboard
    def test_find_plugin_by_path(self, temp_dir: str) -> None:
        """Should find plugin by full path if it exists."""
        from video_editor.audio.vst_processor import VSTProcessor

        # This will return None for non-existent path
        result = VSTProcessor.find_plugin("/nonexistent/plugin.vst3")

        assert result is None  # Path doesn't exist

    @requires_pedalboard
    def test_find_plugin_by_name(self) -> None:
        """Should find plugin by name from discovered plugins."""
        from video_editor.audio.vst_processor import VSTProcessor

        # Get first available plugin (if any)
        plugins = VSTProcessor.discover_plugins()

        if plugins:
            plugin = plugins[0]
            found = VSTProcessor.find_plugin(plugin.name)

            assert found is not None
            assert found.name == plugin.name


@requires_ffmpeg
class TestVSTConvenienceFunctions:
    """Tests for VST convenience functions."""

    def test_list_available_vst_plugins(self) -> None:
        """Should list plugins in simple dict format."""
        from video_editor.audio.vst_processor import list_available_vst_plugins

        plugins = list_available_vst_plugins()

        assert isinstance(plugins, list)
        for plugin in plugins:
            assert isinstance(plugin, dict)
            assert "name" in plugin
            assert "path" in plugin
            assert "type" in plugin

    @requires_pedalboard
    def test_get_vst_plugin_parameters_nonexistent(self) -> None:
        """Should return empty dict for non-existent plugin."""
        from video_editor.audio.vst_processor import get_vst_plugin_parameters

        params = get_vst_plugin_parameters("/nonexistent/plugin.vst3")

        assert params == {}


@requires_ffmpeg
@requires_pedalboard
class TestVSTPluginProcessing:
    """Tests for actual VST plugin processing (requires plugins to be installed)."""

    def test_process_audio_with_plugin(
        self, sample_video: str, temp_dir: str
    ) -> None:
        """Process audio with a VST plugin."""
        from video_editor.audio.vst_processor import (
            VSTProcessor,
            list_available_vst_plugins,
        )

        plugins = list_available_vst_plugins()

        if not plugins:
            pytest.skip("No VST plugins available on this system")

        # Extract audio first
        audio_path = os.path.join(temp_dir, "audio.wav")
        import subprocess
        cmd = [
            "ffmpeg", "-y",
            "-i", sample_video,
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "44100",
            "-ac", "2",
            audio_path
        ]
        subprocess.run(cmd, capture_output=True)

        # Process with first available plugin
        processor = VSTProcessor()
        output_path = processor.process_audio(
            audio_path=audio_path,
            plugin_path=plugins[0]["path"],
        )

        assert os.path.exists(output_path)


@requires_ffmpeg
class TestVideoPipelineVSTMethods:
    """Tests for VST methods on VideoPipeline."""

    def test_list_available_vst_plugins_static(self) -> None:
        """VideoPipeline.list_available_vst_plugins should work."""
        from video_editor.pipeline import VideoPipeline

        plugins = VideoPipeline.list_available_vst_plugins()

        assert isinstance(plugins, list)

    @requires_pedalboard
    def test_get_vst_plugin_parameters_static(self) -> None:
        """VideoPipeline.get_vst_plugin_parameters should work."""
        from video_editor.pipeline import VideoPipeline
        from video_editor.audio.vst_processor import list_available_vst_plugins

        plugins = list_available_vst_plugins()

        if not plugins:
            pytest.skip("No VST plugins available")

        params = VideoPipeline.get_vst_plugin_parameters(plugins[0]["path"])

        assert isinstance(params, dict)
        # Each parameter should be a tuple of (min, max, default)
        for name, values in params.items():
            assert isinstance(values, tuple)
            assert len(values) == 3

    @requires_pedalboard
    def test_apply_vst_plugin(self, sample_video: str, temp_dir: str) -> None:
        """Apply VST plugin to video audio."""
        from video_editor.pipeline import VideoPipeline
        from video_editor.audio.vst_processor import list_available_vst_plugins

        plugins = list_available_vst_plugins()

        if not plugins:
            pytest.skip("No VST plugins available")

        pipeline = VideoPipeline(sample_video)
        pipeline.apply_vst_plugin(plugins[0]["path"])
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    @requires_pedalboard
    def test_apply_vst_plugin_with_params(
        self, sample_video: str, temp_dir: str
    ) -> None:
        """Apply VST plugin with parameters."""
        from video_editor.pipeline import VideoPipeline
        from video_editor.audio.vst_processor import (
            list_available_vst_plugins,
            get_vst_plugin_parameters,
        )

        plugins = list_available_vst_plugins()

        if not plugins:
            pytest.skip("No VST plugins available")

        # Get parameters for first plugin
        params = get_vst_plugin_parameters(plugins[0]["path"])

        if not params:
            pytest.skip("Plugin has no adjustable parameters")

        # Use the first parameter with its default value
        param_name = list(params.keys())[0]
        param_values = params[param_name]

        pipeline = VideoPipeline(sample_video)
        pipeline.apply_vst_plugin(
            plugins[0]["path"],
            params={param_name: param_values[2]},  # Use default value
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    @requires_pedalboard
    def test_apply_vst_plugin_segment(
        self, sample_video: str, temp_dir: str
    ) -> None:
        """Apply VST plugin to specific segment."""
        from video_editor.pipeline import VideoPipeline
        from video_editor.audio.vst_processor import list_available_vst_plugins

        plugins = list_available_vst_plugins()

        if not plugins:
            pytest.skip("No VST plugins available")

        pipeline = VideoPipeline(sample_video)
        pipeline.apply_vst_plugin(
            plugins[0]["path"],
            start_time=1.0,
            end_time=3.0,
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    @requires_pedalboard
    def test_apply_vst_plugin_method_chaining(self, sample_video: str) -> None:
        """apply_vst_plugin should return self for chaining."""
        from video_editor.pipeline import VideoPipeline
        from video_editor.audio.vst_processor import list_available_vst_plugins

        plugins = list_available_vst_plugins()

        if not plugins:
            pytest.skip("No VST plugins available")

        pipeline = VideoPipeline(sample_video)
        result = pipeline.apply_vst_plugin(plugins[0]["path"])

        assert result is pipeline

    @requires_pedalboard
    def test_apply_vst_plugin_operation_tracked(self, sample_video: str) -> None:
        """VST plugin application should be tracked."""
        from video_editor.pipeline import VideoPipeline
        from video_editor.audio.vst_processor import list_available_vst_plugins

        plugins = list_available_vst_plugins()

        if not plugins:
            pytest.skip("No VST plugins available")

        pipeline = VideoPipeline(sample_video)
        pipeline.apply_vst_plugin(
            plugins[0]["path"],
            start_time=1.0,
            end_time=3.0,
            params={"threshold": -20},
        )

        ops = [op for op in pipeline._operations if op["type"] == "apply_vst_plugin"]
        assert len(ops) == 1
        assert ops[0]["start_time"] == 1.0
        assert ops[0]["end_time"] == 3.0
        assert ops[0]["params"] == {"threshold": -20}

    def test_apply_vst_plugin_not_found(self, sample_video: str) -> None:
        """Should raise error for non-existent plugin."""
        from video_editor.pipeline import VideoPipeline

        if not pedalboard_available():
            pytest.skip("Pedalboard not installed")

        from video_editor.audio.vst_processor import VSTError

        pipeline = VideoPipeline(sample_video)

        with pytest.raises(VSTError):
            pipeline.apply_vst_plugin("/nonexistent/plugin.vst3")
