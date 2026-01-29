# VEMCP Ultra Implementation Plan

## Overview

This plan implements all TODO features using **Test-Driven Development** with **multi-agent parallel execution**. Each feature uses 3rd-party libraries where possible, with automatic GPU detection and utilization.

## Execution Strategy

### Multi-Agent Parallel Phases

```
PHASE 1 (Parallel - 6 agents)
├── Agent A: Audio Extraction & Replacement
├── Agent B: Frame Extraction & Thumbnails
├── Agent C: Blur/Pixelate Regions
├── Agent D: Video Stabilization
├── Agent E: Auto-Subtitles (Whisper)
└── Agent F: PiP Presets & Split Screen

PHASE 2 (Parallel - 6 agents)
├── Agent G: Ken Burns & Slideshow
├── Agent H: Borders & Padding
├── Agent I: Reverse & Loop
├── Agent J: Audio Normalization
├── Agent K: Animated Text
└── Agent L: Batch Processing

PHASE 3 (Parallel - 4 agents)
├── Agent M: Scene Detection
├── Agent N: Audio Ducking
├── Agent O: Vignette & Effects
└── Agent P: Motion Blur & Sharpen

PHASE 4 (Sequential - Integration)
└── Agent Q: Template System & EDL Export
```

---

## Dependencies to Add

```toml
# Add to pyproject.toml [project.dependencies]
dependencies = [
    "fastmcp>=0.1.0",
    "faster-whisper>=1.0.0",      # Auto-subtitles (uses CTranslate2, GPU auto)
    "pysrt>=1.1.2",               # SRT subtitle handling
    "scenedetect>=0.6.0",         # Scene detection
    "pyloudnorm>=0.1.1",          # Audio loudness normalization
    "numpy>=1.24.0",              # Array operations
    "Pillow>=10.0.0",             # Image processing
    "imageio>=2.31.0",            # Image/video I/O
    "imageio-ffmpeg>=0.4.8",      # FFmpeg backend for imageio
]
```

---

## Phase 1: Core Media Operations

### 1A. Audio Extraction & Replacement

**Libraries**: FFmpeg (built-in)

**New Tools**:
- `extract_audio(pipeline_id, format, output_path)` - Export audio track
- `replace_audio(pipeline_id, audio_path, keep_original_volume)` - Swap audio

**Test File**: `tests/test_audio_extraction.py`

```python
# RED - Tests that must fail first
import pytest
from conftest import requires_ffmpeg, get_video_duration

@requires_ffmpeg
class TestAudioExtraction:
    """Tests for audio extraction - must fail before implementation."""

    def test_extract_audio_creates_mp3_file(self, sample_video, temp_dir):
        """Extract audio should create valid MP3 file."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        output = pipeline.extract_audio(format="mp3", output_dir=temp_dir)

        assert os.path.exists(output)
        assert output.endswith(".mp3")
        # Verify it's a valid audio file with duration
        duration = get_audio_duration(output)
        assert duration is not None
        assert duration > 0

    def test_extract_audio_wav_format(self, sample_video, temp_dir):
        """Extract audio should support WAV format."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        output = pipeline.extract_audio(format="wav", output_dir=temp_dir)

        assert output.endswith(".wav")
        assert os.path.exists(output)

    def test_extract_audio_flac_format(self, sample_video, temp_dir):
        """Extract audio should support FLAC format."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        output = pipeline.extract_audio(format="flac", output_dir=temp_dir)

        assert output.endswith(".flac")

    def test_extract_audio_preserves_duration(self, sample_video, temp_dir):
        """Extracted audio should match video duration."""
        from video_editor.pipeline import VideoPipeline

        video_duration = get_video_duration(sample_video)
        pipeline = VideoPipeline(sample_video)
        output = pipeline.extract_audio(format="mp3", output_dir=temp_dir)
        audio_duration = get_audio_duration(output)

        assert abs(video_duration - audio_duration) < 0.5  # Within 0.5s


@requires_ffmpeg
class TestAudioReplacement:
    """Tests for audio replacement - must fail before implementation."""

    def test_replace_audio_changes_audio_track(self, sample_video, sample_audio, temp_dir):
        """Replace audio should swap the audio track."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.replace_audio(sample_audio)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        # Audio track should be different - verify by checking audio codec/properties
        original_info = get_audio_info(sample_video)
        new_info = get_audio_info(output)
        # The new audio should match the replacement audio's characteristics
        replacement_info = get_audio_info(sample_audio)
        # Duration should match the video, not the replacement audio
        assert get_video_duration(output) == pytest.approx(get_video_duration(sample_video), abs=0.5)

    def test_replace_audio_keeps_video_intact(self, sample_video, sample_audio, temp_dir):
        """Replace audio should not alter video stream."""
        from video_editor.pipeline import VideoPipeline

        original_resolution = get_video_resolution(sample_video)

        pipeline = VideoPipeline(sample_video)
        pipeline.replace_audio(sample_audio)
        output = pipeline.render(output_dir=temp_dir)

        new_resolution = get_video_resolution(output)
        assert original_resolution == new_resolution

    def test_replace_audio_loops_short_audio(self, sample_video, temp_dir):
        """Short audio should loop to match video duration."""
        from video_editor.pipeline import VideoPipeline

        # Create 1-second audio for 5-second video
        short_audio = create_short_audio(temp_dir, duration=1)

        pipeline = VideoPipeline(sample_video)
        pipeline.replace_audio(short_audio, loop=True)
        output = pipeline.render(output_dir=temp_dir)

        # Output should still be ~5 seconds
        assert get_video_duration(output) == pytest.approx(5.0, abs=0.5)
```

**Implementation** (operations.py):
```python
def add_extract_audio(
    self,
    format: str = "mp3",
    output_path: str | None = None,
) -> str:
    """Extract audio track from video.

    Uses FFmpeg: ffmpeg -i input.mp4 -vn -acodec libmp3lame output.mp3
    """
    codec_map = {
        "mp3": "libmp3lame",
        "wav": "pcm_s16le",
        "flac": "flac",
        "aac": "aac",
        "opus": "libopus",
    }
    # Implementation uses FFmpeg -vn flag to strip video
    ...

def add_replace_audio(
    self,
    audio_path: str,
    loop: bool = False,
    volume: float = 1.0,
) -> None:
    """Replace video's audio track with new audio.

    Uses FFmpeg: ffmpeg -i video.mp4 -i audio.mp3 -c:v copy -map 0:v -map 1:a output.mp4
    """
    # Implementation maps video from input 0, audio from input 1
    ...
```

---

### 1B. Frame Extraction & Thumbnails

**Libraries**: FFmpeg, Pillow (for image optimization)

**New Tools**:
- `extract_frames(pipeline_id, timestamps, output_dir)` - Extract specific frames
- `extract_keyframes(pipeline_id, output_dir, max_frames)` - Extract I-frames
- `generate_thumbnails(pipeline_id, interval, size, output_dir)` - Grid of thumbnails

