-- Manual lead level (hot/warm/qualified/cold/info_seeker) + reason memo.
-- Replaces the old computed priority for classifying leads. Safe to re-run.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_level text,
  ADD COLUMN IF NOT EXISTS lead_level_reason text;

NOTIFY pgrst, 'reload schema';
