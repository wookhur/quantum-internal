-- 영수증관리(법인카드 결제 영수증) — admin 전용으로 앱에서 접근 제한.
-- 결제인/결제사유/결제일/영수증첨부/상세보고 기록. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.corporate_receipts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer        text,                         -- 결제인
  reason       text,                         -- 결제사유
  paid_date    date,                         -- 결제일
  receipt_url  text,                         -- 영수증 첨부 (사진/파일 URL)
  receipt_name text,
  memo         text,                         -- 상세보고
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON public.corporate_receipts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.corporate_receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.corporate_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "corporate_receipts_all" ON public.corporate_receipts;
CREATE POLICY "corporate_receipts_all" ON public.corporate_receipts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
