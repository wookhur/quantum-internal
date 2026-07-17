-- 콜드콜 → 세미나 참석 연동: 리드가 신청한 웨비나(세션)별로 참석 의사/참석 완료를 기록.
--  status: planned(참석예정) | unsure(미정) | no_contact(연락안됨) | attended(참석완료)
-- 세미나관리 집계 및 리드카드 참석 뱃지에 사용. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.lead_seminar_attendance (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid NOT NULL,
  seminar_id    uuid NOT NULL,
  session_label text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'planned',
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_seminar_attendance_key
  ON public.lead_seminar_attendance (lead_id, seminar_id, session_label);
CREATE INDEX IF NOT EXISTS idx_lead_seminar_attendance_seminar
  ON public.lead_seminar_attendance (seminar_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.lead_seminar_attendance;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.lead_seminar_attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.lead_seminar_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_seminar_attendance_all" ON public.lead_seminar_attendance;
CREATE POLICY "lead_seminar_attendance_all" ON public.lead_seminar_attendance
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
