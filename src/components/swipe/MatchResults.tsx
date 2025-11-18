import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heart, PartyPopper } from "lucide-react";
import { Match } from "@/hooks/useSwipeGameState";
import { Place } from "@/types/place";

interface MatchResultsProps {
  allMatches: Match[];
  finalWinner: Place | null;
  participantCount: number;
  onPlayAgain?: () => void;
  onNewSearch?: () => void;
}

export function MatchResults({ 
  allMatches, 
  finalWinner, 
  participantCount,
  onPlayAgain,
  onNewSearch,
}: MatchResultsProps) {
  return (
    <div className="space-y-4 max-w-md mx-auto">
      {/* Final Winner */}
      {finalWinner && (
        <Card className="border-primary bg-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <PartyPopper className="w-6 h-6 text-primary" />
              Winner Selected! 🎉
            </CardTitle>
            <CardDescription>This is the one!</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 border-2 border-primary rounded-lg bg-white">
              <h3 className="font-bold text-xl mb-2">{finalWinner.name}</h3>
              <p className="text-sm text-muted-foreground mb-2">{finalWinner.type}</p>
              <p className="text-sm mb-3">{finalWinner.description}</p>
              <p className="text-xs text-muted-foreground">{finalWinner.address}</p>
              {finalWinner.rating && (
                <div className="mt-2">
                  <Badge variant="secondary">⭐ {finalWinner.rating}/5</Badge>
                </div>
              )}
            </div>
            {(onPlayAgain || onNewSearch) && (
              <div className="flex gap-2">
                {onPlayAgain && (
                  <Button onClick={onPlayAgain} className="flex-1">
                    Play Again
                  </Button>
                )}
                {onNewSearch && (
                  <Button onClick={onNewSearch} variant="outline" className="flex-1">
                    New Search
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* All Unanimous Matches */}
      {allMatches.length > 0 && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-primary" />
              All Unanimous Matches ({allMatches.length})
            </CardTitle>
            <CardDescription>Places ALL participants loved unanimously</CardDescription>
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

      {/* No matches case */}
      {allMatches.length === 0 && !finalWinner && (
        <Card>
          <CardHeader>
            <CardTitle>Game Ended</CardTitle>
            <CardDescription>No agreement was reached. Better luck next time!</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

