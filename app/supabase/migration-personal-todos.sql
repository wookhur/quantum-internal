-- Personal to-do list (own items only). Two-track: manual (+) and flagged
-- from a chat message. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.personal_todos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  done              BOOLEAN NOT NULL DEFAULT false,
  done_at           TIMESTAMPTZ,
  source_message_id UUID,   -- set when created by flagging a chat message
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personal_todos_owner ON public.personal_todos(owner_id);

DROP TRIGGER IF EXISTS personal_todos_updated_at ON public.personal_todos;
CREATE TRIGGER personal_todos_updated_at
  BEFORE UPDATE ON public.personal_todos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.personal_todos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personal_todos_select" ON public.personal_todos;
DROP POLICY IF EXISTS "personal_todos_insert" ON public.personal_todos;
DROP POLICY IF EXISTS "personal_todos_update" ON public.personal_todos;
DROP POLICY IF EXISTS "personal_todos_delete" ON public.personal_todos;
CREATE POLICY "personal_todos_select" ON public.personal_todos FOR SELECT TO authenticated USING (true);
CREATE POLICY "personal_todos_insert" ON public.personal_todos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "personal_todos_update" ON public.personal_todos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "personal_todos_delete" ON public.personal_todos FOR DELETE TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
