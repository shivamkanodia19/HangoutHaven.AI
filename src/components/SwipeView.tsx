import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Place } from "@/types/place";
import SwipeCard from "./SwipeCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, PartyPopper, ArrowLeft, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

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

  // Check if current user is host and load participants (including host)
  useEffect(() => {
    checkIfHost();
    loadParticipants();
  }, [sessionId]);

  const checkIfHost = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    setCurrentUserId(user.id);
    
    const { data: session } = await supabase
      .from('sessions')
      .select('created_by')
      .eq('id', sessionId)
      .single();
    
    if (session) {
      setIsHost(session.created_by === user.id);
    }
  };

  const loadParticipants = async () => {
    // Fetch host and participants, then compute distinct IDs
    const { data: session } = await supabase
      .from('sessions')
      .select('created_by')
      .eq('id', sessionId)
      .single();

    const { data: rows } = await supabase
      .from('session_participants')
      .select('user_id')
      .eq('session_id', sessionId);

    const ids = new Set<string>();
    if (session?.created_by) ids.add(session.created_by);
    rows?.forEach((r: { user_id: string }) => ids.add(r.user_id));

    const list = Array.from(ids);
    setParticipantUserIds(list);
    setParticipantCount(list.length);
  };

  // Subscribe to session updates to sync round progression
  useEffect(() => {
    const sessionChannel = supabase
      .channel(`session_sync_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${sessionId}`,
        },
        () => {
          // Session updated, reload state
          checkRoundCompletion();
        }
      )
      .subscribe();

    const matchChannel = supabase
      .channel(`session_matches_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_matches',
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          loadMatches(); // Reload all matches silently
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'session_matches',
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          loadMatches(); // Reload when matches are updated
        }
      )
      .subscribe();

    const participantsChannel = supabase
      .channel(`participants_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'session_participants',
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          loadParticipants();
          checkRoundCompletion();
        }
      )
      .subscribe();

    const swipeChannel = supabase
      .channel(`session_swipes_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_swipes',
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          // Reload swipe counts and check round completion when anyone swipes
          loadSwipeCounts();
          checkRoundCompletion();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(matchChannel);
      supabase.removeChannel(participantsChannel);
      supabase.removeChannel(swipeChannel);
    };
  }, [sessionId]);

  // Check round completion when index changes
  useEffect(() => {
    if (currentIndex < deck.length || participantCount === 0) return;
    checkRoundCompletion();
  }, [currentIndex, deck.length, participantCount]);

  const subscribeToSwipes = () => {
    const swipeChannel = supabase
      .channel(`session_swipes_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_swipes',
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          // Reload swipe counts and check round completion when anyone swipes
          loadSwipeCounts();
          checkRoundCompletion();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(swipeChannel);
    };
  };

  const loadSwipeCounts = async () => {
    const placeIds = deck.map(p => p.id);
    
    const { data: swipes } = await supabase
      .from('session_swipes')
      .select('place_id, user_id')
      .eq('session_id', sessionId)
      .eq('direction', 'right')
      .in('place_id', placeIds);

    if (swipes) {
      const counts: Record<string, Set<string>> = {};
      swipes.forEach(swipe => {
        if (!counts[swipe.place_id]) {
          counts[swipe.place_id] = new Set();
        }
        counts[swipe.place_id].add(swipe.user_id);
      });

      const swipeCountsMap: Record<string, number> = {};
      Object.keys(counts).forEach(placeId => {
        swipeCountsMap[placeId] = counts[placeId].size;
      });

      setSwipeCounts(swipeCountsMap);
    }
  };

  const loadMatches = async () => {
    const { data, error } = await supabase
      .from('session_matches')
      .select('*')
      .eq('session_id', sessionId);

    if (!error && data) {
      // Load like counts for each match
      const matchesWithCounts = await Promise.all(
        data.map(async (match) => {
          const { count } = await supabase
            .from('session_swipes')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', sessionId)
            .eq('place_id', match.place_id)
            .eq('direction', 'right');

          return {
            ...match,
            place_data: match.place_data as unknown as Place,
            like_count: count || 0,
          };
        })
      );
      
      setAllMatches(matchesWithCounts as Match[]);
    }
  };

  // Initial load of matches and swipe counts
  useEffect(() => {
    loadMatches();
    loadSwipeCounts();
  }, [sessionId]);

  const checkRoundCompletion = async () => {
    // Get all swipes for this round's deck
    const placeIds = deck.map(p => p.id);
    
    const { data: swipes } = await supabase
      .from('session_swipes')
      .select('place_id, direction, user_id')
      .eq('session_id', sessionId)
      .in('place_id', placeIds);

    if (!swipes) return;

    // Check if ALL participants have swiped on ALL places in the deck
    const swipesByUser: Record<string, Set<string>> = {};
    swipes.forEach(swipe => {
      if (!swipesByUser[swipe.user_id]) {
        swipesByUser[swipe.user_id] = new Set();
      }
      swipesByUser[swipe.user_id].add(swipe.place_id);
    });

    const expectedIds = participantUserIds;
    const allParticipantsCompleted = expectedIds.length > 0 &&
      expectedIds.every((uid) => (swipesByUser[uid]?.size || 0) === placeIds.length);

    if (!allParticipantsCompleted) {
      // Not everyone has finished swiping yet
      return;
    }

    // Group by place_id and count right swipes
    const likeCounts: Record<string, number> = {};
    placeIds.forEach(id => likeCounts[id] = 0);

    swipes.forEach(swipe => {
      if (swipe.direction === 'right') {
        likeCounts[swipe.place_id] = (likeCounts[swipe.place_id] || 0) + 1;
      }
    });

    // Get unanimous matches for this round (all participants liked)
    const unanimousMatches = deck.filter(place => likeCounts[place.id] === participantCount);
    
    // Get all places with at least 1 like (for advancing)
    const likedPlaces = deck.filter(place => likeCounts[place.id] > 0);
    
    // Remove unanimous matches from advancing places (they're already winners)
    const advancingPlaces = likedPlaces.filter(place => 
      !unanimousMatches.some(match => match.id === place.id)
    );
    
    // Sort by like count (most liked first)
    const sortedPlaces = advancingPlaces.sort((a, b) => 
      likeCounts[b.id] - likeCounts[a.id]
    );

    // Load current round matches for display
    const currentRoundMatchesData = unanimousMatches.map(place => ({
      id: `match-${place.id}`,
      place_id: place.id,
      place_data: place,
      is_final_choice: false,
      like_count: participantCount,
    }));
    
    setRoundMatches(currentRoundMatchesData);
    setCurrentRoundCandidates(sortedPlaces);
    setShowRoundSummary(true);

    if (unanimousMatches.length > 0) {
      toast.success(`🎉 ${unanimousMatches.length} unanimous match${unanimousMatches.length > 1 ? 'es' : ''} this round!`);
    }

    if (sortedPlaces.length === 0 && unanimousMatches.length === 0) {
      // No agreement - end game
      setGameEnded(true);
      toast.error("No agreement reached. Game ended.");
    } else if (sortedPlaces.length <= 2 && sortedPlaces.length > 0) {
      // 2 or fewer advancing - enter vote mode
      setIsVoteMode(true);
      toast.success(`Final vote! Choose between ${sortedPlaces.length} option${sortedPlaces.length > 1 ? 's' : ''}.`);
    } else if (sortedPlaces.length === 0) {
      // Only unanimous matches, game complete
      setGameEnded(true);
      toast.success("All decisions made! Check your matches above.");
    }
    // If sortedPlaces > 2, wait for user to click "Continue to Next Round"
  };

  const advanceToNextRound = async () => {
    if (currentRoundCandidates.length > 2) {
      // Merge current round matches into all matches
      const newAllMatches = [...allMatches, ...roundMatches];
      setAllMatches(newAllMatches);
      
      setDeck(currentRoundCandidates);
      setCurrentIndex(0);
      setRound(prev => prev + 1);
      setShowRoundSummary(false);
      setRoundMatches([]);
      
      // Update session to trigger sync for all participants
      await supabase
        .from('sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId);
      
      toast.success(`Round ${round + 1}: ${currentRoundCandidates.length} places to swipe!`);
    }
  };

  const handleSwipe = async (direction: 'left' | 'right') => {
    if (currentIndex >= deck.length) return;

    const place = deck[currentIndex];
    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if swipe already exists
      const { data: existingSwipe } = await supabase
        .from('session_swipes')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .eq('place_id', place.id)
        .single();

      if (existingSwipe) {
        // Already swiped, just move to next
        setCurrentIndex((prev) => prev + 1);
        return;
      }

      await supabase
        .from('session_swipes')
        .insert({
          session_id: sessionId,
          user_id: user.id,
          place_id: place.id,
          place_data: place as any,
          direction,
        });

      setCurrentIndex((prev) => prev + 1);
    } catch (error) {
      console.error('Error recording swipe:', error);
      toast.error("Failed to record swipe");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVote = async (place: Place) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Record vote as a swipe
      await supabase
        .from('session_swipes')
        .insert({
          session_id: sessionId,
          user_id: user.id,
          place_id: place.id,
          place_data: place as any,
          direction: 'right',
        });

      toast.success(`Voted for ${place.name}!`);
      
      // Check if all participants have voted
      const { data: voteSwipes } = await supabase
        .from('session_swipes')
        .select('user_id')
        .eq('session_id', sessionId)
        .in('place_id', currentRoundCandidates.map(p => p.id));

      const uniqueVoters = new Set(voteSwipes?.map(s => s.user_id));
      
      if (uniqueVoters.size >= participantCount) {
        // All voted - tally results
        tallyFinalVotes();
      }
    } catch (error) {
      console.error('Error recording vote:', error);
      toast.error("Failed to record vote");
    } finally {
      setIsLoading(false);
    }
  };

  const tallyFinalVotes = async () => {
    const placeIds = currentRoundCandidates.map(p => p.id);
    
    const { data: votes } = await supabase
      .from('session_swipes')
      .select('place_id')
      .eq('session_id', sessionId)
      .eq('direction', 'right')
      .in('place_id', placeIds);

    if (!votes || votes.length === 0) {
      toast.error("No votes recorded!");
      return;
    }

    // Count votes
    const voteCounts: Record<string, number> = {};
    votes.forEach(v => {
      voteCounts[v.place_id] = (voteCounts[v.place_id] || 0) + 1;
    });

    // Find winner
    const winner = currentRoundCandidates.reduce((prev, current) => 
      (voteCounts[current.id] || 0) > (voteCounts[prev.id] || 0) ? current : prev
    );

    // Mark as final choice if it's in matches
    const winnerMatch = allMatches.find(m => m.place_id === winner.id);
    if (winnerMatch) {
      await supabase
        .from('session_matches')
        .update({ is_final_choice: true })
        .eq('id', winnerMatch.id);
    }

    toast.success(`🎉 Winner: ${winner.name} with ${voteCounts[winner.id]} votes!`);
    setGameEnded(true);
  };

  const currentPlace = deck[currentIndex];
  const progressPercent = deck.length > 0 ? ((currentIndex / deck.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-background p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between max-w-md mx-auto">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="text-center">
          <p className="text-sm font-medium">Session Code</p>
          <Badge variant="secondary" className="text-lg">{sessionCode}</Badge>
        </div>
      </div>

      {/* Round Banner */}
      {!gameEnded && !isVoteMode && !showRoundSummary && (
        <Card className={`max-w-md mx-auto ${round > 1 ? 'border-primary bg-primary/5' : ''}`}>
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
                <span>{currentIndex} of {deck.length}</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {participantCount} participant{participantCount !== 1 ? 's' : ''} in session
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isVoteMode && !gameEnded && (
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
            <CardDescription>
              Round {round} will complete when everyone finishes swiping
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {participantCount} participant{participantCount !== 1 ? 's' : ''} total
            </p>
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
            <CardDescription>
              Places ALL participants loved unanimously
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {allMatches.map((match) => (
              <div
                key={match.id}
                className="flex items-center justify-between p-3 border rounded-lg bg-primary/5"
              >
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
                <CardDescription>
                  Everyone agreed on these places
                </CardDescription>
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
                <CardDescription>
                  Places that received likes but not unanimous
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentRoundCandidates.map((place) => (
                  <div
                    key={place.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
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
                  <Button 
                    onClick={advanceToNextRound} 
                    className="w-full"
                    disabled={currentRoundCandidates.length <= 2}
                  >
                    Start Round {round + 1}
                  </Button>
                ) : (
                  <div className="p-4 border border-primary rounded-lg bg-primary/5 text-center">
                    <p className="text-sm font-medium">Waiting for host to start next round...</p>
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
                {allMatches.some(m => m.is_final_choice) ? (
                  <>
                    <PartyPopper className="w-5 h-5 text-primary" />
                    Winner Selected! 🎉
                  </>
                ) : (
                  "Game Ended"
                )}
              </CardTitle>
              <CardDescription>
                {allMatches.some(m => m.is_final_choice)
                  ? "Check the winner above!"
                  : "No agreement was reached. Better luck next time!"}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : currentPlace && !showRoundSummary ? (
          <SwipeCard
            place={currentPlace}
            onSwipeLeft={() => handleSwipe('left')}
            onSwipeRight={() => handleSwipe('right')}
          />
        ) : null}
      </div>
    </div>
  );
};

export default SwipeView;
