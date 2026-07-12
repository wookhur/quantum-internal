-- Unify 'Julie' → '김지현' across service program sales contributors. Safe to re-run.
UPDATE public.service_ec_activities SET sales_contributor_1 = '김지현' WHERE sales_contributor_1 IN ('Julie', 'Julie Kim');
UPDATE public.service_ec_activities SET sales_contributor_2 = '김지현' WHERE sales_contributor_2 IN ('Julie', 'Julie Kim');
UPDATE public.service_academic_support SET sales_contributor_1 = '김지현' WHERE sales_contributor_1 IN ('Julie', 'Julie Kim');
UPDATE public.service_academic_support SET sales_contributor_2 = '김지현' WHERE sales_contributor_2 IN ('Julie', 'Julie Kim');

-- Profile display name (if a consultant profile is literally 'Julie'/'Julie Kim')
UPDATE public.profiles SET name = '김지현' WHERE name IN ('Julie', 'Julie Kim');

NOTIFY pgrst, 'reload schema';
