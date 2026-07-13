-- Commission rates become per-partner AND per-team: each partner row now carries
-- a sales-team rate and a service-team rate. A single '__default__' row holds the
-- company-wide defaults applied to partners without a specific setting.
-- Safe to re-run.

ALTER TABLE public.partner_commission_rates
  ADD COLUMN IF NOT EXISTS sales_rate integer,
  ADD COLUMN IF NOT EXISTS service_rate integer;

-- backfill existing per-partner single-rate rows → both team rates = old rate
UPDATE public.partner_commission_rates
  SET sales_rate = COALESCE(sales_rate, rate),
      service_rate = COALESCE(service_rate, rate)
  WHERE partner NOT IN ('__default__', '__team_sales__', '__team_service__');

-- fold the two old global team rows into one '__default__' row (default 4% / 3%)
INSERT INTO public.partner_commission_rates (partner, rate, sales_rate, service_rate)
  VALUES (
    '__default__', 0,
    COALESCE((SELECT rate FROM public.partner_commission_rates WHERE partner = '__team_sales__'), 4),
    COALESCE((SELECT rate FROM public.partner_commission_rates WHERE partner = '__team_service__'), 3)
  )
  ON CONFLICT (partner) DO NOTHING;

DELETE FROM public.partner_commission_rates WHERE partner IN ('__team_sales__', '__team_service__');

NOTIFY pgrst, 'reload schema';
