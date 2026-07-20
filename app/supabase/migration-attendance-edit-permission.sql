-- 근태관리 수정 권한 (근태 기록 추가·수정·삭제·업로드).
-- HR 모듈 접근 권한과 별개로, 이 권한을 가진 사용자(및 admin)만 근태 기록을
-- 편집할 수 있다. 인사관리 → 접근 권한 설정 → 특수 권한에서 지정한다.
-- Safe to re-run.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_edit_attendance BOOLEAN NOT NULL DEFAULT false;

-- 지정 사용자에게 근태관리 수정 권한 부여
UPDATE public.profiles
  SET can_edit_attendance = true
  WHERE email = 'jisoo@quantumadmissions.com';

NOTIFY pgrst, 'reload schema';
