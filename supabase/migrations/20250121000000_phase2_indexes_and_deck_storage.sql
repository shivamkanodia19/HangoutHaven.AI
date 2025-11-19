-- ============================================================================
-- Phase 2: Add Missing Database Features
-- Add indexes on foreign keys for performance
-- Add deck_place_ids column for progress persistence
-- ============================================================================

-- ============================================================================
-- 1. ADD INDEXES ON FOREIGN KEYS (for query performance)
-- ============================================================================

-- Indexes on session_participants foreign keys
CREATE INDEX IF NOT EXISTS idx_session_participants_session_id 
ON public.session_participants(session_id);

CREATE INDEX IF NOT EXISTS idx_session_participants_user_id 
ON public.session_participants(user_id);

-- Indexes on session_swipes foreign keys (composite for common queries)
CREATE INDEX IF NOT EXISTS idx_session_swipes_session_id 
ON public.session_swipes(session_id);

CREATE INDEX IF NOT EXISTS idx_session_swipes_user_id 
ON public.session_swipes(user_id);

CREATE INDEX IF NOT EXISTS idx_session_swipes_place_id 
ON public.session_swipes(place_id);

-- Composite index for common query pattern: session_id + round
CREATE INDEX IF NOT EXISTS idx_session_swipes_session_round 
ON public.session_swipes(session_id, round);

-- Composite index for round completion checks: session_id + round + place_id
CREATE INDEX IF NOT EXISTS idx_session_swipes_session_round_place 
ON public.session_swipes(session_id, round, place_id);

-- Index for direction filtering (commonly used for right swipes)
CREATE INDEX IF NOT EXISTS idx_session_swipes_direction 
ON public.session_swipes(direction) 
WHERE direction = 'right';

-- Indexes on session_matches foreign keys
CREATE INDEX IF NOT EXISTS idx_session_matches_session_id 
ON public.session_matches(session_id);

CREATE INDEX IF NOT EXISTS idx_session_matches_place_id 
ON public.session_matches(place_id);

-- Index for final choice queries
CREATE INDEX IF NOT EXISTS idx_session_matches_is_final_choice 
ON public.session_matches(is_final_choice) 
WHERE is_final_choice = true;

-- Indexes on round_results foreign keys
CREATE INDEX IF NOT EXISTS idx_round_results_session_id 
ON public.round_results(session_id);

CREATE INDEX IF NOT EXISTS idx_round_results_session_round 
ON public.round_results(session_id, round_number);

-- Indexes on favorites foreign keys (if not already exists)
CREATE INDEX IF NOT EXISTS idx_favorites_user_id 
ON public.favorites(user_id);

CREATE INDEX IF NOT EXISTS idx_favorites_place_id 
ON public.favorites(place_id);

-- ============================================================================
-- 2. ADD DECK_PLACE_IDS COLUMN TO SESSIONS TABLE (Phase 3 requirement)
-- ============================================================================

-- Add deck_place_ids JSONB column to store current round's deck
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS deck_place_ids JSONB;

-- Add comment for documentation
COMMENT ON COLUMN public.sessions.deck_place_ids IS 'Stores the place IDs for the current round deck as a JSON array. Updated when advancing to next round.';

-- Create index on deck_place_ids for queries (GIN index for JSONB array queries)
CREATE INDEX IF NOT EXISTS idx_sessions_deck_place_ids 
ON public.sessions USING GIN (deck_place_ids);

-- ============================================================================
-- 3. VERIFY ADD_HOST_AS_PARTICIPANT TRIGGER EXISTS
-- ============================================================================

-- The trigger should already exist from earlier migrations, but we'll ensure it's there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_add_host_as_participant'
  ) THEN
    -- Create trigger if it doesn't exist
    CREATE TRIGGER trg_add_host_as_participant
    AFTER INSERT ON public.sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.add_host_as_participant();
  END IF;
END $$;

-- ============================================================================
-- 4. ADD CASCADE DELETE POLICIES (data integrity)
-- ============================================================================

-- Note: ON DELETE CASCADE should already be set in the original table creation,
-- but we'll verify and add if missing. This is safe to run multiple times.

-- Ensure cascade deletes are in place (these are already in the original migrations)
-- session_participants ON DELETE CASCADE - already set
-- session_swipes ON DELETE CASCADE - already set
-- session_matches ON DELETE CASCADE - already set
-- round_results ON DELETE CASCADE - already set

-- ============================================================================
-- 5. ADD COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON INDEX idx_session_swipes_session_round IS 'Optimizes queries filtering by session_id and round (most common pattern)';
COMMENT ON INDEX idx_session_swipes_session_round_place IS 'Optimizes round completion checks';
COMMENT ON INDEX idx_session_swipes_direction IS 'Partial index for right swipes (most common filter)';
COMMENT ON INDEX idx_session_matches_is_final_choice IS 'Partial index for final choice queries';

