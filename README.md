# VEMCP - Video Editor MCP Server

A full-featured video editing server powered by FFmpeg, designed for LLM-based text interactions. Edit videos by describing what you want - no GUI needed.

## Overview

VEMCP (Video Editor Model Context Protocol) enables AI assistants to perform professional video editing through natural language. Instead of clicking through timelines and adjusting sliders, simply tell the AI what you want:

- *"Remove all the silent parts from my lecture recording"*
- *"Add a 2-second fade transition between these clips"*
- *"Speed up the boring parts from 1:30 to 2:45 by 2x"*
- *"Overlay my logo in the bottom-right corner"*
- *"Add Ken Burns effect to these photos and create a slideshow"*
- *"Auto-generate subtitles and burn them in"*

The server translates these requests into optimized FFmpeg pipelines, processing everything in a single pass for maximum efficiency.

## Key Features

- **Pipeline Architecture**: Queue multiple operations and render in one FFmpeg call
- **Timeline Intelligence**: Accurate time mapping across compound operations
- **Hardware Acceleration**: NVIDIA CUDA support with automatic fallback
- **AI-Powered**: Whisper integration for transcription and subtitles
- **Token Efficient**: Designed for minimal back-and-forth with LLMs
- **Production Ready**: Strict typing, comprehensive tests, async support

## Requirements

- Python 3.10+
- FFmpeg (with FFprobe)
- UV package manager (recommended)

```bash
# Install dependencies
uv sync

# Or with pip
pip install -r requirements.txt
```

## Quick Start

```bash
# Run the MCP server
uv run python server.py

# Or configure in your MCP client (Claude Desktop, etc.)
```

### MCP Client Configuration

Add to your MCP settings:

```json
{
  "mcpServers": {
    "video-editor": {
      "command": "uv",
      "args": ["run", "python", "path/to/VEMCP/server.py"]
    }
  }
}
```

---

## Current Capabilities

### Pipeline Management

| Tool | Description |
|------|-------------|
| `create_video_pipeline` | Initialize editing session with input video |
| `render_pipeline` | Execute all queued operations and output final video |
| `render_video` | One-shot render for simple operations |

### Trimming & Cutting

| Tool | Description |
|------|-------------|
| `add_trim` | Keep only a portion of the video (start/end times) |
| `add_segment_deletion` | Remove a segment from the middle of the video |

**Example**: *"Trim the video to keep only 0:30 to 2:45"*

### Speed & Time Manipulation

| Tool | Description |
|------|-------------|
| `add_speed_change` | Adjust playback speed (0.25x to 100x) |
| `add_reverse` | Reverse video playback (full or segment) |
| `add_loop` | Loop entire video or specific segment N times |
| `add_boomerang` | Create boomerang effect (forward then reverse) |

- Preserves audio pitch at reasonable speeds
- Supports partial segments (speed up just one section)
- Automatically chains filters for extreme speeds

**Example**: *"Speed up the section from 1:00 to 1:30 by 3x"*

### Visual Transformations

| Tool | Description |
|------|-------------|
| `add_scale` | Resize video resolution |
| `add_rotate` | Rotate by any angle |
| `add_flip` | Mirror horizontally/vertically |
| `add_crop` | Extract region of frame |
| `add_padding` | Add padding/borders around video |
| `add_border` | Add decorative border frame |
| `add_letterbox` | Add letterbox/pillarbox with optional blur bars |

### Color Grading & Visual Effects

| Tool | Description |
|------|-------------|
| `add_color_grade` | Professional color adjustment |
| `add_chroma_key` | Green screen removal |
| `add_vignette` | Darken edges for cinematic look |
| `add_film_grain` | Add film grain texture |
| `add_sepia` | Sepia tone effect |
| `add_black_and_white` | Convert to grayscale |
| `add_negative` | Invert colors |
| `add_vintage` | Vintage film effect |
| `add_color_tint` | Warm/cool color tinting |
| `add_vhs_effect` | VHS-style distortion |
| `add_scan_lines` | CRT scan line effect |
| `add_motion_blur` | Cinematic motion blur |

Color grading supports:
- Brightness (-1.0 to 1.0)
- Contrast (0.0 to 10.0)
- Saturation (0.0 to 10.0)
- Hue rotation (-180° to 180°)
- Black/white level curves

