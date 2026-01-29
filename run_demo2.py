#!/usr/bin/env python3
"""Additional demo script for advanced VEMCP features."""

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


def demo_thumbnail_fixed():
    """Demo: Generate thumbnails (fixed API)."""
    print("\n=== Demo: Generate Thumbnails ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    # interval is in seconds - generate every 30 seconds
    output = pipeline.generate_thumbnails(interval=30, output_dir=OUTPUT_DIR, size=(320, 180))
    print(f"Created {len(output)} thumbnails:")
    for i, path in enumerate(output):
        final = os.path.join(OUTPUT_DIR, f"20_thumbnail_{i + 1}.jpg")
        if os.path.exists(final):
            os.remove(final)
        os.rename(path, final)
        print(f"  - {final}")
    return output


def demo_boomerang():
    """Demo: Boomerang effect (forward + backward)."""
    print("\n=== Demo: Boomerang Effect ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 3)  # Short clip
    pipeline.add_boomerang()
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "24_boomerang.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_negative():
    """Demo: Negative/inverted colors."""
    print("\n=== Demo: Negative Effect ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_negative()
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "25_negative.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_vintage():
    """Demo: Vintage color effect."""
    print("\n=== Demo: Vintage Effect ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_vintage()
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "26_vintage.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_color_tint():
    """Demo: Color tint (warm)."""
    print("\n=== Demo: Warm Color Tint ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_color_tint(tint="warm")
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "27_warm_tint.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_cool_tint():
    """Demo: Color tint (cool)."""
    print("\n=== Demo: Cool Color Tint ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_color_tint(tint="cool")
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "28_cool_tint.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_pixelate():
    """Demo: Pixelate region (privacy mosaic)."""
    print("\n=== Demo: Pixelate Region ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    # Pixelate center
    pipeline.add_pixelate_region(x=400, y=200, width=400, height=300, block_size=15)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "29_pixelated_region.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_motion_blur():
    """Demo: Motion blur effect."""
    print("\n=== Demo: Motion Blur ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_motion_blur(intensity=0.5)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "30_motion_blur.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_vhs():
    """Demo: VHS retro effect."""
    print("\n=== Demo: VHS Effect ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_vhs_effect()
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "31_vhs_effect.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_loudness_norm():
    """Demo: Audio loudness normalization."""
    print("\n=== Demo: Loudness Normalization ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_loudness_normalization(preset="youtube")
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "32_loudness_normalized.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_gaussian_blur():
    """Demo: Full frame gaussian blur."""
    print("\n=== Demo: Gaussian Blur ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_gaussian_blur(sigma=5.0)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "33_gaussian_blur.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_slowmo():
    """Demo: Slow motion (0.5x speed)."""
    print("\n=== Demo: Slow Motion 0.5x ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 5)  # 5 sec -> 10 sec
    pipeline.change_speed(0.5)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "34_slow_motion.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_cinematic():
    """Demo: Cinematic look - letterbox + vignette + color grade."""
    print("\n=== Demo: Cinematic Look ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(10, 20)
    pipeline.add_letterbox(aspect_ratio="21:9")
    pipeline.add_vignette(intensity=0.4)
    pipeline.color_grade(contrast=1.1, saturation=0.9)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "35_cinematic.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_dreamy():
    """Demo: Dreamy look - soft blur + warm tint + film grain."""
    print("\n=== Demo: Dreamy Look ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(20, 30)
    pipeline.add_soften(amount=0.3)
    pipeline.add_color_tint(tint="warm")
    pipeline.add_film_grain(intensity=0.2)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "36_dreamy.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def main():
    """Run additional demos."""
    print("=" * 60)
    print("VEMCP Video Editor - Advanced Feature Demos")
    print("=" * 60)

    demos = [
        demo_thumbnail_fixed,
        demo_boomerang,
        demo_negative,
        demo_vintage,
        demo_color_tint,
        demo_cool_tint,
        demo_pixelate,
        demo_motion_blur,
        demo_vhs,
        demo_loudness_norm,
        demo_gaussian_blur,
        demo_slowmo,
        demo_cinematic,
        demo_dreamy,
    ]

    successful = 0
    failed = 0

    for demo in demos:
        try:
            demo()
            successful += 1
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback

            traceback.print_exc()
            failed += 1

    print("\n" + "=" * 60)
    print(f"Completed: {successful}/{len(demos)} demos")
    if failed:
        print(f"Failed: {failed}")
    print("=" * 60)


if __name__ == "__main__":
    main()
