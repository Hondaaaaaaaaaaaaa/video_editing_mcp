#!/usr/bin/env python3
"""Demo script to test VEMCP video editor features."""

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


def demo_trim():
    """Demo 1: Trim video to first 10 seconds."""
    print("\n=== Demo 1: Trim (first 10 seconds) ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    # Rename to meaningful name
    final_path = os.path.join(OUTPUT_DIR, "01_trimmed_first_10sec.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_scale():
    """Demo 2: Scale video to 640x360."""
    print("\n=== Demo 2: Scale to 640x360 ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)  # Short clip for demo
    pipeline.scale(640, 360)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "02_scaled_640x360.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_overlay():
    """Demo 3: Overlay image on video."""
    print("\n=== Demo 3: Image Overlay (watermark) ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.overlay(OVERLAY_IMAGE, x=50, y=50)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "03_with_image_overlay.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_speed():
    """Demo 4: Speed up video 2x."""
    print("\n=== Demo 4: Speed 2x ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.change_speed(2.0)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "04_speed_2x.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_color_grade():
    """Demo 5: Color grading - increase saturation and brightness."""
    print("\n=== Demo 5: Color Grade (saturated + bright) ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.color_grade(brightness=0.1, saturation=1.5)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "05_color_graded.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_black_and_white():
    """Demo 6: Black and white effect."""
    print("\n=== Demo 6: Black and White ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_black_and_white()
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "06_black_and_white.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_vignette():
    """Demo 7: Vignette effect."""
    print("\n=== Demo 7: Vignette Effect ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_vignette(intensity=0.5)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "07_vignette.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_sepia():
    """Demo 8: Sepia/vintage effect."""
    print("\n=== Demo 8: Sepia Effect ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_sepia()
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "08_sepia_vintage.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_rotate():
    """Demo 9: Rotate 90 degrees."""
    print("\n=== Demo 9: Rotate 90 degrees ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.rotate(90)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "09_rotated_90deg.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_flip():
    """Demo 10: Flip horizontal (mirror)."""
    print("\n=== Demo 10: Flip Horizontal (mirror) ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.flip(horizontal=True)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "10_flipped_mirror.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_crop():
    """Demo 11: Crop to center 640x360."""
    print("\n=== Demo 11: Crop to center 640x360 ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    # Crop center region (320 from left, 180 from top)
    pipeline.crop(x=320, y=180, width=640, height=360)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "11_cropped_center.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_border():
    """Demo 12: Add border/padding."""
    print("\n=== Demo 12: Add Border ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_border(width=20, color="red")
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "12_with_border.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_letterbox():
    """Demo 13: Letterbox to 21:9 ultrawide."""
    print("\n=== Demo 13: Letterbox 21:9 ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_letterbox(aspect_ratio="21:9", color="black")
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "13_letterbox_21_9.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_reverse():
    """Demo 14: Reverse video."""
    print("\n=== Demo 14: Reverse Video ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 5)  # Shorter for reverse (resource intensive)
    pipeline.add_reverse()
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "14_reversed.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_loop():
    """Demo 15: Loop video 3 times."""
    print("\n=== Demo 15: Loop 3x ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 3)  # Short clip
    pipeline.add_loop(count=3)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "15_looped_3x.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_blur_region():
    """Demo 16: Blur a region (privacy blur)."""
    print("\n=== Demo 16: Blur Region (privacy) ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    # Blur top-left corner
    pipeline.add_blur_region(x=0, y=0, width=300, height=200, intensity=30)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "16_blur_region.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_film_grain():
    """Demo 17: Film grain effect."""
    print("\n=== Demo 17: Film Grain ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_film_grain(intensity=0.3)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "17_film_grain.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_volume():
    """Demo 18: Adjust volume."""
    print("\n=== Demo 18: Volume 150% ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.change_volume(1.5)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "18_volume_150pct.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_extract_audio():
    """Demo 19: Extract audio to MP3."""
    print("\n=== Demo 19: Extract Audio to MP3 ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 30)
    output = pipeline.extract_audio(format="mp3", output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "19_extracted_audio.mp3")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_thumbnail():
    """Demo 20: Generate thumbnail."""
    print("\n=== Demo 20: Generate Thumbnail ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    output = pipeline.generate_thumbnails(count=1, output_dir=OUTPUT_DIR, width=320, height=180)
    # Rename
    if output:
        final_path = os.path.join(OUTPUT_DIR, "20_thumbnail.jpg")
        if os.path.exists(final_path):
            os.remove(final_path)
        os.rename(output[0], final_path)
        print(f"Created: {final_path}")
        return final_path
    return None


def demo_combined():
    """Demo 21: Combined effects - trim + vignette + color grade + overlay."""
    print("\n=== Demo 21: Combined Effects ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(5, 15)  # 10 second clip
    pipeline.add_vignette(intensity=0.3)
    pipeline.color_grade(saturation=1.2, contrast=1.1)
    pipeline.overlay(OVERLAY_IMAGE, x=900, y=50)  # Top right
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "21_combined_effects.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_sharpen():
    """Demo 22: Sharpen video."""
    print("\n=== Demo 22: Sharpen ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_sharpen(amount=2.0)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "22_sharpened.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def demo_denoise():
    """Demo 23: Denoise video."""
    print("\n=== Demo 23: Denoise ===")
    pipeline = VideoPipeline(INPUT_VIDEO)
    pipeline.trim(0, 10)
    pipeline.add_denoise(strength=0.5)
    output = pipeline.render(output_dir=OUTPUT_DIR)
    final_path = os.path.join(OUTPUT_DIR, "23_denoised.mp4")
    if os.path.exists(final_path):
        os.remove(final_path)
    os.rename(output, final_path)
    print(f"Created: {final_path}")
    return final_path


def main():
    """Run all demos."""
    print("=" * 60)
    print("VEMCP Video Editor - Feature Demo")
    print("=" * 60)
    print(f"Input: {INPUT_VIDEO}")
    print(f"Output: {OUTPUT_DIR}")
    print("=" * 60)

    demos = [
        demo_trim,
        demo_scale,
        demo_overlay,
        demo_speed,
        demo_color_grade,
        demo_black_and_white,
        demo_vignette,
        demo_sepia,
        demo_rotate,
        demo_flip,
        demo_crop,
        demo_border,
        demo_letterbox,
        demo_reverse,
        demo_loop,
        demo_blur_region,
        demo_film_grain,
        demo_volume,
        demo_extract_audio,
        demo_thumbnail,
        demo_combined,
        demo_sharpen,
        demo_denoise,
    ]

    successful = 0
    failed = 0

    for demo in demos:
        try:
            demo()
            successful += 1
        except Exception as e:
            print(f"  ERROR: {e}")
            failed += 1

    print("\n" + "=" * 60)
    print(f"Completed: {successful}/{len(demos)} demos")
    if failed:
        print(f"Failed: {failed}")
    print("=" * 60)


if __name__ == "__main__":
    main()