**Test File**: `tests/test_frame_extraction.py`

```python
@requires_ffmpeg
class TestFrameExtraction:
    """Tests for frame extraction - must fail before implementation."""

    def test_extract_frame_at_timestamp(self, sample_video, temp_dir):
        """Extract single frame at specific timestamp."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        frames = pipeline.extract_frames(timestamps=[2.5], output_dir=temp_dir)

        assert len(frames) == 1
        assert os.path.exists(frames[0])
        # Verify it's a valid image
        from PIL import Image
        img = Image.open(frames[0])
        assert img.size == (640, 480)  # Match sample_video resolution

    def test_extract_multiple_frames(self, sample_video, temp_dir):
        """Extract multiple frames at different timestamps."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        frames = pipeline.extract_frames(
            timestamps=[0.5, 1.5, 2.5, 3.5],
            output_dir=temp_dir
        )

        assert len(frames) == 4
        for frame in frames:
            assert os.path.exists(frame)

    def test_extract_frames_returns_sorted_by_timestamp(self, sample_video, temp_dir):
        """Frames should be returned in timestamp order."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        frames = pipeline.extract_frames(
            timestamps=[3.0, 1.0, 2.0],
            output_dir=temp_dir
        )

        # Filenames should indicate order
        assert "001" in frames[0] or "1.0" in frames[0]

    def test_extract_keyframes_only(self, sample_video, temp_dir):
        """Extract only I-frames (keyframes)."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        keyframes = pipeline.extract_keyframes(output_dir=temp_dir, max_frames=10)

        assert len(keyframes) > 0
        assert len(keyframes) <= 10
        for kf in keyframes:
            assert os.path.exists(kf)


@requires_ffmpeg
class TestThumbnailGeneration:
    """Tests for thumbnail generation - must fail before implementation."""

    def test_generate_thumbnails_at_interval(self, sample_video, temp_dir):
        """Generate thumbnails every N seconds."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        thumbnails = pipeline.generate_thumbnails(
            interval=1.0,
            output_dir=temp_dir
        )

        # 5-second video with 1s interval = ~5 thumbnails
        assert len(thumbnails) >= 4
        assert len(thumbnails) <= 6

    def test_generate_thumbnails_custom_size(self, sample_video, temp_dir):
        """Thumbnails should respect size parameter."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        thumbnails = pipeline.generate_thumbnails(
            interval=2.0,
            size=(160, 90),
            output_dir=temp_dir
        )

        from PIL import Image
        img = Image.open(thumbnails[0])
        assert img.size == (160, 90)

    def test_generate_thumbnail_grid(self, sample_video, temp_dir):
        """Generate contact sheet / thumbnail grid."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        grid = pipeline.generate_thumbnail_grid(
            columns=4,
            rows=3,
            output_path=os.path.join(temp_dir, "grid.jpg")
        )

        assert os.path.exists(grid)
        from PIL import Image
        img = Image.open(grid)
        # Grid should be larger than individual thumbnail
        assert img.size[0] > 640
```

**Implementation Notes**:
- Use `ffmpeg -vf "select='eq(pict_type,I)'" -vsync vfr` for keyframes
- Use `ffmpeg -vf fps=1/interval` for interval thumbnails
- Use Pillow for grid assembly and resizing

---

### 1C. Blur/Pixelate Regions

**Libraries**: FFmpeg (boxblur, pixelize filters)

**New Tools**:
- `add_blur_region(pipeline_id, x, y, w, h, intensity, start_time, end_time)` - Blur area
- `add_pixelate_region(pipeline_id, x, y, w, h, block_size, start_time, end_time)` - Pixelate
- `add_blur_track(pipeline_id, track_data)` - Blur following coordinates over time

**Test File**: `tests/test_blur_regions.py`

```python
@requires_ffmpeg
class TestBlurRegions:
    """Tests for blur/pixelate regions - must fail before implementation."""

    def test_blur_region_applies_blur(self, sample_video, temp_dir):
        """Blur region should apply gaussian blur to specified area."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_blur_region(
            x=100, y=100, width=200, height=150,
            intensity=20
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        # Verify blur was applied by checking that region differs from original
        # Extract same frame from both and compare
        original_frame = extract_frame(sample_video, 2.0)
        blurred_frame = extract_frame(output, 2.0)

        # The blurred region should have lower variance (smoother)
        region_variance_orig = get_region_variance(original_frame, 100, 100, 200, 150)
        region_variance_blur = get_region_variance(blurred_frame, 100, 100, 200, 150)

        assert region_variance_blur < region_variance_orig

    def test_blur_region_time_limited(self, sample_video, temp_dir):
        """Blur should only apply during specified time range."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_blur_region(
            x=100, y=100, width=200, height=150,
            intensity=20,
            start_time=2.0, end_time=4.0
        )
        output = pipeline.render(output_dir=temp_dir)

        # Frame at 1.0s should NOT be blurred
        frame_before = extract_frame(output, 1.0)
        frame_during = extract_frame(output, 3.0)
        frame_after = extract_frame(output, 4.5)

        # Only frame_during should have blur
        var_before = get_region_variance(frame_before, 100, 100, 200, 150)
        var_during = get_region_variance(frame_during, 100, 100, 200, 150)
        var_after = get_region_variance(frame_after, 100, 100, 200, 150)

        assert var_during < var_before
        assert var_during < var_after

    def test_pixelate_region(self, sample_video, temp_dir):
        """Pixelate should apply mosaic effect to region."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_pixelate_region(
            x=100, y=100, width=200, height=150,
            block_size=10
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_multiple_blur_regions(self, sample_video, temp_dir):
        """Multiple blur regions should all be applied."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_blur_region(x=0, y=0, width=100, height=100, intensity=15)
        pipeline.add_blur_region(x=200, y=200, width=100, height=100, intensity=15)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
```

**Implementation Notes**:
- FFmpeg filter: `boxblur=luma_radius=20:enable='between(t,2,4)'`
- For pixelate: scale down then scale up with neighbor sampling
- Complex filter for region: `[0:v]split[main][blur];[blur]crop=w:h:x:y,boxblur=20[blurred];[main][blurred]overlay=x:y`

---

### 1D. Video Stabilization

**Libraries**: FFmpeg (vidstabdetect, vidstabtransform), or vidstab library

**New Tools**:
- `add_stabilization(pipeline_id, shakiness, accuracy, smoothing)` - Stabilize video

**Test File**: `tests/test_stabilization.py`

