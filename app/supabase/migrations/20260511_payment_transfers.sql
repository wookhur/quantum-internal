-- =============================================
-- Migration: Payment Transfer Tracking
-- 이체 확인 시스템 추가
-- =============================================

-- 1. payments 테이블: 날짜 컬럼을 "예정 납기일"로 재정의
--    (기존 deposit_date 등 → 계약서상 납기 예정일)
--    실제 이체 확인은 payment_transfers 테이블로 관리

-- 2. contracts 테이블: 세일즈/서비스 담당자 컬럼 추가
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS sales_staff_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS service_staff_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- 3. payment_transfers 테이블: 실제 이체 확인 기록
CREATE TABLE IF NOT EXISTS payment_transfers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id   UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  stage        TEXT NOT NULL CHECK (stage IN ('deposit', 'interim1', 'interim2', 'balance', 'other')),
  amount       INT NOT NULL CHECK (amount > 0),
  transferred_at DATE NOT NULL,
  confirmed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sender_name    TEXT,
  transfer_method TEXT NOT NULL DEFAULT 'bank_transfer'
                   CHECK (transfer_method IN ('bank_transfer', 'card', 'other')),
  memo           TEXT,
  confirmed_by   UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_transfers_payment ON payment_transfers(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_transfers_stage   ON payment_transfers(payment_id, stage);

-- 4. 트리거: payment_transfers 변경 시 payments.paid_amount 자동 갱신
CREATE OR REPLACE FUNCTION sync_paid_amount()
RETURNS TRIGGER AS $$
DECLARE
  target_payment_id UUID;
BEGIN
  target_payment_id := COALESCE(NEW.payment_id, OLD.payment_id);

  UPDATE payments
  SET paid_amount = (
    SELECT COALESCE(SUM(amount), 0)
    FROM payment_transfers
    WHERE payment_id = target_payment_id
  )
  WHERE id = target_payment_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_paid_amount ON payment_transfers;
CREATE TRIGGER trg_sync_paid_amount
AFTER INSERT OR UPDATE OR DELETE ON payment_transfers
FOR EACH ROW EXECUTE FUNCTION sync_paid_amount();

-- 5. RLS
ALTER TABLE payment_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_transfers_select" ON payment_transfers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'sales', 'consultant'))
  );

CREATE POLICY "payment_transfers_insert" ON payment_transfers
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'sales', 'consultant'))
  );

CREATE POLICY "payment_transfers_delete" ON payment_transfers
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
