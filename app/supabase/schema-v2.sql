-- =============================================
-- QA Internal System - Schema Migration v2
-- Version: 2.0.0
-- Description: Migration from v0.4.0 to v2.0.0
--   - New pipeline stages for leads
--   - lead_activities table (replaces consultation tracking + memos)
--   - Flexible payment installments (replaces fixed deposit/interim/balance)
--   - Updated profiles with department/position
--   - Updated contracts with reps, amounts, payment account
--   - Events: add event_date column
--
-- SAFE TO RE-RUN: Uses IF NOT EXISTS / IF EXISTS guards
-- =============================================

BEGIN;

-- =============================================
-- 0. UTILITY: Ensure updated_at trigger function exists
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 1. PROFILES: Add department, position, is_external
--    Update role enum: admin, manager, staff, freelancer, viewer
-- =============================================

-- Rename old enum and create new one (safe pattern for enum migration)
DO $$
BEGIN
  -- Only migrate if the old enum still has the 'sales' value
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'sales'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    -- Rename old enum
    ALTER TYPE user_role RENAME TO user_role_old;

    -- Create new enum
    CREATE TYPE user_role AS ENUM ('admin', 'manager', 'staff', 'freelancer', 'viewer');

    -- Migrate column: map old values to new
    ALTER TABLE profiles
      ALTER COLUMN role TYPE user_role
      USING CASE role::text
        WHEN 'admin' THEN 'admin'::user_role
        WHEN 'sales' THEN 'staff'::user_role
        WHEN 'consultant' THEN 'staff'::user_role
        WHEN 'viewer' THEN 'viewer'::user_role
        ELSE 'viewer'::user_role
      END;

    -- Update default
    ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'viewer'::user_role;

    -- Drop old enum
    DROP TYPE user_role_old;
  END IF;
END $$;

-- Add new columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT false;

COMMENT ON COLUMN profiles.department IS 'management, sales, marketing, finance, service';
COMMENT ON COLUMN profiles.position IS '대표이사, 부대표, 이사, 팀장, 디렉터, 편집자 etc';
COMMENT ON COLUMN profiles.is_external IS 'true for freelancers and external contractors';

-- Update handle_new_user to use new default role
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'viewer'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 2. LEADS: New pipeline stages, new fields, remove consultation columns
-- =============================================

-- Migrate pipeline_stage enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'contact_attempted'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'pipeline_stage')
  ) THEN
    ALTER TYPE pipeline_stage RENAME TO pipeline_stage_old;

    CREATE TYPE pipeline_stage AS ENUM (
      'new_lead',               -- 신규 리드
      'contact_attempted',      -- 컨택 시도 (콜드콜/카톡 발송)
      'consultation_scheduled', -- 상담 예약됨
      'first_consultation',     -- 1차 상담
      'second_consultation',    -- 2차 상담
      'third_consultation',     -- 3차 상담
      'contract_review',        -- 계약 검토
      'contracted',             -- 계약 완료
      'on_hold',                -- 보류 (가족 논의중 등)
      'no_response',            -- 응답없음
      'rejected',               -- 거절
      'lost'                    -- 이탈
    );

    ALTER TABLE leads
      ALTER COLUMN pipeline_stage TYPE pipeline_stage
      USING CASE pipeline_stage::text
        WHEN 'new_lead' THEN 'new_lead'::pipeline_stage
        WHEN 'katalk_sent' THEN 'contact_attempted'::pipeline_stage
        WHEN 'first_consultation' THEN 'first_consultation'::pipeline_stage
        WHEN 'second_consultation' THEN 'second_consultation'::pipeline_stage
        WHEN 'contract_review' THEN 'contract_review'::pipeline_stage
        WHEN 'contracted' THEN 'contracted'::pipeline_stage
        WHEN 'lost' THEN 'lost'::pipeline_stage
        ELSE 'new_lead'::pipeline_stage
      END;

    ALTER TABLE leads ALTER COLUMN pipeline_stage SET DEFAULT 'new_lead'::pipeline_stage;

    DROP TYPE pipeline_stage_old;
  END IF;
END $$;

-- Add new fields to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_channel TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS google_meet_link TEXT;

