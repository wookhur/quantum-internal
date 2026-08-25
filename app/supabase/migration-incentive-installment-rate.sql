-- ============================================================
-- 인센티브 회차별 요율 오버라이드
-- ------------------------------------------------------------
-- 한 수령자(contract_incentives 1행)의 기본 % 는 그대로 두고,
-- 특정 회차만 다른 %를 적용할 수 있게 JSONB 맵을 추가.
--   installment_overrides = { "<installment_id>": <percent>, ... }
-- 계산·표시 시: 해당 회차 id 가 맵에 있으면 그 %, 없으면 기본 percentage.
-- 용도: 계약금은 1%로 이미 수금됐고 잔금만 2%로 조정하는 경우 등.
-- (삭제/재추가 없이 수정 → 지급이력 key 유지, 수금분이 미수금으로 되돌아가지 않음)
-- Safe to re-run.
-- ============================================================

ALTER TABLE public.contract_incentives
  ADD COLUMN IF NOT EXISTS installment_overrides jsonb;

NOTIFY pgrst, 'reload schema';
