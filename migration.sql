-- ============================================================
-- DATA MIGRATION: Contracts + Payment Installments
-- Source: Google Sheets "QA Marketing/Sales"
-- Date: 2026-05-13
-- ============================================================

BEGIN;

-- ============================================================
-- PART 1: Update contracts with total_amount
-- ============================================================

-- 1. 허원영 - UCSB
UPDATE contracts SET total_amount = 15000000
WHERE id = '871cc898-42c8-4d24-aa07-e9aa725f56d8';

-- 2. 김정원 - Gunnery
UPDATE contracts SET total_amount = 29700000
WHERE id = 'd1d35337-c24b-4b1f-838b-07bae08289fc';

-- 3. 김호진 - NLCS
UPDATE contracts SET total_amount = 33000000
WHERE id = '7c5cdde3-bb6e-4b15-b7bf-c99dfbbf0df4';

-- 4. 강윤영 - GIA
UPDATE contracts SET total_amount = 11000000
WHERE id = 'c8b0dab3-fa60-4e19-9494-c8c48f576216';

-- 5. 배서연 - WMA
UPDATE contracts SET total_amount = 53295000
WHERE id = 'e2245466-0316-4b06-a193-10cb48c0699d';

-- 6. 박태준 - Head Royce
UPDATE contracts SET total_amount = 56100000
WHERE id = '12ac10c5-34a7-453f-8404-3a292926d66f';

-- 7. 윤준형 - 외대부고
UPDATE contracts SET total_amount = 48400000
WHERE id = '0e4b34ff-1f60-440a-84cb-a535531b003e';

-- 8. 박여은 - ASFG
UPDATE contracts SET total_amount = 26500000
WHERE id = '44dd8d07-7d46-4031-9560-f3c179ae439d';

-- 9. 박은율 - ASFG
UPDATE contracts SET total_amount = 68215694, school_name = 'ASFG'
WHERE id = '3de1e2de-59c1-4c62-b115-50b0cb9caddd';

-- 10. 김태민 - Harvard Westlake
UPDATE contracts SET total_amount = 56100000
WHERE id = '0793063a-de64-47a2-a9a0-fd5c1637c4ab';

-- 11. 남연주 - Dulwich College Beijing
UPDATE contracts SET total_amount = 79200000
WHERE id = '873faf98-fdbe-42d1-b132-3b9ed1744605';

-- 12. 현시우 - Fay school
UPDATE contracts SET total_amount = 24200000
WHERE id = '1fd40a45-89c2-47ad-b055-093ed63e0392';

-- 13. Clare Lee - Fay school (Northwood in payment schedule)
UPDATE contracts SET total_amount = 44000000
WHERE id = 'c4d08bd8-7edd-459f-b4cf-15c17fdff3ab';

-- 14. 임서연(Charlotte Im) - Harvard Westlake
UPDATE contracts SET total_amount = 11840000
WHERE id = 'a5ffadb3-23f4-43cb-b16e-6ecbafa9f6ae';

-- 15. 김채현(Chloe) - SIS
UPDATE contracts SET total_amount = 48700000
WHERE id = 'a6e8c3e1-ab81-48a8-a1bd-78f1fa57fdc3';

-- 16. Amy Kim - APIS
UPDATE contracts SET total_amount = 63800000
WHERE id = '6121d781-c49d-432b-bf5b-a65b205c84ec';

-- 17. 유예지 - BHA
UPDATE contracts SET total_amount = 87200000
WHERE id = '8ab647c0-4bed-40a1-8dfc-7a70f05af0a5';

-- 18. 김규연(Chloe) - 잠실중
UPDATE contracts SET total_amount = 15400000
WHERE id = 'fcc37878-8c3e-41fb-b50c-be9023bd870e';

-- 19. 임서아 - 숙명여고
UPDATE contracts SET total_amount = 40000000
WHERE id = '14118e99-9966-405a-9377-26fae02a1657';

-- 20. 한지민(Brandon) - 브레아올린다하이스쿨
UPDATE contracts SET total_amount = 20000000
WHERE id = 'a9676ef1-d0f7-4405-9121-6217b283ae93';

-- 21. 강예은 - BHA
UPDATE contracts SET total_amount = 40000000
WHERE id = 'd3118e45-7886-4a56-9c75-f1ce20363020';

-- ============================================================
-- PART 2: Insert payment installments
-- ============================================================

INSERT INTO payment_installments
  (contract_id, installment_order, label, amount, due_date, paid_amount, paid_date, status, currency)
VALUES

-- 1. 허원영 - UCSB (15M, 1 installment, 100% paid)
('871cc898-42c8-4d24-aa07-e9aa725f56d8', 1, '계약금', 15000000, '2025-11-30', 15000000, '2025-11-30', 'paid', 'KRW'),

-- 2. 김정원 - Gunnery (29.7M, 3 installments, 37% paid)
('d1d35337-c24b-4b1f-838b-07bae08289fc', 1, '계약금', 11000000, '2025-11-07', 11000000, '2025-11-07', 'paid', 'KRW'),
('d1d35337-c24b-4b1f-838b-07bae08289fc', 2, '중도금', 9350000, '2025-12-07', 0, NULL, 'overdue', 'KRW'),
('d1d35337-c24b-4b1f-838b-07bae08289fc', 3, '잔금', 9350000, '2025-12-31', 0, NULL, 'overdue', 'KRW'),

