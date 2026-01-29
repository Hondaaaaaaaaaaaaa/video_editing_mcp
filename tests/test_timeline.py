"""
Tests for timeline tracking functionality.
"""

from __future__ import annotations

from video_editor.timeline import TimelineModification, TimelineTracker, TimeRange


class TestTimeRange:
    """Tests for TimeRange class."""

    def test_time_range_creation(self) -> None:
        """Test creating a TimeRange object."""
        tr = TimeRange(1.0, 5.0)
        assert tr.start == 1.0
        assert tr.end == 5.0

    def test_time_range_duration(self) -> None:
        """Test TimeRange duration calculation."""
        tr = TimeRange(1.0, 5.0)
        assert tr.duration() == 4.0

    def test_time_range_no_end(self) -> None:
        """Test TimeRange with no end time."""
        tr = TimeRange(1.0)
        assert tr.start == 1.0
        assert tr.end is None
        assert tr.duration() == float("inf")

    def test_time_range_repr(self) -> None:
        """Test TimeRange string representation."""
        tr = TimeRange(2.5, 7.5)
        assert "2.5" in repr(tr)
        assert "7.5" in repr(tr)


class TestTimelineModification:
    """Tests for TimelineModification class."""

    def test_delete_modification(self) -> None:
        """Test creating a deletion modification."""
        tr = TimeRange(2.0, 4.0)
        mod = TimelineModification(TimelineModification.TYPE_DELETE, tr)

        assert mod.type == "delete"
        assert mod.range.start == 2.0
        assert mod.range.end == 4.0

    def test_speed_modification(self) -> None:
        """Test creating a speed modification."""
        tr = TimeRange(0.0, 5.0)
        mod = TimelineModification(TimelineModification.TYPE_SPEED, tr, factor=2.0)

        assert mod.type == "speed"
        assert mod.factor == 2.0

    def test_delete_duration_change(self) -> None:
        """Test duration change calculation for deletion."""
        tr = TimeRange(2.0, 4.0)  # 2 seconds long
        mod = TimelineModification(TimelineModification.TYPE_DELETE, tr)

        # Deletion should reduce duration by the segment length
        assert mod.get_duration_change() == -2.0

    def test_speed_duration_change_double(self) -> None:
        """Test duration change for 2x speed."""
        tr = TimeRange(0.0, 4.0)  # 4 seconds long
        mod = TimelineModification(TimelineModification.TYPE_SPEED, tr, factor=2.0)

        # 2x speed means 4 seconds becomes 2 seconds (change of -2)
        assert mod.get_duration_change() == -2.0

    def test_speed_duration_change_half(self) -> None:
        """Test duration change for 0.5x speed."""
        tr = TimeRange(0.0, 4.0)  # 4 seconds long
        mod = TimelineModification(TimelineModification.TYPE_SPEED, tr, factor=0.5)

        # 0.5x speed means 4 seconds becomes 8 seconds (change of +4)
        assert mod.get_duration_change() == 4.0


