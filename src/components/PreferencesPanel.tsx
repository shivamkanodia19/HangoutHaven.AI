import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { MapPin, Activity, UtensilsCrossed } from "lucide-react";
import { Place } from "@/types/place";
import { toast } from "sonner";

interface PreferencesPanelProps {
  onRecommendationsGenerated: (places: Place[]) => void;
}

const PreferencesPanel = ({ onRecommendationsGenerated }: PreferencesPanelProps) => {
  const [startAddress, setStartAddress] = useState("");
  const [radius, setRadius] = useState(10);
  const [activities, setActivities] = useState("");
  const [foodPreferences, setFoodPreferences] = useState("");

  const handleGenerate = async () => {
    if (!startAddress) {
      toast.error("Please enter a starting address");
      return;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-recommendations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            startAddress,
            radius,
            activities,
            foodPreferences,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate recommendations');
      }

      const data = await response.json();
      onRecommendationsGenerated(data.places);
      toast.success("Recommendations generated!");
    } catch (error) {
      console.error('Error generating recommendations:', error);
      toast.error(error instanceof Error ? error.message : "Failed to generate recommendations");
    }
  };

  return (
    <div className="w-80 bg-card border-r border-border p-6 overflow-y-auto">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">Local Guide</h2>
          <p className="text-sm text-muted-foreground">Find personalized recommendations</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address" className="text-sm font-medium flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Start Address
            </Label>
            <Input
              id="address"
              placeholder="Enter your starting address"
              value={startAddress}
              onChange={(e) => setStartAddress(e.target.value)}
              className="bg-background"
            />
            <p className="text-xs text-muted-foreground">
              Enter your starting location or address
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="radius" className="text-sm font-medium">
              Search Radius: {radius} miles
            </Label>
            <Slider
              id="radius"
              value={[radius]}
              onValueChange={(value) => setRadius(value[0])}
              min={5}
              max={50}
              step={5}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Find places within {radius} miles of your starting address
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="activities" className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Activity Preferences
            </Label>
            <Textarea
              id="activities"
              placeholder="e.g., hiking, museums, shopping"
              value={activities}
              onChange={(e) => setActivities(e.target.value)}
              className="bg-background min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground">
              Describe your preferred activities
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="food" className="text-sm font-medium flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4" />
              Food Preferences
            </Label>
            <Textarea
              id="food"
              placeholder="e.g., Italian, vegetarian, spicy food"
              value={foodPreferences}
              onChange={(e) => setFoodPreferences(e.target.value)}
              className="bg-background min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground">
              Describe your preferred food types
            </p>
          </div>

          <Button 
            onClick={handleGenerate}
            className="w-full bg-foreground text-background hover:bg-foreground/90"
            size="lg"
          >
            Generate Recommendations
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PreferencesPanel;
