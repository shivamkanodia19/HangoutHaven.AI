-- Add session type to sessions table
ALTER TABLE public.sessions
ADD COLUMN session_type text NOT NULL DEFAULT 'group' CHECK (session_type IN ('date', 'group'));