#!/usr/bin/env python3
"""Comprehensive demo script for remaining VEMCP features."""

from __future__ import annotations

import os
import sys

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


def demo_loop_fixed():
    """Demo: Loop 3x (fixed - should be 9 seconds)."""
    print("\n=== Demo: Loop 3x (FIXED) ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 3)  # 3 second clip
    pipeline.add_loop(count=3)  # Should produce 9 seconds
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "40_loop_3x_fixed.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)

    # Verify duration
    import subprocess
    import json

    result = subprocess.run(
        [os.path.join(ffmpeg_path, "ffprobe.exe"), "-v", "quiet", "-print_format", "json", "-show_format", final_path], capture_output=True, text=True
    )
    data = json.loads(result.stdout)
    duration = float(data["format"]["duration"])
    print(f"Created: {final_path}")
    print(f"Duration: {duration:.2f}s (expected ~9s)")
    return final_path


def demo_boomerang_fixed():
    """Demo: Boomerang (fixed - should be 6 seconds)."""
    print("\n=== Demo: Boomerang (FIXED) ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 3)  # 3 second clip
    pipeline.add_boomerang()  # Should produce 6 seconds
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "41_boomerang_fixed.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)

    # Verify duration
    import subprocess
    import json

    result = subprocess.run(
        [os.path.join(ffmpeg_path, "ffprobe.exe"), "-v", "quiet", "-print_format", "json", "-show_format", final_path], capture_output=True, text=True
    )
    data = json.loads(result.stdout)
    duration = float(data["format"]["duration"])
    print(f"Created: {final_path}")
    print(f"Duration: {duration:.2f}s (expected ~6s)")
    return final_path


def demo_remove_silence():
    """Demo: Remove silence from video."""
    print("\n=== Demo: Remove Silence ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 30)  # First 30 seconds
    pipeline.remove_silences(threshold=-30, min_silence_duration=0.5)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "42_silence_removed.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_pip():
    """Demo: Picture-in-Picture overlay."""
    print("\n=== Demo: Picture-in-Picture ===")
    # Create a PiP video using part of the same video
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    # Use same video shifted as PiP (showing different part)
    pipeline.add_pip(
        pip_video=INPUT_VIDEO,
        position="bottom-right",
        size=0.25,  # 25% of main video
        start_time=0,
        end_time=10,
    )
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "43_pip_overlay.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_split_screen():
    """Demo: Split screen layout."""
    print("\n=== Demo: Split Screen (Horizontal) ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    # Horizontal split with same video (showing comparison)
    pipeline.add_split_screen(
        videos=[INPUT_VIDEO],  # Add one more video to split with
        layout="horizontal",
    )
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "44_split_screen.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_add_text():
    """Demo: Add static text overlay."""
    print("\n=== Demo: Static Text Overlay ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_text(text="VEMCP Demo", x=50, y=50, font_size=48, color="white")
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "45_with_text.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_animated_text():
    """Demo: Animated text with fade in."""
    print("\n=== Demo: Animated Text (Fade In) ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_animated_text(
        text="Hello World!", animation="fade_in", duration=1.0, start_time=1.0, position="center", font_size=64, color="yellow"
    )
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "46_animated_text.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_animated_text_slide():
    """Demo: Animated text sliding from left."""
    print("\n=== Demo: Animated Text (Slide In Left) ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_animated_text(
        text="Sliding Text", animation="slide_in_left", duration=0.5, start_time=1.0, position="center", font_size=48, color="cyan"
    )
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "47_text_slide_in.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_audio_ducking():
    """Demo: Audio ducking (lower music when speech detected)."""
    print("\n=== Demo: Audio Ducking ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 15)
    pipeline.add_audio_ducking(duck_amount=0.3, threshold=-25)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "48_audio_ducking.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_loudness_normalization():
    """Demo: Audio loudness normalization."""
    print("\n=== Demo: Loudness Normalization (YouTube -14 LUFS) ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    # Use direct parameters instead of preset
    pipeline.add_loudness_normalization(target_lufs=-14.0, true_peak=-1.0)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "49_loudness_normalized.mp4")
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
    final_path = os.path.join(OUTPUT_DIR, "50_ken_burns.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_extract_frames():
    """Demo: Extract frames at regular intervals."""
    print("\n=== Demo: Extract Frames ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    # Extract frames every 10 seconds
    frames = pipeline.extract_frames(interval=30, output_dir=OUTPUT_DIR)
    print(f"Extracted {len(frames)} frames")
    for i, frame in enumerate(frames[:5]):  # Show first 5
        final = os.path.join(OUTPUT_DIR, f"51_frame_{i + 1}.jpg")
        if os.path.exists(final):
            os.remove(final)
        os.rename(frame, final)
        print(f"  - {final}")
    return frames


def demo_stabilization():
    """Demo: Video stabilization."""
    print("\n=== Demo: Video Stabilization ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_stabilization(shakiness=5, smoothing=10, zoom=5)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "52_stabilized.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_scan_lines():
    """Demo: CRT scan lines effect."""
    print("\n=== Demo: Scan Lines Effect ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_scan_lines(intensity=0.3)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "53_scan_lines.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_letterbox_blur():
    """Demo: Letterbox with blurred bars."""
    print("\n=== Demo: Letterbox with Blurred Bars ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_letterbox(aspect_ratio="9:16", blur_bars=True)  # Portrait mode with blur
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "54_letterbox_blur.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_scene_detection():
    """Demo: Scene detection analysis."""
    print("\n=== Demo: Scene Detection ===")
    from video_editor.analysis import detect_scenes

    scenes = detect_scenes(INPUT_VIDEO, threshold=30.0)
    print(f"Detected {len(scenes)} scenes:")
    for i, scene in enumerate(scenes[:10]):  # Show first 10
        print(f"  Scene {i + 1}: {scene['start']:.2f}s - {scene['end']:.2f}s")
    return scenes


def demo_loudness_analysis():
    """Demo: Loudness analysis."""
    print("\n=== Demo: Loudness Analysis ===")
    from video_editor.analysis import get_loudness

    loudness = get_loudness(INPUT_VIDEO)
    print("Loudness analysis:")
    print(f"  Integrated: {loudness['integrated_lufs']:.1f} LUFS")
    print(f"  True Peak: {loudness['true_peak']:.1f} dBTP")
    print(f"  LRA: {loudness['lra']:.1f} LU")
    return loudness


def demo_combined_cinematic():
    """Demo: Combined cinematic look with multiple effects."""
    print("\n=== Demo: Full Cinematic Pipeline ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(30, 45)  # 15 second clip
    pipeline.add_letterbox(aspect_ratio="2.35:1")  # Cinematic aspect
    pipeline.add_vignette(intensity=0.4)
    pipeline.color_grade(contrast=1.1, saturation=0.85)  # Slightly desaturated
    pipeline.add_film_grain(intensity=0.15)
    pipeline.add_animated_text(
        text="A VEMCP Production",
        animation="fade_in",
        duration=1.5,
        start_time=2.0,
        end_time=8.0,
        position="bottom-center",
        font_size=36,
        color="white",
    )
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "55_full_cinematic.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def main():
    """Run comprehensive feature demos."""
    print("=" * 60)
    print("VEMCP Video Editor - Comprehensive Feature Test")
    print("=" * 60)

    demos = [
        # Fixed bugs
        demo_loop_fixed,
        demo_boomerang_fixed,
        # Remaining features
        demo_remove_silence,
        demo_pip,
        demo_split_screen,
        demo_add_text,
        demo_animated_text,
        demo_animated_text_slide,
        demo_audio_ducking,
        demo_loudness_normalization,
        demo_ken_burns,
        demo_extract_frames,
        demo_stabilization,
        demo_scan_lines,
        demo_letterbox_blur,
        # Analysis
        demo_scene_detection,
        demo_loudness_analysis,
        # Combined
        demo_combined_cinematic,
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
            print(f"  - {name}: {err}")
    print("=" * 60)


if __name__ == "__main__":
    main()
