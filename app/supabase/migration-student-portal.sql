-- Student Portal Tokens
-- Allows generating shareable links for parents to view student records without login

CREATE TABLE IF NOT EXISTS student_portal_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES service_students(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  label text, -- optional label like "홍길동 학부모 링크"
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz -- null = never expires
);

CREATE INDEX idx_portal_tokens_token ON student_portal_tokens(token);
CREATE INDEX idx_portal_tokens_student ON student_portal_tokens(student_id);

-- RLS: authenticated users can manage tokens
ALTER TABLE student_portal_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read tokens"
  ON student_portal_tokens FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert tokens"
  ON student_portal_tokens FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update tokens"
  ON student_portal_tokens FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete tokens"
  ON student_portal_tokens FOR DELETE
  TO authenticated
  USING (true);

-- Anonymous users can read active tokens (for portal page)
CREATE POLICY "Anon can read active tokens"
  ON student_portal_tokens FOR SELECT
  TO anon
  USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- Anonymous read access to student data via portal
-- service_students: allow anon to select if they have a valid token
CREATE POLICY "Anon can read students via portal token"
  ON service_students FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM student_portal_tokens
      WHERE student_portal_tokens.student_id = service_students.id
        AND student_portal_tokens.is_active = true
        AND (student_portal_tokens.expires_at IS NULL OR student_portal_tokens.expires_at > now())
    )
  );

-- service_meetings: allow anon to select if student has valid token
CREATE POLICY "Anon can read meetings via portal token"
  ON service_meetings FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM student_portal_tokens
      WHERE student_portal_tokens.student_id = service_meetings.student_id
        AND student_portal_tokens.is_active = true
        AND (student_portal_tokens.expires_at IS NULL OR student_portal_tokens.expires_at > now())
    )
  );

-- service_diary: allow anon to select if student has valid token
CREATE POLICY "Anon can read diary via portal token"
  ON service_diary FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM student_portal_tokens
      WHERE student_portal_tokens.student_id = service_diary.student_id
        AND student_portal_tokens.is_active = true
        AND (student_portal_tokens.expires_at IS NULL OR student_portal_tokens.expires_at > now())
    )
  );
