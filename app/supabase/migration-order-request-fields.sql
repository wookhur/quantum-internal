-- 주문요청(구 쿠팡주문) 기능 확장:
--  - needed_by: 필요한 날짜 (긴급도 계산용)
--  - payment_approver_id / payment_approver_role: 결제요청자(세일즈이사/재무이사)
--  - category에 직원용기타/고객용기타가 추가되므로 category CHECK 제약이 있으면 완화
-- Safe to re-run.

ALTER TABLE public.coupang_orders
  ADD COLUMN IF NOT EXISTS needed_by date,
  ADD COLUMN IF NOT EXISTS payment_approver_id uuid,
  ADD COLUMN IF NOT EXISTS payment_approver_role text;

-- allow new category values (직원용기타/고객용기타)
ALTER TABLE public.coupang_orders DROP CONSTRAINT IF EXISTS coupang_orders_category_check;

NOTIFY pgrst, 'reload schema';
