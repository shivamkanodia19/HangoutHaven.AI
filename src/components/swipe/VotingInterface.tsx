import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PartyPopper } from "lucide-react";
import { Place } from "@/types/place";

interface VotingInterfaceProps {
  candidates: Place[];
  isLoading: boolean;
  onVote: (place: Place) => void;
}

export function VotingInterface({ candidates, isLoading, onVote }: VotingInterfaceProps) {
  return (
    <Card className="w-full max-w-md mx-auto border-primary bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PartyPopper className="w-5 h-5 text-primary" />
          Final Vote!
        </CardTitle>
        <CardDescription>
          Choose your favorite from the final {candidates.length} option{candidates.length > 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {candidates.map((place) => (
          <Button
            key={place.id}
            variant="outline"
            className="w-full h-auto flex-col items-start p-4 hover:border-primary"
            onClick={() => onVote(place)}
            disabled={isLoading}
          >
            <p className="font-semibold text-lg">{place.name}</p>
            <p className="text-sm text-muted-foreground">{place.type}</p>
            <p className="text-xs text-muted-foreground mt-1">{place.address}</p>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

