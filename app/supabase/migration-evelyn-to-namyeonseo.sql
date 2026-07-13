-- "Evelyn" and "남연서" are the same person → unify stored contributor names to 남연서.
-- Safe to re-run.

UPDATE public.service_ec_activities SET sales_contributor_1 = '남연서' WHERE sales_contributor_1 = 'Evelyn';
UPDATE public.service_ec_activities SET sales_contributor_2 = '남연서' WHERE sales_contributor_2 = 'Evelyn';
UPDATE public.service_academic_support SET sales_contributor_1 = '남연서' WHERE sales_contributor_1 = 'Evelyn';
UPDATE public.service_academic_support SET sales_contributor_2 = '남연서' WHERE sales_contributor_2 = 'Evelyn';

NOTIFY pgrst, 'reload schema';
