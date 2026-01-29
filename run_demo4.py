#!/usr/bin/env python3
"""Final comprehensive demo with corrected API calls."""

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

# Paths
INPUT_VIDEO = r"E:\DL\Projects\VEMCP\media\3. Please Be Fair.mp4"
OVERLAY_IMAGE = r"E:\DL\Projects\VEMCP\media\Screenshot 2026-01-02 182600.png"
OUTPUT_DIR = r"E:\DL\Projects\VEMCP\media\demo_outputs"

os.makedirs(OUTPUT_DIR, exist_ok=True)


def get_duration(path):
    """Get video/audio duration using ffprobe."""
    result = subprocess.run(
        [os.path.join(ffmpeg_path, "ffprobe.exe"), "-v", "quiet", "-print_format", "json", "-show_format", path], capture_output=True, text=True
    )
    try:
        data = json.loads(result.stdout)
        return float(data["format"]["duration"])
    except (json.JSONDecodeError, KeyError, ValueError, TypeError):
        return 0


def demo_loop_fixed():
    """Demo: Loop 3x - should produce 3 second clip repeated 3 times = 9 seconds."""
    print("\n=== Demo: Loop 3x (FIXED) ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 3)  # 3 second clip
    pipeline.add_loop(count=3)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "60_loop_3x_fixed.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    duration = get_duration(final_path)
    print(f"Created: {final_path}")
    print(f"Duration: {duration:.2f}s (expected ~9s)")
    assert 8 < duration < 10, f"Loop failed: expected ~9s, got {duration}s"
    return final_path


def demo_boomerang_fixed():
    """Demo: Boomerang - 3 second clip forward + backward = 6 seconds."""
    print("\n=== Demo: Boomerang (FIXED) ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 3)
    pipeline.add_boomerang()
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "61_boomerang_fixed.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    duration = get_duration(final_path)
    print(f"Created: {final_path}")
    print(f"Duration: {duration:.2f}s (expected ~6s)")
    assert 5 < duration < 7, f"Boomerang failed: expected ~6s, got {duration}s"
    return final_path


def demo_remove_silence():
    """Demo: Remove silence using correct API."""
    print("\n=== Demo: Remove Silence ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 30)
    # Correct API: noise_threshold not threshold
    pipeline.remove_silences(noise_threshold=-30, min_silence_duration=0.5)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "62_silence_removed.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    duration = get_duration(final_path)
    print(f"Created: {final_path}")
    print(f"Duration: {duration:.2f}s (original was 30s, should be shorter if silence was removed)")
    return final_path


def demo_extract_frames():
    """Demo: Extract frames at specific timestamps."""
    print("\n=== Demo: Extract Frames ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    # Correct API: timestamps is a list of seconds, not interval
    frames = pipeline.extract_frames(timestamps=[0, 30, 60, 90, 120], output_dir=OUTPUT_DIR)
    print(f"Extracted {len(frames)} frames:")
    for i, frame in enumerate(frames):
        final = os.path.join(OUTPUT_DIR, f"63_frame_{i + 1}.png")
        if os.path.exists(final):
            os.remove(final)
        os.rename(frame, final)
        print(f"  - {final}")
    return frames


def demo_stabilization():
    """Demo: Video stabilization (path fix for Windows)."""
    print("\n=== Demo: Video Stabilization ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_stabilization(shakiness=5, smoothing=10, zoom=5)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "64_stabilized.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_loudness_normalization():
    """Demo: Loudness normalization."""
    print("\n=== Demo: Loudness Normalization ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    # Just use default parameters
    pipeline.add_loudness_normalization()
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "65_loudness_normalized.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_cinematic():
    """Demo: Full cinematic pipeline with 2.35:1 letterbox."""
    print("\n=== Demo: Full Cinematic (2.35:1) ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(30, 45)
    pipeline.add_letterbox(aspect_ratio="2.35:1")  # Now supports decimal
    pipeline.add_vignette(intensity=0.4)
    pipeline.color_grade(contrast=1.1, saturation=0.85)
    pipeline.add_film_grain(intensity=0.15)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "66_cinematic_2351.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_pip():
    """Demo: Picture-in-Picture."""
    print("\n=== Demo: Picture-in-Picture ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_pip(pip_video=INPUT_VIDEO, position="bottom-right", size=0.25, start_time=0, end_time=10)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "67_pip.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_split_screen():
    """Demo: Split screen horizontal."""
    print("\n=== Demo: Split Screen ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_split_screen(videos=[INPUT_VIDEO], layout="horizontal")
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "68_split_screen.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_animated_text():
    """Demo: Animated text with various animations."""
    print("\n=== Demo: Animated Text (Slide + Fade) ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_animated_text(
        text="VEMCP Demo!", animation="slide_in_bottom", duration=0.5, start_time=1.0, position="bottom-center", font_size=48, color="white"
    )
    pipeline.add_animated_text(
        text="Video Editor", animation="fade_in", duration=1.0, start_time=3.0, position="top-center", font_size=36, color="yellow"
    )
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "69_animated_text_multi.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_audio_ducking():
    """Demo: Audio ducking."""
    print("\n=== Demo: Audio Ducking ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 15)
    pipeline.add_audio_ducking(duck_amount=0.3, threshold=-25)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "70_audio_ducking.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_ken_burns():
    """Demo: Ken Burns zoom effect."""
    print("\n=== Demo: Ken Burns Effect ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_ken_burns(zoom_start=1.0, zoom_end=1.3, pan_direction="left_to_right")
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "71_ken_burns.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_scene_split():
    """Demo: Split video by scenes."""
    print("\n=== Demo: Split by Scenes ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    outputs = pipeline.split_by_scenes(threshold=30.0, output_dir=OUTPUT_DIR, prefix="72_scene_")
    print(f"Split into {len(outputs)} scene files:")
    for p in outputs[:5]:  # Show first 5
        print(f"  - {p}")
    return outputs


def demo_letterbox_blur():
    """Demo: Portrait letterbox with blur bars (9:16 for phone)."""
    print("\n=== Demo: Portrait Letterbox with Blur ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_letterbox(aspect_ratio="9:16", blur_bars=True)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "73_portrait_blur.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_analysis():
    """Demo: Scene detection and loudness analysis."""
    print("\n=== Demo: Analysis Features ===")
    from video_editor.analysis import detect_scenes, get_loudness

    print("\nScene Detection:")
    scenes = detect_scenes(INPUT_VIDEO, threshold=30.0)
    print(f"  Detected {len(scenes)} scenes")
    for i, s in enumerate(scenes[:5]):
        print(f"    Scene {i + 1}: {s['start']:.2f}s - {s['end']:.2f}s")

    print("\nLoudness Analysis:")
    loudness = get_loudness(INPUT_VIDEO)
    print(f"  Integrated: {loudness['integrated_lufs']:.1f} LUFS")
    print(f"  True Peak: {loudness['true_peak']:.1f} dBTP")
    print(f"  LRA: {loudness['lra']:.1f} LU")

    return scenes, loudness


def main():
    """Run all demos."""
    print("=" * 60)
    print("VEMCP Video Editor - Final Comprehensive Demo")
    print("=" * 60)

    demos = [
        # Critical fixes
        demo_loop_fixed,
        demo_boomerang_fixed,
        demo_remove_silence,
        demo_extract_frames,
        demo_stabilization,
        demo_loudness_normalization,
        demo_cinematic,
        # Additional features
        demo_pip,
        demo_split_screen,
        demo_animated_text,
        demo_audio_ducking,
        demo_ken_burns,
        demo_scene_split,
        demo_letterbox_blur,
        demo_analysis,
    ]

    successful = 0
    failed = 0
    errors = []

    for demo in demos:
        try:
            demo()
            successful += 1
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback

            traceback.print_exc()
            errors.append((demo.__name__, str(e)))
            failed += 1

    print("\n" + "=" * 60)
    print(f"Completed: {successful}/{len(demos)} demos")
    if failed:
        print(f"Failed: {failed}")
        for name, err in errors:
            print(f"  - {name}: {err[:100]}")
    print("=" * 60)


if __name__ == "__main__":
    main()