-- 3. 김호진 - NLCS (33M, 3 installments, 100% paid)
('7c5cdde3-bb6e-4b15-b7bf-c99dfbbf0df4', 1, '계약금', 11000000, '2025-11-07', 11000000, '2025-11-07', 'paid', 'KRW'),
('7c5cdde3-bb6e-4b15-b7bf-c99dfbbf0df4', 2, '중도금', 11000000, '2025-12-07', 11000000, '2025-12-07', 'paid', 'KRW'),
('7c5cdde3-bb6e-4b15-b7bf-c99dfbbf0df4', 3, '잔금', 11000000, '2026-01-07', 11000000, '2026-01-07', 'paid', 'KRW'),

-- 4. 강윤영 - GIA (11M, 1 installment, 100% paid)
('c8b0dab3-fa60-4e19-9494-c8c48f576216', 1, '계약금', 11000000, '2025-11-30', 11000000, '2025-11-30', 'paid', 'KRW'),

-- 5. 배서연 - WMA (53.295M, 3 installments, 41% paid)
('e2245466-0316-4b06-a193-10cb48c0699d', 1, '계약금', 22000000, '2025-11-30', 22000000, '2025-11-30', 'paid', 'KRW'),
('e2245466-0316-4b06-a193-10cb48c0699d', 2, '중도금', 22000000, '2026-07-31', 0, NULL, 'pending', 'KRW'),
('e2245466-0316-4b06-a193-10cb48c0699d', 3, '잔금', 9295000, '2026-12-31', 0, NULL, 'pending', 'KRW'),

-- 6. 박태준 - Head Royce (56.1M, 3 installments, 39% paid)
('12ac10c5-34a7-453f-8404-3a292926d66f', 1, '계약금', 22000000, '2026-01-09', 22000000, '2026-01-09', 'paid', 'KRW'),
('12ac10c5-34a7-453f-8404-3a292926d66f', 2, '중도금', 22000000, '2026-07-01', 0, NULL, 'pending', 'KRW'),
('12ac10c5-34a7-453f-8404-3a292926d66f', 3, '잔금', 12100000, '2027-01-31', 0, NULL, 'pending', 'KRW'),

-- 7. 윤준형 - 외대부고 (48.4M, 3 installments, 45% paid)
('0e4b34ff-1f60-440a-84cb-a535531b003e', 1, '계약금', 22000000, '2026-02-05', 22000000, '2026-02-05', 'paid', 'KRW'),
('0e4b34ff-1f60-440a-84cb-a535531b003e', 2, '중도금', 13200000, '2026-08-05', 0, NULL, 'pending', 'KRW'),
('0e4b34ff-1f60-440a-84cb-a535531b003e', 3, '잔금', 13200000, '2027-02-05', 0, NULL, 'pending', 'KRW'),

-- 8. 박여은 - ASFG (26.5M, 2 installments, 72% paid)
('44dd8d07-7d46-4031-9560-f3c179ae439d', 1, '계약금', 19116099, '2026-02-07', 19116099, '2026-02-07', 'paid', 'KRW'),
('44dd8d07-7d46-4031-9560-f3c179ae439d', 2, '잔금', 7383901, '2026-04-07', 0, NULL, 'overdue', 'KRW'),

-- 9. 박은율 - ASFG (68.2M, 3 installments, 2% paid)
('3de1e2de-59c1-4c62-b115-50b0cb9caddd', 1, '계약금', 1246274, '2026-02-12', 1246274, '2026-02-12', 'paid', 'KRW'),
('3de1e2de-59c1-4c62-b115-50b0cb9caddd', 2, '중도금', 25132097, '2027-02-12', 0, NULL, 'pending', 'KRW'),
('3de1e2de-59c1-4c62-b115-50b0cb9caddd', 3, '잔금', 41837323, '2028-02-12', 0, NULL, 'pending', 'KRW'),

-- 10. 김태민 - Harvard Westlake (56.1M, 3 installments, 39% paid)
('0793063a-de64-47a2-a9a0-fd5c1637c4ab', 1, '계약금', 22000000, '2026-02-25', 22000000, '2026-02-25', 'paid', 'KRW'),
('0793063a-de64-47a2-a9a0-fd5c1637c4ab', 2, '중도금', 22000000, '2026-08-25', 0, NULL, 'pending', 'KRW'),
('0793063a-de64-47a2-a9a0-fd5c1637c4ab', 3, '잔금', 12100000, '2027-02-25', 0, NULL, 'pending', 'KRW'),

-- 11. 남연주 - Dulwich (79.2M, 3 installments, 42% paid)
('873faf98-fdbe-42d1-b132-3b9ed1744605', 1, '계약금', 33000000, '2026-03-01', 33000000, '2026-03-01', 'paid', 'KRW'),
('873faf98-fdbe-42d1-b132-3b9ed1744605', 2, '중도금', 23100000, '2026-09-01', 0, NULL, 'pending', 'KRW'),
('873faf98-fdbe-42d1-b132-3b9ed1744605', 3, '잔금', 23100000, '2027-03-01', 0, NULL, 'pending', 'KRW'),

