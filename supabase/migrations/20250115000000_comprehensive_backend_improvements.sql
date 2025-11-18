-- ============================================================================
-- Comprehensive Backend Improvements for Dateify
-- Addresses all PRD requirements and performance issues
-- ============================================================================

-- ============================================================================
-- 1. ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================================================

-- Add recommendations column to sessions table (stored as JSONB)
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS recommendations JSONB;

-- Add expires_at column for session expiration
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- Set default expiration to 24 hours from creation
UPDATE public.sessions 
SET expires_at = created_at + INTERVAL '24 hours' 
WHERE expires_at IS NULL;

-- Add constraint to ensure expires_at is set on new sessions
ALTER TABLE public.sessions 
ALTER COLUMN expires_at SET DEFAULT (now() + INTERVAL '24 hours');

-- ============================================================================
-- 2. CREATE ROUND RESULTS TABLE (for history tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.round_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  deck_place_ids TEXT[] NOT NULL,
  unanimous_matches TEXT[] DEFAULT '{}',
  advancing_place_ids TEXT[] DEFAULT '{}',
  eliminated_place_ids TEXT[] DEFAULT '{}',
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(session_id, round_number)
);

-- Enable RLS
ALTER TABLE public.round_results ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view round results for their sessions
CREATE POLICY "Users can view round results in their sessions"
ON public.round_results FOR SELECT
USING (public.user_has_session_access(auth.uid(), session_id));

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_round_results_session_round 
ON public.round_results(session_id, round_number);

