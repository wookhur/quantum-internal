-- ============================================================
-- 지출결의 확장: 카테고리별 월 예산 (예산 대비)
-- (migration-expense-requests.sql 이후 실행). Safe to re-run.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expense_category_budgets (
  category       text PRIMARY KEY,           -- 분류명
  monthly_budget numeric NOT NULL DEFAULT 0, -- 매월 예산(원)
  updated_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_category_budgets ENABLE ROW LEVEL SECURITY;
-- 열람: 인증 전원 / 수정: 재무·관리자
DROP POLICY IF EXISTS expense_budgets_read ON public.expense_category_budgets;
CREATE POLICY expense_budgets_read ON public.expense_category_budgets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS expense_budgets_write ON public.expense_category_budgets;
CREATE POLICY expense_budgets_write ON public.expense_category_budgets FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = ANY (ARRAY['admin','c_level','account']) OR is_account = true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = ANY (ARRAY['admin','c_level','account']) OR is_account = true)));

NOTIFY pgrst, 'reload schema';
