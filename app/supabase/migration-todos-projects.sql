-- Add team, owner_id, and assignees columns to todos table
-- for project management features

ALTER TABLE todos ADD COLUMN IF NOT EXISTS team TEXT;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES profiles(id);
ALTER TABLE todos ADD COLUMN IF NOT EXISTS assignees UUID[] DEFAULT '{}';

-- Make todos visible to all authenticated users (remove any user-specific RLS if present)
-- Drop existing restrictive policies and replace with open read access
DO $$
BEGIN
  -- Drop old select policy if it exists
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'todos_select_own' AND tablename = 'todos') THEN
    DROP POLICY "todos_select_own" ON todos;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'todos_select' AND tablename = 'todos') THEN
    DROP POLICY "todos_select" ON todos;
  END IF;
END
$$;

-- All authenticated users can read all todos/projects
CREATE POLICY "todos_select_all" ON todos
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- All authenticated users can insert
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'todos_insert_all' AND tablename = 'todos') THEN
    CREATE POLICY "todos_insert_all" ON todos
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END
$$;

-- All authenticated users can update (for status toggling etc)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'todos_update_all' AND tablename = 'todos') THEN
    CREATE POLICY "todos_update_all" ON todos
      FOR UPDATE USING (auth.uid() IS NOT NULL);
  END IF;
END
$$;
