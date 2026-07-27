-- 업무요청 첨부(이미지/PDF)용 스토리지 버킷 + 정책
-- 1) 공개 버킷 생성 (public: getPublicUrl 로 바로 열람/다운로드 가능)
insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', true)
on conflict (id) do nothing;

-- 2) 인증 사용자 업로드/열람/삭제 정책 (버킷 한정)
drop policy if exists "task_attachments_read" on storage.objects;
drop policy if exists "task_attachments_insert" on storage.objects;
drop policy if exists "task_attachments_delete" on storage.objects;

create policy "task_attachments_read" on storage.objects
  for select to authenticated using (bucket_id = 'task-attachments');

create policy "task_attachments_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'task-attachments');

create policy "task_attachments_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'task-attachments');