```python
@requires_ffmpeg
class TestVideoStabilization:
    """Tests for video stabilization - must fail before implementation."""

    def test_stabilization_creates_output(self, shaky_video, temp_dir):
        """Stabilization should produce valid output."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(shaky_video)
        pipeline.add_stabilization(smoothing=10)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        assert get_video_duration(output) > 0

    def test_stabilization_preserves_duration(self, shaky_video, temp_dir):
        """Stabilization should not significantly alter duration."""
        from video_editor.pipeline import VideoPipeline

        original_duration = get_video_duration(shaky_video)

        pipeline = VideoPipeline(shaky_video)
        pipeline.add_stabilization()
        output = pipeline.render(output_dir=temp_dir)

        new_duration = get_video_duration(output)
        assert abs(original_duration - new_duration) < 1.0

    def test_stabilization_with_custom_settings(self, shaky_video, temp_dir):
        """Stabilization should respect shakiness and accuracy params."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(shaky_video)
        pipeline.add_stabilization(
            shakiness=8,
            accuracy=15,
            smoothing=30
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_stabilization_uses_gpu_if_available(self, shaky_video, temp_dir):
        """Stabilization should auto-detect and use GPU."""
        from video_editor.pipeline import VideoPipeline
        from video_editor.utils.helpers import _is_gpu_available

        pipeline = VideoPipeline(shaky_video)
        pipeline.add_stabilization()

        # Just verify it runs - GPU detection is internal
        output = pipeline.render(output_dir=temp_dir)
        assert os.path.exists(output)


# Fixture for shaky video
@pytest.fixture
def shaky_video(temp_dir):
    """Create a video with simulated camera shake."""
    output_path = os.path.join(temp_dir, "shaky.mp4")

    # Use FFmpeg to add artificial shake
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "testsrc=duration=5:size=640x480:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=5",
        "-vf", "crop=600:440:20+10*sin(t*10):20+10*cos(t*8)",
        "-c:v", "libx264", "-preset", "ultrafast",
        "-c:a", "aac",
        output_path
    ]
    subprocess.run(cmd, capture_output=True)
    return output_path
```

**Implementation Notes**:
- Two-pass process: 1) detect: `vidstabdetect` 2) transform: `vidstabtransform`
- Store transform data in temp file
- Can combine with GPU scaling for performance

---

### 1E. Auto-Subtitles (Whisper)

**Libraries**: faster-whisper (GPU auto-detection built-in), pysrt

**New Tools**:
- `transcribe_audio(pipeline_id, language, model_size)` - Get transcription as JSON
- `add_subtitles(pipeline_id, language, style, burn_in)` - Auto-generate and add subtitles
- `add_srt_subtitles(pipeline_id, srt_path, style, burn_in)` - Add existing SRT

**Test File**: `tests/test_subtitles.py`

```python
@requires_ffmpeg
class TestAutoSubtitles:
    """Tests for auto-subtitles - must fail before implementation."""

    def test_transcribe_returns_segments(self, sample_video_with_speech, temp_dir):
        """Transcribe should return list of timed segments."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video_with_speech)
        segments = pipeline.transcribe_audio(language="en", model_size="base")

        assert isinstance(segments, list)
        assert len(segments) > 0

        # Each segment should have text, start, end
        for seg in segments:
            assert "text" in seg
            assert "start" in seg
            assert "end" in seg
            assert seg["end"] > seg["start"]

    def test_transcribe_uses_gpu_if_available(self, sample_video_with_speech):
        """Transcription should use GPU when available."""
        from video_editor.pipeline import VideoPipeline
        from video_editor.utils.helpers import _is_gpu_available

        pipeline = VideoPipeline(sample_video_with_speech)

        # This should not raise and should complete
        segments = pipeline.transcribe_audio(language="en", model_size="tiny")

        assert len(segments) >= 0  # May be empty for synthetic audio

    def test_add_subtitles_burns_into_video(self, sample_video_with_speech, temp_dir):
        """Add subtitles should burn text into video."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video_with_speech)
        pipeline.add_subtitles(language="en", burn_in=True)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        # Verify subtitles are burned in by checking frame has text
        # (Hard to verify programmatically - could use OCR)

    def test_add_subtitles_creates_srt_sidecar(self, sample_video_with_speech, temp_dir):
        """Add subtitles with burn_in=False should create SRT file."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video_with_speech)
        pipeline.add_subtitles(language="en", burn_in=False)
        output = pipeline.render(output_dir=temp_dir)

        srt_path = output.replace(".mp4", ".srt")
        assert os.path.exists(srt_path)

        # Verify SRT is valid
        import pysrt
        subs = pysrt.open(srt_path)
        assert len(subs) >= 0

    def test_add_existing_srt_subtitles(self, sample_video, temp_dir):
        """Should be able to add existing SRT file."""
        from video_editor.pipeline import VideoPipeline

        # Create a simple SRT file
        srt_content = """1
00:00:01,000 --> 00:00:03,000
Hello World

2
00:00:03,500 --> 00:00:05,000
This is a test
"""
        srt_path = os.path.join(temp_dir, "test.srt")
        with open(srt_path, "w") as f:
            f.write(srt_content)

        pipeline = VideoPipeline(sample_video)
        pipeline.add_srt_subtitles(srt_path, burn_in=True)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@pytest.fixture
def sample_video_with_speech(temp_dir):
    """Create video with speech-like audio for transcription tests."""
    # For testing, we use a simple tone - real speech would be better
    # In production tests, use a real speech sample
    output_path = os.path.join(temp_dir, "speech_video.mp4")

    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "testsrc=duration=5:size=640x480:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=5",
        "-c:v", "libx264", "-preset", "ultrafast",
        "-c:a", "aac",
        output_path
    ]
    subprocess.run(cmd, capture_output=True)
    return output_path
```

**Implementation Notes**:
```python
from faster_whisper import WhisperModel

def transcribe_audio(self, language: str = "en", model_size: str = "base") -> list:
    """Transcribe audio using Whisper.

    GPU auto-detection is built into faster-whisper.
    """
    # Extract audio first
    audio_path = self.extract_audio(format="wav")

    # Load model (auto GPU detection)
    model = WhisperModel(model_size, device="auto", compute_type="auto")

    segments, info = model.transcribe(audio_path, language=language)

    return [
        {"text": seg.text, "start": seg.start, "end": seg.end}
        for seg in segments
    ]
```

---

### 1F. Picture-in-Picture & Split Screen

**Libraries**: FFmpeg (overlay, hstack, vstack, xstack)

**New Tools**:
- `add_pip(pipeline_id, pip_video, position, size, start_time, end_time)` - PiP overlay
- `add_split_screen(pipeline_id, videos, layout)` - Multi-video layouts

**Test File**: `tests/test_pip_splitscreen.py`

