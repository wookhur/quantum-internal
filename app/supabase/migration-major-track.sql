-- 전공 2단계 분류: 계열(major_track) + 세부전공(major_detail)
-- ① 전공 계열 × 학년 현황판용. 기존 자유입력 majors는 상세 메모로 유지.
alter table service_students add column if not exists major_track text;
alter table service_students add column if not exists major_detail text;
