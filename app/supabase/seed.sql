-- =============================================
-- QA Internal System - Seed Data
-- Run AFTER schema.sql
-- =============================================

-- =============================================
-- 1. LEADS (from Google Sheet Raw data)
-- =============================================
INSERT INTO leads (lead_date, parent_name, student_name, phone, current_school, grade, region, interest_area, source_channel, pipeline_stage, required_action, memo, consult_1_status, consult_1_date, consult_1_method) VALUES
  ('2025-12-24', '김도희', 'Ryan', '010-8638-2580', 'SJA', 'G8', '제주/부산', '해외대학 입시 (대입 - Overseas)', 'Instagram', 'contracted', '계약 완료', '', 'completed', '2025-12-28', 'zoom'),
  ('2025-12-23', '성혜란', '박찬울', '4164717732', 'Luther College Highschool', '10', 'Canada', '해외대학 입시 (대입 - Overseas)', 'Instagram', 'first_consultation', NULL, '', 'completed', '2025-12-27', 'zoom'),
  ('2025-12-30', '김주영', '주영', '01049396479', 'Gia', '8', 'Seoul', '학업 성취도 및 내신 관리', 'GIA Seminar', 'second_consultation', '2차 상담 리드', '', 'completed', '2026-01-03', 'in_person'),
  ('2026-01-06', '박호민', '박태준', '510-574-5475', 'Head Royce', '10', 'CA', '해외대학 입시 (대입 - Overseas)', 'Instagram', 'contracted', '계약 완료', '', 'completed', '2026-01-10', 'zoom'),
  ('2026-01-09', '조아현', '', '852 6598 0928', 'Sha Tin College', '11', 'Hong Kong', '해외대학 입시 (대입 - Overseas)', 'Instagram', 'contract_review', '계약서 검토중', '', 'completed', '2026-01-13', 'zoom'),
  ('2026-04-11', '장부희', 'Amy Kim', '010-3877-8529', 'APIS', '9', '서울', 'Psych, Bio', '인스타그램', 'contracted', NULL, '', 'completed', '2026-04-12', 'in_person'),
  ('2026-04-11', '김선영', '김채현 Chloe', '010-4498-3010', 'SIS', '10', '서울', '', '4/11 서울 세미나', 'contract_review', '계약서 검토중', '', 'completed', '2026-04-09', 'in_person'),
  ('2026-04-11', '홍성희', '김하민', '010-2611-8695', 'Fulton Science', '10', '조지아 알파레타', '전자공학', '4/11 서울 세미나', 'contracted', NULL, '', 'completed', '2026-04-11', 'in_person'),
  ('2026-04-11', '지해연', '김규연', '010-5552-1234', 'KISJ', '9', '서울', '', '4/11 서울 세미나', 'new_lead', NULL, '', 'pending', NULL, NULL),
  ('2026-03-15', '이상희', '', '010-3344-5566', '체드윅', 'G8', '서울', '', 'GIA Seminar', 'katalk_sent', NULL, '', 'pending', NULL, NULL),
  ('2026-03-10', '임현주', '', '010-7788-9900', 'Norman North', '10', 'OK', '', 'Instagram', 'katalk_sent', NULL, '', 'pending', NULL, NULL),
  ('2026-04-01', '황민준', '', '010-1122-3344', '필립스 엑시터', 'Y11', '서울', '', 'Instagram', 'first_consultation', NULL, '', 'completed', '2026-04-05', 'zoom'),
  ('2026-04-08', '김소영', '유예지', '010-9988-7766', 'BHA', '8', '서울', '', '4/11 서울 세미나', 'contracted', NULL, '', 'completed', '2026-04-10', 'in_person');

-- Update consultation 2 for leads that have second consultations
UPDATE leads SET consult_2_status = 'completed', consult_2_date = '2026-04-12', consult_2_method = 'in_person'
WHERE parent_name = '김선영' AND student_name = '김채현 Chloe';

UPDATE leads SET consult_2_status = 'completed', consult_2_date = '2026-01-08', consult_2_method = 'in_person'
WHERE parent_name = '김주영' AND student_name = '주영';

