-- ============================================================
-- 지출결의(Expense Approval) 게시판 — 공통
-- ------------------------------------------------------------
-- 주문요청(AI구독·물품)과 별개로, 승인이 필요한 지출을 올리고 → 승인/반려 →
-- 지급 → 지출증빙 첨부까지 관리.
-- · 전 직원 열람·작성, 승인/지급 처리는 앱에서 재무·관리자만(화면 게이팅)
-- · 첨부: kind='quote'(견적·요청근거) / 'proof'(지출증빙)
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.expense_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text NOT NULL,
  category       text,                         -- 소프트웨어/마케팅/출장/식비 등
  amount         numeric NOT NULL DEFAULT 0,
  currency       text NOT NULL DEFAULT 'KRW',
  vendor         text,                          -- 거래처/지급처
  payment_method text,                          -- 법인카드/계좌이체/개인경비 등
  description    text,                          -- 지출 사유·내역
  needed_by      date,                          -- 희망 지급일
  status         text NOT NULL DEFAULT 'pending', -- pending | approved | rejected | paid
  requested_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approver_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at    timestamptz,
  approval_note  text,
  paid_at        date,
  paid_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expense_requests_status ON public.expense_requests(status);
CREATE INDEX IF NOT EXISTS idx_expense_requests_created ON public.expense_requests(created_at DESC);

DROP TRIGGER IF EXISTS expense_requests_updated_at ON public.expense_requests;
CREATE TRIGGER expense_requests_updated_at
  BEFORE UPDATE ON public.expense_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.expense_request_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES public.expense_requests(id) ON DELETE CASCADE,
  kind         text NOT NULL DEFAULT 'quote',  -- quote | proof
  name         text NOT NULL,
  url          text NOT NULL,
  path         text,
  uploaded_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expense_files_request ON public.expense_request_files(request_id);

CREATE TABLE IF NOT EXISTS public.expense_request_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES public.expense_requests(id) ON DELETE CASCADE,
  author_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  content      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expense_comments_request ON public.expense_request_comments(request_id);

-- RLS: 인증 전원 (열람·작성). 승인/지급은 화면에서 재무·관리자만.
ALTER TABLE public.expense_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_request_files    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_request_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expense_requests_all ON public.expense_requests;
CREATE POLICY expense_requests_all ON public.expense_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS expense_files_all ON public.expense_request_files;
CREATE POLICY expense_files_all ON public.expense_request_files FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS expense_comments_all ON public.expense_request_comments;
CREATE POLICY expense_comments_all ON public.expense_request_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Storage 버킷 (공개 읽기)
INSERT INTO storage.buckets (id, name, public) VALUES ('expense-files', 'expense-files', true)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "expense_files_read" ON storage.objects;
CREATE POLICY "expense_files_read" ON storage.objects FOR SELECT USING (bucket_id = 'expense-files');
DROP POLICY IF EXISTS "expense_files_write" ON storage.objects;
CREATE POLICY "expense_files_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'expense-files');
DROP POLICY IF EXISTS "expense_files_delete" ON storage.objects;
CREATE POLICY "expense_files_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'expense-files');

NOTIFY pgrst, 'reload schema';