-- ============================================================================
-- 3. CREATE CACHED RECOMMENDATIONS TABLE (for performance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cached_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE, -- Hash of (start_address, radius, activities, food_preferences)
  start_address TEXT NOT NULL,
  radius INTEGER NOT NULL,
  activities TEXT,
  food_preferences TEXT,
  recommendations JSONB NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

-- Enable RLS (public read, system write)
ALTER TABLE public.cached_recommendations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Everyone can read cached recommendations
CREATE POLICY "Anyone can read cached recommendations"
ON public.cached_recommendations FOR SELECT
USING (true);

-- Index for cache lookups
CREATE INDEX IF NOT EXISTS idx_cached_recommendations_key 
ON public.cached_recommendations(cache_key);

CREATE INDEX IF NOT EXISTS idx_cached_recommendations_expires 
ON public.cached_recommendations(expires_at);

-- Function to generate cache key
CREATE OR REPLACE FUNCTION public.generate_recommendation_cache_key(
  p_start_address TEXT,
  p_radius INTEGER,
  p_activities TEXT,
  p_food_preferences TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(
    digest(
      COALESCE(p_start_address, '') || '|' || 
      COALESCE(p_radius::TEXT, '') || '|' || 
      COALESCE(p_activities, '') || '|' || 
      COALESCE(p_food_preferences, ''),
      'sha256'
    ),
    'hex'
  );
$$;

-- ============================================================================
-- 4. ADD MISSING INDEXES FOR PERFORMANCE
-- ============================================================================

-- Sessions table indexes
CREATE INDEX IF NOT EXISTS idx_sessions_created_by 
ON public.sessions(created_by);

CREATE INDEX IF NOT EXISTS idx_sessions_session_code 
ON public.sessions(session_code);

CREATE INDEX IF NOT EXISTS idx_sessions_status 
ON public.sessions(status);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at 
ON public.sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_sessions_session_type 
ON public.sessions(session_type);

-- Session participants indexes
CREATE INDEX IF NOT EXISTS idx_session_participants_user_id 
ON public.session_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_session_participants_session_id 
ON public.session_participants(session_id);

-- Session swipes indexes (additional to existing)
CREATE INDEX IF NOT EXISTS idx_session_swipes_user_id 
ON public.session_swipes(user_id);

CREATE INDEX IF NOT EXISTS idx_session_swipes_session_round 
ON public.session_swipes(session_id, round, place_id);

CREATE INDEX IF NOT EXISTS idx_session_swipes_direction 
ON public.session_swipes(session_id, place_id, direction);

-- Session matches indexes
CREATE INDEX IF NOT EXISTS idx_session_matches_session_id 
ON public.session_matches(session_id);

CREATE INDEX IF NOT EXISTS idx_session_matches_final_choice 
ON public.session_matches(session_id, is_final_choice);

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_user_id 
ON public.profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_profiles_username 
ON public.profiles(username);

-- Favorites indexes
CREATE INDEX IF NOT EXISTS idx_favorites_user_id 
ON public.favorites(user_id);

-- ============================================================================
-- 5. IMPROVE TRIGGERS
-- ============================================================================

-- Function: Add host as participant when session is created
CREATE OR REPLACE FUNCTION public.add_host_as_participant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert creator as participant if not already present
  INSERT INTO public.session_participants (session_id, user_id)
  VALUES (NEW.id, NEW.created_by)
  ON CONFLICT (session_id, user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS trg_add_host_as_participant ON public.sessions;
CREATE TRIGGER trg_add_host_as_participant
AFTER INSERT ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.add_host_as_participant();

-- ============================================================================
-- 6. IMPROVE DATABASE FUNCTIONS
-- ============================================================================

-- Improved join_session_with_code function with better error handling
CREATE OR REPLACE FUNCTION public.join_session_with_code(code TEXT)
RETURNS TABLE (
  id UUID,
  session_code TEXT,
  session_type TEXT,
  created_by UUID,
  status TEXT,
  start_address TEXT,
  radius INTEGER,
  activities TEXT,
  food_preferences TEXT,
  current_round INTEGER,
  started_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_session_id UUID;
  v_session_type TEXT;
  v_participant_count INTEGER;
  v_max_participants INTEGER;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Find session by code (case-insensitive, uppercase)
  SELECT s.id, s.session_type INTO v_session_id, v_session_type
  FROM public.sessions s
  WHERE UPPER(s.session_code) = UPPER(code)
    AND s.status = 'active'
    AND (s.expires_at IS NULL OR s.expires_at > now())
  LIMIT 1;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Session not found or expired';
  END IF;

  -- Check if user is already a participant
  IF EXISTS (
    SELECT 1 FROM public.session_participants
    WHERE session_id = v_session_id AND user_id = v_user_id
  ) THEN
    -- Return session info even if already joined
    RETURN QUERY
    SELECT s.id, s.session_code, s.session_type, s.created_by, s.status,
           s.start_address, s.radius, s.activities, s.food_preferences,
           s.current_round, s.started_at, s.created_at, s.updated_at
    FROM public.sessions s
    WHERE s.id = v_session_id;
    RETURN;
  END IF;

  -- Determine max participants based on session type
  IF v_session_type = 'date' THEN
    v_max_participants := 2;
  ELSE
    v_max_participants := 10;
  END IF;

  -- Check current participant count
  SELECT COUNT(*) INTO v_participant_count
  FROM public.session_participants
  WHERE session_id = v_session_id;

  IF v_participant_count >= v_max_participants THEN
    RAISE EXCEPTION 'Session is full (maximum % participants)', v_max_participants;
  END IF;

  -- Add user as participant
  INSERT INTO public.session_participants (session_id, user_id)
  VALUES (v_session_id, v_user_id)
  ON CONFLICT (session_id, user_id) DO NOTHING;

  -- Return session info
  RETURN QUERY
  SELECT s.id, s.session_code, s.session_type, s.created_by, s.status,
         s.start_address, s.radius, s.activities, s.food_preferences,
         s.current_round, s.started_at, s.created_at, s.updated_at
  FROM public.sessions s
  WHERE s.id = v_session_id;
END;
$$;

-- Improved check_and_complete_round with round_results tracking
CREATE OR REPLACE FUNCTION public.check_and_complete_round(
  p_session_id UUID,
  p_deck_place_ids TEXT[],
  p_round_number INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_count INTEGER;
  v_unanimous_matches TEXT[];
  v_advancing_places JSONB;
  v_eliminated_place_ids TEXT[];
  v_all_completed BOOLEAN;
  v_session_type TEXT;
BEGIN
  -- Lock session row to prevent concurrent completion
  PERFORM 1 FROM sessions WHERE id = p_session_id FOR UPDATE;
  
  -- Get session type and participant count
  SELECT s.session_type, COUNT(DISTINCT sp.user_id) 
  INTO v_session_type, v_participant_count
  FROM public.sessions s
  LEFT JOIN public.session_participants sp ON sp.session_id = s.id
  WHERE s.id = p_session_id
  GROUP BY s.session_type;
  
  -- If no participants, return not completed
  IF v_participant_count = 0 THEN
    RETURN jsonb_build_object(
      'completed', false,
      'participant_count', 0
    );
  END IF;
  
  -- Check if all participants have swiped on all places in THIS ROUND's deck
  SELECT COUNT(DISTINCT user_id) >= v_participant_count INTO v_all_completed
  FROM (
    SELECT DISTINCT user_id
    FROM session_swipes
    WHERE session_id = p_session_id
      AND round = p_round_number
      AND place_id = ANY(p_deck_place_ids)
    GROUP BY user_id
    HAVING COUNT(DISTINCT place_id) = array_length(p_deck_place_ids, 1)
  ) AS completed_users;
  
  -- If not all completed, return early
  IF NOT v_all_completed THEN
    RETURN jsonb_build_object(
      'completed', false,
      'participant_count', v_participant_count
    );
  END IF;
  
  -- Find unanimous matches (all participants swiped right in THIS ROUND)
  SELECT array_agg(place_id) INTO v_unanimous_matches
  FROM (
    SELECT place_id
    FROM session_swipes
    WHERE session_id = p_session_id
      AND round = p_round_number
      AND place_id = ANY(p_deck_place_ids)
      AND direction = 'right'
    GROUP BY place_id
    HAVING COUNT(DISTINCT user_id) = v_participant_count
  ) AS unanimous;
  
  -- Find advancing places with like counts (from THIS ROUND only, excluding unanimous)
  SELECT jsonb_agg(
    jsonb_build_object(
      'place_id', place_id,
      'like_count', like_count,
      'place_data', place_data
    ) ORDER BY like_count DESC
  ) INTO v_advancing_places
  FROM (
    SELECT 
      ss.place_id,
      COUNT(DISTINCT ss.user_id) as like_count,
      MAX(ss.place_data) as place_data
    FROM session_swipes ss
    WHERE ss.session_id = p_session_id
      AND ss.round = p_round_number
      AND ss.place_id = ANY(p_deck_place_ids)
      AND ss.direction = 'right'
      AND NOT (ss.place_id = ANY(COALESCE(v_unanimous_matches, ARRAY[]::TEXT[])))
    GROUP BY ss.place_id
    HAVING COUNT(DISTINCT ss.user_id) > 0 
      AND COUNT(DISTINCT ss.user_id) < v_participant_count
  ) AS advancing;
  
  -- Find eliminated places (no likes or all left swipes)
  SELECT array_agg(place_id) INTO v_eliminated_place_ids
  FROM unnest(p_deck_place_ids) AS place_id
  WHERE place_id NOT IN (
    SELECT unnest(COALESCE(v_unanimous_matches, ARRAY[]::TEXT[]))
    UNION
    SELECT jsonb_array_elements_text(jsonb_path_query_array(v_advancing_places, '$[*].place_id'))
  );
  
  -- Store round results
  INSERT INTO public.round_results (
    session_id, 
    round_number, 
    deck_place_ids, 
    unanimous_matches, 
    advancing_place_ids,
    eliminated_place_ids
  )
  VALUES (
    p_session_id,
    p_round_number,
    p_deck_place_ids,
    COALESCE(v_unanimous_matches, ARRAY[]::TEXT[]),
    COALESCE(
      ARRAY(
        SELECT jsonb_array_elements_text(jsonb_path_query_array(v_advancing_places, '$[*].place_id'))
      ),
      ARRAY[]::TEXT[]
    ),
    COALESCE(v_eliminated_place_ids, ARRAY[]::TEXT[])
  )
  ON CONFLICT (session_id, round_number) 
  DO UPDATE SET
    deck_place_ids = EXCLUDED.deck_place_ids,
    unanimous_matches = EXCLUDED.unanimous_matches,
    advancing_place_ids = EXCLUDED.advancing_place_ids,
    eliminated_place_ids = EXCLUDED.eliminated_place_ids,
    completed_at = now();
  
  RETURN jsonb_build_object(
    'completed', true,
    'participant_count', v_participant_count,
    'unanimous_matches', COALESCE(v_unanimous_matches, ARRAY[]::TEXT[]),
    'advancing_places', COALESCE(v_advancing_places, '[]'::jsonb),
    'eliminated_place_ids', COALESCE(v_eliminated_place_ids, ARRAY[]::TEXT[])
  );
END;
$$;

-- ============================================================================
-- 7. SESSION EXPIRATION AND CLEANUP FUNCTIONS
-- ============================================================================

-- Function to expire old sessions
CREATE OR REPLACE FUNCTION public.expire_old_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  -- Mark sessions as completed if expired
  UPDATE public.sessions
  SET status = 'completed', updated_at = now()
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < now();
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  
  -- Clean up expired cached recommendations
  DELETE FROM public.cached_recommendations
  WHERE expires_at < now();
  
  RETURN expired_count;
END;
$$;

-- Function to get cached recommendations (returns array of places)
CREATE OR REPLACE FUNCTION public.get_cached_recommendations(
  p_start_address TEXT,
  p_radius INTEGER,
  p_activities TEXT,
  p_food_preferences TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cache_key TEXT;
  v_cached JSONB;
BEGIN
  -- Generate cache key
  v_cache_key := public.generate_recommendation_cache_key(
    p_start_address,
    p_radius,
    p_activities,
    p_food_preferences
  );
  
  -- Try to get from cache
  SELECT recommendations INTO v_cached
  FROM public.cached_recommendations
  WHERE cache_key = v_cache_key
    AND expires_at > now();
  
  -- If found, increment hit count and return
  IF v_cached IS NOT NULL THEN
    UPDATE public.cached_recommendations
    SET hit_count = hit_count + 1,
        updated_at = now()
    WHERE cache_key = v_cache_key;
    
    RETURN v_cached;
  END IF;
  
  -- Not found in cache, return NULL (caller should generate)
  RETURN NULL;
END;
$$;

-- ============================================================================
-- 8. IMPROVE UNIQUE CONSTRAINT ON SESSION_SWIPES
-- ============================================================================

-- Update unique constraint to include round (if not already exists)
DO $$
BEGIN
  -- Drop old constraint if exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'session_swipes_session_id_user_id_place_id_key'
  ) THEN
    ALTER TABLE public.session_swipes 
    DROP CONSTRAINT session_swipes_session_id_user_id_place_id_key;
  END IF;

  -- Add new constraint with round if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'session_swipes_session_user_place_round_unique'
  ) THEN
    ALTER TABLE public.session_swipes 
    ADD CONSTRAINT session_swipes_session_user_place_round_unique 
    UNIQUE (session_id, user_id, place_id, round);
  END IF;
END $$;

-- ============================================================================
-- 9. ADD CASCADE DELETE RULES (if missing)
-- ============================================================================

-- Ensure all foreign keys have CASCADE delete
-- (Most should already be set, but verify)

-- ============================================================================
-- 10. CREATE HELPER FUNCTION FOR SESSION STATISTICS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_session_stats(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats JSONB;
  v_participant_count INTEGER;
  v_total_swipes INTEGER;
  v_matches_count INTEGER;
  v_current_round INTEGER;
BEGIN
  -- Get participant count
  SELECT COUNT(*) INTO v_participant_count
  FROM public.session_participants
  WHERE session_id = p_session_id;
  
  -- Get total swipes
  SELECT COUNT(*) INTO v_total_swipes
  FROM public.session_swipes
  WHERE session_id = p_session_id;
  
  -- Get matches count
  SELECT COUNT(*) INTO v_matches_count
  FROM public.session_matches
  WHERE session_id = p_session_id;
  
  -- Get current round
  SELECT current_round INTO v_current_round
  FROM public.sessions
  WHERE id = p_session_id;
  
  RETURN jsonb_build_object(
    'participant_count', v_participant_count,
    'total_swipes', v_total_swipes,
    'matches_count', v_matches_count,
    'current_round', v_current_round
  );
END;
$$;

-- ============================================================================
-- 11. GRANT PERMISSIONS
-- ============================================================================

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION public.join_session_with_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_complete_round(UUID, TEXT[], INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_recommendation_cache_key(TEXT, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cached_recommendations(TEXT, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_old_sessions() TO authenticated;

-- ============================================================================
-- 12. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.round_results IS 'Stores history of each round completion for analytics and debugging';
COMMENT ON TABLE public.cached_recommendations IS 'Caches AI-generated recommendations to reduce API costs and improve performance';
COMMENT ON COLUMN public.sessions.recommendations IS 'Stores the initial recommendations as JSONB for the session';
COMMENT ON COLUMN public.sessions.expires_at IS 'Session expiration timestamp (default 24 hours from creation)';
COMMENT ON FUNCTION public.check_and_complete_round IS 'Atomically checks if all participants completed a round and identifies matches';
COMMENT ON FUNCTION public.join_session_with_code IS 'Safely joins a user to a session by code with participant limit enforcement';