COMMENT ON COLUMN leads.contact_channel IS '연락 채널: 단톡방, 카카오 비즈, 전화 etc';
COMMENT ON COLUMN leads.google_meet_link IS '구글밋 링크';

-- Remove old consultation tracking columns (replaced by lead_activities)
-- Using DO block so it doesn't fail if columns already removed
DO $$
BEGIN
  ALTER TABLE leads DROP COLUMN IF EXISTS consult_1_status;
  ALTER TABLE leads DROP COLUMN IF EXISTS consult_1_date;
  ALTER TABLE leads DROP COLUMN IF EXISTS consult_1_method;
  ALTER TABLE leads DROP COLUMN IF EXISTS consult_2_status;
  ALTER TABLE leads DROP COLUMN IF EXISTS consult_2_date;
  ALTER TABLE leads DROP COLUMN IF EXISTS consult_2_method;
  ALTER TABLE leads DROP COLUMN IF EXISTS consult_3_status;
  ALTER TABLE leads DROP COLUMN IF EXISTS consult_3_date;
  ALTER TABLE leads DROP COLUMN IF EXISTS consult_3_method;
END $$;

-- Drop old consultation enums if they exist (no longer needed)
DROP TYPE IF EXISTS consultation_status;
DROP TYPE IF EXISTS consultation_method;

-- =============================================
-- 3. LEAD ACTIVITIES: Timeline/notes for each lead
--    Replaces consultation tracking + memo fields
-- =============================================
CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'note',              -- 일반 메모
    'call',              -- 전화
    'katalk',            -- 카카오톡
    'email',             -- 이메일
    'meeting',           -- 미팅
    'consultation',      -- 상담
    'stage_change',      -- 파이프라인 단계 변경
    'assignment_change', -- 담당자 변경
    'system'             -- 시스템 자동 기록
  )),
  title TEXT NOT NULL,              -- e.g. "1차 상담 완료", "콜드콜: 부재중"
  content TEXT,                     -- detailed notes, AI consultation summary etc
  consultation_number INT,          -- 1, 2, 3 for consultation type activities
  consultation_method TEXT CHECK (consultation_method IN ('zoom', 'in_person', 'phone', 'katalk')),
  meeting_date TIMESTAMPTZ,         -- for meeting/consultation activities
  google_meet_link TEXT,
  metadata JSONB DEFAULT '{}',      -- flexible extra data
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for lead_activities
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_type ON lead_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created ON lead_activities(created_at DESC);

COMMENT ON TABLE lead_activities IS 'Timeline of all actions/notes for each lead. Replaces old consultation tracking columns and memo field.';

