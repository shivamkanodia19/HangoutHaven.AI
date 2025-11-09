import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, MapPin, ThumbsUp, ThumbsDown, Heart } from "lucide-react";
import { Place } from "@/types/place";

interface SwipeCardProps {
  place: Place;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}

const SwipeCard = ({ place, onSwipeLeft, onSwipeRight }: SwipeCardProps) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);

  const handleSwipe = (swipeDirection: 'left' | 'right') => {
    setDirection(swipeDirection);
    setIsAnimating(true);
    
    setTimeout(() => {
      if (swipeDirection === 'left') {
        onSwipeLeft();
      } else {
        onSwipeRight();
      }
      setIsAnimating(false);
      setDirection(null);
    }, 300);
  };

  return (
    <Card 
      className={`w-full max-w-md transition-all duration-300 ${
        isAnimating 
          ? direction === 'left' 
            ? '-translate-x-full opacity-0' 
            : 'translate-x-full opacity-0'
          : 'translate-x-0 opacity-100'
      }`}
    >
      {place.imageUrl && (
        <div className="w-full h-48 overflow-hidden rounded-t-lg">
          <img 
            src={place.imageUrl} 
            alt={place.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-xl">{place.name}</CardTitle>
          <Badge variant="secondary">{place.type}</Badge>
        </div>
        {place.rating && (
          <div className="flex items-center gap-1 text-sm">
            <Star className="w-4 h-4 fill-primary text-primary" />
            <span className="font-semibold">{place.rating}</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <CardDescription>{place.description}</CardDescription>
        
        <div className="flex items-start gap-2 text-sm">
          <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground" />
          <span className="text-muted-foreground">{place.address}</span>
        </div>

        {place.highlights && place.highlights.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Highlights:</p>
            <div className="flex flex-wrap gap-2">
              {place.highlights.map((highlight, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {highlight}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-4 pt-4">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={() => handleSwipe('left')}
          >
            <ThumbsDown className="w-5 h-5 mr-2" />
            Pass
          </Button>
          <Button
            variant="default"
            size="lg"
            className="flex-1"
            onClick={() => handleSwipe('right')}
          >
            <ThumbsUp className="w-5 h-5 mr-2" />
            Like
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default SwipeCard;
