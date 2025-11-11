-- Create RPC function for atomic round completion
CREATE OR REPLACE FUNCTION public.check_and_complete_round(
  p_session_id uuid,
  p_deck_place_ids text[],
  p_round_number int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_count int;
  v_unanimous_matches text[];
  v_advancing_places jsonb;
  v_all_completed boolean;
BEGIN
  -- Lock session row to prevent concurrent completion
  PERFORM 1 FROM sessions WHERE id = p_session_id FOR UPDATE;
  
  -- Get participant count
  SELECT COUNT(*) INTO v_participant_count
  FROM session_participants
  WHERE session_id = p_session_id;
  
  -- If no participants, return not completed
  IF v_participant_count = 0 THEN
    RETURN jsonb_build_object(
      'completed', false,
      'participant_count', 0
    );
  END IF;
  
  -- Check if all participants have swiped on all places in the deck
  SELECT COUNT(DISTINCT user_id) = v_participant_count INTO v_all_completed
  FROM (
    SELECT DISTINCT user_id
    FROM session_swipes
    WHERE session_id = p_session_id
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
  
  -- Find unanimous matches (all participants swiped right)
  SELECT array_agg(place_id) INTO v_unanimous_matches
  FROM (
    SELECT place_id
    FROM session_swipes
    WHERE session_id = p_session_id
      AND place_id = ANY(p_deck_place_ids)
      AND direction = 'right'
    GROUP BY place_id
    HAVING COUNT(DISTINCT user_id) = v_participant_count
  ) AS unanimous;
  
  -- Find advancing places with like counts
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
      AND ss.place_id = ANY(p_deck_place_ids)
      AND ss.direction = 'right'
    GROUP BY ss.place_id
    HAVING COUNT(DISTINCT ss.user_id) > 0
  ) AS advancing;
  
  RETURN jsonb_build_object(
    'completed', true,
    'participant_count', v_participant_count,
    'unanimous_matches', COALESCE(v_unanimous_matches, ARRAY[]::text[]),
    'advancing_places', COALESCE(v_advancing_places, '[]'::jsonb)
  );
END;
$$;