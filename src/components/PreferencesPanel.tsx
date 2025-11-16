import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { MapPin, Activity, UtensilsCrossed } from "lucide-react";
import { Place } from "@/types/place";
import { toast } from "sonner";
import AddressAutocomplete from "./AddressAutocomplete";
import { supabase } from "@/lib/supabaseClient";

interface PreferencesPanelProps {
  onRecommendationsGenerated: (places: Place[], sessionId?: string, sessionCode?: string) => void;
  onCreateSession?: (preferences: {
    startAddress: string;
    radius: number;
    activities: string;
    foodPreferences: string;
  }) => Promise<void>;
  sessionMode?: boolean;
}

const PreferencesPanel = ({ onRecommendationsGenerated, onCreateSession, sessionMode = false }: PreferencesPanelProps) => {
  const [startAddress, setStartAddress] = useState("");
  const [radius, setRadius] = useState(10);
  const [activities, setActivities] = useState("");
  const [foodPreferences, setFoodPreferences] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!startAddress) {
      toast.error("Please enter a complete address");
      return;
    }

    setIsGenerating(true);
    try {
      // If in session mode, use the onCreateSession callback
      if (sessionMode && onCreateSession) {
        await onCreateSession({
          startAddress,
          radius,
          activities,
          foodPreferences,
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('generate-recommendations', {
        body: {
          startAddress,
          radius,
          activities,
          foodPreferences,
        },
      });

      if (error) {
        throw error;
      }

      onRecommendationsGenerated((data as any).places);
      toast.success("Recommendations generated!");
    } catch (error) {
      console.error('Error generating recommendations:', error);
      toast.error(error instanceof Error ? error.message : "Failed to generate recommendations");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-80 bg-card/80 backdrop-blur-sm border-r border-border p-6 overflow-y-auto">
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
            <AddressAutocomplete
              value={startAddress}
              onChange={setStartAddress}
              onSelect={setStartAddress}
              placeholder="Enter your starting address"
            />
            <p className="text-xs text-muted-foreground">
              Select a complete address from the suggestions
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
            disabled={isGenerating}
            className="w-full bg-foreground text-background hover:bg-foreground/90"
            size="lg"
          >
            {isGenerating ? "Generating..." : sessionMode ? "Create Session" : "Generate Recommendations"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PreferencesPanel;
