-- 과거 파트너 프로그램 소통기록(partner_program_comments)을
-- 콜드콜 연락기록(lead_activities)에 일괄 미러링(소급 반영).
--
-- 앱의 useAddProgramComment 미러링 로직과 동일:
--   방식 매핑: call→call, katalk→katalk, sms→sms, other→note
--   제목:      '통화|카톡|문자|기타 · 파트너 프로그램'
--   metadata:  { source:'partner_program', entryId, programCommentId, contactMethod }
--   created_at: 원래 소통기록 시각 유지(콜드콜 히스토리 정렬용)
--
-- 안전: 이미 미러링된 건(metadata.programCommentId 존재)은 건너뜀 → 여러 번 실행해도 중복 안 생김.

insert into public.lead_activities
  (lead_id, activity_type, title, content, metadata, created_by, created_at)
select
  e.lead_id,
  case c.method
    when 'call'   then 'call'
    when 'katalk' then 'katalk'
    when 'sms'    then 'sms'
    else 'note'
  end as activity_type,
  (case c.method
    when 'call'   then '통화'
    when 'katalk' then '카톡'
    when 'sms'    then '문자'
    else '기타'
  end) || ' · 파트너 프로그램' as title,
  c.content,
  jsonb_build_object(
    'source', 'partner_program',
    'entryId', c.entry_id::text,
    'programCommentId', c.id::text,
    'contactMethod', case c.method
      when 'call'   then 'call'
      when 'katalk' then 'katalk'
      when 'sms'    then 'sms'
      else 'note'
    end
  ) as metadata,
  c.created_by,
  c.created_at
from public.partner_program_comments c
join public.partner_program_entries e on e.id = c.entry_id
where e.lead_id is not null
  and not exists (
    select 1 from public.lead_activities la
    where la.metadata->>'programCommentId' = c.id::text
  );

-- 반영 결과 확인용(선택): 미러링된 건수
-- select count(*) from public.lead_activities where metadata->>'source' = 'partner_program';
