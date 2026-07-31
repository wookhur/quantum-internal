-- 실물 계약서 PDF 첨부 (Student 360 계약사항)
-- 1) service_students 에 PDF URL 컬럼 추가
alter table public.service_students add column if not exists contract_pdf_url text;

-- 2) 계약서 PDF용 스토리지 버킷 (public: getPublicUrl 로 다운로드)
insert into storage.buckets (id, name, public)
values ('contract-pdfs', 'contract-pdfs', true)
on conflict (id) do nothing;

-- 3) 인증 사용자 업로드/열람/삭제 정책 (버킷 한정)
drop policy if exists "contract_pdfs_read"   on storage.objects;
drop policy if exists "contract_pdfs_insert" on storage.objects;
drop policy if exists "contract_pdfs_delete" on storage.objects;

create policy "contract_pdfs_read" on storage.objects
  for select to authenticated using (bucket_id = 'contract-pdfs');

create policy "contract_pdfs_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'contract-pdfs');

create policy "contract_pdfs_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'contract-pdfs');

-- 4) PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
