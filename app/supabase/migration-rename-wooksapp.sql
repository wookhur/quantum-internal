-- EC partner label "Wook's App" → "앱개발" so it matches partner meeting comments
-- recorded under 앱개발. Safe to re-run.
UPDATE public.service_ec_activities SET partner = '앱개발' WHERE partner = 'Wook''s App';
NOTIFY pgrst, 'reload schema';