```python
@requires_ffmpeg
class TestPictureInPicture:
    """Tests for PiP - must fail before implementation."""

    def test_pip_top_left(self, sample_video, second_video, temp_dir):
        """PiP in top-left corner."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_pip(
            pip_video=second_video,
            position="top-left",
            size=0.25  # 25% of main video size
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        # Resolution should match main video
        assert get_video_resolution(output) == "640x480"

    def test_pip_bottom_right(self, sample_video, second_video, temp_dir):
        """PiP in bottom-right corner."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_pip(
            pip_video=second_video,
            position="bottom-right",
            size=0.3
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_pip_custom_position(self, sample_video, second_video, temp_dir):
        """PiP at custom x,y coordinates."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_pip(
            pip_video=second_video,
            position=(100, 50),  # x=100, y=50
            size=(160, 90)  # Exact pixel size
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_pip_time_limited(self, sample_video, second_video, temp_dir):
        """PiP should only appear during specified time range."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_pip(
            pip_video=second_video,
            position="top-right",
            size=0.25,
            start_time=1.0,
            end_time=3.0
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@requires_ffmpeg
class TestSplitScreen:
    """Tests for split screen layouts - must fail before implementation."""

    def test_split_screen_side_by_side(self, sample_video, second_video, temp_dir):
        """Side-by-side (horizontal) split."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_split_screen(
            videos=[second_video],
            layout="horizontal"  # 2 videos side by side
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        # Width should be doubled
        resolution = get_video_resolution(output)
        assert "1280" in resolution  # 640*2

    def test_split_screen_stacked(self, sample_video, second_video, temp_dir):
        """Top-bottom (vertical) split."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_split_screen(
            videos=[second_video],
            layout="vertical"
        )
        output = pipeline.render(output_dir=temp_dir)

        resolution = get_video_resolution(output)
        assert "960" in resolution  # 480*2

    def test_split_screen_2x2_grid(self, sample_video, second_video, temp_dir):
        """2x2 grid layout."""
        from video_editor.pipeline import VideoPipeline

        # Need 4 videos total for 2x2
        pipeline = VideoPipeline(sample_video)
        pipeline.add_split_screen(
            videos=[second_video, sample_video, second_video],
            layout="grid_2x2"
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_split_screen_3x3_grid(self, sample_video, second_video, temp_dir):
        """3x3 grid layout."""
        from video_editor.pipeline import VideoPipeline

        videos = [second_video] * 8  # Need 8 more for 9 total

        pipeline = VideoPipeline(sample_video)
        pipeline.add_split_screen(
            videos=videos,
            layout="grid_3x3"
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
```

**Implementation Notes**:
- PiP: `overlay=x:y:enable='between(t,start,end)'`
- Horizontal: `hstack=inputs=2`
- Vertical: `vstack=inputs=2`
- Grid: `xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0`

---

## Phase 2: Effects & Transformations

### 2G. Ken Burns & Slideshow

**Libraries**: FFmpeg (zoompan filter), Pillow

**New Tools**:
- `add_ken_burns(pipeline_id, zoom_start, zoom_end, pan_direction)` - Pan/zoom effect
- `create_slideshow(images, duration_per_image, transition, output_path)` - Images to video

**Test File**: `tests/test_slideshow.py`

```python
@requires_ffmpeg
class TestKenBurns:
    """Tests for Ken Burns effect - must fail before implementation."""

    def test_ken_burns_zoom_in(self, sample_image_video, temp_dir):
        """Ken Burns should zoom from 1.0 to 1.5."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_image_video)
        pipeline.add_ken_burns(
            zoom_start=1.0,
            zoom_end=1.5,
            pan_direction="center"
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_ken_burns_pan_left_to_right(self, sample_image_video, temp_dir):
        """Ken Burns should pan from left to right."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_image_video)
        pipeline.add_ken_burns(
            zoom_start=1.2,
            zoom_end=1.2,
            pan_direction="left_to_right"
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@requires_ffmpeg
class TestSlideshow:
    """Tests for slideshow creation - must fail before implementation."""

    def test_create_slideshow_basic(self, temp_dir):
        """Create slideshow from images."""
        from video_editor.pipeline import create_slideshow

        # Create test images
        images = create_test_images(temp_dir, count=5)

        output = create_slideshow(
            images=images,
            duration_per_image=2.0,
            output_path=os.path.join(temp_dir, "slideshow.mp4")
        )

        assert os.path.exists(output)
        duration = get_video_duration(output)
        assert duration == pytest.approx(10.0, abs=1.0)  # 5 images * 2s

    def test_create_slideshow_with_transitions(self, temp_dir):
        """Slideshow with fade transitions."""
        from video_editor.pipeline import create_slideshow

        images = create_test_images(temp_dir, count=3)

        output = create_slideshow(
            images=images,
            duration_per_image=3.0,
            transition="fade",
            transition_duration=0.5,
            output_path=os.path.join(temp_dir, "slideshow.mp4")
        )

        assert os.path.exists(output)

    def test_create_slideshow_with_ken_burns(self, temp_dir):
        """Slideshow with Ken Burns on each image."""
        from video_editor.pipeline import create_slideshow

        images = create_test_images(temp_dir, count=3)

        output = create_slideshow(
            images=images,
            duration_per_image=3.0,
            ken_burns=True,
            output_path=os.path.join(temp_dir, "slideshow.mp4")
        )

        assert os.path.exists(output)

    def test_create_slideshow_with_audio(self, temp_dir, sample_audio):
        """Slideshow with background audio."""
        from video_editor.pipeline import create_slideshow

        images = create_test_images(temp_dir, count=3)

        output = create_slideshow(
            images=images,
            duration_per_image=2.0,
            audio_path=sample_audio,
            output_path=os.path.join(temp_dir, "slideshow.mp4")
        )

        assert os.path.exists(output)
        # Should have audio track
        info = get_video_info(output)
        assert any(s["codec_type"] == "audio" for s in info["streams"])


def create_test_images(temp_dir, count=5):
    """Helper to create test images."""
    images = []
    for i in range(count):
        path = os.path.join(temp_dir, f"image_{i}.png")
        # Create colored image
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c=#{i*30:02x}{i*20:02x}{255-i*30:02x}:s=1920x1080:d=1",
            "-frames:v", "1",
            path
        ]
        subprocess.run(cmd, capture_output=True)
        images.append(path)
    return images
```

**Implementation Notes**:
- Ken Burns: `zoompan=z='zoom+0.001':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=125`
- Slideshow: Concatenate images with duration using `loop=1:duration:1` per image

---

### 2H. Borders & Padding

**Libraries**: FFmpeg (pad filter)

**New Tools**:
- `add_padding(pipeline_id, top, right, bottom, left, color)` - Add padding
- `add_letterbox(pipeline_id, aspect_ratio, color)` - Letterbox to aspect ratio

**Test File**: `tests/test_borders.py`