-- =============================================
-- 4. CONTRACTS: Add reps, contact info, amounts, payment account
-- =============================================
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS sales_rep UUID REFERENCES profiles(id);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS service_rep UUID REFERENCES profiles(id);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS total_amount BIGINT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'KRW';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_account TEXT DEFAULT 'KR';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add check constraints (safe with DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contracts_currency_check'
  ) THEN
    ALTER TABLE contracts ADD CONSTRAINT contracts_currency_check
      CHECK (currency IN ('KRW', 'USD'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contracts_payment_account_check'
  ) THEN
    ALTER TABLE contracts ADD CONSTRAINT contracts_payment_account_check
      CHECK (payment_account IN ('KR', 'US'));
  END IF;
END $$;

COMMENT ON COLUMN contracts.sales_rep IS '세일즈 담당자';
COMMENT ON COLUMN contracts.service_rep IS '서비스 담당자 (컨설턴트)';
COMMENT ON COLUMN contracts.total_amount IS '총 계약금액';
COMMENT ON COLUMN contracts.currency IS 'KRW or USD';
COMMENT ON COLUMN contracts.payment_account IS 'KR = 한국계좌, US = 미국법인계좌';

-- =============================================
-- 5. PAYMENT INSTALLMENTS: Flexible installment tracking
--    Replaces the fixed deposit/interim/balance structure in payments
-- =============================================
CREATE TABLE IF NOT EXISTS payment_installments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  installment_order INT NOT NULL,       -- 1=계약금, 2=중도금, 3=잔금 etc
  label TEXT NOT NULL,                  -- '계약금', '중도금', '2차 중도금', '잔금'
  amount BIGINT NOT NULL,
  due_date DATE,
  paid_date DATE,
  paid_amount BIGINT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'partial')),
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK (currency IN ('KRW', 'USD')),
  payment_method TEXT CHECK (payment_method IN ('bank_transfer', 'card', 'us_wire')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for payment_installments
CREATE INDEX IF NOT EXISTS idx_installments_contract ON payment_installments(contract_id);
CREATE INDEX IF NOT EXISTS idx_installments_status ON payment_installments(status);
CREATE INDEX IF NOT EXISTS idx_installments_due ON payment_installments(due_date);

COMMENT ON TABLE payment_installments IS 'Flexible payment installments per contract. Replaces old fixed deposit/interim/balance columns.';
COMMENT ON COLUMN payment_installments.installment_order IS '1=계약금, 2=중도금, 3=잔금 etc. Allows any number of installments.';
COMMENT ON COLUMN payment_installments.payment_method IS 'bank_transfer=계좌이체, card=카드, us_wire=미국 송금';

-- updated_at trigger for payment_installments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'payment_installments'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON payment_installments
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL; -- table might not exist yet on first run
END $$;

-- =============================================
-- 6. EVENTS: Add event_date for proper date handling
-- =============================================
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_date DATE;

COMMENT ON COLUMN events.event_date IS 'Proper date field for event date. Supplements event_datetime text field.';

-- =============================================
-- 7. RLS POLICIES for new tables
-- =============================================

-- lead_activities: same access pattern as leads
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Drop existing policies if re-running
  DROP POLICY IF EXISTS "lead_activities_select" ON lead_activities;
  DROP POLICY IF EXISTS "lead_activities_insert" ON lead_activities;
  DROP POLICY IF EXISTS "lead_activities_update" ON lead_activities;
  DROP POLICY IF EXISTS "lead_activities_delete" ON lead_activities;
END $$;

CREATE POLICY "lead_activities_select" ON lead_activities FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'manager', 'staff')
  )
);

CREATE POLICY "lead_activities_insert" ON lead_activities FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'manager', 'staff')
  )
);

CREATE POLICY "lead_activities_update" ON lead_activities FOR UPDATE USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

CREATE POLICY "lead_activities_delete" ON lead_activities FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- payment_installments: admin can CRUD, manager/staff can read
ALTER TABLE payment_installments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "installments_select" ON payment_installments;
  DROP POLICY IF EXISTS "installments_insert" ON payment_installments;
  DROP POLICY IF EXISTS "installments_update" ON payment_installments;
  DROP POLICY IF EXISTS "installments_delete" ON payment_installments;
END $$;

CREATE POLICY "installments_select" ON payment_installments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'manager', 'staff')
  )
);

CREATE POLICY "installments_insert" ON payment_installments FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'manager')
  )
);

CREATE POLICY "installments_update" ON payment_installments FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'manager')
  )
);

CREATE POLICY "installments_delete" ON payment_installments FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- =============================================
-- 8. UPDATE EXISTING RLS POLICIES for new role values
--    Old policies reference 'sales' and 'consultant' which no longer exist
-- =============================================

-- Leads policies: update to use new role names
DO $$
BEGIN
  DROP POLICY IF EXISTS "leads_select" ON leads;
  DROP POLICY IF EXISTS "leads_insert" ON leads;
  DROP POLICY IF EXISTS "leads_update" ON leads;
  DROP POLICY IF EXISTS "leads_delete" ON leads;
END $$;

CREATE POLICY "leads_select" ON leads FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager', 'staff'))
);
CREATE POLICY "leads_insert" ON leads FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager', 'staff'))
);
CREATE POLICY "leads_update" ON leads FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager', 'staff'))
);
CREATE POLICY "leads_delete" ON leads FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Contracts policies: update to use new role names
DO $$
BEGIN
  DROP POLICY IF EXISTS "contracts_select" ON contracts;
  DROP POLICY IF EXISTS "contracts_modify" ON contracts;
  DROP POLICY IF EXISTS "contracts_insert" ON contracts;
  DROP POLICY IF EXISTS "contracts_update" ON contracts;
  DROP POLICY IF EXISTS "contracts_delete" ON contracts;