class TestTimelineTracker:
    """Tests for TimelineTracker class."""

    def test_tracker_creation(self) -> None:
        """Test creating a TimelineTracker."""
        tracker = TimelineTracker(original_duration=10.0)
        assert tracker.original_duration == 10.0
        assert len(tracker.modifications) == 0

    def test_tracker_add_modification(self) -> None:
        """Test adding modifications to tracker."""
        tracker = TimelineTracker(10.0)
        mod = TimelineModification(TimelineModification.TYPE_DELETE, TimeRange(2.0, 4.0))
        tracker.add_modification(mod)

        assert len(tracker.modifications) == 1

    def test_register_deletion(self) -> None:
        """Test registering a deletion."""
        tracker = TimelineTracker(10.0)
        tracker.register_deletion(2.0, 4.0)

        assert len(tracker.modifications) == 1
        assert tracker.modifications[0].type == TimelineModification.TYPE_DELETE

    def test_register_speed_change(self) -> None:
        """Test registering a speed change."""
        tracker = TimelineTracker(10.0)
        tracker.register_speed_change(0.0, 5.0, speed=2.0)

        assert len(tracker.modifications) == 1
        assert tracker.modifications[0].type == TimelineModification.TYPE_SPEED
        assert tracker.modifications[0].factor == 2.0

    def test_map_no_modifications(self) -> None:
        """Test timeline mapping with no modifications."""
        tracker = TimelineTracker(10.0)

        # With no modifications, timeline should be unchanged
        assert tracker.map_timeline_to_original(5.0) == 5.0
        assert tracker.map_timeline_to_original(0.0) == 0.0
        assert tracker.map_timeline_to_original(10.0) == 10.0

    def test_map_none_returns_none(self) -> None:
        """Test that mapping None returns None."""
        tracker = TimelineTracker(10.0)
        assert tracker.map_timeline_to_original(None) is None

    def test_map_after_deletion(self) -> None:
        """Test timeline mapping after a deletion."""
        tracker = TimelineTracker(10.0)

        # Delete segment from 2.0 to 4.0 (removes 2 seconds)
        tracker.register_deletion(2.0, 4.0)

        # Time before deletion should be unchanged
        assert tracker.map_timeline_to_original(1.0) == 1.0

        # Time at deletion point should map to original deletion start
        assert tracker.map_timeline_to_original(2.0) == 4.0  # 2.0 in edited = 4.0 in original

        # Time after deletion should add back the deleted duration
        # edited time 5.0 should map to original time 7.0 (5.0 + 2.0 deleted)
        assert tracker.map_timeline_to_original(5.0) == 7.0

    def test_register_invalid_deletion(self) -> None:
        """Test that invalid deletion is ignored."""
        tracker = TimelineTracker(10.0)

        # End before start should be ignored
        tracker.register_deletion(5.0, 3.0)
        assert len(tracker.modifications) == 0

    def test_register_invalid_speed(self) -> None:
        """Test that invalid speed change is ignored."""
        tracker = TimelineTracker(10.0)

        # Zero speed should be ignored
        tracker.register_speed_change(0.0, 5.0, speed=0)
        assert len(tracker.modifications) == 0

        # Negative speed should be ignored
        tracker.register_speed_change(0.0, 5.0, speed=-1.0)
        assert len(tracker.modifications) == 0

        # Invalid range should be ignored
        tracker.register_speed_change(5.0, 3.0, speed=2.0)
        assert len(tracker.modifications) == 0


class TestComplexTimelineScenarios:
    """Tests for complex timeline modification scenarios."""

    def test_multiple_deletions(self) -> None:
        """Test mapping with multiple deletions."""
        tracker = TimelineTracker(20.0)

        # Delete 2-4 (2 seconds) and 8-10 (2 seconds)
        # Note: After first deletion, timeline shifts
        tracker.register_deletion(2.0, 4.0)  # Removes 2s at positions 2-4
        tracker.register_deletion(6.0, 8.0)  # In edited timeline (was 8-10 in original)

        assert len(tracker.modifications) == 2

    def test_speed_then_delete(self) -> None:
        """Test speed change followed by deletion."""
        tracker = TimelineTracker(10.0)

        # Speed up first 4 seconds by 2x
        tracker.register_speed_change(0.0, 4.0, speed=2.0)

        # Then delete a segment
        tracker.register_deletion(3.0, 4.0)

        assert len(tracker.modifications) == 2

    def test_cumulative_modifications(self) -> None:
        """Test that modifications are tracked cumulatively."""
        tracker = TimelineTracker(30.0)

        # Add several modifications
        tracker.register_deletion(5.0, 7.0)  # -2 seconds
        tracker.register_speed_change(10.0, 15.0, speed=2.0)  # -2.5 seconds effective

        assert len(tracker.modifications) == 2

        # Each modification should be recorded
        assert tracker.modifications[0].type == TimelineModification.TYPE_DELETE
        assert tracker.modifications[1].type == TimelineModification.TYPE_SPEED
