-- ============================================================
-- contract_incentives.incentive_type CHECK 제약에 'sales_contribution' 추가
-- ------------------------------------------------------------
-- incentive_type 은 자유 TEXT 가 아니라 허용값 목록 CHECK 제약이 걸려 있어,
-- 새 유형 'sales_contribution'(세일즈기여 인센티브 2.5%) 추가 시 insert 가 거부됨.
--   → 제약을 전체 유형 목록으로 재생성.
-- (모든 값은 INCENTIVE_TYPES 키와 일치. 기존 데이터는 모두 이 목록 안에 있으므로 안전)
-- Safe to re-run.
-- ============================================================

ALTER TABLE public.contract_incentives
  DROP CONSTRAINT IF EXISTS contract_incentives_incentive_type_check;

ALTER TABLE public.contract_incentives
  ADD CONSTRAINT contract_incentives_incentive_type_check
  CHECK (incentive_type IN (
    'partner_sales',
    'partner_fee',
    'cold_call',
    'total_revenue',
    'total_revenue_1_5',
    'external_fee',
    'service_team',
    'service_director',
    'sales_contribution'
  ));

NOTIFY pgrst, 'reload schema';
