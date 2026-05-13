-- Feature Access table: stores per-user custom module access overrides
-- If a user doesn't have a row here, role-based defaults apply (managed in frontend)

CREATE TABLE IF NOT EXISTS feature_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enabled_modules TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT feature_access_user_unique UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE feature_access ENABLE ROW LEVEL SECURITY;

-- Admin/manager can read all
CREATE POLICY "feature_access_select" ON feature_access
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

-- Admin/manager can insert/update
CREATE POLICY "feature_access_insert" ON feature_access
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "feature_access_update" ON feature_access
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

-- Only admin can delete
CREATE POLICY "feature_access_delete" ON feature_access
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- Also need: allow admin/manager to update OTHER profiles (for role/department changes)
-- Check if this policy already exists before creating
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'profiles_update_admin_manager' AND tablename = 'profiles'
  ) THEN
    CREATE POLICY "profiles_update_admin_manager" ON profiles
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid()
          AND role IN ('admin', 'manager')
        )
      );
  END IF;
END
$$;