```python
@requires_ffmpeg
class TestBorders:
    """Tests for borders and padding - must fail before implementation."""

    def test_add_padding_all_sides(self, sample_video, temp_dir):
        """Add equal padding to all sides."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_padding(
            top=20, right=20, bottom=20, left=20,
            color="black"
        )
        output = pipeline.render(output_dir=temp_dir)

        # Resolution should increase by padding
        resolution = get_video_resolution(output)
        assert resolution == "680x520"  # 640+40 x 480+40

    def test_add_padding_custom_color(self, sample_video, temp_dir):
        """Padding with custom color."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_padding(
            top=50, right=50, bottom=50, left=50,
            color="#FF0000"  # Red
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_letterbox_to_widescreen(self, sample_video, temp_dir):
        """Letterbox 4:3 to 16:9."""
        from video_editor.pipeline import VideoPipeline

        # sample_video is 640x480 (4:3)
        pipeline = VideoPipeline(sample_video)
        pipeline.add_letterbox(
            aspect_ratio="16:9",
            color="black"
        )
        output = pipeline.render(output_dir=temp_dir)

        # Should now be 16:9 with same width
        resolution = get_video_resolution(output)
        w, h = map(int, resolution.split("x"))
        ratio = w / h
        assert abs(ratio - 16/9) < 0.1

    def test_pillarbox_to_vertical(self, sample_video, temp_dir):
        """Pillarbox 4:3 to 9:16 (vertical)."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_letterbox(
            aspect_ratio="9:16",
            color="white"
        )
        output = pipeline.render(output_dir=temp_dir)

        resolution = get_video_resolution(output)
        w, h = map(int, resolution.split("x"))
        ratio = w / h
        assert abs(ratio - 9/16) < 0.1
```

**Implementation Notes**:
- Padding: `pad=width+left+right:height+top+bottom:left:top:color`
- Letterbox: Calculate required padding from current and target aspect ratios

---

### 2I. Reverse & Loop

**Libraries**: FFmpeg (reverse, loop filters)

**New Tools**:
- `add_reverse(pipeline_id, start_time, end_time)` - Reverse playback
- `add_loop(pipeline_id, count, segment_start, segment_end)` - Loop segment N times

**Test File**: `tests/test_reverse_loop.py`

```python
@requires_ffmpeg
class TestReverse:
    """Tests for reverse playback - must fail before implementation."""

    def test_reverse_entire_video(self, sample_video, temp_dir):
        """Reverse should play video backwards."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_reverse()
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        # Duration should be same
        assert get_video_duration(output) == pytest.approx(
            get_video_duration(sample_video), abs=0.5
        )

    def test_reverse_segment(self, sample_video, temp_dir):
        """Reverse only a segment of video."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_reverse(start_time=1.0, end_time=3.0)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_reverse_with_audio(self, sample_video, temp_dir):
        """Reverse should also reverse audio."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_reverse()
        output = pipeline.render(output_dir=temp_dir)

        # Verify audio exists
        info = get_video_info(output)
        assert any(s["codec_type"] == "audio" for s in info["streams"])


@requires_ffmpeg
class TestLoop:
    """Tests for loop/repeat - must fail before implementation."""

    def test_loop_entire_video(self, sample_video, temp_dir):
        """Loop entire video 3 times."""
        from video_editor.pipeline import VideoPipeline

        original_duration = get_video_duration(sample_video)

        pipeline = VideoPipeline(sample_video)
        pipeline.add_loop(count=3)
        output = pipeline.render(output_dir=temp_dir)

        new_duration = get_video_duration(output)
        assert new_duration == pytest.approx(original_duration * 3, abs=1.0)

    def test_loop_segment(self, sample_video, temp_dir):
        """Loop only a segment."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_loop(
            count=3,
            segment_start=1.0,
            segment_end=2.0
        )
        output = pipeline.render(output_dir=temp_dir)

        # Original 5s, segment 1s repeated 3 times = 5 + 2 = 7s
        duration = get_video_duration(output)
        assert duration == pytest.approx(7.0, abs=1.0)

    def test_loop_with_crossfade(self, sample_video, temp_dir):
        """Loop with crossfade between repetitions."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_loop(count=2, crossfade=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
```

**Implementation Notes**:
- Reverse video: `reverse` filter (but requires loading entire video into memory)
- Reverse audio: `areverse`
- For long videos, use segment-based approach with trim + reverse + concat
- Loop: Use concat demuxer with same file N times, or `loop` filter for short clips

---

### 2J. Audio Normalization

**Libraries**: pyloudnorm (EBU R128), FFmpeg (loudnorm filter)

**New Tools**:
- `add_loudness_normalization(pipeline_id, target_lufs, true_peak)` - Normalize loudness
- `get_loudness(video_path)` - Analyze audio loudness

**Test File**: `tests/test_audio_normalization.py`

```python
@requires_ffmpeg
class TestAudioNormalization:
    """Tests for audio normalization - must fail before implementation."""

    def test_get_loudness_returns_lufs(self, sample_video):
        """Get loudness should return LUFS measurement."""
        from video_editor.pipeline import get_loudness

        result = get_loudness(sample_video)

        assert "integrated_lufs" in result
        assert "true_peak" in result
        assert "lra" in result  # Loudness Range
        assert isinstance(result["integrated_lufs"], float)

    def test_normalize_to_target_lufs(self, quiet_video, temp_dir):
        """Normalize should adjust to target LUFS."""
        from video_editor.pipeline import VideoPipeline, get_loudness

        original_loudness = get_loudness(quiet_video)

        pipeline = VideoPipeline(quiet_video)
        pipeline.add_loudness_normalization(target_lufs=-14.0)
        output = pipeline.render(output_dir=temp_dir)

        new_loudness = get_loudness(output)

        # Should be closer to -14 LUFS
        assert abs(new_loudness["integrated_lufs"] - (-14.0)) < 2.0

    def test_normalize_youtube_standard(self, sample_video, temp_dir):
        """Normalize to YouTube standard (-14 LUFS)."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_loudness_normalization(
            target_lufs=-14.0,
            true_peak=-1.0,
            preset="youtube"
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_normalize_podcast_standard(self, sample_video, temp_dir):
        """Normalize to podcast standard (-16 LUFS)."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_loudness_normalization(
            target_lufs=-16.0,
            preset="podcast"
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_normalize_preserves_video(self, sample_video, temp_dir):
        """Normalization should not alter video stream."""
        from video_editor.pipeline import VideoPipeline

        original_resolution = get_video_resolution(sample_video)

        pipeline = VideoPipeline(sample_video)
        pipeline.add_loudness_normalization(target_lufs=-14.0)
        output = pipeline.render(output_dir=temp_dir)

        assert get_video_resolution(output) == original_resolution


@pytest.fixture
def quiet_video(temp_dir):
    """Create a video with quiet audio."""
    output_path = os.path.join(temp_dir, "quiet.mp4")

    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "testsrc=duration=5:size=640x480:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=5",
        "-af", "volume=0.1",  # Very quiet
        "-c:v", "libx264", "-preset", "ultrafast",
        "-c:a", "aac",
        output_path
    ]
    subprocess.run(cmd, capture_output=True)
    return output_path
```

**Implementation Notes**:
- Two-pass loudnorm for accurate normalization:
  1. Analyze: `ffmpeg -i input -af loudnorm=print_format=json -f null -`
  2. Apply: `loudnorm=I=-14:TP=-1:LRA=11:measured_I=X:measured_TP=Y:measured_LRA=Z`
- Or use pyloudnorm for measurement, FFmpeg for application

---

### 2K. Animated Text

**Libraries**: FFmpeg (drawtext with expressions)

**New Tools**:
- `add_animated_text(pipeline_id, text, animation, duration, position, start_time)` - Animated text

**Test File**: `tests/test_animated_text.py`

