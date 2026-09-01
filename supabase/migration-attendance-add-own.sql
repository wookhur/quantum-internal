-- 근태: 본인 행은 누구나 추가/수정(주말 재택 등), 근태관리 권한자·admin 은 전체.
--
-- RLS 활성/비활성 상태는 건드리지 않는다(현 상태 유지). 정책만 추가한다.
--   · 지금 attendances 가 RLS 꺼져 있으면 → 이 정책들은 무해(효력 없음), 추가는 이미 가능.
--   · RLS 켜져 있고 관리자만 쓰기 가능했으면 → 본인 행 추가/수정이 열린다.
-- (여러 번 실행해도 안전)

drop policy if exists att_insert_own on public.attendances;
create policy att_insert_own on public.attendances
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    or exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and (coalesce(p.can_edit_attendance, false) or p.role = 'admin')
    )
  );

drop policy if exists att_update_own on public.attendances;
create policy att_update_own on public.attendances
  for update to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and (coalesce(p.can_edit_attendance, false) or p.role = 'admin')
    )
  )
  with check (
    profile_id = auth.uid()
    or exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and (coalesce(p.can_edit_attendance, false) or p.role = 'admin')
    )
  );
