import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { MapPin } from "lucide-react";

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (address: string) => void;
  placeholder?: string;
}

interface PlacePrediction {
  description: string;
  place_id: string;
}

const AddressAutocomplete = ({ value, onChange, onSelect, placeholder }: AddressAutocompleteProps) => {
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (value.length < 3) {
      setSuggestions([]);
      return;
    }

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/autocomplete-address`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ input: value }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.predictions || []);
          setShowSuggestions(true);
        }
      } catch (error) {
        console.error('Error fetching address suggestions:', error);
      }
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [value]);

  const handleSelect = (address: string) => {
    onSelect(address);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-background"
        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
      />
      {showSuggestions && suggestions.length > 0 && (
        <Command className="absolute top-full mt-1 w-full z-50 bg-background border rounded-md shadow-lg">
          <CommandList>
            <CommandGroup>
              {suggestions.map((suggestion) => (
                <CommandItem
                  key={suggestion.place_id}
                  onSelect={() => handleSelect(suggestion.description)}
                  className="cursor-pointer"
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  {suggestion.description}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      )}
    </div>
  );
};

export default AddressAutocomplete;