-- 12. 현시우 - Fay school (24.2M, 1 installment, 100% paid)
('1fd40a45-89c2-47ad-b055-093ed63e0392', 1, '계약금', 24200000, '2026-03-12', 24200000, '2026-03-12', 'paid', 'KRW'),

-- 13. Clare Lee - Fay school (44M, 3 installments, 14% paid)
('c4d08bd8-7edd-459f-b4cf-15c17fdff3ab', 1, '계약금', 13000000, '2026-03-21', 6000000, NULL, 'overdue', 'KRW'),
('c4d08bd8-7edd-459f-b4cf-15c17fdff3ab', 2, '중도금', 18000000, '2026-09-21', 0, NULL, 'pending', 'KRW'),
('c4d08bd8-7edd-459f-b4cf-15c17fdff3ab', 3, '잔금', 13000000, '2027-03-21', 0, NULL, 'pending', 'KRW'),

-- 14. 임서연(Charlotte Im) - Harvard Westlake (11.84M, 1 installment, 100% paid)
('a5ffadb3-23f4-43cb-b16e-6ecbafa9f6ae', 1, '잔금', 11840000, '2026-04-05', 11840000, '2026-04-05', 'paid', 'KRW'),

-- 15. 김채현(Chloe) - SIS (48.7M, 2 installments, 32% paid)
('a6e8c3e1-ab81-48a8-a1bd-78f1fa57fdc3', 1, '계약금', 15700000, '2026-04-13', 15700000, '2026-04-13', 'paid', 'KRW'),
('a6e8c3e1-ab81-48a8-a1bd-78f1fa57fdc3', 2, '잔금', 33000000, '2027-01-31', 0, NULL, 'pending', 'KRW'),

-- 16. Amy Kim - APIS (63.8M, 3 installments, 24% paid)
('6121d781-c49d-432b-bf5b-a65b205c84ec', 1, '계약금', 15400000, '2026-04-18', 15400000, '2026-04-18', 'paid', 'KRW'),
('6121d781-c49d-432b-bf5b-a65b205c84ec', 2, '중도금', 15400000, '2026-10-05', 0, NULL, 'pending', 'KRW'),
('6121d781-c49d-432b-bf5b-a65b205c84ec', 3, '잔금', 33000000, '2027-12-31', 0, NULL, 'pending', 'KRW'),

-- 17. 유예지 - BHA (87.2M, 4 installments, 0% paid)
('8ab647c0-4bed-40a1-8dfc-7a70f05af0a5', 1, '계약금', 30000000, '2026-05-10', 0, NULL, 'overdue', 'KRW'),
('8ab647c0-4bed-40a1-8dfc-7a70f05af0a5', 2, '중도금', 24000000, '2027-05-10', 0, NULL, 'pending', 'KRW'),
('8ab647c0-4bed-40a1-8dfc-7a70f05af0a5', 3, '2차 중도금', 23000000, '2028-05-10', 0, NULL, 'pending', 'KRW'),
('8ab647c0-4bed-40a1-8dfc-7a70f05af0a5', 4, '잔금', 10000000, '2028-12-31', 0, NULL, 'pending', 'KRW'),

-- 18. 김규연(Chloe) - 잠실중 (15.4M, 4 installments, 0% paid)
('fcc37878-8c3e-41fb-b50c-be9023bd870e', 1, '계약금', 3850000, '2026-04-24', 0, NULL, 'overdue', 'KRW'),
('fcc37878-8c3e-41fb-b50c-be9023bd870e', 2, '중도금', 3850000, '2026-07-24', 0, NULL, 'pending', 'KRW'),
('fcc37878-8c3e-41fb-b50c-be9023bd870e', 3, '2차 중도금', 3850000, '2026-10-24', 0, NULL, 'pending', 'KRW'),
('fcc37878-8c3e-41fb-b50c-be9023bd870e', 4, '잔금', 3850000, '2027-01-24', 0, NULL, 'pending', 'KRW'),

-- 19. 임서아 - 숙명여고 (40M, 1 installment, 0% paid)
('14118e99-9966-405a-9377-26fae02a1657', 1, '잔금', 40000000, '2026-05-02', 0, NULL, 'overdue', 'KRW'),

-- 20. 한지민(Brandon) - 브레아올린다 (20M, 1 installment, 100% paid)
('a9676ef1-d0f7-4405-9121-6217b283ae93', 1, '계약금', 20000000, '2026-05-04', 20000000, '2026-05-04', 'paid', 'KRW'),

-- 21. 강예은 - BHA (40M, 2 installments, 0% paid)
('d3118e45-7886-4a56-9c75-f1ce20363020', 1, '계약금', 20000000, '2026-04-27', 0, NULL, 'overdue', 'KRW'),
('d3118e45-7886-4a56-9c75-f1ce20363020', 2, '잔금', 20000000, '2027-05-27', 0, NULL, 'pending', 'KRW');

COMMIT;
