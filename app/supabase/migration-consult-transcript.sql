-- ============================================================
-- 상담 전사본 올리기 + 자동 요약
-- ------------------------------------------------------------
-- 전화 상담은 길고 구어체여서 전사본 그대로는 아무도 다시 읽지 않는다.
-- 전사본을 올리면 Point / Concerns / Solutions / Follow-up 으로 줄여
-- 상담 내용 칸에 채운다. 채운 뒤에도 그냥 글이라 화면에서 바로 고친다 —
-- 요약을 믿고 쓰는 게 아니라 사람이 손볼 초안으로 쓴다.
--
-- 올린 파일은 Storage 에 남겨 근거로 둔다. 요약이 이상하면 원문을 연다.
--
-- 음성 파일은 아직 받지 않는다 — Claude 는 음성을 못 읽는다. 전사 서비스 키를
-- 붙이면 summarize-consult 앞단에 전사 단계만 더하면 되고, DB·화면은 그대로다.
-- Safe to re-run.
-- ============================================================

-- ── 1. 전사본 칸 ────────────────────────────────────────────
alter table public.post_contract_consults
  add column if not exists transcript_url  text,
  add column if not exists transcript_name text;

comment on column public.post_contract_consults.transcript_url is
  '올려 둔 전사본 파일 주소. 요약의 근거 — 요약이 이상할 때 원문을 열어 본다.';
comment on column public.post_contract_consults.transcript_name is
  '올린 전사본의 원래 파일 이름.';


-- ── 2. 전사본 저장통 ────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('consult-transcripts', 'consult-transcripts', true)
on conflict (id) do nothing;

drop policy if exists "consult_transcripts_read"   on storage.objects;
drop policy if exists "consult_transcripts_insert" on storage.objects;
drop policy if exists "consult_transcripts_delete" on storage.objects;

create policy "consult_transcripts_read" on storage.objects
  for select to authenticated using (bucket_id = 'consult-transcripts');

create policy "consult_transcripts_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'consult-transcripts');

create policy "consult_transcripts_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'consult-transcripts');

notify pgrst, 'reload schema';
