-- 1) Ensure unique participants per session
CREATE UNIQUE INDEX IF NOT EXISTS uq_session_participants_session_user
ON public.session_participants(session_id, user_id);

-- 2) Automatically add host as participant when a session is created
CREATE OR REPLACE FUNCTION public.add_host_as_participant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.session_participants(session_id, user_id)
  VALUES (NEW.id, NEW.created_by)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_host_as_participant ON public.sessions;
CREATE TRIGGER trg_add_host_as_participant
AFTER INSERT ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.add_host_as_participant();

-- 3) Enforce max participants and auto-start when full
DROP TRIGGER IF EXISTS trg_prevent_exceed_max_participants ON public.session_participants;
CREATE TRIGGER trg_prevent_exceed_max_participants
BEFORE INSERT ON public.session_participants
FOR EACH ROW
EXECUTE FUNCTION public.prevent_exceed_max_participants();

DROP TRIGGER IF EXISTS trg_autostart_session_on_max_participants ON public.session_participants;
CREATE TRIGGER trg_autostart_session_on_max_participants
AFTER INSERT ON public.session_participants
FOR EACH ROW
EXECUTE FUNCTION public.autostart_session_on_max_participants();

-- 4) Create matches when all participants swipe right on a place
DROP TRIGGER IF EXISTS trg_check_and_create_match ON public.session_swipes;
CREATE TRIGGER trg_check_and_create_match
AFTER INSERT ON public.session_swipes
FOR EACH ROW
EXECUTE FUNCTION public.check_and_create_match();

-- 5) Ensure only one match per place per session at DB level
CREATE UNIQUE INDEX IF NOT EXISTS uq_session_matches_session_place
ON public.session_matches(session_id, place_id);

-- 6) Maintain updated_at on sessions
DROP TRIGGER IF EXISTS trg_update_sessions_updated_at ON public.sessions;
CREATE TRIGGER trg_update_sessions_updated_at
BEFORE UPDATE ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 7) Ensure full row data for realtime updates (esp. UPDATE events)
ALTER TABLE public.sessions REPLICA IDENTITY FULL;
ALTER TABLE public.session_participants REPLICA IDENTITY FULL;
ALTER TABLE public.session_swipes REPLICA IDENTITY FULL;
ALTER TABLE public.session_matches REPLICA IDENTITY FULL;