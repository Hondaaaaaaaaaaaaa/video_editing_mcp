"""
Tests for scene detection.

TDD: These tests must FAIL before implementation.
Run with: uv run pytest tests/test_scene_detection.py -v
"""

from __future__ import annotations

import os
import subprocess

import pytest

from tests.conftest import requires_ffmpeg, get_video_duration


@pytest.fixture
def video_with_cuts(temp_dir: str) -> str:
    """Create a video with distinct scene cuts."""
    output_path = os.path.join(temp_dir, "cuts.mp4")

    # Create 3 different colored segments and concat
    segments = []
    colors = ["red", "blue", "green"]
    for i, color in enumerate(colors):
        seg_path = os.path.join(temp_dir, f"seg_{i}.mp4")
        cmd: list[str] = [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c={color}:s=640x480:d=3:r=30",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=3",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-c:a",
            "aac",
            seg_path,
        ]
        subprocess.run(cmd, capture_output=True)
        segments.append(seg_path)

    # Concat segments
    concat_file = os.path.join(temp_dir, "concat.txt")
    with open(concat_file, "w") as f:
        for seg in segments:
            f.write(f"file '{seg}'\n")

    cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_file, "-c", "copy", output_path]
    subprocess.run(cmd, capture_output=True)
    return output_path


@requires_ffmpeg
class TestSceneDetection:
    """Tests for scene detection - must fail before implementation."""

    def test_detect_scenes_returns_timestamps(self, video_with_cuts: str) -> None:
        """Scene detection should return cut timestamps."""
        from video_editor.analysis import detect_scenes

        scenes = detect_scenes(video_with_cuts, threshold=30.0)

        assert isinstance(scenes, list)
        assert len(scenes) > 0

        for scene in scenes:
            assert "start" in scene
            assert "end" in scene
            assert scene["end"] > scene["start"]

    def test_detect_scenes_finds_cuts(self, video_with_cuts: str) -> None:
        """Should detect the scene cuts in test video."""
        from video_editor.analysis import detect_scenes

        scenes = detect_scenes(video_with_cuts, threshold=30.0)

        # Our test video has 3 segments of 3s each = 9s total
        # Should detect 3 scenes
        assert len(scenes) >= 2  # At least 2 cuts detected

    def test_detect_scenes_respects_threshold(self, video_with_cuts: str) -> None:
        """Higher threshold should detect fewer scenes."""
        from video_editor.analysis import detect_scenes

        scenes_low = detect_scenes(video_with_cuts, threshold=20.0)
        scenes_high = detect_scenes(video_with_cuts, threshold=50.0)

        # Higher threshold = fewer or equal scenes
        assert len(scenes_high) <= len(scenes_low)

    def test_detect_scenes_min_length(self, video_with_cuts: str) -> None:
        """Min scene length should filter short scenes."""
        from video_editor.analysis import detect_scenes

        scenes = detect_scenes(
            video_with_cuts,
            threshold=30.0,
            min_scene_length=2.0,  # At least 2 seconds
        )

        for scene in scenes:
            duration = scene["end"] - scene["start"]
            assert duration >= 2.0

    def test_detect_scenes_no_cuts(self, sample_video: str) -> None:
        """Video without cuts should return single scene."""
        from video_editor.analysis import detect_scenes

        scenes = detect_scenes(sample_video, threshold=30.0)

        # Single continuous video = 1 scene
        assert len(scenes) == 1


@requires_ffmpeg
class TestSceneSplit:
    """Tests for splitting video by scenes - must fail before implementation."""

    def test_split_by_scenes(self, video_with_cuts: str, temp_dir: str) -> None:
        """Split video should create separate files per scene."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(video_with_cuts)
        outputs = pipeline.split_by_scenes(threshold=30.0, output_dir=temp_dir)

        assert len(outputs) > 1
        for output in outputs:
            assert os.path.exists(output)
            duration = get_video_duration(output)
            assert duration is not None
            assert duration > 0

    def test_split_by_scenes_with_naming(self, video_with_cuts: str, temp_dir: str) -> None:
        """Split should use sensible naming."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(video_with_cuts)
        outputs = pipeline.split_by_scenes(threshold=30.0, output_dir=temp_dir, prefix="scene_")

        for i, output in enumerate(outputs):
            assert f"scene_{i + 1}" in os.path.basename(output)

    def test_split_by_scenes_returns_metadata(self, video_with_cuts: str, temp_dir: str) -> None:
        """Split should return scene metadata."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(video_with_cuts)
        result = pipeline.split_by_scenes(threshold=30.0, output_dir=temp_dir, return_metadata=True)

        assert "scenes" in result
        assert "output_files" in result

        for scene in result["scenes"]:
            assert "start" in scene
            assert "end" in scene
            assert "output" in scene


@requires_ffmpeg
class TestAutoChapter:
    """Tests for auto-chaptering - must fail before implementation."""

    def test_generate_chapters(self, video_with_cuts: str) -> None:
        """Generate chapter markers from scene detection."""
        from video_editor.analysis import generate_chapters

        chapters = generate_chapters(video_with_cuts, threshold=30.0)

        assert isinstance(chapters, list)
        assert len(chapters) > 0

        for chapter in chapters:
            assert "title" in chapter
            assert "start" in chapter
            assert "end" in chapter

    def test_generate_chapters_custom_titles(self, video_with_cuts: str) -> None:
        """Generate chapters with custom title pattern."""
        from video_editor.analysis import generate_chapters

        chapters = generate_chapters(video_with_cuts, threshold=30.0, title_pattern="Part {n}")

        assert chapters[0]["title"] == "Part 1"
        assert chapters[1]["title"] == "Part 2"

    def test_export_chapters_ffmetadata(self, video_with_cuts: str, temp_dir: str) -> None:
        """Export chapters as FFmpeg metadata."""
        from video_editor.analysis import generate_chapters, export_chapters_ffmetadata

        chapters = generate_chapters(video_with_cuts, threshold=30.0)
        metadata_path = os.path.join(temp_dir, "chapters.txt")

        export_chapters_ffmetadata(chapters, metadata_path)

        assert os.path.exists(metadata_path)
        with open(metadata_path) as f:
            content = f.read()
        assert ";FFMETADATA1" in content
        assert "[CHAPTER]" in content
