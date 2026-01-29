"""
Timeline tracking for cumulative video operations.
"""

from __future__ import annotations

from typing import Final, List, Optional


class TimeRange:
    """Represents a time range in a video."""

    start: float
    end: Optional[float]

    def __init__(self, start: float, end: Optional[float] = None) -> None:
        self.start = start
        self.end = end

    def __repr__(self) -> str:
        return f"TimeRange({self.start}, {self.end})"

    def duration(self) -> float:
        """Get the duration of this time range."""
        if self.end is None:
            return float("inf")
        return self.end - self.start


class TimelineModification:
    """Represents a modification to the timeline."""

    TYPE_DELETE: Final[str] = "delete"  # Segment is removed
    TYPE_SPEED: Final[str] = "speed"  # Segment is sped up/slowed down

    type: str
    range: TimeRange
    factor: float

    def __init__(self, mod_type: str, original_range: TimeRange, factor: float = 0.0) -> None:
        """
        Create a new timeline modification.

        Args:
            mod_type: Type of modification (delete, speed)
            original_range: The range in the original timeline
            factor: Speed factor for speed modifications (e.g. 2.0 for double speed)
        """
        self.type = mod_type
        self.range = original_range
        self.factor = factor

    def get_duration_change(self) -> float:
        """Calculate how much this modification changes the timeline duration."""
        original_duration = self.range.duration()

        if self.type == self.TYPE_DELETE:
            # Deleted segments reduce duration by their full length
            return -original_duration
        elif self.type == self.TYPE_SPEED:
            # Speed changes affect duration based on the factor
            # E.g., 2x speed = half duration, 0.5x speed = double duration
            new_duration = original_duration / self.factor
            return new_duration - original_duration

        return 0.0


class TimelineTracker:
    """Track and map between original and edited timelines."""

    modifications: List[TimelineModification]
    original_duration: Optional[float]

    def __init__(self, original_duration: Optional[float] = None) -> None:
        self.modifications = []
        self.original_duration = original_duration

    def add_modification(self, mod: TimelineModification) -> None:
        """Add a modification to the timeline tracker."""
        self.modifications.append(mod)

    def register_deletion(self, start: float, end: float) -> None:
        """Register a segment deletion in the timeline."""
        if start >= end:
            return  # Invalid range

        # Map points from edited to original timeline
        original_start = self.map_timeline_to_original(start)
        original_end = self.map_timeline_to_original(end)

        if original_start is None or original_end is None:
            return

        self.add_modification(
            TimelineModification(
                TimelineModification.TYPE_DELETE,
                TimeRange(original_start, original_end),
            )
        )

    def register_speed_change(self, start: float, end: float, speed: float) -> None:
        """Register a speed change in the timeline."""
        if start >= end or speed <= 0:
            return  # Invalid range or speed

        # Map points from edited to original timeline
        original_start = self.map_timeline_to_original(start)
        original_end = self.map_timeline_to_original(end)

        if original_start is None or original_end is None:
            return

        self.add_modification(
            TimelineModification(
                TimelineModification.TYPE_SPEED,
                TimeRange(original_start, original_end),
                speed,
            )
        )

    def map_timeline_to_original(self, time_point: Optional[float]) -> Optional[float]:
        """
        Map a time point in the edited timeline to the original timeline.

        Args:
            time_point: Time in seconds in the edited timeline

        Returns:
            The corresponding time in the original timeline
        """
        if time_point is None:
            return None

        # No modifications means the timelines are identical
        if not self.modifications:
            return time_point

        # Start with the current time point
        current_time: float = time_point

        # Apply each modification in reverse order to map back to original timeline
        for mod in reversed(self.modifications):
            range_start: float = mod.range.start
            range_end: Optional[float] = mod.range.end

            if mod.type == TimelineModification.TYPE_DELETE:
                # For deletions, if we're past the deletion point, add its duration
                if range_end is not None and current_time >= range_start:
                    current_time += range_end - range_start
            elif mod.type == TimelineModification.TYPE_SPEED:
                # For speed changes, adjust the time if we're in or past the affected range
                if current_time > range_start:
                    # If inside the speed-changed range
                    if range_end is None or current_time <= range_end:
                        # Calculate how far we are into the speed-changed segment
                        offset: float = current_time - range_start
                        # Apply inverse speed factor and add to range start
                        current_time = range_start + (offset * mod.factor)
                    else:
                        # Past the speed-changed range
                        # Calculate the duration difference and add it
                        original_duration: float = range_end - range_start
                        edited_duration: float = original_duration / mod.factor
                        duration_diff: float = original_duration - edited_duration
                        current_time += duration_diff

        return current_time
