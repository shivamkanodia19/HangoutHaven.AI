import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Place } from "@/types/place";
import SwipeCard from "./SwipeCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, ArrowLeft, Sparkles, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useSwipeGameState, Match } from "@/hooks/useSwipeGameState";
import { RoundSummary } from "./swipe/RoundSummary";
import { VotingInterface } from "./swipe/VotingInterface";
import { MatchResults } from "./swipe/MatchResults";
import { WaitingForPlayers } from "./swipe/WaitingForPlayers";
import { Confetti } from "./Confetti";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useRoundCompletion } from "@/hooks/useRoundCompletion";
import { useProgressPersistence } from "@/hooks/useProgressPersistence";
import { RoundCompletionResult } from "@/types/game";

interface SwipeViewProps {
  sessionId: string;
  sessionCode: string;
  recommendations: Place[];
  onBack: () => void;
}

const SwipeView = ({ sessionId, sessionCode, recommendations, onBack }: SwipeViewProps) => {
  const { state, actions } = useSwipeGameState(recommendations);
  const { saveProgress, loadProgress, clearProgress } = useProgressPersistence(sessionId);
  const hasVotedRef = useRef(false);

  // Initialize deck when recommendations change
  useEffect(() => {
    if (recommendations.length > 0 && state.deck.length === 0) {
      // Try to load saved progress
      const savedProgress = loadProgress();
      if (savedProgress && savedProgress.deck.length > 0) {
        // Restore saved progress if available
        actions.setDeck(recommendations.filter(p => savedProgress.deck.includes(p.id)));
        actions.setRound(savedProgress.round);
        actions.setIndex(savedProgress.currentIndex);
        toast.info(`Restored progress from round ${savedProgress.round}`);
      } else {
        actions.setDeck(recommendations);
      }
    }
  }, [recommendations, state.deck.length, actions, loadProgress]);
  
  // Save progress whenever it changes
  useEffect(() => {
    if (state.deck.length > 0 && !state.gameEnded && !state.showRoundSummary) {
      saveProgress(state.round, state.currentIndex, state.deck.map(p => p.id));
    }
  }, [state.round, state.currentIndex, state.deck, state.gameEnded, state.showRoundSummary, saveProgress]);
  
  // Clear progress on game end
  useEffect(() => {
    if (state.gameEnded) {
      clearProgress();
    }
  }, [state.gameEnded, clearProgress]);

  // Load participants and check if user is host
  useEffect(() => {
    const loadInitialData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Check if host
      const { data: session } = await supabase
        .from("sessions")
        .select("created_by")
        .eq("id", sessionId)
        .single();

      const isHost = session?.created_by === user.id;

      // Load participants
      const { data: sessionData } = await supabase
        .from("sessions")
        .select("created_by")
        .eq("id", sessionId)
        .single();

      const { data: participants } = await supabase
        .from("session_participants")
        .select("user_id")
        .eq("session_id", sessionId);

      const userIds = new Set<string>();
      if (sessionData?.created_by) userIds.add(sessionData.created_by);
      participants?.forEach((p) => userIds.add(p.user_id));

      const userIdsArray = Array.from(userIds);
      actions.setParticipants(userIdsArray.length, userIdsArray, user.id, isHost);
    };

    loadInitialData();
  }, [sessionId, actions]);

  // Load swipe counts for current round
  const loadSwipeCounts = useCallback(async () => {
    if (state.deck.length === 0) return;

    const placeIds = state.deck.map((p) => p.id);
    const { data: swipes } = await supabase
      .from("session_swipes")
      .select("place_id, user_id")
      .eq("session_id", sessionId)
      .eq("round", state.round)
      .eq("direction", "right")
      .in("place_id", placeIds);

    if (swipes) {
      const counts: Record<string, Set<string>> = {};
      swipes.forEach((swipe) => {
        if (!counts[swipe.place_id]) {
          counts[swipe.place_id] = new Set();
        }
        counts[swipe.place_id].add(swipe.user_id);
      });

      const swipeCountsMap: Record<string, number> = {};
      Object.keys(counts).forEach((placeId) => {
        swipeCountsMap[placeId] = counts[placeId].size;
      });

      actions.setSwipeCounts(swipeCountsMap);
    }
  }, [sessionId, state.deck, state.round, actions]);

  // Handle round completion result
  const handleRoundComplete = useCallback((result: RoundCompletionResult) => {
    // Update participant count from server response
    if (result.participant_count !== state.participantCount) {
      actions.setParticipants(
        result.participant_count,
        state.participantUserIds,
        state.currentUserId,
        state.isHost
      );
    }

    // Build round matches from unanimous IDs
    const roundMatches: Match[] = result.unanimous_matches
      .map((placeId) => {
        const place = state.deck.find((p) => p.id === placeId);
        if (!place) return null;
        return {
          id: `match-${placeId}`,
          place_id: placeId,
          place_data: place,
          is_final_choice: false,
          like_count: result.participant_count,
        };
      })
      .filter((m): m is Match => m !== null);

    // Build advancing candidates
    const advancingCandidates = result.advancing_places
      .map((item) => {
        const place = state.deck.find((p) => p.id === item.place_id);
        if (!place) return null;
        return place;
      })
      .filter((p): p is Place => p !== null)
      .sort((a, b) => {
        const aCount = result.advancing_places.find((ap) => ap.place_id === a.id)?.like_count || 0;
        const bCount = result.advancing_places.find((ap) => ap.place_id === b.id)?.like_count || 0;
        return bCount - aCount;
      });

    // Update swipe counts for display
    const newSwipeCounts: Record<string, number> = {};
    result.advancing_places.forEach((item) => {
      newSwipeCounts[item.place_id] = item.like_count;
    });
    result.unanimous_matches.forEach((placeId) => {
      newSwipeCounts[placeId] = result.participant_count;
    });
    actions.setSwipeCounts(newSwipeCounts);

    // Store round matches and advancing candidates
    actions.setRoundMatches(roundMatches);
    actions.setAdvancingCandidates(advancingCandidates);
    actions.setShowRoundSummary(true);
    actions.setNextAction(result.next_action);

    if (roundMatches.length > 0) {
      toast.success(
        `🎉 ${roundMatches.length} unanimous match${roundMatches.length > 1 ? "es" : ""} this round!`
      );
    }

    // Handle next action
    if (result.next_action === "end") {
      actions.endGame(null);
      toast.error("No agreement reached. Game ended.");
    }
  }, [state, actions]);

  // Use round completion hook with optimistic locking
  const { checkRoundCompletion } = useRoundCompletion({
    sessionId,
    onComplete: handleRoundComplete,
  });

  // Wrapper for checkRoundCompletion that respects game state
  const triggerRoundCheck = useCallback(() => {
    if (state.showRoundSummary || state.isVoteMode || state.gameEnded) return;
    if (state.deck.length === 0) return;
    
    const deckPlaceIds = state.deck.map((p) => p.id);
    checkRoundCompletion(deckPlaceIds, state.round);
  }, [state, checkRoundCompletion]);

  // Unified real-time sync using hook
  const { isConnected } = useRealtimeSync({
    sessionId,
    onSessionUpdate: async (payload) => {
      const newSession = payload.new as any;
      
      // Handle round advancement from host
      if (newSession.current_round && newSession.current_round > state.round) {
        actions.setRound(newSession.current_round);
        // Trigger round check after round update
        triggerRoundCheck();
      }
    },
    onMatchUpdate: async (payload) => {
      // Reload matches when they change
      await loadMatches();
      
      // If final choice was set and game hasn't ended, end the game
      const match = payload.new as any;
      if (match.is_final_choice && !state.gameEnded) {
        const winnerPlace = match.place_data as unknown as Place;
        if (winnerPlace) {
          actions.endGame(winnerPlace);
          toast.success(`🎉 Winner selected: ${winnerPlace.name}!`);
        }
      }
    },
    onParticipantUpdate: async () => {
      // Reload participants
      const { data: sessionData } = await supabase
        .from("sessions")
        .select("created_by")
        .eq("id", sessionId)
        .single();

      const { data: participants } = await supabase
        .from("session_participants")
        .select("user_id")
        .eq("session_id", sessionId);

      const userIds = new Set<string>();
      if (sessionData?.created_by) userIds.add(sessionData.created_by);
      participants?.forEach((p) => userIds.add(p.user_id));

      actions.setParticipants(
        userIds.size,
        Array.from(userIds),
        state.currentUserId,
        state.isHost
      );
    },
    onSwipeInsert: async (payload) => {
      await loadSwipeCounts();
      
      // If in vote mode, check if all participants have voted
      if (state.isVoteMode && !state.gameEnded) {
        const swipeData = payload.new as any;
        if (swipeData.direction === 'right' && state.advancingCandidates.some(p => p.id === swipeData.place_id)) {
          const { data: voteSwipes } = await supabase
            .from("session_swipes")
            .select("user_id")
            .eq("session_id", sessionId)
            .eq("round", state.round)
            .in("place_id", state.advancingCandidates.map((p) => p.id));

          const uniqueVoters = new Set(voteSwipes?.map((s: any) => s.user_id));
          if (uniqueVoters.size >= state.participantCount && state.isHost) {
            // All voted - tally results using database function
            tallyFinalVotes();
          }
        }
      } else {
        // Trigger round check after swipe (debounced)
        setTimeout(() => {
          triggerRoundCheck();
        }, 500);
      }
    },
    onReconnect: () => {
      toast.success("Reconnected to session!");
    },
    onDisconnect: () => {
      toast.warning("Connection lost. Reconnecting...");
    },
  });

  // Load matches
  const loadMatches = useCallback(async () => {
    const { data, error } = await supabase
      .from("session_matches")
      .select("*")
      .eq("session_id", sessionId);

    if (!error && data) {
      const matchesWithCounts: Match[] = await Promise.all(
        data.map(async (match) => {
          const { count } = await supabase
            .from("session_swipes")
            .select("*", { count: "exact", head: true })
            .eq("session_id", sessionId)
            .eq("place_id", match.place_id)
            .eq("direction", "right");

          return {
          id: match.id,
          place_id: match.place_id,
          place_data: match.place_data as unknown as Place,
          is_final_choice: match.is_final_choice,
            like_count: count || 0,
          };
        })
      );

      // Update all matches
      actions.addToAllMatches(matchesWithCounts);
    }
  }, [sessionId, actions]);

  // Initial load
  useEffect(() => {
    loadMatches();
    loadSwipeCounts();
  }, [sessionId, state.round, loadMatches, loadSwipeCounts]);

  // Periodic check for round completion (when user finishes early)
  useEffect(() => {
    if (state.currentIndex >= state.deck.length && !state.showRoundSummary && !state.isVoteMode && !state.gameEnded) {
      const interval = setInterval(() => {
        triggerRoundCheck();
      }, 2000); // Check every 2 seconds

      return () => clearInterval(interval);
    }
  }, [state.currentIndex, state.deck.length, state.showRoundSummary, state.isVoteMode, state.gameEnded, triggerRoundCheck]);

  // Handle swipe
  const handleSwipe = useCallback(async (direction: "left" | "right") => {
    if (state.currentIndex >= state.deck.length) return;

    const place = state.deck[state.currentIndex];
    actions.setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if swipe already exists
      const { data: existingSwipe } = await supabase
        .from("session_swipes")
        .select("id")
        .eq("session_id", sessionId)
        .eq("user_id", user.id)
        .eq("place_id", place.id)
        .eq("round", state.round)
        .single();

      if (existingSwipe) {
        // Already swiped, just move to next
        actions.incrementIndex();
        return;
      }

      // Record swipe
      await supabase.from("session_swipes").insert({
        session_id: sessionId,
        user_id: user.id,
        place_id: place.id,
        place_data: place as unknown as any,
        direction,
        round: state.round,
      });

      actions.incrementIndex();
    } catch (error) {
      console.error("Error recording swipe:", error);
      toast.error("Failed to record swipe");
    } finally {
      actions.setLoading(false);
    }
  }, [sessionId, state, actions]);

  // Tally final votes using database function (atomic and deterministic)
  // Defined before handleVote to avoid forward reference
  const tallyFinalVotes = useCallback(async () => {
    if (!state.isHost) return; // Only host should tally to avoid duplicates
    
    const placeIds = state.advancingCandidates.map((p) => p.id);

    // TODO: Implement tally_final_votes RPC function
    // For now, just log that voting is complete
    console.log('All participants have voted - tally_final_votes RPC not yet implemented');
  }, [sessionId, state, actions]);

  // Handle vote in final voting
  const handleVote = useCallback(async (place: Place) => {
    if (hasVotedRef.current) {
      toast.info("You already voted!");
      return;
    }

    actions.setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if already voted
      const { data: existingVote } = await supabase
        .from("session_swipes")
        .select("id")
        .eq("session_id", sessionId)
        .eq("user_id", user.id)
        .eq("round", state.round)
        .in("place_id", state.advancingCandidates.map((p) => p.id))
        .single();

      if (existingVote) {
        toast.info("You already voted!");
        hasVotedRef.current = true;
        return;
      }

      // Record vote
      await supabase.from("session_swipes").insert({
        session_id: sessionId,
        user_id: user.id,
        place_id: place.id,
        place_data: place as unknown as any,
        direction: "right",
        round: state.round,
      });

      hasVotedRef.current = true;
      toast.success(`Voted for ${place.name}!`);

      // Check if all participants voted
      const { data: voteSwipes } = await supabase
        .from("session_swipes")
        .select("user_id")
        .eq("session_id", sessionId)
        .eq("round", state.round)
        .in("place_id", state.advancingCandidates.map((p) => p.id));

      const uniqueVoters = new Set(voteSwipes?.map((s) => s.user_id));
      if (uniqueVoters.size >= state.participantCount) {
        // All voted - tally results (only host should do this to avoid duplicates)
        if (state.isHost) {
          tallyFinalVotes();
        }
      }
    } catch (error) {
      console.error("Error recording vote:", error);
      toast.error("Failed to record vote");
    } finally {
      actions.setLoading(false);
    }
  }, [sessionId, state, actions, tallyFinalVotes]);

  // Advance to next round
  const advanceToNextRound = useCallback(async () => {
    // Merge current round matches into all matches
    if (state.roundMatches.length > 0) {
      actions.addToAllMatches(state.roundMatches);
    }

    if (state.nextAction === "nextRound" && state.advancingCandidates.length > 0) {
      // Host updates database to sync all participants
      if (state.isHost) {
        await supabase
          .from("sessions")
          .update({
            current_round: state.round + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sessionId);
      }

      actions.advanceToNextRound(state.advancingCandidates, state.round + 1);
      toast.success(`Round ${state.round + 1}: ${state.advancingCandidates.length} places to swipe!`);
    } else if (state.nextAction === "vote") {
      // Host starts vote
      if (state.isHost) {
        await supabase
          .from("sessions")
          .update({
            current_round: state.round + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sessionId);
      }

      actions.startVoteMode();
      actions.setRound(state.round + 1);
      hasVotedRef.current = false; // Reset vote flag
      toast.success(
        `Final vote! Choose between ${state.advancingCandidates.length} option${state.advancingCandidates.length > 1 ? "s" : ""}.`
      );
    } else if (state.nextAction === "end") {
      actions.endGame(null);
      toast.success("All decisions made!");
    }
  }, [sessionId, state, actions]);

  // Force advance round (host only)
  const forceAdvanceRound = useCallback(async () => {
    if (!state.isHost) return;

    actions.setLoading(true);
    try {
      // Use round completion hook to check completion
      const deckPlaceIds = state.deck.map((p) => p.id);
      checkRoundCompletion(deckPlaceIds, state.round);
    } catch (error) {
      console.error("Error forcing round advance:", error);
      toast.error("Failed to advance round");
    } finally {
      actions.setLoading(false);
    }
  }, [sessionId, state, checkRoundCompletion, actions]);

  const currentPlace = state.deck[state.currentIndex];
  const progressPercent = state.deck.length > 0 ? (state.currentIndex / state.deck.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(200,90%,95%)] via-[hsl(320,80%,95%)] to-[hsl(340,80%,95%)] p-4 space-y-6">
      {/* Confetti for winner */}
      <Confetti trigger={state.gameEnded && state.finalWinner !== null} />

      {/* Header */}
      <div className="flex items-center justify-between max-w-md mx-auto gap-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="text-center flex-1">
          <p className="text-sm font-medium">Session Code</p>
          <Badge variant="secondary" className="text-lg">
            {sessionCode}
          </Badge>
        </div>
        {/* Connection Status */}
        <div className="flex items-center gap-1">
          {isConnected ? (
            <Badge variant="outline" className="text-xs border-green-500 text-green-700 bg-green-50 flex items-center">
              <Wifi className="w-3 h-3 mr-1" />
              Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs border-red-500 text-red-700 bg-red-50 flex items-center">
              <WifiOff className="w-3 h-3 mr-1" />
              Disconnected
            </Badge>
          )}
        </div>
      </div>

      {/* Round Banner */}
      {!state.gameEnded && !state.isVoteMode && !state.showRoundSummary && (
        <Card className={`max-w-md mx-auto ${state.round > 1 ? "border-primary bg-primary/5" : ""}`}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              {state.round === 1 ? (
                <>
                  <Sparkles className="w-5 h-5" />
                  Round 1: Initial Swipes
                </>
              ) : (
                <>
                  <Heart className="w-5 h-5 text-primary" />
                  Round {state.round}: Narrowing Down
                </>
              )}
            </CardTitle>
            <CardDescription>
              {state.round === 1
                ? "Swipe through all places. Unanimous matches will be revealed at the end!"
                : `Keep swiping to narrow down. Matches shown at end of round!`}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Progress</span>
                <span>
                  {state.currentIndex} of {state.deck.length}
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {state.participantCount} participant{state.participantCount !== 1 ? "s" : ""} in session
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Waiting for players */}
      {state.currentIndex >= state.deck.length &&
        !state.showRoundSummary &&
        !state.isVoteMode &&
        !state.gameEnded && (
          <WaitingForPlayers
            round={state.round}
            participantCount={state.participantCount}
            isHost={state.isHost}
            isLoading={state.isLoading}
            onForceAdvance={forceAdvanceRound}
          />
        )}

      {/* Round Summary */}
      {state.showRoundSummary && !state.isVoteMode && !state.gameEnded && (
        <RoundSummary
          round={state.round}
          roundMatches={state.roundMatches}
          advancingCandidates={state.advancingCandidates}
          swipeCounts={state.swipeCounts}
          participantCount={state.participantCount}
          nextAction={state.nextAction}
          isHost={state.isHost}
          onAdvance={advanceToNextRound}
        />
      )}

      {/* Voting Interface */}
      {state.isVoteMode && !state.gameEnded && (
        <VotingInterface
          candidates={state.advancingCandidates}
          isLoading={state.isLoading}
          onVote={handleVote}
        />
      )}

      {/* Match Results / Game End */}
      {state.gameEnded && (
        <MatchResults
          allMatches={state.allMatches}
          finalWinner={state.finalWinner}
          participantCount={state.participantCount}
        />
      )}

      {/* Swipe Card */}
      {currentPlace && !state.showRoundSummary && !state.isVoteMode && !state.gameEnded && (
        <div className="flex justify-center">
          <SwipeCard
            place={currentPlace}
            onSwipeLeft={() => handleSwipe("left")}
            onSwipeRight={() => handleSwipe("right")}
          />
        </div>
      )}
    </div>
  );
};

export default SwipeView;

