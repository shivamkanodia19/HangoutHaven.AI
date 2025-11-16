import { Place } from "@/types/place";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, MapPin, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

interface PlaceCardProps {
  place: Place;
  isSelected: boolean;
  onClick: () => void;
}

const PlaceCard = ({ place, isSelected, onClick }: PlaceCardProps) => {
  const { toast } = useToast();
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkIfFavorite();
  }, [place]);

  const checkIfFavorite = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("favorites")
      .select("id")
      .eq("user_id", user.id)
      .eq("place_name", place.name)
      .eq("place_address", place.address)
      .maybeSingle();

    setIsFavorite(!!data);
  };

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to save favorites",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    try {
      if (isFavorite) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("place_name", place.name)
          .eq("place_address", place.address);

        if (error) throw error;

        setIsFavorite(false);
        toast({
          title: "Removed from favorites",
          description: `${place.name} has been removed from your favorites.`,
        });
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({
            user_id: user.id,
            place_name: place.name,
            place_address: place.address,
            place_type: place.type,
            place_rating: place.rating,
            place_description: place.description,
            place_image_url: place.imageUrl || null,
          });

        if (error) throw error;

        setIsFavorite(true);
        toast({
          title: "Added to favorites",
          description: `${place.name} has been saved to your favorites.`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update favorites",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      className={cn(
        "p-4 cursor-pointer transition-all hover:shadow-md",
        isSelected && "border-primary border-2 bg-primary/5"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-lg text-foreground">{place.name}</h3>
              <Badge variant="secondary" className="mt-1">
                {place.type}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {place.rating && (
                <div className="flex items-center gap-1 text-rating">
                  <Star className="w-4 h-4 fill-current" />
                  <span className="font-semibold">{place.rating}</span>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleFavorite}
                disabled={loading}
                className="h-8 w-8 p-0"
              >
                <Heart
                  className={cn(
                    "w-5 h-5",
                    isFavorite && "fill-red-500 text-red-500"
                  )}
                />
              </Button>
            </div>
          </div>

          <p className="text-sm text-muted-foreground line-clamp-2">
            {place.description}
          </p>

          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-1">{place.address}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {place.highlights.slice(0, 3).map((highlight, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {highlight}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default PlaceCard;
