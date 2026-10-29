-- ============================================================
-- 서비스입금관리 수금 메모
-- ------------------------------------------------------------
-- 수금 처리를 하다 보면 '11월 입금 예정', '페이백 별도 정산' 같은 특이사항이 생기는데
-- 적어 둘 데가 없었다. 다음 달에 그 건을 다시 열었을 때 무엇을 확인해야 하는지가
-- 남지 않는다.
--
-- 학습지원(service_academic_support)에는 notes 가 이미 있지만 그건 Student 360 에
-- 보이는 프로그램 메모다. 거기에 수금 사정을 섞으면 학생 화면에 엉뚱한 글이 뜬다.
-- 그래서 수금 전용 칸을 따로 둔다.
--
-- 수기 입금(service_manual_fees)은 제 입력 창이 따로 있어 여기서 다루지 않는다.
-- Safe to re-run.
-- ============================================================

alter table public.service_ec_activities
  add column if not exists collection_memo text;

alter table public.service_academic_support
  add column if not exists collection_memo text;

comment on column public.service_ec_activities.collection_memo is
  '수금 처리 때 적는 특이사항(리마인더). Student 360 에 보이는 프로그램 메모와 다르다.';
comment on column public.service_academic_support.collection_memo is
  '수금 처리 때 적는 특이사항(리마인더). Student 360 에 보이는 notes 와 다르다.';

notify pgrst, 'reload schema';