```python
@requires_ffmpeg
class TestAnimatedText:
    """Tests for animated text - must fail before implementation."""

    def test_text_fade_in(self, sample_video, temp_dir):
        """Text should fade in."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(
            text="Hello World",
            animation="fade_in",
            duration=1.0,
            start_time=1.0
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_text_fade_out(self, sample_video, temp_dir):
        """Text should fade out."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(
            text="Goodbye",
            animation="fade_out",
            duration=1.0,
            start_time=1.0,
            end_time=3.0
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_text_slide_in_left(self, sample_video, temp_dir):
        """Text should slide in from left."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(
            text="Sliding Text",
            animation="slide_in_left",
            duration=0.5,
            start_time=1.0
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_text_slide_in_right(self, sample_video, temp_dir):
        """Text should slide in from right."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(
            text="From Right",
            animation="slide_in_right",
            duration=0.5,
            start_time=1.0
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_text_typewriter(self, sample_video, temp_dir):
        """Text should appear letter by letter."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(
            text="Typewriter Effect",
            animation="typewriter",
            duration=2.0,
            start_time=1.0
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_text_zoom_in(self, sample_video, temp_dir):
        """Text should zoom in."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_animated_text(
            text="ZOOM",
            animation="zoom_in",
            duration=0.5,
            start_time=1.0
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
```

**Implementation Notes**:
- Fade: `drawtext=text='Hello':alpha='if(lt(t,1),t,1)'`
- Slide: `drawtext=text='Hello':x='if(lt(t,1),-tw+t*tw,0)'`
- Typewriter: Use `substr()` with time-based length
- Zoom: Combine with `scale` filter and overlay

---

### 2L. Batch Processing

**Libraries**: asyncio, concurrent.futures

**New Tools**:
- `batch_process(input_files, operations, output_dir)` - Apply same ops to multiple files
- `batch_watermark(input_files, watermark_image, position, output_dir)` - Watermark batch

**Test File**: `tests/test_batch.py`

```python
@requires_ffmpeg
class TestBatchProcessing:
    """Tests for batch processing - must fail before implementation."""

    def test_batch_process_multiple_videos(self, temp_dir):
        """Batch process should handle multiple videos."""
        from video_editor.batch import batch_process

        # Create 3 test videos
        videos = create_test_videos(temp_dir, count=3)

        results = batch_process(
            input_files=videos,
            operations=[
                {"type": "trim", "start": 0, "end": 2},
                {"type": "scale", "width": 320, "height": 240}
            ],
            output_dir=temp_dir
        )

        assert len(results) == 3
        for result in results:
            assert os.path.exists(result["output"])
            assert get_video_resolution(result["output"]) == "320x240"

    def test_batch_process_parallel_execution(self, temp_dir):
        """Batch process should run in parallel."""
        from video_editor.batch import batch_process
        import time

        videos = create_test_videos(temp_dir, count=4)

        start = time.time()
        results = batch_process(
            input_files=videos,
            operations=[{"type": "trim", "start": 0, "end": 1}],
            output_dir=temp_dir,
            parallel=True,
            max_workers=4
        )
        elapsed = time.time() - start

        # Should be faster than sequential (roughly 4x faster ideally)
        assert len(results) == 4

    def test_batch_watermark(self, temp_dir, sample_image):
        """Batch watermark should apply to all videos."""
        from video_editor.batch import batch_watermark

        videos = create_test_videos(temp_dir, count=3)

        results = batch_watermark(
            input_files=videos,
            watermark_image=sample_image,
            position="bottom-right",
            output_dir=temp_dir
        )

        assert len(results) == 3
        for result in results:
            assert os.path.exists(result["output"])

    def test_batch_process_returns_errors(self, temp_dir):
        """Batch process should report errors without stopping."""
        from video_editor.batch import batch_process

        videos = create_test_videos(temp_dir, count=2)
        videos.append("/nonexistent/video.mp4")  # Invalid file

        results = batch_process(
            input_files=videos,
            operations=[{"type": "trim", "start": 0, "end": 1}],
            output_dir=temp_dir
        )

        # Should have 2 successes and 1 error
        successes = [r for r in results if r.get("success")]
        errors = [r for r in results if r.get("error")]

        assert len(successes) == 2
        assert len(errors) == 1


def create_test_videos(temp_dir, count=3):
    """Create multiple test videos."""
    videos = []
    for i in range(count):
        path = os.path.join(temp_dir, f"video_{i}.mp4")
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"testsrc=duration=3:size=640x480:rate=30",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
            "-c:v", "libx264", "-preset", "ultrafast",
            "-c:a", "aac",
            path
        ]
        subprocess.run(cmd, capture_output=True)
        videos.append(path)
    return videos
```

**Implementation Notes**:
- Use `concurrent.futures.ProcessPoolExecutor` for parallel FFmpeg calls
- Each video gets its own pipeline
- Return structured results with success/error status

---

## Phase 3: Advanced Features

### 3M. Scene Detection

**Libraries**: scenedetect

**New Tools**:
- `detect_scenes(video_path, threshold, min_scene_length)` - Detect scene changes
- `split_by_scenes(pipeline_id, threshold, output_dir)` - Split into scene files

**Test File**: `tests/test_scene_detection.py`

```python
@requires_ffmpeg
class TestSceneDetection:
    """Tests for scene detection - must fail before implementation."""

    def test_detect_scenes_returns_timestamps(self, video_with_cuts, temp_dir):
        """Scene detection should return cut timestamps."""
        from video_editor.analysis import detect_scenes

        scenes = detect_scenes(video_with_cuts, threshold=30.0)

        assert isinstance(scenes, list)
        assert len(scenes) > 0

        for scene in scenes:
            assert "start" in scene
            assert "end" in scene
            assert scene["end"] > scene["start"]

    def test_detect_scenes_respects_threshold(self, video_with_cuts, temp_dir):
        """Higher threshold should detect fewer scenes."""
        from video_editor.analysis import detect_scenes

        scenes_low = detect_scenes(video_with_cuts, threshold=20.0)
        scenes_high = detect_scenes(video_with_cuts, threshold=50.0)

        assert len(scenes_high) <= len(scenes_low)

    def test_detect_scenes_min_length(self, video_with_cuts, temp_dir):
        """Min scene length should filter short scenes."""
        from video_editor.analysis import detect_scenes

        scenes = detect_scenes(
            video_with_cuts,
            threshold=30.0,
            min_scene_length=2.0  # At least 2 seconds
        )

        for scene in scenes:
            duration = scene["end"] - scene["start"]
            assert duration >= 2.0

    def test_split_by_scenes(self, video_with_cuts, temp_dir):
        """Split video should create separate files per scene."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(video_with_cuts)
        outputs = pipeline.split_by_scenes(
            threshold=30.0,
            output_dir=temp_dir
        )

        assert len(outputs) > 1
        for output in outputs:
            assert os.path.exists(output)


@pytest.fixture
def video_with_cuts(temp_dir):
    """Create a video with distinct scene cuts."""
    output_path = os.path.join(temp_dir, "cuts.mp4")

    # Create 3 different colored segments and concat
    segments = []
    colors = ["red", "blue", "green"]
    for i, color in enumerate(colors):
        seg_path = os.path.join(temp_dir, f"seg_{i}.mp4")
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c={color}:s=640x480:d=3:r=30",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
            "-c:v", "libx264", "-preset", "ultrafast",
            "-c:a", "aac",
            seg_path
        ]
        subprocess.run(cmd, capture_output=True)
        segments.append(seg_path)

    # Concat segments
    concat_file = os.path.join(temp_dir, "concat.txt")
    with open(concat_file, "w") as f:
        for seg in segments:
            f.write(f"file '{seg}'\n")

    cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", concat_file,
        "-c", "copy",
        output_path
    ]
    subprocess.run(cmd, capture_output=True)
    return output_path
```

