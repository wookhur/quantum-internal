-- Partner companies (업체 관리): business info, bank account, fee policy, and
-- which student-info fields are shared with the partner. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.partner_companies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  business_number  TEXT,
  business_name    TEXT,
  ceo_name         TEXT,
  contact          TEXT,
  address          TEXT,
  bank_account     TEXT,
  fee_policy       TEXT,
  info_scope       TEXT[] NOT NULL DEFAULT '{}',
  notes            TEXT,
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS partner_companies_updated_at ON public.partner_companies;
CREATE TRIGGER partner_companies_updated_at
  BEFORE UPDATE ON public.partner_companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.partner_companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_companies_select" ON public.partner_companies;
DROP POLICY IF EXISTS "partner_companies_insert" ON public.partner_companies;
DROP POLICY IF EXISTS "partner_companies_update" ON public.partner_companies;
DROP POLICY IF EXISTS "partner_companies_delete" ON public.partner_companies;
CREATE POLICY "partner_companies_select" ON public.partner_companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "partner_companies_insert" ON public.partner_companies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "partner_companies_update" ON public.partner_companies FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "partner_companies_delete" ON public.partner_companies FOR DELETE TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
