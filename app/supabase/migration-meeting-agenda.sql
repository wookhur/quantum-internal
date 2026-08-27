-- ============================================================
-- 회의안건(Meeting Agenda) 게시판 — 공통(전 직원 오픈)
-- ------------------------------------------------------------
-- · 회의: 제목·날짜·시간·장소(또는 온라인 링크)·참석자·상태
-- · 안건 항목: 항목별 내용 + 담당자 + 진행상태
-- · 댓글: 항목별(또는 회의 전체) 피드백·진행결과
-- 전 직원 열람·편집 (인증 사용자 모두). Safe to re-run.
-- ============================================================

-- 1) 회의
CREATE TABLE IF NOT EXISTS public.meeting_agendas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  meeting_date  date,
  meeting_time  text,                       -- 'HH:MM'
  location      text,                        -- 장소 또는 온라인 회의 링크
  attendee_ids  uuid[] NOT NULL DEFAULT '{}',-- 참석자 profile id 목록
  status        text NOT NULL DEFAULT 'scheduled', -- scheduled | done | cancelled
  notes         text,                        -- 회의 개요/메모
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meeting_agendas_date ON public.meeting_agendas(meeting_date DESC);

DROP TRIGGER IF EXISTS meeting_agendas_updated_at ON public.meeting_agendas;
CREATE TRIGGER meeting_agendas_updated_at
  BEFORE UPDATE ON public.meeting_agendas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) 안건 항목
CREATE TABLE IF NOT EXISTS public.meeting_agenda_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  uuid NOT NULL REFERENCES public.meeting_agendas(id) ON DELETE CASCADE,
  position    int NOT NULL DEFAULT 0,
  content     text NOT NULL,
  owner_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL, -- 담당자
  status      text NOT NULL DEFAULT 'open',  -- open | in_progress | done
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meeting_items_meeting ON public.meeting_agenda_items(meeting_id);

-- 3) 댓글 (항목별 또는 회의 전체)
CREATE TABLE IF NOT EXISTS public.meeting_agenda_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  uuid NOT NULL REFERENCES public.meeting_agendas(id) ON DELETE CASCADE,
  item_id     uuid REFERENCES public.meeting_agenda_items(id) ON DELETE CASCADE, -- null = 회의 전체 댓글
  author_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meeting_comments_meeting ON public.meeting_agenda_comments(meeting_id);

-- RLS: 전 직원 오픈 게시판 — 인증 사용자 전체 열람·편집
ALTER TABLE public.meeting_agendas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_agenda_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_agenda_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_agendas_all ON public.meeting_agendas;
CREATE POLICY meeting_agendas_all ON public.meeting_agendas FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS meeting_items_all ON public.meeting_agenda_items;
CREATE POLICY meeting_items_all ON public.meeting_agenda_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS meeting_comments_all ON public.meeting_agenda_comments;
CREATE POLICY meeting_comments_all ON public.meeting_agenda_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
