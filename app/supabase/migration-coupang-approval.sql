-- Coupang order approval: a "주문승인" permission holder approves requests,
-- and only approved orders proceed to ordering. Safe to re-run.

-- Per-user "주문승인" permission (assigned in 인사관리 access control)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_approve_orders BOOLEAN NOT NULL DEFAULT false;

-- Track who approved and when
ALTER TABLE public.coupang_orders ADD COLUMN IF NOT EXISTS approved_by UUID;
ALTER TABLE public.coupang_orders ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- If status has a CHECK constraint, it may reject the new 'approved' value.
-- coupang_orders.status is a plain TEXT column here, so no change needed.

NOTIFY pgrst, 'reload schema';