END $$;

CREATE POLICY "contracts_select" ON contracts FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager', 'staff'))
);
CREATE POLICY "contracts_insert" ON contracts FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);
CREATE POLICY "contracts_update" ON contracts FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);
CREATE POLICY "contracts_delete" ON contracts FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Payments policies: update to use new role names
DO $$
BEGIN
  DROP POLICY IF EXISTS "payments_select" ON payments;
  DROP POLICY IF EXISTS "payments_modify" ON payments;
END $$;

CREATE POLICY "payments_select" ON payments FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager', 'staff'))
);
CREATE POLICY "payments_modify" ON payments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

-- Meetings policies: update to use new role names
DO $$
BEGIN
  DROP POLICY IF EXISTS "meetings_select" ON meetings;
  DROP POLICY IF EXISTS "meetings_modify" ON meetings;
END $$;

CREATE POLICY "meetings_select" ON meetings FOR SELECT USING (true);
CREATE POLICY "meetings_modify" ON meetings FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager', 'staff'))
);

-- =============================================
-- 9. DATA MIGRATION HELPERS
--    Migrate existing consultation data to lead_activities
-- =============================================

-- NOTE: This section is commented out because the consultation columns
-- were dropped above. If you need to migrate data, run this BEFORE
-- dropping the columns by uncommenting and executing separately.
--
-- INSERT INTO lead_activities (lead_id, activity_type, title, consultation_number, consultation_method, meeting_date, created_at)
-- SELECT
--   id,
--   'consultation',
--   '1차 상담',
--   1,
--   consult_1_method::text,
--   consult_1_date::timestamptz,
--   COALESCE(consult_1_date::timestamptz, created_at)
-- FROM leads
-- WHERE consult_1_status = 'completed' AND consult_1_date IS NOT NULL;
--
-- (repeat for consult_2 and consult_3)

-- =============================================
-- 10. VIEWS: Useful aggregation views
-- =============================================

-- Contract payment summary view
CREATE OR REPLACE VIEW contract_payment_summary AS
SELECT
  c.id AS contract_id,
  c.contractor_name,
  c.student_name,
  c.total_amount AS contract_total,
  c.currency,
  COUNT(pi.id) AS installment_count,
  COALESCE(SUM(pi.paid_amount), 0) AS total_paid,
  COALESCE(SUM(pi.amount), 0) AS total_scheduled,
  COALESCE(SUM(pi.amount) - SUM(pi.paid_amount), 0) AS outstanding,
  CASE
    WHEN COALESCE(SUM(pi.amount), 0) > 0
    THEN ROUND((SUM(pi.paid_amount)::numeric / SUM(pi.amount) * 100), 2)
    ELSE 0
  END AS payment_progress_pct,
  COUNT(pi.id) FILTER (WHERE pi.status = 'overdue') AS overdue_count,
  MIN(pi.due_date) FILTER (WHERE pi.status IN ('pending', 'partial')) AS next_due_date
FROM contracts c
LEFT JOIN payment_installments pi ON pi.contract_id = c.id
GROUP BY c.id, c.contractor_name, c.student_name, c.total_amount, c.currency;

-- Lead activity summary view
CREATE OR REPLACE VIEW lead_activity_summary AS
SELECT
  l.id AS lead_id,
  l.parent_name,
  l.student_name,
  l.pipeline_stage,
  l.assigned_to,
  COUNT(la.id) AS total_activities,
  COUNT(la.id) FILTER (WHERE la.activity_type = 'consultation') AS consultation_count,
  MAX(la.created_at) AS last_activity_at,
  MAX(la.meeting_date) FILTER (WHERE la.activity_type = 'consultation') AS last_consultation_date
FROM leads l
LEFT JOIN lead_activities la ON la.lead_id = l.id
GROUP BY l.id, l.parent_name, l.student_name, l.pipeline_stage, l.assigned_to;

-- =============================================
-- MIGRATION COMPLETE
-- =============================================

COMMIT;
