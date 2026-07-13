-- Fix a mistyped EC partner name: "아트앤아이디자인" → "아트앤디자인랩" (correct name).
-- Merges records under the correct name so nothing is lost and the wrong name
-- disappears from every dropdown (options are built from data). Safe to re-run.

-- EC activities
UPDATE public.service_ec_activities
  SET partner = '아트앤디자인랩'
  WHERE partner = '아트앤아이디자인';

-- Academic support (in case it was recorded there)
UPDATE public.service_academic_support
  SET academy_name = '아트앤디자인랩'
  WHERE academy_name = '아트앤아이디자인';

-- Commission-rate row: drop the wrong one if the correct one already exists,
-- otherwise rename it (partner has a unique index).
DELETE FROM public.partner_commission_rates a
  WHERE a.partner = '아트앤아이디자인'
    AND EXISTS (SELECT 1 FROM public.partner_commission_rates b WHERE b.partner = '아트앤디자인랩');

UPDATE public.partner_commission_rates
  SET partner = '아트앤디자인랩'
  WHERE partner = '아트앤아이디자인';

NOTIFY pgrst, 'reload schema';
