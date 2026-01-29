"""
Tests for batch processing.

TDD: These tests must FAIL before implementation.
Run with: uv run pytest tests/test_batch.py -v
"""

from __future__ import annotations

import os
import subprocess
import time


from tests.conftest import requires_ffmpeg, get_video_resolution, get_video_duration


def create_test_videos(temp_dir: str, count: int = 3) -> list[str]:
    """Create multiple test videos."""
    videos = []
    for i in range(count):
        path = os.path.join(temp_dir, f"video_{i}.mp4")
        cmd: list[str] = [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=duration=3:size=640x480:rate=30",
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
            path,
        ]
        subprocess.run(cmd, capture_output=True)
        videos.append(path)
    return videos


@requires_ffmpeg
class TestBatchProcessing:
    """Tests for batch processing - must fail before implementation."""

    def test_batch_process_multiple_videos(self, temp_dir: str) -> None:
        """Batch process should handle multiple videos."""
        from video_editor.batch import batch_process

        videos = create_test_videos(temp_dir, count=3)

        results = batch_process(
            input_files=videos,
            operations=[{"type": "trim", "start": 0, "end": 2}, {"type": "scale", "width": 320, "height": 240}],
            output_dir=temp_dir,
        )

        assert len(results) == 3
        for result in results:
            assert result.get("success") is True
            assert os.path.exists(result["output"])
            assert get_video_resolution(result["output"]) == "320x240"

    def test_batch_process_single_operation(self, temp_dir: str) -> None:
        """Batch process with single operation."""
        from video_editor.batch import batch_process

        videos = create_test_videos(temp_dir, count=2)

        results = batch_process(input_files=videos, operations=[{"type": "trim", "start": 0, "end": 1}], output_dir=temp_dir)

        assert len(results) == 2
        for result in results:
            assert result.get("success") is True
            duration = get_video_duration(result["output"])
            assert duration is not None
            assert abs(duration - 1.0) < 0.5

    def test_batch_process_parallel_execution(self, temp_dir: str) -> None:
        """Batch process should run in parallel."""
        from video_editor.batch import batch_process

        videos = create_test_videos(temp_dir, count=4)

        start = time.time()
        results = batch_process(
            input_files=videos, operations=[{"type": "trim", "start": 0, "end": 1}], output_dir=temp_dir, parallel=True, max_workers=4
        )
        _elapsed = time.time() - start  # noqa: F841

        assert len(results) == 4
        # All should succeed
        for result in results:
            assert result.get("success") is True

    def test_batch_process_sequential(self, temp_dir: str) -> None:
        """Batch process sequential execution."""
        from video_editor.batch import batch_process

        videos = create_test_videos(temp_dir, count=2)

        results = batch_process(input_files=videos, operations=[{"type": "scale", "width": 320, "height": 240}], output_dir=temp_dir, parallel=False)

        assert len(results) == 2

    def test_batch_process_returns_errors(self, temp_dir: str) -> None:
        """Batch process should report errors without stopping."""
        from video_editor.batch import batch_process

        videos = create_test_videos(temp_dir, count=2)
        videos.append("/nonexistent/video.mp4")  # Invalid file

        results = batch_process(input_files=videos, operations=[{"type": "trim", "start": 0, "end": 1}], output_dir=temp_dir)

        # Should have 2 successes and 1 error
        successes = [r for r in results if r.get("success")]
        errors = [r for r in results if r.get("error")]

        assert len(successes) == 2
        assert len(errors) == 1

    def test_batch_process_custom_output_names(self, temp_dir: str) -> None:
        """Batch process with custom output naming."""
        from video_editor.batch import batch_process

        videos = create_test_videos(temp_dir, count=2)

        results = batch_process(
            input_files=videos,
            operations=[{"type": "scale", "width": 320, "height": 240}],
            output_dir=temp_dir,
            output_prefix="processed_",
            output_suffix="_small",
        )

        for result in results:
            assert "processed_" in os.path.basename(result["output"])
            assert "_small" in os.path.basename(result["output"])


@requires_ffmpeg
class TestBatchWatermark:
    """Tests for batch watermarking - must fail before implementation."""

    def test_batch_watermark(self, temp_dir: str, sample_image: str) -> None:
        """Batch watermark should apply to all videos."""
        from video_editor.batch import batch_watermark

        videos = create_test_videos(temp_dir, count=3)

        results = batch_watermark(input_files=videos, watermark_image=sample_image, position="bottom-right", output_dir=temp_dir)

        assert len(results) == 3
        for result in results:
            assert result.get("success") is True
            assert os.path.exists(result["output"])

    def test_batch_watermark_with_opacity(self, temp_dir: str, sample_image: str) -> None:
        """Batch watermark with custom opacity."""
        from video_editor.batch import batch_watermark

        videos = create_test_videos(temp_dir, count=2)

        results = batch_watermark(input_files=videos, watermark_image=sample_image, position="top-left", opacity=0.5, output_dir=temp_dir)

        assert len(results) == 2

    def test_batch_watermark_with_scale(self, temp_dir: str, sample_image: str) -> None:
        """Batch watermark with scaled watermark."""
        from video_editor.batch import batch_watermark

        videos = create_test_videos(temp_dir, count=2)

        results = batch_watermark(
            input_files=videos,
            watermark_image=sample_image,
            position="bottom-right",
            scale=0.2,  # 20% of video width
            output_dir=temp_dir,
        )

        assert len(results) == 2

    def test_batch_watermark_all_positions(self, temp_dir: str, sample_image: str) -> None:
        """Batch watermark should support all position presets."""
        from video_editor.batch import batch_watermark

        videos = create_test_videos(temp_dir, count=4)

        positions = ["top-left", "top-right", "bottom-left", "bottom-right"]

        for video, position in zip(videos, positions):
            results = batch_watermark(input_files=[video], watermark_image=sample_image, position=position, output_dir=temp_dir)
            assert results[0].get("success") is True


@requires_ffmpeg
class TestBatchConvert:
    """Tests for batch conversion - must fail before implementation."""

    def test_batch_convert_format(self, temp_dir: str) -> None:
        """Batch convert to different format."""
        from video_editor.batch import batch_convert

        videos = create_test_videos(temp_dir, count=2)

        results = batch_convert(input_files=videos, output_format="mkv", output_dir=temp_dir)

        assert len(results) == 2
        for result in results:
            assert result["output"].endswith(".mkv")

    def test_batch_convert_resolution(self, temp_dir: str) -> None:
        """Batch convert to different resolution."""
        from video_editor.batch import batch_convert

        videos = create_test_videos(temp_dir, count=2)

        results = batch_convert(input_files=videos, resolution=(1280, 720), output_dir=temp_dir)

        for result in results:
            assert get_video_resolution(result["output"]) == "1280x720"

    def test_batch_convert_with_preset(self, temp_dir: str) -> None:
        """Batch convert with encoding preset."""
        from video_editor.batch import batch_convert

        videos = create_test_videos(temp_dir, count=2)

        results = batch_convert(input_files=videos, preset="youtube", output_dir=temp_dir)

        assert len(results) == 2