**Example**: *"Increase saturation by 20% and add slight warmth"*

### Blur & Sharpening

| Tool | Description |
|------|-------------|
| `add_sharpen` | Enhance detail and sharpness |
| `add_soften` | Soft focus effect |
| `add_gaussian_blur` | Gaussian blur filter |
| `add_box_blur` | Box blur filter |
| `add_denoise` | Video noise reduction |
| `add_blur_region` | Blur specific rectangular area |
| `add_pixelate_region` | Pixelate specific area (faces, plates) |

**Example**: *"Blur the license plate at coordinates 100,200 with size 150x50"*

### Video Stabilization

| Tool | Description |
|------|-------------|
| `add_stabilization` | Reduce camera shake using vidstab |

Stabilization parameters:
- Shakiness detection (1-10)
- Accuracy (1-15)
- Zoom compensation
- Adaptive zoom

**Example**: *"Stabilize the shaky handheld footage"*

### Audio Operations

| Tool | Description |
|------|-------------|
| `add_volume_change` | Adjust audio level |
| `add_audio_track` | Mix in additional audio (music, voiceover) |
| `replace_audio` | Replace entire audio track |
| `extract_audio` | Export audio to separate file |
| `add_loudness_normalization` | EBU R128 loudness normalization |
| `add_peak_normalization` | Normalize to target peak dB |
| `add_audio_ducking` | Auto-lower music when speech detected |
| `add_sidechain_compression` | Advanced compression with sidechain |
| `add_vst3_processing` | Apply VST3 audio plugins |
| `list_vst3` | Discover installed VST3 plugins |

**Example**: *"Add background music at 30% volume and duck it when I'm speaking"*

### Text & Overlays

| Tool | Description |
|------|-------------|
| `add_text_overlay` | Add titles, captions, watermarks |
| `add_animated_text` | Text with animation effects |
| `add_overlay` | Layer images or videos on top |

**Animated text supports 10 animation types:**
- `fade_in`, `fade_out`, `fade_in_out`
- `slide_in_left`, `slide_in_right`, `slide_in_top`, `slide_in_bottom`
- `typewriter`, `zoom_in`, `zoom_out`, `bounce`

Text overlay features:
- Custom fonts, sizes, colors
- Outline/border support
- Opacity control
- Position expressions (`w-text_w-10` for right-aligned)
- Timed appearance

**Example**: *"Add 'Chapter 1' sliding in from the bottom with a 0.5s animation"*

### Subtitles & Transcription

| Tool | Description |
|------|-------------|
| `transcribe_audio` | Transcribe audio using Whisper AI |
| `add_subtitles` | Auto-generate and burn in subtitles |
| `add_srt_subtitles` | Add existing SRT subtitle file |

Supports multiple languages via Whisper model.

**Example**: *"Transcribe the video and burn in English subtitles"*

### Video Composition

| Tool | Description |
|------|-------------|
| `add_concatenation` | Join multiple videos end-to-end |
| `add_transition` | Smooth transition between clips |
| `add_pip` | Picture-in-picture overlay |
| `add_split_screen` | Side-by-side or grid layouts |

**Transition types:**
- `fade` - Classic fade through black
- `dissolve` - Cross-dissolve/crossfade
- `wipe_lr` / `wipe_rl` - Horizontal wipes
- `wipe_tb` / `wipe_bt` - Vertical wipes

**Split screen layouts:**
- `horizontal` - Side by side
- `vertical` - Top and bottom
- `grid_2x2` - 2x2 grid
- `grid_3x3` - 3x3 grid

**Example**: *"Add picture-in-picture of the webcam in the bottom-right at 25% size"*

### Ken Burns & Slideshow

| Tool | Description |
|------|-------------|
| `add_ken_burns` | Pan and zoom effect on images |
| `create_slideshow` | Create video from images |

Ken Burns supports:
- Custom start/end positions
- Zoom in/out with pan
- Ease in/out transitions

Slideshow features:
- Configurable duration per image
- Transition effects between slides
- Background audio support
- Custom resolution and FPS

**Example**: *"Create a slideshow from these photos with 3-second crossfades and Ken Burns zoom"*

### Silence Removal

