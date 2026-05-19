-- Add attachment columns to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type text;  -- e.g. image/png, application/pdf
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_size bigint; -- bytes
