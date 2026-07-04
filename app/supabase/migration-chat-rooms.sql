-- Group chat rooms (단톡방) for teams/projects. Admin creates rooms and
-- assigns members; members chat together. Messages support reply-to so a
-- completed To-do (flagged from a room message) can post back as a reply.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_room_members (
  room_id     UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  member_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_room_members_member ON public.chat_room_members(member_id);

CREATE TABLE IF NOT EXISTS public.chat_room_messages (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id              UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_id            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  content              TEXT NOT NULL,
  reply_to_message_id  UUID,   -- original flagged message this replies to
  reply_to_content     TEXT,   -- snapshot of the replied message's text
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_room_messages_room ON public.chat_room_messages(room_id, created_at);

-- Personal To-do: remember which room a flagged item came from, so completing
-- it can post a "처리완료" reply back into that room.
ALTER TABLE public.personal_todos ADD COLUMN IF NOT EXISTS source_room_id UUID;

DROP TRIGGER IF EXISTS chat_rooms_updated_at ON public.chat_rooms;
CREATE TRIGGER chat_rooms_updated_at
  BEFORE UPDATE ON public.chat_rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.chat_rooms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_room_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_room_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_rooms_all"        ON public.chat_rooms;
DROP POLICY IF EXISTS "chat_room_members_all" ON public.chat_room_members;
DROP POLICY IF EXISTS "chat_room_messages_all" ON public.chat_room_messages;
CREATE POLICY "chat_rooms_all"        ON public.chat_rooms        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "chat_room_members_all" ON public.chat_room_members FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "chat_room_messages_all" ON public.chat_room_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