-- =============================================
-- 2. MONTHLY PERFORMANCE (실적 분석)
-- =============================================
INSERT INTO monthly_performance (year, month, region, target, actual, consultation_count, new_contracts, conversion_rate, currency) VALUES
  (2026, 1, 'KR', 30000000, 33000000, 8, 1, 12.5, 'KRW'),
  (2026, 2, 'KR', 50000000, 55000000, 10, 1, 10.0, 'KRW'),
  (2026, 3, 'KR', 70000000, 70200000, 12, 2, 16.7, 'KRW'),
  (2026, 4, 'KR', 100000000, 0, 23, 2, 8.7, 'KRW'),
  (2026, 1, 'US', 0, 3540, 2, 0, 0, 'USD'),
  (2026, 2, 'US', 0, 3540, 1, 0, 0, 'USD'),
  (2026, 3, 'US', 0, 0, 0, 0, 0, 'USD');

-- =============================================
-- 3. SALES EVENTS (영업 현황)
-- =============================================
INSERT INTO sales_events (month, event_name, applicants, attendees, phone_consultations, zoom_bookings, in_person_bookings, total_meetings, contracts, contract_rate) VALUES
  ('2026-01', '1월 GIA 세미나', 35, 28, 5, 3, 8, 16, 1, 6.3),
  ('2026-02', '2월 인스타 캠페인', 42, 0, 8, 5, 3, 16, 1, 6.3),
  ('2026-03', '3월 부산 세미나', 50, 38, 6, 4, 12, 22, 2, 9.1),
  ('2026-04', '4/11 서울 세미나', 65, 48, 3, 2, 15, 20, 3, 15.0);

-- =============================================
-- 4. MARKETING METRICS (마케팅 현황)
-- =============================================
INSERT INTO marketing_metrics (year, month, week, channel, metric, annual_target, value) VALUES
  -- Kakao
  (2026, 4, 1, 'kakao', 'friends', 3000, 2150),
  (2026, 4, 2, 'kakao', 'friends', 3000, 2230),
  -- Instagram
  (2026, 4, 1, 'instagram', 'followers', 5000, 3800),
  (2026, 4, 2, 'instagram', 'followers', 5000, 3950),
  -- YouTube
  (2026, 4, 1, 'youtube', 'views', 50000, 28000),
  -- Blog
  (2026, 4, 1, 'blog', 'visitors', 10000, 4500);

-- =============================================
-- 5. EVENTS (이벤트 현황)
-- =============================================
INSERT INTO events (month, week, event_name, event_datetime, venue, speakers, speaker_confirmed, venue_confirmed, copy_written, design_completed, ppt_completed, uploaded) VALUES
  ('2026-04', 2, '4/11 서울 세미나', '4/11, 14:00-16:00', '삼성동 컨퍼런스룸', ARRAY['한상범'], true, true, true, true, true, true),
  ('2026-04', 4, '4/24 제주 세미나', '4/24, 14:00-16:00', '신화월드 올레룸', ARRAY['한상범', '허욱'], true, false, true, false, false, false),
  ('2026-05', 1, '5/2 부산 세미나', '5/2, 14:00-16:00', 'TBD', ARRAY['한상범'], false, false, false, false, false, false);

-- =============================================
-- 6. AD CAMPAIGNS (광고 현황)
-- =============================================
INSERT INTO ad_campaigns (platform, event_name, impressions, reach, clicks, cost, ctr, cpc, comments, comment_rate, cost_per_comment) VALUES
  ('meta', '4/11 서울 세미나', 45000, 32000, 890, 350000, 1.98, 393, 42, 4.72, 8333),
  ('meta', '4/24 제주 세미나', 12000, 8500, 210, 120000, 1.75, 571, 8, 3.81, 15000);

INSERT INTO ad_campaigns (platform, event_name, impressions, reach, clicks, cost, ctr, cpc, friends_before, friends_after, note) VALUES
  ('kakao', '4월 카카오 비즈보드', 28000, 18000, 520, 280000, 1.86, 538, 2150, 2230, '4/11 세미나 타겟');
