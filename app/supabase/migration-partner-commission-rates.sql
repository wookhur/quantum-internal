-- Partner commission rates: each service partner has a commission % (5–20, step 5)
-- and an optional note. Used by 서비스입금관리 to auto-compute the incentive amount
-- (billed × rate) when a service is marked 수금 완료. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.partner_commission_rates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner     text NOT NULL,
  rate        integer NOT NULL DEFAULT 10,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- one rate row per partner label
CREATE UNIQUE INDEX IF NOT EXISTS partner_commission_rates_partner_key
  ON public.partner_commission_rates (partner);

-- keep updated_at fresh
DROP TRIGGER IF EXISTS set_updated_at ON public.partner_commission_rates;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.partner_commission_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.partner_commission_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated full access" ON public.partner_commission_rates;
CREATE POLICY "authenticated full access" ON public.partner_commission_rates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
