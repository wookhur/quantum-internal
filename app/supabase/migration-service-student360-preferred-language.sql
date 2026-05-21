-- Add preferred_language column to service_students
ALTER TABLE service_students ADD COLUMN IF NOT EXISTS preferred_language text;
