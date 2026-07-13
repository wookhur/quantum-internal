-- Per-contributor team override for service incentives.
-- Incentive rate is driven by each contributor's team (세일즈맨/서비스맨), resolved
-- automatically from 인사관리 소속팀; these columns let an admin override the team
-- per contributor when the name can't be matched to a profile. NULL = 자동(감지).
-- Values: 'sales' | 'service'. Safe to re-run.

ALTER TABLE public.service_ec_activities
  ADD COLUMN IF NOT EXISTS contributor_1_team text,
  ADD COLUMN IF NOT EXISTS contributor_2_team text;

ALTER TABLE public.service_academic_support
  ADD COLUMN IF NOT EXISTS contributor_1_team text,
  ADD COLUMN IF NOT EXISTS contributor_2_team text;

NOTIFY pgrst, 'reload schema';
