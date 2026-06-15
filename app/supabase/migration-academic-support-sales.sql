-- Add sales contributor columns to service_academic_support
-- Run once in the Supabase SQL editor.

ALTER TABLE service_academic_support
  ADD COLUMN IF NOT EXISTS sales_contributor_1 TEXT;

ALTER TABLE service_academic_support
  ADD COLUMN IF NOT EXISTS sales_contributor_2 TEXT;

NOTIFY pgrst, 'reload schema';
