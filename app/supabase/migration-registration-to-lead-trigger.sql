-- 세미나 신청 → 리드 자동 생성 트리거
-- 신청서(seminar_registrations)가 저장되면 leads에 자동 등록.
-- 전화(정규화) 또는 이메일이 이미 리드에 있으면 중복 생성하지 않음.
-- SECURITY DEFINER: anon(공개 폼) 제출에서도 leads에 insert 가능. 실패해도 신청 저장은 롤백되지 않음.

create or replace function public.sync_registration_to_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm_phone text;
  v_exists uuid;
  v_title text;
  v_memo text;
begin
  begin
    v_norm_phone := regexp_replace(coalesce(NEW.phone, ''), '[^0-9]', '', 'g');
    select title into v_title from public.seminars where id = NEW.seminar_id;

    -- 중복 리드 확인 (전화 정규화 일치 또는 이메일 일치)
    select id into v_exists
    from public.leads
    where (v_norm_phone <> '' and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_norm_phone)
       or (coalesce(NEW.email, '') <> '' and lower(coalesce(email, '')) = lower(NEW.email))
    limit 1;

    if v_exists is not null then
      return NEW;  -- 이미 리드로 존재 → 중복 생성 안 함
    end if;

    v_memo := nullif(trim(both E'\n' from concat_ws(E'\n',
      '[세미나 신청] ' || coalesce(v_title, ''),
      case when coalesce(NEW.source, '') <> '' then '유입경로: ' || NEW.source end,
      case when coalesce(array_length(NEW.session_labels, 1), 0) > 0 then '희망회차: ' || array_to_string(NEW.session_labels, ' / ') end,
      case when NEW.applicant_count is not null then '신청인원: ' || NEW.applicant_count end,
      NEW.memo
    )), '');

    insert into public.leads (
      lead_date, parent_name, student_name, email, phone,
      current_school, grade, region, residence_country, residence_city,
      source_channel, memo, pipeline_stage
    ) values (
      current_date,
      coalesce(nullif(NEW.parent_name, ''), '(미입력)'),
      NEW.student_name,
      NEW.email,
      coalesce(nullif(NEW.phone, ''), '-'),
      NEW.school,
      NEW.grade,
      NEW.region_geo,
      NEW.country,
      NEW.region_geo,
      '세미나 - ' || coalesce(v_title, '세미나'),
      v_memo,
      'new_lead'
    );
  exception when others then
    null;  -- 리드 동기화 실패가 신청 저장을 막지 않도록 무시
  end;
  return NEW;
end;
$$;

drop trigger if exists trg_sync_registration_to_lead on public.seminar_registrations;
create trigger trg_sync_registration_to_lead
  after insert on public.seminar_registrations
  for each row execute function public.sync_registration_to_lead();

notify pgrst, 'reload schema';
