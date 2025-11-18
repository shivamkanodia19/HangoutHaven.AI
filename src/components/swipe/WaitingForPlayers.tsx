import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

interface WaitingForPlayersProps {
  round: number;
  participantCount: number;
  isHost: boolean;
  isLoading: boolean;
  onForceAdvance?: () => void;
}

export function WaitingForPlayers({
  round,
  participantCount,
  isHost,
  isLoading,
  onForceAdvance,
}: WaitingForPlayersProps) {
  return (
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
          {participantCount} participant{participantCount !== 1 ? 's' : ''} total
        </p>
        {isHost && onForceAdvance && (
          <Button onClick={onForceAdvance} disabled={isLoading} className="w-full" variant="outline">
            Force End Round (Host Only)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

