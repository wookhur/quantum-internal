-- =============================================
-- QA Internal System - Supabase Schema
-- Version: 0.4.0
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 1. USERS (extends Supabase auth.users)
-- =============================================
CREATE TYPE user_role AS ENUM ('admin', 'sales', 'consultant', 'viewer');

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'viewer',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================
-- 2. LEADS (Raw 탭 기반)
-- =============================================
CREATE TYPE pipeline_stage AS ENUM (
  'new_lead', 'katalk_sent', 'first_consultation',
  'second_consultation', 'contract_review', 'contracted', 'lost'
);

CREATE TYPE consultation_status AS ENUM ('pending', 'completed');
CREATE TYPE consultation_method AS ENUM ('in_person', 'zoom', 'phone', 'katalk');

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_date DATE NOT NULL DEFAULT CURRENT_DATE,
  parent_name TEXT NOT NULL,
  student_name TEXT,
  email TEXT,
  phone TEXT NOT NULL,
  current_school TEXT,
  grade TEXT,
  region TEXT,
  interest_area TEXT,
  source_channel TEXT NOT NULL,
  memo TEXT,
  required_action TEXT,
  pipeline_stage pipeline_stage NOT NULL DEFAULT 'new_lead',
  assigned_to UUID REFERENCES profiles(id),
  -- Consultation tracking
  consult_1_status consultation_status DEFAULT 'pending',
  consult_1_date DATE,
  consult_1_method consultation_method,
  consult_2_status consultation_status DEFAULT 'pending',
  consult_2_date DATE,
  consult_2_method consultation_method,
  consult_3_status consultation_status DEFAULT 'pending',
  consult_3_date DATE,
  consult_3_method consultation_method,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_pipeline ON leads(pipeline_stage);
CREATE INDEX idx_leads_source ON leads(source_channel);
CREATE INDEX idx_leads_assigned ON leads(assigned_to);
CREATE INDEX idx_leads_date ON leads(lead_date DESC);

-- =============================================
-- 3. MEETINGS (Meeting 탭 기반)
-- =============================================
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  meeting_date DATE NOT NULL,
  meeting_number SMALLINT NOT NULL CHECK (meeting_number BETWEEN 1 AND 5),
  parent_name TEXT NOT NULL,
  student_name TEXT,
  phone TEXT,
  current_school TEXT,
  grade TEXT,
  region TEXT,
  interest_area TEXT,
  source_channel TEXT,
  memo TEXT,
  note_delivered BOOLEAN DEFAULT false,
  next_meeting_date DATE,
  required_action TEXT,
  google_calendar_event_id TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meetings_lead ON meetings(lead_id);
CREATE INDEX idx_meetings_date ON meetings(meeting_date DESC);

-- =============================================
-- 4. SALES EVENTS (영업 현황 탭)
-- =============================================
CREATE TABLE sales_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  month TEXT NOT NULL,  -- "2026-01"
  event_name TEXT NOT NULL,
  applicants INT DEFAULT 0,
  attendees INT DEFAULT 0,
  phone_consultations INT DEFAULT 0,
  zoom_bookings INT DEFAULT 0,
  in_person_bookings INT DEFAULT 0,
  total_meetings INT DEFAULT 0,
  contracts INT DEFAULT 0,
  contract_rate DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 5. MARKETING METRICS (마케팅 현황 탭)
-- =============================================
CREATE TABLE marketing_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  week INT CHECK (week BETWEEN 1 AND 5),
  channel TEXT NOT NULL,  -- kakao, instagram, youtube, blog, news
  metric TEXT NOT NULL,   -- friends, followers, views, visitors, published
  annual_target INT,
  value INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(year, month, week, channel, metric)
);

-- =============================================
-- 6. AD CAMPAIGNS (마케팅 광고 현황 탭)
-- =============================================
CREATE TYPE ad_platform AS ENUM ('meta', 'kakao');

CREATE TABLE ad_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform ad_platform NOT NULL,
  event_name TEXT NOT NULL,
  impressions INT DEFAULT 0,
  reach INT DEFAULT 0,
  clicks INT DEFAULT 0,
  cost INT DEFAULT 0,  -- KRW
  ctr DECIMAL(6,2) DEFAULT 0,
  cpc INT DEFAULT 0,
  -- Meta-specific
  comments INT,
  comment_rate DECIMAL(6,2),
  cost_per_comment INT,
  -- Kakao-specific
  friends_before INT,
  friends_after INT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 7. EVENTS (이벤트 현황 탭)
-- =============================================
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  month TEXT NOT NULL,  -- "2026-04"
  week INT,
  event_name TEXT NOT NULL,
  event_datetime TEXT,  -- "4/11, 14:00, 16:00"
  venue TEXT,
  speakers TEXT[],
  -- Checklist
  speaker_confirmed BOOLEAN DEFAULT false,
  venue_confirmed BOOLEAN DEFAULT false,
  copy_written BOOLEAN DEFAULT false,
  design_completed BOOLEAN DEFAULT false,
  ppt_completed BOOLEAN DEFAULT false,
  uploaded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 8. CONTRACTS (Existing Contract 탭)
-- =============================================
CREATE TYPE contract_status AS ENUM ('active', 'expiring_soon', 'expired');

CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  contractor_name TEXT NOT NULL,
  student_name TEXT NOT NULL,
  school_name TEXT NOT NULL,
  grade_at_contract TEXT,
  contract_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  status contract_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contracts_status ON contracts(status);
CREATE INDEX idx_contracts_expiry ON contracts(expiry_date);

