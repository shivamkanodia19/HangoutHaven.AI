import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Place } from "@/types/place";
import SwipeCard from "./SwipeCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, PartyPopper, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

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
}

const SwipeView = ({ sessionId, sessionCode, recommendations, onBack }: SwipeViewProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadMatches();

    // Subscribe to new matches
    const channel = supabase
      .channel(`session_matches_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_matches',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const newMatch = payload.new as Match;
          setMatches((prev) => [...prev, newMatch]);
          toast.success(`🎉 It's a match! ${newMatch.place_data.name}`);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const loadMatches = async () => {
    const { data, error } = await supabase
      .from('session_matches')
      .select('*')
      .eq('session_id', sessionId);

    if (!error && data) {
      const typedMatches = data.map(match => ({
        ...match,
        place_data: match.place_data as unknown as Place
      }));
      setMatches(typedMatches);
    }
  };

  const handleSwipe = async (direction: 'left' | 'right') => {
    if (currentIndex >= recommendations.length) return;

    const place = recommendations[currentIndex];
    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

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

  const handleFinalChoice = async (matchId: string) => {
    try {
      await supabase
        .from('session_matches')
        .update({ is_final_choice: true })
        .eq('id', matchId);

      toast.success("Final choice selected! 🎉");
    } catch (error) {
      console.error('Error setting final choice:', error);
      toast.error("Failed to set final choice");
    }
  };

  const currentPlace = recommendations[currentIndex];

  return (
    <div className="min-h-screen bg-background p-4 space-y-6">
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

      {matches.length > 0 && (
        <Card className="max-w-md mx-auto border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-primary" />
              Mutual Matches ({matches.length})
            </CardTitle>
            <CardDescription>
              Places you both liked!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {matches.map((match) => (
              <div
                key={match.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <p className="font-medium">{match.place_data.name}</p>
                  <p className="text-sm text-muted-foreground">{match.place_data.type}</p>
                </div>
                {!match.is_final_choice && (
                  <Button
                    size="sm"
                    onClick={() => handleFinalChoice(match.id)}
                  >
                    Choose This
                  </Button>
                )}
                {match.is_final_choice && (
                  <Badge variant="default">
                    <PartyPopper className="w-3 h-3 mr-1" />
                    Final Choice
                  </Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center">
        {currentPlace ? (
          <SwipeCard
            place={currentPlace}
            onSwipeLeft={() => handleSwipe('left')}
            onSwipeRight={() => handleSwipe('right')}
          />
        ) : (
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>All Done!</CardTitle>
              <CardDescription>
                {matches.length > 0
                  ? "Check your matches above and choose your final destination!"
                  : "No more places to swipe. Try adjusting your preferences for more recommendations."}
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      {currentPlace && (
        <p className="text-center text-sm text-muted-foreground">
          {currentIndex + 1} of {recommendations.length}
        </p>
      )}
    </div>
  );
};

export default SwipeView;
