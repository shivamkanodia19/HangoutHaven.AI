import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Place } from "@/types/place";
import SwipeCard from "./SwipeCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, ArrowLeft, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useSwipeGameState, Match } from "@/hooks/useSwipeGameState";
import { RoundSummary } from "./swipe/RoundSummary";
import { VotingInterface } from "./swipe/VotingInterface";
import { MatchResults } from "./swipe/MatchResults";
import { WaitingForPlayers } from "./swipe/WaitingForPlayers";
import { Confetti } from "./Confetti";

interface SwipeViewProps {
  sessionId: string;
  sessionCode: string;
  recommendations: Place[];
  onBack: () => void;
}

const SwipeView = ({ sessionId, sessionCode, recommendations, onBack }: SwipeViewProps) => {
  const { state, actions } = useSwipeGameState(recommendations);
  
  // Refs to prevent race conditions
  const isCheckingRound = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasVotedRef = useRef(false);

  // Initialize deck when recommendations change
  useEffect(() => {
    if (recommendations.length > 0 && state.deck.length === 0) {
      actions.setDeck(recommendations);
    }
  }, [recommendations, state.deck.length, actions]);

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

  // Check round completion using RPC function
  const checkRoundCompletion = useCallback(async () => {
    if (isCheckingRound.current) return;
    if (state.showRoundSummary || state.isVoteMode || state.gameEnded) return;
    if (state.deck.length === 0) return;

    isCheckingRound.current = true;

    // Cancel previous check
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const deckPlaceIds = state.deck.map((p) => p.id);

      const { data, error } = await supabase.rpc("check_and_complete_round", {
        p_session_id: sessionId,
        p_deck_place_ids: deckPlaceIds,
        p_round_number: state.round,
      });

      if (signal.aborted) return;

      if (error) {
        console.error("Error checking round completion:", error);
        return;
      }

      if (!data || !data.completed) {
        return;
      }

      const result = data as {
        completed: boolean;
        participant_count: number;
        unanimous_matches: string[];
        advancing_places: Array<{
          place_id: string;
          like_count: number;
          place_data: any;
        }>;
        eliminated_place_ids?: string[];
      };

      // Update participant count
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

      if (roundMatches.length > 0) {
        toast.success(
          `🎉 ${roundMatches.length} unanimous match${roundMatches.length > 1 ? "es" : ""} this round!`
        );
      }

      // Determine next action based on results
      if (advancingCandidates.length === 0 && roundMatches.length === 0) {
        // No matches, no advancing - game ends
        actions.setNextAction("end");
        actions.endGame(null);
        toast.error("No agreement reached. Game ended.");
      } else if (advancingCandidates.length <= 2 && advancingCandidates.length > 0) {
        // 1-2 candidates remaining - go to final vote
        actions.setNextAction("vote");
      } else if (advancingCandidates.length > 2) {
        // More than 2 candidates - continue to next round
        actions.setNextAction("nextRound");
      } else {
        // Edge case - end game
        actions.setNextAction("end");
        actions.endGame(null);
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        console.error("Error in checkRoundCompletion:", error);
      }
    } finally {
      isCheckingRound.current = false;
    }
  }, [sessionId, state, actions]);

  // Real-time subscriptions
  useEffect(() => {
    const channel = supabase
      .channel(`session_updates_${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${sessionId}`,
        },
        async (payload) => {
          const newSession = payload.new as any;
          
          // Handle round advancement from host
          if (newSession.current_round && newSession.current_round > state.round) {
            actions.setRound(newSession.current_round);
            // Round advancement will be handled by checkRoundCompletion
            checkRoundCompletion();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_matches",
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload) => {
          // Reload matches when they change
          await loadMatches();
          
          // If final choice was set and game hasn't ended, end the game
          const match = payload.new as any;
          if (match.is_final_choice && !state.gameEnded) {
            const winnerPlace = match.place_data as Place;
            if (winnerPlace) {
              actions.endGame(winnerPlace);
              toast.success(`🎉 Winner selected: ${winnerPlace.name}!`);
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_participants",
          filter: `session_id=eq.${sessionId}`,
        },
        async () => {
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
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "session_swipes",
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload) => {
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
                // All voted - tally results
                tallyFinalVotes();
              }
            }
          } else {
            await checkRoundCompletion();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, state.round, state.isVoteMode, state.gameEnded, state.advancingCandidates, state.participantCount, state.isHost, checkRoundCompletion, loadSwipeCounts, tallyFinalVotes, actions, state.currentUserId]);

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
            place_data: match.place_data as Place,
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
        checkRoundCompletion();
      }, 2000); // Check every 2 seconds

      return () => clearInterval(interval);
    }
  }, [state.currentIndex, state.deck.length, state.showRoundSummary, state.isVoteMode, state.gameEnded, checkRoundCompletion]);

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
        place_data: place as any,
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
        place_data: place as any,
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

  // Tally final votes and determine winner
  const tallyFinalVotes = useCallback(async () => {
    const placeIds = state.advancingCandidates.map((p) => p.id);

    const { data: votes } = await supabase
      .from("session_swipes")
      .select("place_id")
      .eq("session_id", sessionId)
      .eq("round", state.round)
      .eq("direction", "right")
      .in("place_id", placeIds);

    if (!votes || votes.length === 0) {
      toast.error("No votes recorded!");
      return;
    }

    // Count votes
    const voteCounts: Record<string, number> = {};
    votes.forEach((v) => {
      voteCounts[v.place_id] = (voteCounts[v.place_id] || 0) + 1;
    });

    // Find winner(s) - handle ties
    const maxVotes = Math.max(...Object.values(voteCounts));
    const winners = state.advancingCandidates.filter(
      (p) => voteCounts[p.id] === maxVotes
    );

    // If tie between 2 options, use random tiebreaker
    // For deterministic results across all participants, use a hash of the session ID
    let winner: Place;
    if (winners.length === 2) {
      // Use session ID hash for deterministic random selection across all participants
      // This ensures all participants see the same winner
      const hash = sessionId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const randomValue = (hash % 100) / 100; // Convert to 0-1 range
      winner = randomValue > 0.5 ? winners[0] : winners[1];
      toast.info(`Tie detected! Randomly selected: ${winner.name}`);
    } else if (winners.length > 2) {
      // Multiple ties - still use deterministic selection
      const hash = sessionId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const index = hash % winners.length;
      winner = winners[index];
      toast.info(`Multiple ties detected! Randomly selected: ${winner.name}`);
    } else {
      winner = winners[0];
    }

    // Create or update match as final choice
    const winnerMatch = state.allMatches.find((m) => m.place_id === winner.id);
    
    if (winnerMatch) {
      // Update existing match
      await supabase
        .from("session_matches")
        .update({ is_final_choice: true })
        .eq("id", winnerMatch.id);
    } else {
      // Create new match
      const { data: newMatch } = await supabase
        .from("session_matches")
        .insert({
          session_id: sessionId,
          place_id: winner.id,
          place_data: winner as any,
          is_final_choice: true,
        })
        .select()
        .single();

      if (newMatch) {
        actions.addToAllMatches([{
          id: newMatch.id,
          place_id: winner.id,
          place_data: winner,
          is_final_choice: true,
          like_count: voteCounts[winner.id] || 0,
        }]);
      }
    }

    toast.success(`🎉 Winner: ${winner.name} with ${voteCounts[winner.id]} votes!`);
    actions.endGame(winner);
  }, [sessionId, state, actions]);

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
      // Use RPC to check round completion
      const deckPlaceIds = state.deck.map((p) => p.id);
      const { data } = await supabase.rpc("check_and_complete_round", {
        p_session_id: sessionId,
        p_deck_place_ids: deckPlaceIds,
        p_round_number: state.round,
      });

      if (data && data.completed) {
        // Process same as normal round completion
        const result = data as any;
        const roundMatches: Match[] = result.unanimous_matches
          .map((placeId: string) => {
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
          .filter((m: Match | null): m is Match => m !== null);

        const advancingCandidates = result.advancing_places
          .map((item: any) => state.deck.find((p) => p.id === item.place_id))
          .filter((p: Place | undefined): p is Place => p !== undefined);

        actions.setRoundMatches(roundMatches);
        actions.setAdvancingCandidates(advancingCandidates);
        actions.setShowRoundSummary(true);

        if (advancingCandidates.length <= 2 && advancingCandidates.length > 0) {
          actions.setNextAction("vote");
        } else if (advancingCandidates.length > 2) {
          actions.setNextAction("nextRound");
        } else {
          actions.setNextAction("end");
        }

        // Update session round
        await supabase
          .from("sessions")
          .update({
            current_round: state.round + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sessionId);

        toast.success("Round forced to end!");
      } else {
        toast.error("Round not ready to advance yet");
      }
    } catch (error) {
      console.error("Error forcing round advance:", error);
      toast.error("Failed to advance round");
    } finally {
      actions.setLoading(false);
    }
  }, [sessionId, state, actions]);

  const currentPlace = state.deck[state.currentIndex];
  const progressPercent = state.deck.length > 0 ? (state.currentIndex / state.deck.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(200,90%,95%)] via-[hsl(320,80%,95%)] to-[hsl(340,80%,95%)] p-4 space-y-6">
      {/* Confetti for winner */}
      <Confetti trigger={state.gameEnded && state.finalWinner !== null} />

      {/* Header */}
      <div className="flex items-center justify-between max-w-md mx-auto">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="text-center">
          <p className="text-sm font-medium">Session Code</p>
          <Badge variant="secondary" className="text-lg">
            {sessionCode}
          </Badge>
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

