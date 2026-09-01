-- 인보이스가 정산(커버)하는 커미션 라인 키 목록.
-- 커미션 키 = `${incentiveId}-${installmentId}` (재무대시보드 미지급 현황의 라인 키).
-- 이 인보이스가 '지급완료(paid_date)'되면, 여기 담긴 커미션은 미지급 현황에서 빠진다.
-- (여러 번 실행해도 안전)
alter table public.freelancer_invoices
  add column if not exists covered_incentive_keys text[];
