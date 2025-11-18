import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heart, PartyPopper, Sparkles } from "lucide-react";
import { Place } from "@/types/place";
import { Match } from "@/hooks/useSwipeGameState";

interface RoundSummaryProps {
  round: number;
  roundMatches: Match[];
  advancingCandidates: Place[];
  swipeCounts: Record<string, number>;
  participantCount: number;
  nextAction: 'nextRound' | 'vote' | 'end' | null;
  isHost: boolean;
  onAdvance: () => void;
}

export function RoundSummary({
  round,
  roundMatches,
  advancingCandidates,
  swipeCounts,
  participantCount,
  nextAction,
  isHost,
  onAdvance,
}: RoundSummaryProps) {
  return (
    <>
      {/* Unanimous matches from this round */}
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

      {/* Advancing candidates */}
      {advancingCandidates.length > 0 && (
        <Card className="max-w-md mx-auto border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              {nextAction === 'vote' 
                ? `Final Vote! (${advancingCandidates.length} options)`
                : `Advancing to Next Round (${advancingCandidates.length})`}
            </CardTitle>
            <CardDescription>
              {nextAction === 'vote'
                ? 'Choose your favorite from the final options'
                : 'Places that received likes but not unanimous'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {advancingCandidates.map((place) => (
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
              <Button onClick={onAdvance} className="w-full">
                {nextAction === 'vote'
                  ? 'Start Final Vote'
                  : nextAction === 'end'
                    ? 'Finish'
                    : `Start Round ${round + 1}`}
              </Button>
            ) : (
              <div className="p-4 border border-primary rounded-lg bg-primary/5 text-center">
                <p className="text-sm font-medium">
                  {nextAction === 'vote'
                    ? 'Waiting for host to start final vote...'
                    : 'Waiting for host to start next round...'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

