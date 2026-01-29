"""
Tests for templates and EDL export.

TDD: These tests must FAIL before implementation.
Run with: uv run pytest tests/test_templates_edl.py -v
"""

from __future__ import annotations

import json
import os

import pytest

from tests.conftest import requires_ffmpeg, get_video_duration, get_video_resolution


class TestTemplates:
    """Tests for template system - must fail before implementation."""

    def test_save_template(self, temp_dir: str) -> None:
        """Save template should persist operations."""
        from video_editor.templates import save_template, load_template

        operations = [
            {"type": "trim", "start": 0, "end": 10},
            {"type": "scale", "width": 1920, "height": 1080},
            {"type": "loudness_normalization", "target_lufs": -14},
        ]

        save_template("youtube_prep", operations, template_dir=temp_dir)

        loaded = load_template("youtube_prep", template_dir=temp_dir)
        assert loaded == operations

    def test_load_nonexistent_template(self, temp_dir: str) -> None:
        """Loading nonexistent template should raise error."""
        from video_editor.templates import load_template

        with pytest.raises(FileNotFoundError):
            load_template("nonexistent", template_dir=temp_dir)

    def test_list_templates(self, temp_dir: str) -> None:
        """List available templates."""
        from video_editor.templates import save_template, list_templates

        save_template("template_a", [], template_dir=temp_dir)
        save_template("template_b", [], template_dir=temp_dir)

        templates = list_templates(template_dir=temp_dir)

        assert "template_a" in templates
        assert "template_b" in templates

    def test_delete_template(self, temp_dir: str) -> None:
        """Delete a template."""
        from video_editor.templates import save_template, delete_template, list_templates

        save_template("to_delete", [], template_dir=temp_dir)
        assert "to_delete" in list_templates(template_dir=temp_dir)

        delete_template("to_delete", template_dir=temp_dir)
        assert "to_delete" not in list_templates(template_dir=temp_dir)

    def test_template_with_metadata(self, temp_dir: str) -> None:
        """Template with description and metadata."""
        from video_editor.templates import save_template, load_template

        operations = [{"type": "trim", "start": 0, "end": 5}]
        metadata = {"description": "Quick 5-second clip", "author": "test", "version": "1.0"}

        save_template("with_meta", operations, template_dir=temp_dir, metadata=metadata)

        result = load_template("with_meta", template_dir=temp_dir, include_metadata=True)

        assert result["operations"] == operations
        assert result["metadata"]["description"] == "Quick 5-second clip"


