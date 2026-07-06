-- feature_access.enabled_routes was referenced by the app (per-route overrides)
-- but never created. Without it, saving custom access fails. Safe to re-run.

ALTER TABLE public.feature_access
  ADD COLUMN IF NOT EXISTS enabled_routes TEXT[] NOT NULL DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
