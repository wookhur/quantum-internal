-- Create student_milestones table
-- Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.student_milestones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES public.service_students(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,   -- strategy | essay | application | competition | decision | ec_activity
  title         TEXT NOT NULL,
  date          DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'upcoming',  -- on_track | behind | urgent | completed | upcoming
  notes         TEXT,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER student_milestones_updated_at
  BEFORE UPDATE ON public.student_milestones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: enable and allow authenticated users full access
ALTER TABLE public.student_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read milestones"
  ON public.student_milestones FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert milestones"
  ON public.student_milestones FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update milestones"
  ON public.student_milestones FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete milestones"
  ON public.student_milestones FOR DELETE
  TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
