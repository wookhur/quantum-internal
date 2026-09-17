-- ============================================================
-- 서비스 만족도 설문 — 구글폼 응답 연동 + 컨설턴트별 집계
-- ------------------------------------------------------------
-- 응답은 익명이지만 폼에 '담당 컨설턴트' 문항이 있어, 그 칸으로 컨설턴트별
-- 집계가 가능하다. 설문 문항은 바뀔 수 있으므로 어느 칸이 컨설턴트·점수인지는
-- 코드에 박지 않고 화면에서 지정한다(satisfaction_sources.column_map).
--
-- 민감정보(자유서술 코멘트 포함)이므로 열람·편집 모두 admin·c_level 만.
-- employee_bonuses 와 같은 방식이다. Safe to re-run.
-- ============================================================

-- ── 설문 출처(시트) 설정 ─────────────────────────────────────
create table if not exists public.satisfaction_sources (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                 -- 화면에 보일 이름 (예: '2026 상반기 서비스 만족도')
  spreadsheet_id text not null,                -- 구글 스프레드시트 ID
  sheet_tab     text,                          -- 탭 이름 (비우면 첫 번째 탭)
  form_url      text,                          -- 응답용 폼 링크 (참고/공유용)
  -- 어느 컬럼이 무엇인지. 화면에서 지정한다.
  --   { "consultant": "담당 컨설턴트", "timestamp": "타임스탬프",
  --     "scores": ["전반적 만족도", "소통 만족도"], "comments": ["자유의견"] }
  column_map    jsonb not null default '{}'::jsonb,
  /** 점수 문항의 만점 (5점 척도면 5). 평균을 100점 환산할 때 쓴다. */
  score_max     numeric not null default 5,
  /** 응답이 이 수보다 적은 컨설턴트는 개별 코멘트를 가린다(익명성 보호). */
  min_responses_to_show_comments int not null default 3,
  active        boolean not null default true,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── 응답 ─────────────────────────────────────────────────────
create table if not exists public.satisfaction_responses (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references public.satisfaction_sources(id) on delete cascade,
  -- 시트의 행을 그대로 보관한다. 문항이 바뀌어도 원본이 남고, 매핑만 다시 하면 된다.
  raw           jsonb not null default '{}'::jsonb,
  -- 매핑으로 뽑아낸 값 (집계용). 매핑을 바꾸면 다시 채워진다.
  consultant_name text,
  responded_at  timestamptz,
  avg_score     numeric,                       -- 점수 문항들의 평균 (원점수)
  -- 같은 행이 두 번 들어오지 않도록. 시트 행을 해시한 값.
  row_hash      text not null,
  created_at    timestamptz not null default now(),
  unique (source_id, row_hash)
);

create index if not exists satisfaction_responses_source_idx
  on public.satisfaction_responses (source_id);
create index if not exists satisfaction_responses_consultant_idx
  on public.satisfaction_responses (consultant_name);
create index if not exists satisfaction_responses_at_idx
  on public.satisfaction_responses (responded_at desc);

-- ── 권한: admin·c_level 만 (자유서술 코멘트가 들어있는 민감정보) ──
alter table public.satisfaction_sources   enable row level security;
alter table public.satisfaction_responses enable row level security;

drop policy if exists satisfaction_sources_all on public.satisfaction_sources;
create policy satisfaction_sources_all on public.satisfaction_sources
  for all to authenticated
  using       (exists (select 1 from public.profiles where id = auth.uid() and role = any (array['admin','c_level'])))
  with check  (exists (select 1 from public.profiles where id = auth.uid() and role = any (array['admin','c_level'])));

drop policy if exists satisfaction_responses_all on public.satisfaction_responses;
create policy satisfaction_responses_all on public.satisfaction_responses
  for all to authenticated
  using       (exists (select 1 from public.profiles where id = auth.uid() and role = any (array['admin','c_level'])))
  with check  (exists (select 1 from public.profiles where id = auth.uid() and role = any (array['admin','c_level'])));

comment on table public.satisfaction_responses is
  '서비스 만족도 설문 응답(익명). 자유서술 코멘트를 포함하므로 admin·c_level 만 열람.';

notify pgrst, 'reload schema';
