import { Place } from "@/types/place";
import PlaceCard from "./PlaceCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

interface RecommendationsPanelProps {
  places: Place[];
  selectedPlace: Place | null;
  onSelectPlace: (place: Place) => void;
}

const RecommendationsPanel = ({ places, selectedPlace, onSelectPlace }: RecommendationsPanelProps) => {
  const [favorites, setFavorites] = useState<Place[]>([]);

  useEffect(() => {
    loadFavorites();

    // Subscribe to favorites changes
    const channel = supabase
      .channel('favorites-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'favorites'
        },
        () => {
          loadFavorites();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadFavorites = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("favorites")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (data) {
      const favoritePlaces: Place[] = data.map((fav) => ({
        id: fav.id,
        name: fav.place_name,
        address: fav.place_address,
        type: fav.place_type,
        rating: fav.place_rating,
        description: fav.place_description,
        imageUrl: fav.place_image_url,
        highlights: [],
      }));
      setFavorites(favoritePlaces);
    }
  };

  return (
    <div className="flex-1 bg-card/50 backdrop-blur-sm p-6 overflow-y-auto">
      <div className="max-w-3xl mx-auto space-y-4">
        <Tabs defaultValue="recommendations" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
            <TabsTrigger value="favorites">Favorites ({favorites.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="recommendations" className="space-y-4 mt-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-1">Recommended Places</h2>
              <p className="text-sm text-muted-foreground">Based on your preferences</p>
            </div>

            {places.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                <p>Enter your preferences and generate recommendations to get started</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {places.map((place) => (
                  <PlaceCard
                    key={place.id}
                    place={place}
                    isSelected={selectedPlace?.id === place.id}
                    onClick={() => onSelectPlace(place)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="favorites" className="space-y-4 mt-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-1">My Favorites</h2>
              <p className="text-sm text-muted-foreground">Places you've saved</p>
            </div>

            {favorites.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                <p>No favorites yet. Click the heart icon on any place to save it.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {favorites.map((place) => (
                  <PlaceCard
                    key={place.id}
                    place={place}
                    isSelected={selectedPlace?.id === place.id}
                    onClick={() => onSelectPlace(place)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default RecommendationsPanel;
