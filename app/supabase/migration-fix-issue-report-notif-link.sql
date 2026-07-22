-- 기존 이슈 리포트 알림의 "자세히 보기" 링크를 해당 학생의 Student360 카드로 교정.
-- (기존 rows는 존재하지 않는 /service/students 경로를 가지고 있어 로그인/대시보드로 튕겼음)
-- 새로 생성되는 알림은 코드에서 올바른 링크를 넣으므로 이 스크립트는 과거 데이터 보정용. 재실행 안전.
UPDATE user_notifications
SET link = '/service/student-360?student=' || (metadata->>'studentId')
WHERE type = 'issue_report'
  AND metadata->>'studentId' IS NOT NULL
  AND (link IS NULL OR link NOT LIKE '/service/student-360%');
