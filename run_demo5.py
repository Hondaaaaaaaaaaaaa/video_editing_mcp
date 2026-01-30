#!/usr/bin/env python3
"""
Demo 5: Advanced Audio Capabilities

This demo showcases the new advanced audio editing features:
- Audio layering with precise timing
- Audio transitions (fade in, fade out, crossfade)
- Targeted audio segment modification
- Voice isolation (requires demucs)
- VST plugin support (requires pedalboard)
"""

from __future__ import annotations

import os
import sys
import subprocess
import json

# Add FFmpeg to PATH
ffmpeg_path = r"C:\Users\MASTE\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin"
os.environ["PATH"] = ffmpeg_path + os.pathsep + os.environ.get("PATH", "")

# Add project to Python path
sys.path.insert(0, r"E:\DL\Projects\VEMCP")

from video_editor.pipeline import VideoPipeline
from video_editor.audio import check_audio_dependencies, check_vad_dependencies

# Paths
INPUT_VIDEO = r"E:\DL\Projects\VEMCP\media\3. Please Be Fair.mp4"
OUTPUT_DIR = r"E:\DL\Projects\VEMCP\media\demo_outputs_audio"

os.makedirs(OUTPUT_DIR, exist_ok=True)


def get_duration(path: str) -> float:
    """Get video/audio duration using ffprobe."""
    result = subprocess.run(
        [os.path.join(ffmpeg_path, "ffprobe.exe"), "-v", "quiet", "-print_format", "json", "-show_format", path],
        capture_output=True, text=True
    )
    try:
        data = json.loads(result.stdout)
        return float(data["format"]["duration"])
    except (json.JSONDecodeError, KeyError, ValueError, TypeError):
        return 0


def create_test_audio(output_path: str, frequency: int = 440, duration: float = 5.0) -> str:
    """Create a test audio file using FFmpeg."""
    cmd = [
        os.path.join(ffmpeg_path, "ffmpeg.exe"), "-y",
        "-f", "lavfi",
        "-i", f"sine=frequency={frequency}:duration={duration}",
        "-c:a", "libmp3lame",
        output_path
    ]
    subprocess.run(cmd, capture_output=True)
    return output_path


