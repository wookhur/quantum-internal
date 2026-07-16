-- 인센티브 추가 실패(비관리자/재무 권한 담당자) 대응: contract_incentives의 RLS를
-- 다른 테이블과 동일하게 로그인 사용자 전체 허용으로 맞춘다. Safe to re-run.

ALTER TABLE public.contract_incentives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contract_incentives_all" ON public.contract_incentives;
DROP POLICY IF EXISTS "contract_incentives_select" ON public.contract_incentives;
DROP POLICY IF EXISTS "contract_incentives_insert" ON public.contract_incentives;
DROP POLICY IF EXISTS "contract_incentives_update" ON public.contract_incentives;
DROP POLICY IF EXISTS "contract_incentives_delete" ON public.contract_incentives;

CREATE POLICY "contract_incentives_all" ON public.contract_incentives
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 저장된 외부 수령자 테이블도 동일하게(있을 경우)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='incentive_recipients') THEN
    EXECUTE 'ALTER TABLE public.incentive_recipients ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "incentive_recipients_all" ON public.incentive_recipients';
    EXECUTE 'CREATE POLICY "incentive_recipients_all" ON public.incentive_recipients FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
