-- Drop all existing problematic policies
DROP POLICY IF EXISTS "Users can view participants in their sessions" ON public.session_participants;
DROP POLICY IF EXISTS "Users can view swipes in their sessions" ON public.session_swipes;
DROP POLICY IF EXISTS "Users can view matches in their sessions" ON public.session_matches;
DROP POLICY IF EXISTS "Session participants can update match final choice" ON public.session_matches;

-- Create security definer function to check session access
CREATE OR REPLACE FUNCTION public.user_has_session_access(_user_id uuid, _session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sessions 
    WHERE id = _session_id 
    AND created_by = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.session_participants
    WHERE session_id = _session_id 
    AND user_id = _user_id
  );
$$;

-- Update session_participants policies with security definer function
CREATE POLICY "Users can view participants in their sessions"
ON public.session_participants FOR SELECT
USING (public.user_has_session_access(auth.uid(), session_id));

-- Update session_swipes policies with security definer function  
CREATE POLICY "Users can view swipes in their sessions"
ON public.session_swipes FOR SELECT
USING (public.user_has_session_access(auth.uid(), session_id));

-- Update session_matches policies with security definer function
CREATE POLICY "Users can view matches in their sessions"
ON public.session_matches FOR SELECT
USING (public.user_has_session_access(auth.uid(), session_id));

CREATE POLICY "Session participants can update match final choice"
ON public.session_matches FOR UPDATE
USING (public.user_has_session_access(auth.uid(), session_id));