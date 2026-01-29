"""
Timeline tracking and mapping for cumulative video operations.

Provides utilities for tracking time-based edits to video files
and maintaining proper mapping between original and edited timelines.
"""

from __future__ import annotations

from video_editor.timeline.tracker import TimeRange, TimelineModification, TimelineTracker

__all__: list[str] = ["TimeRange", "TimelineModification", "TimelineTracker"]
