-- Fix check_and_create_match to only count swipes from the current round
CREATE OR REPLACE FUNCTION public.check_and_create_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  participant_count INTEGER;
  right_swipe_count INTEGER;
BEGIN
  -- Count total participants in the session
  SELECT COUNT(*) INTO participant_count
  FROM public.session_participants
  WHERE session_id = NEW.session_id;

  -- Only proceed if there are at least 2 participants
  IF participant_count >= 2 THEN
    -- Count right swipes for this place in this session IN THE SAME ROUND
    SELECT COUNT(*) INTO right_swipe_count
    FROM public.session_swipes
    WHERE session_id = NEW.session_id 
    AND place_id = NEW.place_id 
    AND round = NEW.round
    AND direction = 'right';

    -- If ALL participants swiped right IN THIS ROUND, create a match
    IF right_swipe_count = participant_count THEN
      INSERT INTO public.session_matches (session_id, place_id, place_data)
      VALUES (NEW.session_id, NEW.place_id, NEW.place_data)
      ON CONFLICT (session_id, place_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;