@requires_ffmpeg
class TestApplyTemplate:
    """Tests for applying templates - must fail before implementation."""

    def test_apply_template(self, sample_video: str, temp_dir: str) -> None:
        """Apply template should execute all operations."""
        from video_editor.pipeline import VideoPipeline
        from video_editor.templates import save_template

        # Save a template
        operations = [{"type": "trim", "start": 1, "end": 4}, {"type": "scale", "width": 320, "height": 240}]
        save_template("test_template", operations, template_dir=temp_dir)

        # Apply it
        pipeline = VideoPipeline(sample_video)
        pipeline.apply_template("test_template", template_dir=temp_dir)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        duration = get_video_duration(output)
        assert duration is not None
        assert abs(duration - 3.0) < 0.5
        assert get_video_resolution(output) == "320x240"

    def test_apply_template_with_overrides(self, sample_video: str, temp_dir: str) -> None:
        """Apply template with parameter overrides."""
        from video_editor.pipeline import VideoPipeline
        from video_editor.templates import save_template

        operations = [{"type": "trim", "start": 0, "end": "${duration}"}, {"type": "scale", "width": "${width}", "height": "${height}"}]
        save_template("parametric", operations, template_dir=temp_dir)

        pipeline = VideoPipeline(sample_video)
        pipeline.apply_template("parametric", template_dir=temp_dir, overrides={"duration": 2, "width": 640, "height": 360})
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@requires_ffmpeg
class TestEDLExport:
    """Tests for EDL export - must fail before implementation."""

    def test_export_edl_basic(self, sample_video: str, temp_dir: str) -> None:
        """Export timeline as EDL."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_trim(start_time=1.0, end_time=4.0)

        edl_path = os.path.join(temp_dir, "timeline.edl")
        pipeline.export_edl(edl_path)

        assert os.path.exists(edl_path)

        with open(edl_path) as f:
            content = f.read()

        # EDL should contain standard markers
        assert "TITLE:" in content or "FCM:" in content

    def test_export_edl_with_cuts(self, sample_video: str, temp_dir: str) -> None:
        """EDL with multiple cuts."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_segment_deletion(start_time=2.0, end_time=3.0)

        edl_path = os.path.join(temp_dir, "timeline.edl")
        pipeline.export_edl(edl_path)

        assert os.path.exists(edl_path)

    def test_export_edl_cmx3600_format(self, sample_video: str, temp_dir: str) -> None:
        """EDL in CMX 3600 format."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_trim(start_time=0.5, end_time=4.5)

        edl_path = os.path.join(temp_dir, "timeline.edl")
        pipeline.export_edl(edl_path, format="cmx3600")

        with open(edl_path) as f:
            content = f.read()

        # CMX 3600 specific markers
        assert "001" in content  # Edit number


@requires_ffmpeg
class TestTimelineJSON:
    """Tests for JSON timeline export - must fail before implementation."""

    def test_export_timeline_json(self, sample_video: str, temp_dir: str) -> None:
        """Export timeline as JSON."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_trim(start_time=1.0, end_time=4.0)
        pipeline.add_scale(width=1920, height=1080)

        json_path = os.path.join(temp_dir, "timeline.json")
        pipeline.export_timeline_json(json_path)

        assert os.path.exists(json_path)

        with open(json_path) as f:
            data = json.load(f)

        assert "operations" in data
        assert len(data["operations"]) == 2

    def test_export_timeline_json_with_metadata(self, sample_video: str, temp_dir: str) -> None:
        """JSON export with metadata."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_trim(start_time=1.0, end_time=4.0)

        json_path = os.path.join(temp_dir, "timeline.json")
        pipeline.export_timeline_json(json_path, include_metadata=True)

        with open(json_path) as f:
            data = json.load(f)

        assert "source" in data
        assert "duration" in data

    def test_import_timeline_json(self, sample_video: str, temp_dir: str) -> None:
        """Import timeline from JSON."""
        from video_editor.pipeline import VideoPipeline

        # Create JSON timeline
        timeline = {
            "source": sample_video,
            "operations": [{"type": "trim", "start_time": 1.0, "end_time": 3.0}, {"type": "scale", "width": 320, "height": 240}],
        }
        json_path = os.path.join(temp_dir, "timeline.json")
        with open(json_path, "w") as f:
            json.dump(timeline, f)

        # Import and render
        pipeline = VideoPipeline.from_timeline_json(json_path)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@requires_ffmpeg
class TestProjectSave:
    """Tests for project save/load - must fail before implementation."""

    def test_save_project(self, sample_video: str, temp_dir: str) -> None:
        """Save project state."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_trim(start_time=1.0, end_time=4.0)
        pipeline.add_scale(width=640, height=360)

        project_path = os.path.join(temp_dir, "project.vemcp")
        pipeline.save_project(project_path)

        assert os.path.exists(project_path)

    def test_load_project(self, sample_video: str, temp_dir: str) -> None:
        """Load project and continue editing."""
        from video_editor.pipeline import VideoPipeline

        # Create and save project
        pipeline = VideoPipeline(sample_video)
        pipeline.add_trim(start_time=1.0, end_time=4.0)

        project_path = os.path.join(temp_dir, "project.vemcp")
        pipeline.save_project(project_path)

        # Load and add more operations
        loaded_pipeline = VideoPipeline.load_project(project_path)
        loaded_pipeline.add_scale(width=320, height=240)
        output = loaded_pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        assert get_video_resolution(output) == "320x240"
