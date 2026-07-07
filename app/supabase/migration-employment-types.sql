-- Allow multiple employment types (고용형태) per person. Safe to re-run.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS employment_types TEXT[];

-- Backfill from the existing single value
UPDATE public.profiles
  SET employment_types = ARRAY[employment_type]
  WHERE employment_type IS NOT NULL
    AND (employment_types IS NULL OR employment_types = '{}');

NOTIFY pgrst, 'reload schema';
