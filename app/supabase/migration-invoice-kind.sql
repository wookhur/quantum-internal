-- Distinguish freelancer invoices from sales-incentive invoices (same table,
-- same submit/approve flow). Existing rows default to 'freelancer'. Re-runnable.

ALTER TABLE public.freelancer_invoices
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'freelancer';

NOTIFY pgrst, 'reload schema';