def demo_audio_layer_basic():
    """Demo: Add an audio layer with timing."""
    print("\n=== Demo: Audio Layer - Basic ===")

    # Create a sound effect
    sfx_path = os.path.join(OUTPUT_DIR, "sfx_ding.mp3")
    create_test_audio(sfx_path, frequency=880, duration=1.0)

    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_audio_layer(sfx_path, start_time=3.0, volume=0.8)
    output = pipeline.render(output_dir=OUTPUT_DIR)

    final_path = os.path.join(OUTPUT_DIR, "01_audio_layer_basic.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)

    print(f"Created: {final_path}")
    print(f"Duration: {get_duration(final_path):.2f}s")
    print("Audio layer added at 3 seconds with 0.8 volume")
    return final_path


def demo_audio_layer_with_fades():
    """Demo: Add an audio layer with fade in and fade out."""
    print("\n=== Demo: Audio Layer - With Fades ===")

    # Create background music
    music_path = os.path.join(OUTPUT_DIR, "bg_music.mp3")
    create_test_audio(music_path, frequency=220, duration=15.0)

    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_audio_layer(
        music_path,
        start_time=0,
        end_time=8.0,
        volume=0.4,
        fade_in=1.5,
        fade_out=1.5
    )
    output = pipeline.render(output_dir=OUTPUT_DIR)

    final_path = os.path.join(OUTPUT_DIR, "02_audio_layer_fades.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)

    print(f"Created: {final_path}")
    print("Background music with 1.5s fade in and 1.5s fade out")
    return final_path


def demo_sound_effect():
    """Demo: Add sound effects at specific times."""
    print("\n=== Demo: Sound Effects ===")

    # Create sound effects
    ding_path = os.path.join(OUTPUT_DIR, "ding.mp3")
    whoosh_path = os.path.join(OUTPUT_DIR, "whoosh.mp3")
    create_test_audio(ding_path, frequency=1000, duration=0.5)
    create_test_audio(whoosh_path, frequency=300, duration=0.3)

    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_sound_effect(ding_path, at_time=2.0, volume=1.0)
    pipeline.add_sound_effect(whoosh_path, at_time=5.0, volume=0.7)
    pipeline.add_sound_effect(ding_path, at_time=8.0, volume=0.8)
    output = pipeline.render(output_dir=OUTPUT_DIR)

    final_path = os.path.join(OUTPUT_DIR, "03_sound_effects.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)

    print(f"Created: {final_path}")
    print("Sound effects added at 2s, 5s, and 8s")
    return final_path


def demo_audio_fade_in():
    """Demo: Audio fade in effect."""
    print("\n=== Demo: Audio Fade In ===")

    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_audio_fade_in(duration=3.0)
    output = pipeline.render(output_dir=OUTPUT_DIR)

    final_path = os.path.join(OUTPUT_DIR, "04_audio_fade_in.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)

    print(f"Created: {final_path}")
    print("3 second fade in from silence")
    return final_path


def demo_audio_fade_out():
    """Demo: Audio fade out effect."""
    print("\n=== Demo: Audio Fade Out ===")

    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_audio_fade_out(duration=3.0)
    output = pipeline.render(output_dir=OUTPUT_DIR)

    final_path = os.path.join(OUTPUT_DIR, "05_audio_fade_out.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)

    print(f"Created: {final_path}")
    print("3 second fade out to silence at end")
    return final_path


def demo_audio_fade_both():
    """Demo: Both fade in and fade out."""
    print("\n=== Demo: Audio Fade In + Out ===")

    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_audio_fade_in(duration=2.0)
    pipeline.add_audio_fade_out(duration=2.0)
    output = pipeline.render(output_dir=OUTPUT_DIR)

    final_path = os.path.join(OUTPUT_DIR, "06_audio_fade_both.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)

    print(f"Created: {final_path}")
    print("2s fade in and 2s fade out")
    return final_path


def demo_audio_crossfade():
    """Demo: Audio crossfade effect."""
    print("\n=== Demo: Audio Crossfade ===")

    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_audio_crossfade(at_time=5.0, duration=1.0)
    output = pipeline.render(output_dir=OUTPUT_DIR)

    final_path = os.path.join(OUTPUT_DIR, "07_audio_crossfade.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)

    print(f"Created: {final_path}")
    print("Crossfade at 5s with 1s duration")
    return final_path


def demo_modify_segment_volume():
    """Demo: Modify volume of a specific segment."""
    print("\n=== Demo: Segment Volume Modification ===")

    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    # Make segment from 3-6s quieter
    pipeline.modify_audio_segment(start_time=3.0, end_time=6.0, volume=0.3)
    output = pipeline.render(output_dir=OUTPUT_DIR)

    final_path = os.path.join(OUTPUT_DIR, "08_segment_volume.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)

    print(f"Created: {final_path}")
    print("Volume reduced to 30% between 3-6 seconds")
    return final_path


def demo_change_pitch():
    """Demo: Change audio pitch."""
    print("\n=== Demo: Change Pitch ===")

    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.change_pitch(semitones=3)  # Raise pitch 3 semitones
    output = pipeline.render(output_dir=OUTPUT_DIR)

    final_path = os.path.join(OUTPUT_DIR, "09_pitch_up.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)

    print(f"Created: {final_path}")
    print("Pitch raised 3 semitones")
    return final_path


def demo_change_pitch_down():
    """Demo: Lower audio pitch."""
    print("\n=== Demo: Lower Pitch ===")

    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.change_pitch(semitones=-4)  # Lower pitch 4 semitones
    output = pipeline.render(output_dir=OUTPUT_DIR)

    final_path = os.path.join(OUTPUT_DIR, "10_pitch_down.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)

    print(f"Created: {final_path}")
    print("Pitch lowered 4 semitones")
    return final_path


def demo_change_audio_speed():
    """Demo: Change audio speed (without pitch change)."""
    print("\n=== Demo: Change Audio Speed ===")

    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.change_audio_speed(factor=1.5)  # 50% faster
    output = pipeline.render(output_dir=OUTPUT_DIR)

    final_path = os.path.join(OUTPUT_DIR, "11_audio_speed_up.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)

    print(f"Created: {final_path}")
    print("Audio sped up 50% (pitch preserved)")
    return final_path


def demo_combined_effects():
    """Demo: Combine multiple audio effects."""
    print("\n=== Demo: Combined Audio Effects ===")

    # Create background music
    music_path = os.path.join(OUTPUT_DIR, "bg_combined.mp3")
    create_test_audio(music_path, frequency=220, duration=15.0)

    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 15)

    # Add background music with fade
    pipeline.add_audio_layer(music_path, start_time=0, volume=0.3, fade_in=2.0)

    # Fade in the main audio
    pipeline.add_audio_fade_in(duration=1.5)

    # Quiet segment in the middle
    pipeline.modify_audio_segment(start_time=5.0, end_time=10.0, volume=0.5)

    # Fade out at the end
    pipeline.add_audio_fade_out(duration=2.0)

    output = pipeline.render(output_dir=OUTPUT_DIR)

    final_path = os.path.join(OUTPUT_DIR, "12_combined_effects.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)

    print(f"Created: {final_path}")
    print("Combined: background music + fade in + quiet segment + fade out")
    return final_path


def demo_voice_isolation():
    """Demo: Voice isolation (requires demucs)."""
    print("\n=== Demo: Voice Isolation ===")

    missing = check_audio_dependencies()
    if "demucs" in missing:
        print("SKIPPED: demucs not installed")
        print("Install with: pip install demucs")
        return None

    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)

    # Extract vocals
    vocals_path = pipeline.isolate_vocals(output_dir=OUTPUT_DIR)
    print(f"Vocals extracted to: {vocals_path}")

    # Extract instrumental
    instrumental_path = pipeline.isolate_music(output_dir=OUTPUT_DIR)
    print(f"Instrumental extracted to: {instrumental_path}")

    return vocals_path, instrumental_path


def demo_vst_plugins():
    """Demo: VST plugin support (requires pedalboard)."""
    print("\n=== Demo: VST Plugin Support ===")

    missing = check_audio_dependencies()
    if "pedalboard" in missing:
        print("SKIPPED: pedalboard not installed")
        print("Install with: pip install pedalboard")
        return None

    # List available VST plugins
    plugins = VideoPipeline.list_available_vst_plugins()

    if not plugins:
        print("No VST plugins found on this system")
        print("Standard search paths:")
        from video_editor.audio.vst_processor import VSTProcessor
        for path in VSTProcessor.get_vst_search_paths():
            print(f"  - {path}")
        return None

    print(f"Found {len(plugins)} VST plugins:")
    for p in plugins[:5]:  # Show first 5
        print(f"  - {p['name']} ({p['type']})")
    if len(plugins) > 5:
        print(f"  ... and {len(plugins) - 5} more")

    # Get parameters for first plugin
    first_plugin = plugins[0]
    params = VideoPipeline.get_vst_plugin_parameters(first_plugin['path'])
    print(f"\nParameters for {first_plugin['name']}:")
    for name, (min_val, max_val, default) in list(params.items())[:5]:
        print(f"  - {name}: {min_val} to {max_val} (default: {default})")

    return plugins


def check_dependencies():
    """Check and report on advanced audio dependencies."""
    print("\n=== Checking Advanced Audio Dependencies ===")

    missing = check_audio_dependencies()

    if not missing:
        print("All advanced audio dependencies are installed!")
    else:
        print("Missing dependencies:")
        for dep in missing:
            print(f"  - {dep}")
        print("\nInstall with: pip install -r requirements-audio.txt")

    # Check VAD backends
    print("\n=== Checking VAD Backends ===")
    vad_status = check_vad_dependencies()
    for backend, available in vad_status.items():
        status = "available" if available else "not installed"
        print(f"  - {backend}: {status}")

    return missing


def demo_cut_silences():
    """Demo: Cut silences using auto-editor or FFmpeg (RECOMMENDED)."""
    print("\n=== Demo: Cut Silences (Professional Method) ===")

    # Check available tools
    tools = VideoPipeline.check_silence_removal_tools()
    print(f"Available tools: {tools}")

    # First trim to work with a 60-second segment
    trimmed_path = os.path.join(OUTPUT_DIR, "temp_trimmed.mp4")
    trim_cmd = [
        os.path.join(ffmpeg_path, "ffmpeg.exe"), "-y",
        "-i", INPUT_VIDEO,
        "-ss", "0", "-t", "60",
        "-c", "copy",
        trimmed_path
    ]
    subprocess.run(trim_cmd, capture_output=True)

    original_duration = get_duration(trimmed_path)
    print(f"Original duration: {original_duration:.2f}s")

    # Use the trimmed video for silence removal
    pipeline2 = VideoPipeline(trimmed_path)

    try:
        output = pipeline2.cut_silences(
            noise_threshold_db=-30,
            min_silence_duration=0.3,
            padding=0.1,
            method="auto",
            output_dir=OUTPUT_DIR,
        )

        final_path = os.path.join(OUTPUT_DIR, "20_cut_silences.mp4")
        if os.path.exists(final_path):
            os.remove(final_path)
        if os.path.exists(output):
            os.rename(output, final_path)

        new_duration = get_duration(final_path)
        print(f"Created: {final_path}")
        print(f"New duration: {new_duration:.2f}s")
        print(f"Removed: {original_duration - new_duration:.2f}s of silence")
        return final_path
    except Exception as e:
        print(f"Error: {e}")
        return None
    finally:
        # Cleanup temp file
        if os.path.exists(trimmed_path):
            os.remove(trimmed_path)


def demo_cut_silences_aggressive():
    """Demo: More aggressive silence cutting."""
    print("\n=== Demo: Aggressive Silence Cutting ===")

    # First trim
    trimmed_path = os.path.join(OUTPUT_DIR, "temp_trimmed2.mp4")
    trim_cmd = [
        os.path.join(ffmpeg_path, "ffmpeg.exe"), "-y",
        "-i", INPUT_VIDEO,
        "-ss", "0", "-t", "60",
        "-c", "copy",
        trimmed_path
    ]
    subprocess.run(trim_cmd, capture_output=True)

    original_duration = get_duration(trimmed_path)
    print(f"Original duration: {original_duration:.2f}s")

    pipeline2 = VideoPipeline(trimmed_path)

    try:
        # More aggressive: higher threshold catches more "silence"
        output = pipeline2.cut_silences(
            noise_threshold_db=-25,  # Higher = catches more
            min_silence_duration=0.2,  # Shorter = catches brief pauses
            padding=0.05,  # Less padding
            method="auto",
            output_dir=OUTPUT_DIR,
        )

        final_path = os.path.join(OUTPUT_DIR, "21_cut_silences_aggressive.mp4")
        if os.path.exists(final_path):
            os.remove(final_path)
        if os.path.exists(output):
            os.rename(output, final_path)

        new_duration = get_duration(final_path)
        print(f"Created: {final_path}")
        print(f"New duration: {new_duration:.2f}s")
        print(f"Removed: {original_duration - new_duration:.2f}s")
        return final_path
    except Exception as e:
        print(f"Error: {e}")
        return None
    finally:
        if os.path.exists(trimmed_path):
            os.remove(trimmed_path)


def demo_speed_up_silences():
    """Demo: Speed up silences instead of cutting (requires auto-editor)."""
    print("\n=== Demo: Speed Up Silences (Smoother) ===")

    from video_editor.audio.silence_removal import is_auto_editor_available

    if not is_auto_editor_available():
        print("SKIPPED: Requires auto-editor")
        print("Install with: pip install auto-editor")
        return None

    # Trim first
    trimmed_path = os.path.join(OUTPUT_DIR, "temp_trimmed3.mp4")
    trim_cmd = [
        os.path.join(ffmpeg_path, "ffmpeg.exe"), "-y",
        "-i", INPUT_VIDEO,
        "-ss", "0", "-t", "60",
        "-c", "copy",
        trimmed_path
    ]
    subprocess.run(trim_cmd, capture_output=True)

    original_duration = get_duration(trimmed_path)
    print(f"Original duration: {original_duration:.2f}s")

    pipeline = VideoPipeline(trimmed_path)

    try:
        output = pipeline.speed_up_silences(
            silent_speed=6.0,  # 6x speed for silences
            noise_threshold_db=-30,
            padding=0.1,
            output_dir=OUTPUT_DIR,
        )

        final_path = os.path.join(OUTPUT_DIR, "22_speed_up_silences.mp4")
        if os.path.exists(final_path):
            os.remove(final_path)
        if os.path.exists(output):
            os.rename(output, final_path)

        new_duration = get_duration(final_path)
        print(f"Created: {final_path}")
        print(f"New duration: {new_duration:.2f}s")
        print(f"Saved: {original_duration - new_duration:.2f}s")
        return final_path
    except Exception as e:
        print(f"Error: {e}")
        return None
    finally:
        if os.path.exists(trimmed_path):
            os.remove(trimmed_path)


def demo_detect_silent_segments():
    """Demo: Detect silent segments (for analysis)."""
    print("\n=== Demo: Detect Silent Segments ===")

    from video_editor.audio.silence_removal import detect_silent_segments

    # Trim first
    trimmed_path = os.path.join(OUTPUT_DIR, "temp_trimmed4.mp4")
    trim_cmd = [
        os.path.join(ffmpeg_path, "ffmpeg.exe"), "-y",
        "-i", INPUT_VIDEO,
        "-ss", "0", "-t", "30",
        "-c", "copy",
        trimmed_path
    ]
    subprocess.run(trim_cmd, capture_output=True)

    try:
        segments = detect_silent_segments(
            trimmed_path,
            noise_threshold_db=-30,
            min_silence_duration=0.3,
        )

        silent_segments = [s for s in segments if s.is_silent]
        speech_segments = [s for s in segments if not s.is_silent]

        print(f"Found {len(silent_segments)} silent segments:")
        total_silence = 0
        for i, seg in enumerate(silent_segments[:10]):
            print(f"  {i+1}. {seg.start:.2f}s - {seg.end:.2f}s ({seg.duration:.2f}s)")
            total_silence += seg.duration

        if len(silent_segments) > 10:
            for seg in silent_segments[10:]:
                total_silence += seg.duration
            print(f"  ... and {len(silent_segments) - 10} more")

        print(f"\nTotal silence: {total_silence:.2f}s")
        print(f"Speech segments: {len(speech_segments)}")

        return segments
    except Exception as e:
        print(f"Error: {e}")
        return None
    finally:
        if os.path.exists(trimmed_path):
            os.remove(trimmed_path)


def main():
    """Run all demos."""
    print("=" * 60)
    print("DEMO 5: Advanced Audio Capabilities")
    print("=" * 60)

    # Check dependencies first
    check_dependencies()

    # Basic FFmpeg-based features (always available)
    print("\n" + "=" * 60)
    print("PART 1: Audio Layering (FFmpeg-based)")
    print("=" * 60)

    try:
        demo_audio_layer_basic()
        demo_audio_layer_with_fades()
        demo_sound_effect()
    except Exception as e:
        print(f"Error in audio layering demos: {e}")

    print("\n" + "=" * 60)
    print("PART 2: Audio Transitions (FFmpeg-based)")
    print("=" * 60)

    try:
        demo_audio_fade_in()
        demo_audio_fade_out()
        demo_audio_fade_both()
        demo_audio_crossfade()
    except Exception as e:
        print(f"Error in audio transition demos: {e}")

    print("\n" + "=" * 60)
    print("PART 3: Audio Segment Modification (FFmpeg-based)")
    print("=" * 60)

    try:
        demo_modify_segment_volume()
        demo_change_pitch()
        demo_change_pitch_down()
        demo_change_audio_speed()
    except Exception as e:
        print(f"Error in segment modification demos: {e}")

    print("\n" + "=" * 60)
    print("PART 4: Combined Effects")
    print("=" * 60)

    try:
        demo_combined_effects()
    except Exception as e:
        print(f"Error in combined effects demo: {e}")

    print("\n" + "=" * 60)
    print("PART 5: Voice Isolation (requires demucs)")
    print("=" * 60)

    try:
        demo_voice_isolation()
    except Exception as e:
        print(f"Error in voice isolation demo: {e}")

    print("\n" + "=" * 60)
    print("PART 6: VST Plugin Support (requires pedalboard)")
    print("=" * 60)

    try:
        demo_vst_plugins()
    except Exception as e:
        print(f"Error in VST plugin demo: {e}")

    print("\n" + "=" * 60)
    print("PART 7: Professional Silence Removal")
    print("=" * 60)
    print("Uses auto-editor (if installed) or FFmpeg select filters")
    print("Install auto-editor for best results: pip install auto-editor")

    try:
        demo_detect_silent_segments()
        demo_cut_silences()
        demo_cut_silences_aggressive()
        demo_speed_up_silences()
    except Exception as e:
        print(f"Error in silence removal demos: {e}")
        import traceback
        traceback.print_exc()

    print("\n" + "=" * 60)
    print("DEMO COMPLETE")
    print(f"Output files saved to: {OUTPUT_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
