-- 콜드콜 거주지: 이전 버전이 자동 저장한 (일부 잘못된) 거주국가/거주도시 값을 초기화.
-- 이제 국가/현지시각은 저장하지 않고 매번 계산해 표시하고, 거주도시는 사용자가 직접
-- 입력했을 때만 저장한다. 따라서 자동으로 채워졌던 값을 비워 깨끗하게 재계산시키는 게 안전.
-- (직접 입력했던 소수의 도시도 함께 지워지므로, 필요하면 카드에서 다시 입력하면 됨.)
UPDATE leads
SET residence_country = NULL,
    residence_city = NULL
WHERE residence_country IS NOT NULL OR residence_city IS NOT NULL;
