-- Add current_round column to sessions table to track which round the session is on
ALTER TABLE public.sessions 
ADD COLUMN current_round integer NOT NULL DEFAULT 1;

-- Add index for better query performance
CREATE INDEX idx_sessions_current_round ON public.sessions(current_round);