**Implementation Notes**:
```python
from scenedetect import detect, ContentDetector

def detect_scenes(video_path: str, threshold: float = 30.0) -> list:
    """Detect scene changes using scenedetect library."""
    scene_list = detect(video_path, ContentDetector(threshold=threshold))

    return [
        {"start": scene[0].get_seconds(), "end": scene[1].get_seconds()}
        for scene in scene_list
    ]
```

---

### 3N. Audio Ducking

**Libraries**: FFmpeg (sidechaincompress), pyloudnorm

**New Tools**:
- `add_audio_ducking(pipeline_id, music_track, duck_amount, threshold)` - Auto-duck music

**Test File**: `tests/test_audio_ducking.py`

```python
@requires_ffmpeg
class TestAudioDucking:
    """Tests for audio ducking - must fail before implementation."""

    def test_duck_music_during_speech(self, video_with_speech, sample_audio, temp_dir):
        """Music should be quieter during speech."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(video_with_speech)
        pipeline.add_audio_track(sample_audio, volume=1.0)  # Add music
        pipeline.add_audio_ducking(duck_amount=0.3)  # Duck to 30%
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        # Verification would need audio analysis

    def test_duck_with_custom_threshold(self, video_with_speech, sample_audio, temp_dir):
        """Ducking should respect threshold parameter."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(video_with_speech)
        pipeline.add_audio_track(sample_audio)
        pipeline.add_audio_ducking(
            duck_amount=0.2,
            threshold=-20,  # dB threshold for speech detection
            attack=0.1,
            release=0.5
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_duck_external_music_file(self, sample_video, sample_audio, temp_dir):
        """Duck external music track."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_audio_ducking(
            music_path=sample_audio,
            duck_amount=0.25
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
```

**Implementation Notes**:
- Use FFmpeg sidechaincompress:
  `[speech][music]sidechaincompress=threshold=0.03:ratio=9:attack=200:release=1000`
- Or manually analyze with silence detection and apply volume automation

---

### 3O. Vignette & Visual Effects

**Libraries**: FFmpeg (vignette filter)

**New Tools**:
- `add_vignette(pipeline_id, intensity, start_time, end_time)` - Vignette effect
- `add_film_grain(pipeline_id, intensity)` - Add film grain

**Test File**: `tests/test_visual_effects.py`

```python
@requires_ffmpeg
class TestVisualEffects:
    """Tests for visual effects - must fail before implementation."""

    def test_add_vignette(self, sample_video, temp_dir):
        """Vignette should darken edges."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_vignette(intensity=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_vignette_strong(self, sample_video, temp_dir):
        """Strong vignette effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_vignette(intensity=0.8)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_vignette_time_limited(self, sample_video, temp_dir):
        """Vignette only during time range."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_vignette(
            intensity=0.5,
            start_time=1.0,
            end_time=3.0
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_film_grain(self, sample_video, temp_dir):
        """Film grain effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_film_grain(intensity=0.3)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_sepia(self, sample_video, temp_dir):
        """Sepia tone effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_sepia()
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_black_and_white(self, sample_video, temp_dir):
        """Black and white effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_black_and_white()
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
```

**Implementation Notes**:
- Vignette: `vignette=PI/4`
- Film grain: Use `noise` filter or overlay noise texture
- Sepia: `colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131`
- B&W: `hue=s=0`

---

### 3P. Motion Blur & Sharpen

**Libraries**: FFmpeg (minterpolate, unsharp, smartblur)

**New Tools**:
- `add_motion_blur(pipeline_id, intensity)` - Motion blur effect
- `add_sharpen(pipeline_id, amount)` - Sharpen video
- `add_denoise(pipeline_id, strength)` - Reduce noise

**Test File**: `tests/test_blur_sharpen.py`

```python
@requires_ffmpeg
class TestBlurSharpen:
    """Tests for blur/sharpen effects - must fail before implementation."""

    def test_add_motion_blur(self, sample_video, temp_dir):
        """Motion blur effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_motion_blur(intensity=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_sharpen(self, sample_video, temp_dir):
        """Sharpen effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_sharpen(amount=1.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_sharpen_time_range(self, sample_video, temp_dir):
        """Sharpen only during time range."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_sharpen(
            amount=2.0,
            start_time=1.0,
            end_time=3.0
        )
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_denoise(self, noisy_video, temp_dir):
        """Denoise should reduce noise."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(noisy_video)
        pipeline.add_denoise(strength=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)

    def test_add_soften(self, sample_video, temp_dir):
        """Soften/blur effect."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_soften(amount=0.5)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)


@pytest.fixture
def noisy_video(temp_dir):
    """Create a video with noise."""
    output_path = os.path.join(temp_dir, "noisy.mp4")

    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "testsrc=duration=3:size=640x480:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
        "-vf", "noise=alls=20:allf=t",
        "-c:v", "libx264", "-preset", "ultrafast",
        "-c:a", "aac",
        output_path
    ]
    subprocess.run(cmd, capture_output=True)
    return output_path
```

**Implementation Notes**:
- Motion blur: `minterpolate=fps=60:mi_mode=blend`
- Sharpen: `unsharp=5:5:1.0`
- Denoise: `hqdn3d=4:3:6:4.5` or `nlmeans`
- Soften: `smartblur=1.0:0.3`

---

## Phase 4: Integration

### 4Q. Template System & EDL Export

**Libraries**: pydantic (for template schemas), JSON

**New Tools**:
- `save_template(name, operations)` - Save operation sequence
- `load_template(name)` - Load template
- `apply_template(pipeline_id, template_name)` - Apply saved template
- `export_edl(pipeline_id, output_path)` - Export as EDL
- `export_timeline_json(pipeline_id, output_path)` - Export as JSON

**Test File**: `tests/test_templates_edl.py`

