import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Place } from "@/types/place";
import SwipeCard from "./SwipeCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, PartyPopper, ArrowLeft, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useDebounce } from "@/hooks/useDebounce";

interface SwipeViewProps {
  sessionId: string;
  sessionCode: string;
  recommendations: Place[];
  onBack: () => void;
}

interface Match {
  id: string;
  place_id: string;
  place_data: Place;
  is_final_choice: boolean;
  like_count: number;
}

const SwipeView = ({ sessionId, sessionCode, recommendations, onBack }: SwipeViewProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [allMatches, setAllMatches] = useState<Match[]>([]); // All unanimous matches
  const [roundMatches, setRoundMatches] = useState<Match[]>([]); // Matches from current round
  const [currentRoundCandidates, setCurrentRoundCandidates] = useState<Place[]>([]); // Places advancing to next round
  const [isLoading, setIsLoading] = useState(false);
  const [round, setRound] = useState(1);
  const [deck, setDeck] = useState<Place[]>(recommendations);
  const [participantCount, setParticipantCount] = useState(0);
  const [isVoteMode, setIsVoteMode] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);
  const [swipeCounts, setSwipeCounts] = useState<Record<string, number>>({});
  const [showRoundSummary, setShowRoundSummary] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [participantUserIds, setParticipantUserIds] = useState<string[]>([]);
  const [nextAction, setNextAction] = useState<"nextRound" | "vote" | "end" | null>(null);

  // Ref guard to prevent overlapping checks
  const isCheckingRound = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Memoize stable dependency keys to prevent effect loop
  const deckIds = useMemo(() => deck.map((p) => p.id).join(","), [deck]);
  const participantIds = useMemo(() => participantUserIds.join(","), [participantUserIds]);

  // Debounce to avoid rapid-fire checks during swipe bursts
  const debouncedDeckIds = useDebounce(deckIds, 300);
  const debouncedParticipantIds = useDebounce(participantIds, 300);

  // Check if current user is host and load participants (including host)
  useEffect(() => {
    checkIfHost();
    loadParticipants();
  }, [sessionId]);

  const checkIfHost = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    setCurrentUserId(user.id);

    const { data: session } = await supabase.from("sessions").select("created_by").eq("id", sessionId).single();

    if (session) {
      setIsHost(session.created_by === user.id);
    }
  };

  const loadParticipants = async () => {
    // Fetch host and participants, then compute distinct IDs
    const { data: session } = await supabase.from("sessions").select("created_by").eq("id", sessionId).single();

    const { data: rows } = await supabase.from("session_participants").select("user_id").eq("session_id", sessionId);

    const ids = new Set<string>();
    if (session?.created_by) ids.add(session.created_by);
    rows?.forEach((r: { user_id: string }) => ids.add(r.user_id));

    const list = Array.from(ids);
    setParticipantUserIds(list);
    setParticipantCount(list.length);
  };

  // Single unified realtime channel for all updates
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
          
          // Check if host advanced the round
          if (newSession.current_round && newSession.current_round > round) {
            console.log(`Round advanced from ${round} to ${newSession.current_round}`);
            
            // If we're already showing summary, host clicked advance - sync to new round
            if (showRoundSummary) {
              console.log("Host clicked advance, syncing to new round");
              
              // Merge current round matches into all matches
              const newAllMatches = [...allMatches, ...roundMatches];
              setAllMatches(newAllMatches);
              
              // Check what action to take based on current state
              if (nextAction === "nextRound" && currentRoundCandidates.length > 0) {
                // Advance to next round with candidates
                setDeck(currentRoundCandidates);
                setCurrentIndex(0);
                setRound(newSession.current_round);
                setShowRoundSummary(false);
                setRoundMatches([]);
                setCurrentRoundCandidates([]);
                setSwipeCounts({});
                setNextAction(null);
                toast.success(`Round ${newSession.current_round}: ${currentRoundCandidates.length} places to swipe!`);
              } else if (nextAction === "vote") {
                // Start voting mode
                setIsVoteMode(true);
                setShowRoundSummary(false);
                setRoundMatches([]);
                setSwipeCounts({});
                setNextAction(null);
                setRound(newSession.current_round);
                toast.success(`Final vote! Choose between ${currentRoundCandidates.length} options.`);
              } else if (nextAction === "end") {
                // End game
                setGameEnded(true);
                setShowRoundSummary(false);
                setNextAction(null);
                toast.success("All decisions made!");
              }
              return;
            }
            
            // Not showing summary yet - build it from current round data
            const deckPlaceIds = deck.map((p) => p.id);
            
            const { data: swipes } = await supabase
              .from("session_swipes")
              .select("place_id, user_id, place_data")
              .eq("session_id", sessionId)
              .eq("round", round)
              .eq("direction", "right")
              .in("place_id", deckPlaceIds);
            
            // Count likes per place
            const likeCounts: Record<string, Set<string>> = {};
            swipes?.forEach((swipe) => {
              if (!likeCounts[swipe.place_id]) {
                likeCounts[swipe.place_id] = new Set();
              }
              likeCounts[swipe.place_id].add(swipe.user_id);
            });
            
            // Find unanimous (all participants)
            const unanimous = Object.entries(likeCounts)
              .filter(([_, users]) => users.size === participantCount)
              .map(([placeId]) => placeId);
            
            // Find advancing (some but not all)
            const advancing = Object.entries(likeCounts)
              .filter(([_, users]) => users.size > 0 && users.size < participantCount)
              .sort((a, b) => b[1].size - a[1].size)
              .map(([placeId]) => placeId);
            
            // Build matches for unanimous
            const newMatches = unanimous
              .map((placeId) => {
                const place = deck.find((p) => p.id === placeId);
                if (!place) return null;
                return {
                  id: `match-${placeId}`,
                  place_id: placeId,
                  place_data: place,
                  is_final_choice: false,
                  like_count: participantCount,
                };
              })
              .filter(Boolean) as Match[];
            
            // Build advancing candidates
            const advancingPlaces = advancing
              .map((placeId) => deck.find((p) => p.id === placeId))
              .filter(Boolean) as Place[];
            
            setRoundMatches(newMatches);
            setCurrentRoundCandidates(advancingPlaces);
            setShowRoundSummary(true);
            
            // Update swipe counts for display
            const newSwipeCounts: Record<string, number> = {};
            Object.entries(likeCounts).forEach(([placeId, users]) => {
              newSwipeCounts[placeId] = users.size;
            });
            setSwipeCounts(newSwipeCounts);
            
            // Determine next action
            if (advancingPlaces.length === 0 && newMatches.length === 0) {
              setNextAction("end");
              setGameEnded(true);
            } else if (advancingPlaces.length <= 2 && advancingPlaces.length > 0) {
              setNextAction("vote");
            } else if (advancingPlaces.length > 2) {
              setNextAction("nextRound");
            } else {
              setNextAction("end");
            }
            
            toast.info("Host ended the round");
          } else {
            checkRoundCompletion();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_matches",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          loadMatches();
        },
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
          await loadParticipants();
          await checkRoundCompletion();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "session_swipes",
          filter: `session_id=eq.${sessionId}`,
        },
        async () => {
          await loadSwipeCounts();
          await checkRoundCompletion();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, round, deck, participantCount]);

  // Stabilized effect to check round completion - uses memoized & debounced deps
  useEffect(() => {
    if (!debouncedDeckIds || !debouncedParticipantIds) return;
    if (showRoundSummary || isVoteMode || gameEnded) return; // don't check during summary or after end
    if (isCheckingRound.current) return; // prevent overlapping executions

    checkRoundCompletion();
  }, [debouncedDeckIds, debouncedParticipantIds, showRoundSummary, isVoteMode, gameEnded]);


  const loadSwipeCounts = async () => {
    const placeIds = deck.map((p) => p.id);

    // Only count swipes from the current round
    const { data: swipes } = await supabase
      .from("session_swipes")
      .select("place_id, user_id")
      .eq("session_id", sessionId)
      .eq("round", round)
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

      setSwipeCounts(swipeCountsMap);
    }
  };

  const loadMatches = async () => {
    const { data, error } = await supabase.from("session_matches").select("*").eq("session_id", sessionId);

    if (!error && data) {
      // Load like counts for each match
      const matchesWithCounts = await Promise.all(
        data.map(async (match) => {
          const { count } = await supabase
            .from("session_swipes")
            .select("*", { count: "exact", head: true })
            .eq("session_id", sessionId)
            .eq("place_id", match.place_id)
            .eq("direction", "right");

          return {
            ...match,
            place_data: match.place_data as unknown as Place,
            like_count: count || 0,
          };
        }),
      );

      setAllMatches(matchesWithCounts as Match[]);
    }
  };

  // Initial load of matches and swipe counts, reload when round changes
  useEffect(() => {
    loadMatches();
    loadSwipeCounts();
  }, [sessionId, round]);

  const checkRoundCompletion = async () => {
    // Guard: prevent overlapping executions
    if (isCheckingRound.current) return;

    isCheckingRound.current = true;

    // Cancel any previous in-flight check
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      // Prepare deck place IDs for RPC call
      const deckPlaceIds = deck.map((p) => p.id);

      if (deckPlaceIds.length === 0) {
        return;
      }

      // Call server-side atomic round completion RPC
      const { data, error } = await supabase.rpc("check_and_complete_round", {
        p_session_id: sessionId,
        p_deck_place_ids: deckPlaceIds,
        p_round_number: round,
      });

      // Check if request was aborted
      if (signal.aborted) {
        return;
      }

      if (error) {
        console.error("Error checking round completion:", error);
        return;
      }

      if (!data) return;

      // Cast data to expected shape
      const result = data as {
        completed: boolean;
        participant_count: number;
        unanimous_matches: string[];
        advancing_places: Array<{
          place_id: string;
          like_count: number;
          place_data: any;
        }>;
      };

      // Update participant count from server response
      setParticipantCount(result.participant_count || 0);

      // If round not completed, exit early
      if (!result.completed) {
        return;
      }

      // Round is complete - process results
      const unanimousMatchIds = result.unanimous_matches || [];
      const advancingPlacesData = result.advancing_places || [];

      // Build round matches from unanimous IDs
      const currentRoundMatchesData = unanimousMatchIds
        .map((placeId: string) => {
          const place = deck.find((p) => p.id === placeId);
          if (!place) return null;
          return {
            id: `match-${placeId}`,
            place_id: placeId,
            place_data: place,
            is_final_choice: false,
            like_count: result.participant_count,
          };
        })
        .filter(Boolean) as Match[];

      // Build advancing candidates with like counts, sorted descending
      const advancingCandidates = advancingPlacesData
        .map((item: any) => {
          const place = deck.find((p) => p.id === item.place_id);
          if (!place) return null;
          return { ...place, like_count: item.like_count };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b.like_count - a.like_count)
        .map((p: any) => {
          const { like_count, ...place } = p;
          return place as Place;
        });

      // Update swipe counts for UI display
      const newSwipeCounts: Record<string, number> = {};
      advancingPlacesData.forEach((item: any) => {
        newSwipeCounts[item.place_id] = item.like_count;
      });
      setSwipeCounts(newSwipeCounts);

      setRoundMatches(currentRoundMatchesData);
      setCurrentRoundCandidates(advancingCandidates);
      setShowRoundSummary(true);

      if (currentRoundMatchesData.length > 0) {
        toast.success(
          `🎉 ${currentRoundMatchesData.length} unanimous match${currentRoundMatchesData.length > 1 ? "es" : ""} this round!`,
        );
      }

      // Determine next action
      if (advancingCandidates.length === 0 && currentRoundMatchesData.length === 0) {
        setNextAction("end");
        setGameEnded(true);
        toast.error("No agreement reached. Game ended.");
        return;
      }

      if (advancingCandidates.length <= 2 && advancingCandidates.length > 0) {
        setNextAction("vote");
      } else if (advancingCandidates.length > 2) {
        setNextAction("nextRound");
      } else {
        setNextAction("end");
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        // Request was cancelled, ignore
        return;
      }
      console.error("Error in checkRoundCompletion:", error);
    } finally {
      isCheckingRound.current = false;
    }
  };

  const forceAdvanceRound = async () => {
    if (!isHost) return;
    
    setIsLoading(true);
    try {
      // Get current swipes for this round
      const deckPlaceIds = deck.map((p) => p.id);
      
      const { data: swipes } = await supabase
        .from("session_swipes")
        .select("place_id, user_id, place_data")
        .eq("session_id", sessionId)
        .eq("round", round)
        .eq("direction", "right")
        .in("place_id", deckPlaceIds);
      
      if (!swipes || swipes.length === 0) {
        toast.error("No likes yet to advance!");
        return;
      }
      
      // Count likes per place
      const likeCounts: Record<string, Set<string>> = {};
      swipes.forEach((swipe) => {
        if (!likeCounts[swipe.place_id]) {
          likeCounts[swipe.place_id] = new Set();
        }
        likeCounts[swipe.place_id].add(swipe.user_id);
      });
      
      // Find unanimous (all participants)
      const unanimous = Object.entries(likeCounts)
        .filter(([_, users]) => users.size === participantCount)
        .map(([placeId]) => placeId);
      
      // Find advancing (some but not all)
      const advancing = Object.entries(likeCounts)
        .filter(([_, users]) => users.size > 0 && users.size < participantCount)
        .sort((a, b) => b[1].size - a[1].size)
        .map(([placeId]) => placeId);
      
      // Build matches for unanimous
      const newMatches = unanimous
        .map((placeId) => {
          const place = deck.find((p) => p.id === placeId);
          if (!place) return null;
          return {
            id: `match-${placeId}`,
            place_id: placeId,
            place_data: place,
            is_final_choice: false,
            like_count: participantCount,
          };
        })
        .filter(Boolean) as Match[];
      
      // Build advancing candidates
      const advancingPlaces = advancing
        .map((placeId) => deck.find((p) => p.id === placeId))
        .filter(Boolean) as Place[];
      
      setRoundMatches(newMatches);
      setCurrentRoundCandidates(advancingPlaces);
      setShowRoundSummary(true);
      
      // Update swipe counts for display
      const newSwipeCounts: Record<string, number> = {};
      Object.entries(likeCounts).forEach(([placeId, users]) => {
        newSwipeCounts[placeId] = users.size;
      });
      setSwipeCounts(newSwipeCounts);
      
      // Determine next action
      let determinedAction: "nextRound" | "vote" | "end";
      if (advancingPlaces.length === 0 && newMatches.length === 0) {
        determinedAction = "end";
        setNextAction("end");
        setGameEnded(true);
        toast.success("Round forced to end!");
      } else if (advancingPlaces.length <= 2 && advancingPlaces.length > 0) {
        determinedAction = "vote";
        setNextAction("vote");
        toast.success(`Forcing to final vote with ${advancingPlaces.length} options!`);
      } else if (advancingPlaces.length > 2) {
        determinedAction = "nextRound";
        setNextAction("nextRound");
        toast.success(`Forced round end! ${advancingPlaces.length} places advancing.`);
      } else {
        determinedAction = "end";
        setNextAction("end");
        toast.success("Round ended!");
      }
      
      // Update session's current_round to sync all participants
      await supabase
        .from("sessions")
        .update({ 
          current_round: round + 1,
          updated_at: new Date().toISOString() 
        })
        .eq("id", sessionId);
        
    } catch (error) {
      console.error("Error forcing round advance:", error);
      toast.error("Failed to advance round");
    } finally {
      setIsLoading(false);
    }
  };

  const advanceToNextRound = async () => {
    // Merge current round matches into all matches
    const newAllMatches = [...allMatches, ...roundMatches];
    setAllMatches(newAllMatches);

    if (nextAction === "nextRound" && currentRoundCandidates.length > 0) {
      // Host advances - update database to sync all participants
      if (isHost) {
        await supabase
          .from("sessions")
          .update({ 
            current_round: round + 1,
            updated_at: new Date().toISOString() 
          })
          .eq("id", sessionId);
      }
      
      // Reset state for new round
      setDeck(currentRoundCandidates);
      setCurrentIndex(0);
      setRound((prev) => prev + 1);
      setShowRoundSummary(false);
      setRoundMatches([]);
      setCurrentRoundCandidates([]);
      setSwipeCounts({});
      setNextAction(null);
      toast.success(`Round ${round + 1}: ${currentRoundCandidates.length} places to swipe!`);
      return;
    }

    if (nextAction === "vote") {
      // Host starts vote - update database to sync all participants
      if (isHost) {
        await supabase
          .from("sessions")
          .update({ 
            current_round: round + 1,
            updated_at: new Date().toISOString() 
          })
          .eq("id", sessionId);
      }
      
      // Reset state for voting round
      setIsVoteMode(true);
      setShowRoundSummary(false);
      setRoundMatches([]);
      setSwipeCounts({});
      setNextAction(null);
      setRound((prev) => prev + 1);
      toast.success(
        `Final vote! Choose between ${currentRoundCandidates.length} option${currentRoundCandidates.length > 1 ? "s" : ""}.`,
      );
      return;
    }

    if (nextAction === "end") {
      setGameEnded(true);
      setShowRoundSummary(false);
      setNextAction(null);
      toast.success("All decisions made! Check your matches above.");
    }
  };

  const handleSwipe = async (direction: "left" | "right") => {
    if (currentIndex >= deck.length) return;

    const place = deck[currentIndex];
    setIsLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if swipe already exists in this round
      const { data: existingSwipe } = await supabase
        .from("session_swipes")
        .select("id")
        .eq("session_id", sessionId)
        .eq("user_id", user.id)
        .eq("place_id", place.id)
        .eq("round", round)
        .single();

      if (existingSwipe) {
        // Already swiped, just move to next
        setCurrentIndex((prev) => prev + 1);
        return;
      }

      await supabase.from("session_swipes").insert({
        session_id: sessionId,
        user_id: user.id,
        place_id: place.id,
        place_data: place as any,
        direction,
        round,
      });

      setCurrentIndex((prev) => prev + 1);
    } catch (error) {
      console.error("Error recording swipe:", error);
      toast.error("Failed to record swipe");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVote = async (place: Place) => {
    setIsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if user already voted in this voting round
      const { data: existingVote } = await supabase
        .from("session_swipes")
        .select("id")
        .eq("session_id", sessionId)
        .eq("user_id", user.id)
        .eq("round", round)
        .in("place_id", currentRoundCandidates.map((p) => p.id))
        .single();

      if (existingVote) {
        toast.info("You already voted!");
        return;
      }

      // Record vote as a swipe with round tracking
      await supabase.from("session_swipes").insert({
        session_id: sessionId,
        user_id: user.id,
        place_id: place.id,
        place_data: place as any,
        direction: "right",
        round,
      });

      toast.success(`Voted for ${place.name}!`);

      // Check if all participants have voted in THIS round
      const { data: voteSwipes } = await supabase
        .from("session_swipes")
        .select("user_id")
        .eq("session_id", sessionId)
        .eq("round", round)
        .in("place_id", currentRoundCandidates.map((p) => p.id));

      const uniqueVoters = new Set(voteSwipes?.map((s) => s.user_id));

      if (uniqueVoters.size >= participantCount) {
        // All voted - tally results
        tallyFinalVotes();
      }
    } catch (error) {
      console.error("Error recording vote:", error);
      toast.error("Failed to record vote");
    } finally {
      setIsLoading(false);
    }
  };

  const tallyFinalVotes = async () => {
    const placeIds = currentRoundCandidates.map((p) => p.id);

    // Only count votes from the current voting round
    const { data: votes } = await supabase
      .from("session_swipes")
      .select("place_id")
      .eq("session_id", sessionId)
      .eq("round", round)
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

    // Find winner
    const winner = currentRoundCandidates.reduce((prev, current) =>
      (voteCounts[current.id] || 0) > (voteCounts[prev.id] || 0) ? current : prev,
    );

    // Mark as final choice if it's in matches
    const winnerMatch = allMatches.find((m) => m.place_id === winner.id);
    if (winnerMatch) {
      await supabase.from("session_matches").update({ is_final_choice: true }).eq("id", winnerMatch.id);
    }

    toast.success(`🎉 Winner: ${winner.name} with ${voteCounts[winner.id]} votes!`);
    setGameEnded(true);
  };

  const currentPlace = deck[currentIndex];
  const progressPercent = deck.length > 0 ? (currentIndex / deck.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(200,90%,95%)] via-[hsl(320,80%,95%)] to-[hsl(340,80%,95%)] p-4 space-y-6">
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
      {!gameEnded && !isVoteMode && !showRoundSummary && (
        <Card className={`max-w-md mx-auto ${round > 1 ? "border-primary bg-primary/5" : ""}`}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              {round === 1 ? (
                <>
                  <Sparkles className="w-5 h-5" />
                  Round 1: Initial Swipes
                </>
              ) : (
                <>
                  <Heart className="w-5 h-5 text-primary" />
                  Round {round}: Narrowing Down
                </>
              )}
            </CardTitle>
            <CardDescription>
              {round === 1
                ? "Swipe through all places. Unanimous matches will be revealed at the end!"
                : `Keep swiping to narrow down. Matches shown at end of round!`}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Progress</span>
                <span>
                  {currentIndex} of {deck.length}
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {participantCount} participant{participantCount !== 1 ? "s" : ""} in session
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isVoteMode && !gameEnded && !showRoundSummary && (
        <Card className="max-w-md mx-auto border-primary bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PartyPopper className="w-5 h-5 text-primary" />
              Final Vote!
            </CardTitle>
            <CardDescription>
              Choose your favorite from the final {currentRoundCandidates.length} options
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Waiting message when user finishes before others */}
      {currentIndex >= deck.length && !showRoundSummary && !isVoteMode && !gameEnded && (
        <Card className="max-w-md mx-auto border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 animate-spin text-primary" />
              Waiting for All Participants...
            </CardTitle>
            <CardDescription>Round {round} will complete when everyone finishes swiping</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {participantCount} participant{participantCount !== 1 ? "s" : ""} total
            </p>
            {isHost && (
              <Button onClick={forceAdvanceRound} disabled={isLoading} className="w-full" variant="outline">
                Force End Round (Host Only)
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Show all unanimous matches - only in round summary or game ended */}
      {allMatches.length > 0 && (showRoundSummary || gameEnded) && (
        <Card className="max-w-md mx-auto border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-primary" />
              All Unanimous Matches ({allMatches.length})
            </CardTitle>
            <CardDescription>Places ALL participants loved unanimously</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {allMatches.map((match) => (
              <div key={match.id} className="flex items-center justify-between p-3 border rounded-lg bg-primary/5">
                <div className="flex-1">
                  <p className="font-medium">{match.place_data.name}</p>
                  <p className="text-sm text-muted-foreground">{match.place_data.type}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    <Heart className="w-3 h-3 mr-1" />
                    {match.like_count}/{participantCount}
                  </Badge>
                  {match.is_final_choice && (
                    <Badge variant="default">
                      <PartyPopper className="w-3 h-3 mr-1" />
                      Winner
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Round Summary - shown at end of each round */}
      {showRoundSummary && !isVoteMode && !gameEnded && (
        <>
          {roundMatches.length > 0 && (
            <Card className="max-w-md mx-auto border-green-500 bg-green-50 dark:bg-green-950">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-300">
                  <PartyPopper className="w-5 h-5" />
                  Round {round} Unanimous Matches! ({roundMatches.length})
                </CardTitle>
                <CardDescription>Everyone agreed on these places</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {roundMatches.map((match) => (
                  <div
                    key={match.id}
                    className="flex items-center justify-between p-3 border border-green-300 rounded-lg bg-white dark:bg-green-900"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{match.place_data.name}</p>
                      <p className="text-sm text-muted-foreground">{match.place_data.type}</p>
                    </div>
                    <Badge variant="secondary" className="bg-green-100 dark:bg-green-800">
                      <Heart className="w-3 h-3 mr-1" />
                      {match.like_count}/{participantCount}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {currentRoundCandidates.length > 0 && (
            <Card className="max-w-md mx-auto border-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Advancing to Next Round ({currentRoundCandidates.length})
                </CardTitle>
                <CardDescription>Places that received likes but not unanimous</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentRoundCandidates.map((place) => (
                  <div key={place.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{place.name}</p>
                      <p className="text-sm text-muted-foreground">{place.type}</p>
                    </div>
                    <Badge variant="secondary">
                      <Heart className="w-3 h-3 mr-1" />
                      {swipeCounts[place.id] || 0}/{participantCount}
                    </Badge>
                  </div>
                ))}
                {isHost ? (
                  <Button onClick={advanceToNextRound} className="w-full">
                    {nextAction === "vote"
                      ? "Start Final Vote"
                      : nextAction === "end"
                        ? "Finish"
                        : `Start Round ${round + 1}`}
                  </Button>
                ) : (
                  <div className="p-4 border border-primary rounded-lg bg-primary/5 text-center">
                    <p className="text-sm font-medium">
                      {nextAction === "vote"
                        ? "Waiting for host to start final vote..."
                        : "Waiting for host to start next round..."}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <div className="flex justify-center">
        {isVoteMode && !gameEnded ? (
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Cast Your Vote!</CardTitle>
              <CardDescription>Select your favorite from the final options</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {currentRoundCandidates.map((place) => (
                <Button
                  key={place.id}
                  variant="outline"
                  className="w-full h-auto flex-col items-start p-4 hover:border-primary"
                  onClick={() => handleVote(place)}
                  disabled={isLoading}
                >
                  <p className="font-semibold text-lg">{place.name}</p>
                  <p className="text-sm text-muted-foreground">{place.type}</p>
                  <p className="text-xs text-muted-foreground mt-1">{place.address}</p>
                </Button>
              ))}
            </CardContent>
          </Card>
        ) : gameEnded ? (
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {allMatches.some((m) => m.is_final_choice) ? (
                  <>
                    <PartyPopper className="w-5 h-5 text-primary" />
                    Winner Selected! 🎉
                  </>
                ) : (
                  "Game Ended"
                )}
              </CardTitle>
              <CardDescription>
                {allMatches.some((m) => m.is_final_choice)
                  ? "Check the winner above!"
                  : "No agreement was reached. Better luck next time!"}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : currentPlace && !showRoundSummary ? (
          <SwipeCard
            place={currentPlace}
            onSwipeLeft={() => handleSwipe("left")}
            onSwipeRight={() => handleSwipe("right")}
          />
        ) : null}
      </div>
    </div>
  );
};

export default SwipeView;