-- =============================================
-- 9. PAYMENTS (Payment Schedule 탭)
-- =============================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  -- Payment stages
  deposit_amount INT DEFAULT 0,
  deposit_date DATE,
  interim1_amount INT DEFAULT 0,
  interim1_date DATE,
  interim2_amount INT DEFAULT 0,
  interim2_date DATE,
  balance_amount INT DEFAULT 0,
  balance_date DATE,
  -- Totals
  total_amount INT NOT NULL DEFAULT 0,
  paid_amount INT NOT NULL DEFAULT 0,
  outstanding_amount INT GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  payment_progress DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_amount > 0 THEN (paid_amount::DECIMAL / total_amount * 100) ELSE 0 END
  ) STORED,
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK (currency IN ('KRW', 'USD')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Monthly payment records
CREATE TABLE payment_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,  -- "2026-01"
  amount INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 10. MONTHLY PERFORMANCE (실적 분석 탭)
-- =============================================
CREATE TABLE monthly_performance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  region TEXT NOT NULL CHECK (region IN ('KR', 'US')),
  target BIGINT NOT NULL DEFAULT 0,
  actual BIGINT NOT NULL DEFAULT 0,
  achievement_rate DECIMAL(6,2) GENERATED ALWAYS AS (
    CASE WHEN target > 0 THEN (actual::DECIMAL / target * 100) ELSE 0 END
  ) STORED,
  expenses BIGINT,
  profit BIGINT,
  consultation_count INT,
  new_contracts INT,
  conversion_rate DECIMAL(5,2),
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK (currency IN ('KRW', 'USD')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(year, month, region)
);

-- =============================================
-- 11. TODOS (할일)
-- =============================================
CREATE TYPE todo_status AS ENUM ('todo', 'in_progress', 'done');
CREATE TYPE todo_priority AS ENUM ('low', 'medium', 'high');

CREATE TABLE todos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID NOT NULL REFERENCES profiles(id),
  linked_entity_type TEXT CHECK (linked_entity_type IN ('lead', 'contract', 'event', 'video')),
  linked_entity_id UUID,
  status todo_status NOT NULL DEFAULT 'todo',
  priority todo_priority NOT NULL DEFAULT 'medium',
  due_date DATE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_todos_assigned ON todos(assigned_to);
CREATE INDEX idx_todos_status ON todos(status);
CREATE INDEX idx_todos_due ON todos(due_date);

-- =============================================
-- 12. VIDEO PROJECTS (영상 콘텐츠)
-- =============================================
CREATE TYPE video_status AS ENUM ('idea', 'approved', 'filming', 'editing', 'review', 'uploaded');

CREATE TABLE video_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  category TEXT,
  status video_status NOT NULL DEFAULT 'idea',
  assigned_to UUID REFERENCES profiles(id),
  due_date DATE,
  platform TEXT CHECK (platform IN ('youtube', 'instagram_reels', 'both')),
  views INT,
  likes INT,
  comments INT,
  shares INT,
  published_url TEXT,
  checklist JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 13. EVENT FORMS (세미나 신청폼)
-- =============================================
CREATE TABLE event_forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  fields JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE form_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id UUID NOT NULL REFERENCES event_forms(id) ON DELETE CASCADE,
  respondent_type TEXT CHECK (respondent_type IN ('parent', 'student')),
  last_name TEXT,
  first_name TEXT,
  email TEXT,
  phone TEXT,
  current_school TEXT,
  grade TEXT,
  wants_consultation BOOLEAN DEFAULT false,
  lead_id UUID REFERENCES leads(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 14. ACTIVITY LOG
-- =============================================
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('lead', 'contract', 'payment', 'meeting', 'todo', 'video')),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_created ON activity_log(created_at DESC);

-- =============================================
-- 15. GAME LEADERBOARD
-- =============================================
CREATE TABLE game_leaderboard (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  game TEXT NOT NULL DEFAULT 'trex',
  score INT NOT NULL,
  played_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leaderboard_score ON game_leaderboard(game, score DESC);

-- =============================================
-- RLS (Row Level Security)
-- =============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_leaderboard ENABLE ROW LEVEL SECURITY;

-- Profiles: everyone can read, only self can update
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Leads: admin & sales can CRUD, consultants can read
CREATE POLICY "leads_select" ON leads FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'sales', 'consultant'))
);
CREATE POLICY "leads_insert" ON leads FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'sales'))
);
CREATE POLICY "leads_update" ON leads FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'sales'))
);
CREATE POLICY "leads_delete" ON leads FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Todos: everyone can read, assigned user or creator can update
CREATE POLICY "todos_select" ON todos FOR SELECT USING (true);
CREATE POLICY "todos_insert" ON todos FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "todos_update" ON todos FOR UPDATE USING (
  auth.uid() = assigned_to OR auth.uid() = created_by OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Contracts: admin & consultant can CRUD, sales can read
CREATE POLICY "contracts_select" ON contracts FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'sales', 'consultant'))
);
CREATE POLICY "contracts_modify" ON contracts FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'consultant'))
);

-- Payments: admin can CRUD, others read
CREATE POLICY "payments_select" ON payments FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'sales', 'consultant'))
);
CREATE POLICY "payments_modify" ON payments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Meetings: admin & sales can CRUD
CREATE POLICY "meetings_select" ON meetings FOR SELECT USING (true);
CREATE POLICY "meetings_modify" ON meetings FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'sales'))
);

-- Game leaderboard: everyone can read, authenticated can insert own scores
CREATE POLICY "leaderboard_select" ON game_leaderboard FOR SELECT USING (true);
CREATE POLICY "leaderboard_insert" ON game_leaderboard FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =============================================
-- UPDATED_AT TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON todos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON video_projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
