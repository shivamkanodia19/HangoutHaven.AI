-- Fix function search path for security
DROP TRIGGER IF EXISTS check_match_after_swipe ON public.session_swipes;
DROP FUNCTION IF EXISTS public.check_and_create_match();

CREATE OR REPLACE FUNCTION public.check_and_create_match()
RETURNS TRIGGER AS $$
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
    -- Count right swipes for this place in this session
    SELECT COUNT(*) INTO right_swipe_count
    FROM public.session_swipes
    WHERE session_id = NEW.session_id 
    AND place_id = NEW.place_id 
    AND direction = 'right';

    -- If all participants swiped right, create a match
    IF right_swipe_count = participant_count THEN
      INSERT INTO public.session_matches (session_id, place_id, place_data)
      VALUES (NEW.session_id, NEW.place_id, NEW.place_data)
      ON CONFLICT (session_id, place_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate the trigger
CREATE TRIGGER check_match_after_swipe
AFTER INSERT ON public.session_swipes
FOR EACH ROW
EXECUTE FUNCTION public.check_and_create_match();