-- Service QC: meeting attendance lifecycle.
-- Adds status (scheduled/held/cancelled/no_show/rescheduled), cancellation
-- reason + who cancelled, and an optional reschedule target so the weekly
-- quality-control report can measure scheduled vs held vs cancelled.
-- Existing rows default to 'held' (they were only created for meetings that
-- actually happened). Safe to re-run.

ALTER TABLE service_meetings
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'held'
    CHECK (status IN ('scheduled', 'held', 'cancelled', 'no_show', 'rescheduled')),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT
    CHECK (cancelled_by IN ('client', 'consultant', 'other')),
  ADD COLUMN IF NOT EXISTS rescheduled_to DATE;

CREATE INDEX IF NOT EXISTS idx_service_meetings_status ON service_meetings(status);

NOTIFY pgrst, 'reload schema';
