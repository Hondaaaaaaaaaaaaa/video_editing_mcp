# VEMCP - Video Editor MCP Server

A professional video editing platform designed for LLM integration, providing comprehensive video editing through natural language commands via MCP (Model Context Protocol).

## Development Commands

All tools are managed via **uv** (not globally installed):

```bash
# Type checking
uv run mypy video_editor

# Linting
uv run ruff check .

# Auto-fix linting issues
uv run ruff check . --fix

# Format code
uv run ruff format .

# Run tests
uv run pytest

# Run specific test
uv run pytest tests/test_pipeline.py -v

# Run MCP server
uv run python server.py
```

## Project Structure

```
VEMCP/
├── video_editor/              # Main package
│   ├── __init__.py            # Package exports (12 core functions/classes)
│   ├── audio/                 # Advanced audio processing
│   │   ├── silence_removal.py # Silent segment detection & removal
│   │   ├── speech_detection.py# Voice Activity Detection (VAD)
│   │   ├── voice_isolation.py # Demucs-based voice isolation
│   │   ├── vst_processor.py   # VST3/VST2 plugin support
│   │   └── transitions.py     # Audio transition helpers
│   ├── analysis/              # Scene detection, loudness analysis
│   ├── batch/                 # Multi-file batch operations
│   ├── ffmpeg/                # Async FFmpeg execution
│   ├── pipeline/              # Core pipeline system
│   │   ├── core.py            # VideoPipeline class (60+ methods)
│   │   └── operations.py      # FFmpeg operation implementations
│   ├── templates/             # Save/load operation templates
│   ├── timeline/              # Time mapping for compound edits
│   └── utils/                 # GPU detection, temp file handling
├── tests/                     # Test suite (29 test files)
├── server.py                  # MCP server with 50+ tools
├── bin/                       # FFmpeg binaries (not in git)
└── media/                     # Example media files (not in git)
```

## Key Architecture

- **Pipeline Pattern**: Stateful operation queueing with single FFmpeg pass (no intermediate files)
- **Timeline Intelligence**: Tracks time modifications for compound operations
- **GPU Auto-detection**: NVIDIA CUDA support with CPU fallback
- **Strict Typing**: Full mypy strict mode compliance

## Dependencies

**Core** (in pyproject.toml):
- fastmcp, faster-whisper, scenedetect, opencv-python, numpy, Pillow

**Optional Audio** (requirements-audio.txt):
- demucs (voice isolation), pedalboard (VST plugins), librosa, torch/torchaudio

## Configuration

- **pyproject.toml**: Project config, mypy/ruff/pytest settings
- **uv.lock**: Locked dependencies for reproducible builds
- **pytest.ini**: Test configuration

## Testing

Tests use pytest with asyncio auto mode. Run full suite with `uv run pytest`.
