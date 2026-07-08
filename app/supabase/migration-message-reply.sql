-- Reply support for 1:1 messages (quoted snapshot). Safe to re-run.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_id UUID;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_content TEXT;
NOTIFY pgrst, 'reload schema';