| Tool | Description |
|------|-------------|
| `get_silences` | Detect silent segments (preview before removing) |
| `add_silence_removal` | Automatically cut silent parts |

Configuration:
- Noise threshold (default: -30dB)
- Minimum silence duration (default: 0.5s)
- Padding preservation for natural speech

**Example**: *"Remove silences longer than 1 second, keeping 0.2s padding"*

### Scene Detection

| Tool | Description |
|------|-------------|
| `detect_scenes` | Detect scene changes in video |
| `split_by_scenes` | Split video at scene boundaries |
| `generate_chapters` | Auto-generate chapter markers |

**Example**: *"Split this video into separate files at each scene change"*

### Frame Extraction

| Tool | Description |
|------|-------------|
| `extract_frames` | Extract frames at specific timestamps or FPS |
| `extract_keyframes` | Extract only keyframes |
| `generate_thumbnails` | Generate thumbnail previews |
| `generate_thumbnail_grid` | Create contact sheet grid |

**Example**: *"Extract a frame every 10 seconds for LLM analysis"*

### Batch Processing

| Tool | Description |
|------|-------------|
| `batch_process` | Apply operations to multiple videos |
| `batch_watermark` | Add watermark to multiple videos |
| `batch_convert` | Convert format/resolution in bulk |

Supports parallel processing with configurable worker count.

**Example**: *"Add our logo watermark to all videos in this folder"*

### Templates & Projects

| Tool | Description |
|------|-------------|
| `save_template` | Save operation sequence as reusable template |
| `load_template` | Apply saved template |
| `list_templates` | List available templates |
| `save_project` | Save full project state |
| `load_project` | Load project from file |
| `export_edl` | Export as Edit Decision List |
| `export_timeline_json` | Export timeline as JSON |

**Example**: *"Save this as 'youtube-intro' template for future use"*

### Metadata & Discovery

| Tool | Description |
|------|-------------|
| `get_video_info` | Retrieve video metadata (duration, resolution, codecs) |
| `get_loudness` | Analyze audio loudness (LUFS, true peak, LRA) |
| `find_video_path` | Search for videos by name |

---

## Rendering Options

### Output Formats
`mp4`, `mkv`, `mov`, `avi`, `webm`, `flv`, `wmv`, `ts`

### Video Codecs
- `libx264` (default, universal compatibility)
- `libx265` / `hevc` (better compression)
- `h264_nvenc` / `hevc_nvenc` (NVIDIA GPU encoding)

### Presets
| Preset | Use Case |
|--------|----------|
| `youtube` | Optimized for YouTube upload |
| `twitch` | Live streaming quality |
| `instagram` | Auto-scaled for mobile |
| `compress` | Maximum file size reduction |

---

## Architecture

```
Input Video
    │
    ▼
┌─────────────────────────────────────────────┐
│            VIDEO PIPELINE                   │
│  ┌─────────────────────────────────────┐   │
│  │  Operation Queue                     │   │
│  │  - trim(0:30, 2:45)                 │   │
│  │  - speed(2.0, segment=1:00-1:30)    │   │
│  │  - color_grade(saturation=1.2)      │   │
│  │  - overlay(logo.png, position=BR)   │   │
│  └─────────────────────────────────────┘   │
│                    │                        │
│                    ▼                        │
│  ┌─────────────────────────────────────┐   │
│  │  Timeline Tracker                    │   │
│  │  Maps edited times → original times  │   │
│  └─────────────────────────────────────┘   │
│                    │                        │
│                    ▼                        │
│  ┌─────────────────────────────────────┐   │
│  │  FFmpeg Command Builder              │   │
│  │  Single optimized filtergraph        │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
    │
    ▼
Output Video (render/ folder)
```

### Why Pipelines?

1. **Single FFmpeg Call**: No intermediate files, no quality loss
2. **Accurate Timing**: Timeline tracker handles compound operations
3. **Efficient**: Operations are combined into optimal filtergraphs
4. **Stateful**: Queue operations across multiple LLM turns

---

## TODO - Future Enhancements

### High Priority
- [ ] **Object tracking blur** - Track and blur moving objects across frames
- [ ] **Auto-reframe** - Detect subjects and auto-crop for different aspect ratios
- [ ] **Multi-track audio mixing** - Layer multiple audio tracks with individual volume curves