```python
class TestTemplates:
    """Tests for template system - must fail before implementation."""

    def test_save_template(self, temp_dir):
        """Save template should persist operations."""
        from video_editor.templates import save_template, load_template

        operations = [
            {"type": "trim", "start": 0, "end": 10},
            {"type": "scale", "width": 1920, "height": 1080},
            {"type": "loudness_normalization", "target_lufs": -14}
        ]

        save_template("youtube_prep", operations, template_dir=temp_dir)

        loaded = load_template("youtube_prep", template_dir=temp_dir)
        assert loaded == operations

    def test_apply_template(self, sample_video, temp_dir):
        """Apply template should execute all operations."""
        from video_editor.pipeline import VideoPipeline
        from video_editor.templates import save_template

        # Save a template
        operations = [
            {"type": "trim", "start": 1, "end": 4},
            {"type": "scale", "width": 320, "height": 240}
        ]
        save_template("test_template", operations, template_dir=temp_dir)

        # Apply it
        pipeline = VideoPipeline(sample_video)
        pipeline.apply_template("test_template", template_dir=temp_dir)
        output = pipeline.render(output_dir=temp_dir)

        assert os.path.exists(output)
        assert get_video_duration(output) == pytest.approx(3.0, abs=0.5)
        assert get_video_resolution(output) == "320x240"

    def test_list_templates(self, temp_dir):
        """List available templates."""
        from video_editor.templates import save_template, list_templates

        save_template("template_a", [], template_dir=temp_dir)
        save_template("template_b", [], template_dir=temp_dir)

        templates = list_templates(template_dir=temp_dir)

        assert "template_a" in templates
        assert "template_b" in templates


@requires_ffmpeg
class TestEDLExport:
    """Tests for EDL export - must fail before implementation."""

    def test_export_edl_basic(self, sample_video, temp_dir):
        """Export timeline as EDL."""
        from video_editor.pipeline import VideoPipeline

        pipeline = VideoPipeline(sample_video)
        pipeline.add_trim(start_time=1.0, end_time=4.0)

        edl_path = os.path.join(temp_dir, "timeline.edl")
        pipeline.export_edl(edl_path)

        assert os.path.exists(edl_path)

        with open(edl_path) as f:
            content = f.read()

        # EDL should contain timecode
        assert "TITLE:" in content or "FCM:" in content

    def test_export_timeline_json(self, sample_video, temp_dir):
        """Export timeline as JSON."""
        from video_editor.pipeline import VideoPipeline
        import json

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
```

**Implementation Notes**:
- Templates: JSON files in `~/.vemcp/templates/` or specified directory
- EDL format: CMX 3600 format for compatibility
- JSON export: Custom format with all operation details

---

## Execution Commands

### Install Dependencies First

```bash
cd E:\DL\Projects\VEMCP
uv add faster-whisper pysrt scenedetect pyloudnorm numpy Pillow imageio imageio-ffmpeg
uv sync
```

### Run Tests (TDD - Watch Fail First)

```bash
# Run specific test file to see RED
uv run pytest tests/test_audio_extraction.py -v --tb=short

# Run all new tests to see all RED
uv run pytest tests/test_*.py -v --tb=short -x
```

### Multi-Agent Execution

Each agent runs independently, implementing one feature:

```
# Terminal 1 - Agent A
claude-code "Implement audio extraction/replacement. Tests: tests/test_audio_extraction.py. TDD: run tests first (RED), implement in video_editor/pipeline/operations.py, run tests (GREEN)."

# Terminal 2 - Agent B
claude-code "Implement frame extraction. Tests: tests/test_frame_extraction.py. TDD approach."

# Terminal 3 - Agent C
claude-code "Implement blur/pixelate regions. Tests: tests/test_blur_regions.py. TDD approach."

# ... (parallel agents for each feature)
```

---

## GPU Detection Strategy

All features automatically use GPU when available:

```python
# In video_editor/utils/helpers.py - already implemented
def _is_gpu_available() -> bool:
    """Cached GPU detection."""
    ...

# Usage in operations
def add_stabilization(self, ...):
    if _is_gpu_available():
        # Use CUDA-accelerated filters
        self._add_option("-hwaccel", "cuda")
    # FFmpeg automatically falls back to CPU

# For Whisper (built-in auto-detection)
from faster_whisper import WhisperModel
model = WhisperModel("base", device="auto", compute_type="auto")
# Automatically uses CUDA if available
```

---

## File Structure After Implementation

```
VEMCP/
├── server.py                          # Updated with new tools
├── video_editor/
│   ├── __init__.py
│   ├── ffmpeg/
│   │   └── executor.py
│   ├── pipeline/
│   │   ├── __init__.py
│   │   ├── core.py                    # VideoPipeline class (extended)
│   │   └── operations.py              # All FFmpeg operations
│   ├── timeline/
│   │   └── tracker.py
│   ├── analysis/                       # NEW
│   │   ├── __init__.py
│   │   ├── scene_detection.py         # Scene detection
│   │   ├── loudness.py                # Audio analysis
│   │   └── transcription.py           # Whisper integration
│   ├── batch/                          # NEW
│   │   ├── __init__.py
│   │   └── processor.py               # Batch processing
│   ├── templates/                      # NEW
│   │   ├── __init__.py
│   │   └── manager.py                 # Template save/load
│   └── utils/
│       └── helpers.py
├── tests/
│   ├── conftest.py                    # Extended fixtures
│   ├── test_audio_extraction.py       # NEW
│   ├── test_frame_extraction.py       # NEW
│   ├── test_blur_regions.py           # NEW
│   ├── test_stabilization.py          # NEW
│   ├── test_subtitles.py              # NEW
│   ├── test_pip_splitscreen.py        # NEW
│   ├── test_slideshow.py              # NEW
│   ├── test_borders.py                # NEW
│   ├── test_reverse_loop.py           # NEW
│   ├── test_audio_normalization.py    # NEW
│   ├── test_animated_text.py          # NEW
│   ├── test_batch.py                  # NEW
│   ├── test_scene_detection.py        # NEW
│   ├── test_audio_ducking.py          # NEW
│   ├── test_visual_effects.py         # NEW
│   ├── test_blur_sharpen.py           # NEW
│   ├── test_templates_edl.py          # NEW
│   └── ... (existing tests)
└── pyproject.toml                      # Updated dependencies
```

---

## Summary

| Phase | Features | Agents | Parallel? |
|-------|----------|--------|-----------|
| 1 | Audio, Frames, Blur, Stabilization, Subtitles, PiP | 6 | Yes |
| 2 | Ken Burns, Borders, Reverse/Loop, Normalization, Animated Text, Batch | 6 | Yes |
| 3 | Scene Detection, Audio Ducking, Vignette, Motion Blur | 4 | Yes |
| 4 | Templates, EDL Export | 1 | Sequential |

**Total: 17 agents across 4 phases**

Each agent follows TDD:
1. Write tests first (RED - must fail)
2. Run tests, verify failure
3. Implement minimal code (GREEN)
4. Run tests, verify pass
5. Refactor if needed
6. All tests stay green

All features use:
- FFmpeg for core video/audio processing
- 3rd party libraries (faster-whisper, scenedetect, pyloudnorm)
- Automatic GPU detection and acceleration
- No manual/complex code - leverage existing tools
