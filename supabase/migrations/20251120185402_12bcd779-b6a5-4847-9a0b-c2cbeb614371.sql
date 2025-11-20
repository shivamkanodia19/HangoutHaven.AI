-- 1. Create round_results table
CREATE TABLE IF NOT EXISTS public.round_results (
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  deck_place_ids TEXT[] NOT NULL,
  unanimous_matches TEXT[] DEFAULT ARRAY[]::TEXT[],
  advancing_place_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  eliminated_place_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (session_id, round_number)
);

-- 2. Add version column to sessions table
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;

-- 3. Create index on version
CREATE INDEX IF NOT EXISTS idx_sessions_version ON public.sessions(id, version);

-- 4. Create trigger to auto-increment version
CREATE OR REPLACE FUNCTION public.increment_session_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_session_version ON public.sessions;

CREATE TRIGGER trg_increment_session_version
BEFORE UPDATE ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.increment_session_version();

-- 5. Fix check_and_complete_round function
CREATE OR REPLACE FUNCTION public.check_and_complete_round(
  p_session_id UUID,
  p_deck_place_ids TEXT[],
  p_round_number INTEGER,
  p_expected_version INTEGER DEFAULT NULL
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
  v_current_version INTEGER;
  v_next_action TEXT;
BEGIN
  -- Lock session row with optimistic locking check
  SELECT version INTO v_current_version
  FROM sessions 
  WHERE id = p_session_id 
  FOR UPDATE NOWAIT;
  
  -- Optimistic locking: reject if version mismatch (prevents concurrent updates)
  IF p_expected_version IS NOT NULL AND v_current_version != p_expected_version THEN
    RETURN jsonb_build_object(
      'completed', false,
      'version_mismatch', true,
      'current_version', v_current_version,
      'expected_version', p_expected_version,
      'error', 'Session was modified by another participant. Please refresh.'
    );
  END IF;
  
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
      'participant_count', 0,
      'version', v_current_version
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
      'participant_count', v_participant_count,
      'version', v_current_version
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
      MAX(ss.place_data::text)::jsonb as place_data
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
  
  -- Determine next action based on results
  IF COALESCE(array_length(v_advancing_places, 1), 0) = 0 AND COALESCE(array_length(v_unanimous_matches, 1), 0) = 0 THEN
    v_next_action := 'end';
  ELSIF COALESCE(array_length(v_advancing_places, 1), 0) <= 2 AND COALESCE(array_length(v_advancing_places, 1), 0) > 0 THEN
    v_next_action := 'vote';
  ELSIF COALESCE(array_length(v_advancing_places, 1), 0) > 2 THEN
    v_next_action := 'nextRound';
  ELSE
    v_next_action := 'end';
  END IF;
  
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
  
  -- Return consistent structure
  RETURN jsonb_build_object(
    'completed', true,
    'participant_count', v_participant_count,
    'version', v_current_version,
    'unanimous_matches', COALESCE(v_unanimous_matches, ARRAY[]::TEXT[]),
    'advancing_places', COALESCE(v_advancing_places, '[]'::jsonb),
    'eliminated_place_ids', COALESCE(v_eliminated_place_ids, ARRAY[]::TEXT[]),
    'next_action', v_next_action
  );
EXCEPTION
  WHEN lock_not_available THEN
    -- Another transaction is updating the session
    RETURN jsonb_build_object(
      'completed', false,
      'locked', true,
      'error', 'Session is being updated by another participant. Please try again.'
    );
END;
$$;