### Medium Priority
- [ ] **Slow-motion with interpolation** - Frame interpolation for smoother slow-mo
- [ ] **Background removal** - AI-based background removal (not just chroma key)
- [ ] **Animated stickers/GIFs** - Overlay animated content with timing control
- [ ] **Video montage generator** - Auto-cut to beat or create quick montage

### Lower Priority
- [ ] **AI upscaling** - Resolution enhancement using AI models
- [ ] **Style transfer** - Apply artistic styles to video
- [ ] **Undo/History** - Pipeline operation history with rollback
- [ ] **Smart aspect ratio conversion** - 16:9 to 9:16 with subject tracking

---

## Example Workflows

### Podcast/Lecture Cleanup
```
1. get_silences("lecture.mp4") → Review detected silences
2. create_video_pipeline("lecture.mp4")
3. add_silence_removal(threshold=-35, min_duration=1.0, padding=0.3)
4. add_loudness_normalization(target_lufs=-14)
5. add_subtitles(language="en", burn_in=True)
6. render_pipeline(preset="youtube")
```

### YouTube Video with Intro
```
1. create_video_pipeline("intro.mp4")
2. add_transition("main_content.mp4", type="dissolve", duration=1.0)
3. add_animated_text("SUBSCRIBE!", animation="slide_in_bottom", position="bottom-right")
4. add_overlay("logo.png", x=10, y=10, opacity=0.7)
5. render_pipeline(preset="youtube")
```

### Social Media Clip
```
1. create_video_pipeline("full_video.mp4")
2. add_trim(start=45.5, end=75.0) → Extract best 30 seconds
3. add_speed_change(1.1) → Slightly faster pace
4. add_letterbox(aspect_ratio="9:16", blur_bars=True) → Vertical for TikTok
5. add_animated_text("Wait for it...", animation="fade_in")
6. render_pipeline(format="mp4")
```

### Photo Slideshow with Music
```
1. create_slideshow(["photo1.jpg", "photo2.jpg", ...], duration=4.0)
2. add_ken_burns(start_pos="center", end_pos="top-left", zoom=1.2)
3. add_audio_track("background_music.mp3", volume=0.7)
4. render_pipeline()
```

### Privacy Blur
```
1. create_video_pipeline("interview.mp4")
2. add_blur_region(x=100, y=200, width=150, height=50, blur_strength=20)
3. add_pixelate_region(x=500, y=100, width=100, height=100, pixel_size=15)
4. render_pipeline()
```

---

## Testing

```bash
# Run all tests
uv run pytest

# Run specific test suite
uv run pytest tests/test_silence_removal.py -v

# Run with coverage
uv run pytest --cov=video_editor

# Lint and format
uv run ruff check .
uv run ruff format .
```

---

## Project Structure

```
VEMCP/
├── server.py                 # MCP server with all tool definitions
├── video_editor/
│   ├── __init__.py          # Package exports
│   ├── analysis/
│   │   └── __init__.py      # Scene detection, loudness analysis
│   ├── batch/
│   │   └── __init__.py      # Batch processing functions
│   ├── ffmpeg/
│   │   └── executor.py      # Async FFmpeg execution
│   ├── pipeline/
│   │   ├── core.py          # VideoPipeline class (60+ methods)
│   │   └── operations.py    # Individual operations
│   ├── templates/
│   │   └── __init__.py      # Template save/load functions
│   ├── timeline/
│   │   └── tracker.py       # Time mapping for compound operations
│   └── utils/
│       └── helpers.py       # GPU detection, temp files
├── tests/                    # Comprehensive test suite
├── pyproject.toml           # Project configuration
└── README.md
```

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Ensure tests pass (`uv run pytest`)
4. Ensure linting passes (`uv run ruff check .`)
5. Ensure type checking passes (`uv run mypy video_editor`)
6. Submit a pull request

---

## License

MIT License - see LICENSE file for details.

---

## Acknowledgments

- Built on [FFmpeg](https://ffmpeg.org/) - the Swiss Army knife of video processing
- Uses [FastMCP](https://github.com/jlowin/fastmcp) for MCP server implementation
- Transcription powered by [Faster-Whisper](https://github.com/SYSTRAN/faster-whisper)
- Designed for use with Claude and other LLM assistants
