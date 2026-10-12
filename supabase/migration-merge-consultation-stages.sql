-- ============================================================
-- 상담 단계 통합 — 1·2·3차 상담 → '상담 완료' 하나로
-- ------------------------------------------------------------
-- 상담 단계는 둘이면 된다.
--   consultation_scheduled (상담 예약) — 상담을 잡았다. 취소될 수 있어 상담 날까지 여기 머문다.
--   first_consultation     (상담 완료) — 상담을 진행했다. 콜드콜의 [상담 완료] 버튼이 올린다.
-- 몇 차 상담인지는 meetings(상담 일정)가 센다. 단계로 또 나누지 않는다.
--
-- 그래서 second_consultation · third_consultation 을 first_consultation 으로 합친다.
-- 단계만 바뀌고 사라지는 리드는 없다. 이력을 남겨 나중에 "왜 바뀌었나"를 볼 수 있게 한다.
-- Safe to re-run (두 번째부터는 바꿀 행이 없어 아무 일도 하지 않는다).
-- ============================================================

-- ── 1. 바꾸기 전에 무엇이 바뀌는지 본다 ──────────────────────
select pipeline_stage, count(*) as 건수
from public.leads
where pipeline_stage in ('second_consultation', 'third_consultation')
group by pipeline_stage;

-- ── 2. 단계 변경 이력을 먼저 남긴다 ──────────────────────────
-- (UPDATE 를 먼저 하면 옛 값을 잃어 from 을 적을 수 없다)
insert into public.lead_activities (lead_id, activity_type, title, content, metadata, created_by)
select l.id,
       'stage_change',
       '파이프라인 단계 변경',
       l.pipeline_stage || ' → first_consultation (회차 구분 폐기, 상담 완료로 통합)',
       jsonb_build_object('from', l.pipeline_stage, 'to', 'first_consultation', 'reason', 'merge_consultation_stages'),
       null
from public.leads l
where l.pipeline_stage in ('second_consultation', 'third_consultation');

-- ── 3. 단계를 합친다 ─────────────────────────────────────────
update public.leads
set pipeline_stage = 'first_consultation',
    updated_at     = now()
where pipeline_stage in ('second_consultation', 'third_consultation');

-- ── 4. 확인 ──────────────────────────────────────────────────
select pipeline_stage, count(*) as 건수
from public.leads
where pipeline_stage in ('consultation_scheduled', 'first_consultation',
                         'second_consultation', 'third_consultation')
group by pipeline_stage
order by pipeline_stage;

-- second_consultation · third_consultation 이 0 건이면 끝났다.
-- enum 값 자체는 지우지 않는다 — 옛 이력·백업과 맞춰 두기 위해 남겨 둔다.
