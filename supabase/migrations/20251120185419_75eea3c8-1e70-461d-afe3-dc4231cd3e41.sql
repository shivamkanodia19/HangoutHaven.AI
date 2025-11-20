-- Enable RLS on round_results table
ALTER TABLE public.round_results ENABLE ROW LEVEL SECURITY;

-- Allow session participants to view round results for their sessions
CREATE POLICY "Users can view round results in their sessions"
ON public.round_results
FOR SELECT
USING (user_has_session_access(auth.uid(), session_id));

-- Allow system to create/update round results (via RPC functions)
CREATE POLICY "System can manage round results"
ON public.round_results
FOR ALL
USING (true)
WITH CHECK (true);