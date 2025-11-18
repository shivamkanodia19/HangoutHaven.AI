import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const recommendationsSchema = z.object({
  startAddress: z.string().min(1, "Address cannot be empty").max(500, "Address must be less than 500 characters"),
  radius: z.number().min(1, "Radius must be at least 1 mile").max(50, "Radius cannot exceed 50 miles"),
  activities: z.string().max(1000, "Activities must be less than 1000 characters").optional(),
  foodPreferences: z.string().max(1000, "Food preferences must be less than 1000 characters").optional(),
  useCache: z.boolean().optional().default(true), // Allow bypassing cache if needed
});

// Place validation schema
const placeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.string().min(1),
  rating: z.number().min(0).max(5).optional(),
  description: z.string().min(1),
  address: z.string().min(1),
  highlights: z.array(z.string()).length(3).optional(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { startAddress, radius, activities, foodPreferences, useCache } = recommendationsSchema.parse(body);
    console.log('Generating recommendations for:', { startAddress, radius, activities, foodPreferences, useCache });

    // Initialize Supabase client for cache access
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    let supabaseClient = null;
    if (supabaseUrl && supabaseServiceKey) {
      supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    }

    // Try to get from cache first (if enabled and Supabase is available)
    if (useCache && supabaseClient) {
      try {
        const { data: cached, error: cacheError } = await supabaseClient.rpc(
          'get_cached_recommendations',
          {
            p_start_address: startAddress,
            p_radius: radius,
            p_activities: activities || null,
            p_food_preferences: foodPreferences || null,
          }
        );

        if (!cacheError && cached && Array.isArray(cached) && cached.length > 0) {
          console.log('Returning cached recommendations');
          return new Response(JSON.stringify({ places: cached, cached: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (cacheErr) {
        console.warn('Cache lookup failed, proceeding with generation:', cacheErr);
        // Continue to generate new recommendations
      }
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Determine number of recommendations based on input specificity
    const hasSpecificPreferences = (activities && activities.length > 20) || (foodPreferences && foodPreferences.length > 20);
    const recommendationCount = hasSpecificPreferences ? 8 : 12;

    const prompt = `Search the internet and find ${recommendationCount} real places (restaurants, activities, attractions) within ${radius} miles of ${startAddress}.
    
User preferences:
- Starting from: ${startAddress}
- Search radius: ${radius} miles
- Activities interested in: ${activities || 'any activities'}
- Food preferences: ${foodPreferences || 'any cuisine'}

CRITICAL: Each location must be UNIQUE. Do not repeat the same restaurant/place location. For chain restaurants (e.g., KFC, McDonald's), you can include different locations, but each specific address must appear only once in your results.

For each place, provide:
1. Exact name of the establishment
2. Type (Restaurant, Outdoor Activity, Cultural Activity, etc.)
3. Real rating (if available, otherwise estimate based on reviews)
4. Detailed description (2-3 sentences about what makes it special)
5. Full address (must be unique for each place)
6. 3 key highlights

Make sure these are REAL places that exist within ${radius} miles of ${startAddress}. Search the internet to verify they exist and get accurate information.

Return ONLY a valid JSON array with this exact structure, no additional text:
[
  {
    "id": "1",
    "name": "Place Name",
    "type": "Restaurant",
    "rating": 4.5,
    "description": "Description here",
    "address": "Full address",
    "highlights": ["highlight1", "highlight2", "highlight3"]
  }
]`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a local guide expert. Search the internet for real places and return only valid JSON arrays with accurate information about real establishments.' },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log('AI Response:', data);
    
    const content = data.choices[0].message.content;
    console.log('Raw AI content:', content);
    
    // Extract JSON from the response
    let places;
    try {
      // Try to parse the content directly
      places = JSON.parse(content);
    } catch (e) {
      console.log('Direct parse failed, trying to extract from markdown...');
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        try {
          // Parse extracted JSON directly - it should be valid
          places = JSON.parse(jsonMatch[1]);
        } catch (parseError) {
          console.error('Markdown JSON parse failed:', parseError);
          console.error('Extracted content:', jsonMatch[1].substring(0, 500));
          throw new Error('Failed to parse AI response from markdown block');
        }
      } else {
        // Try to find JSON array directly in the text
        const arrayMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (arrayMatch) {
          try {
            places = JSON.parse(arrayMatch[0]);
          } catch (parseError) {
            console.error('Array JSON parse failed:', parseError);
            console.error('Extracted array:', arrayMatch[0].substring(0, 500));
            throw new Error('Failed to parse AI response array');
          }
        } else {
          console.error('Could not extract JSON from response:', content.substring(0, 500));
          throw new Error('Failed to find valid JSON in AI response');
        }
      }
    }

    console.log('Parsed places:', places);

    // Validate and normalize places
    if (!Array.isArray(places) || places.length === 0) {
      throw new Error('AI returned invalid or empty places array');
    }

    // Deduplicate by name + address combination to ensure unique locations
    const seenLocations = new Set<string>();
    const uniquePlaces: any[] = [];
    
    for (const place of places) {
      // Validate place structure
      try {
        const validatedPlace = placeSchema.parse(place);
        const locationKey = `${validatedPlace.name.toLowerCase().trim()}|${validatedPlace.address.toLowerCase().trim()}`;
        
        if (!seenLocations.has(locationKey)) {
          seenLocations.add(locationKey);
          uniquePlaces.push({
            id: validatedPlace.id,
            name: validatedPlace.name.trim(),
            type: validatedPlace.type.trim(),
            rating: validatedPlace.rating ?? null,
            description: validatedPlace.description.trim(),
            address: validatedPlace.address.trim(),
            highlights: validatedPlace.highlights || ['Popular', 'Highly Rated', 'Local Favorite'],
          });
        }
      } catch (validationError) {
        console.warn('Skipping invalid place:', place, validationError);
        // Skip invalid places but continue processing
      }
    }

    if (uniquePlaces.length === 0) {
      throw new Error('No valid places found after validation and deduplication');
    }

    console.log(`Filtered ${places.length} places to ${uniquePlaces.length} unique valid locations`);

    // Cache the results (if Supabase is available)
    if (supabaseClient && useCache) {
      try {
        // Generate cache key
        const { data: cacheKey, error: keyError } = await supabaseClient.rpc(
          'generate_recommendation_cache_key',
          {
            p_start_address: startAddress,
            p_radius: radius,
            p_activities: activities || null,
            p_food_preferences: foodPreferences || null,
          }
        );

        if (!keyError && cacheKey) {
          // Insert or update cache
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
          const { error: upsertError } = await supabaseClient
            .from('cached_recommendations')
            .upsert({
              cache_key: cacheKey,
              start_address: startAddress,
              radius: radius,
              activities: activities || null,
              food_preferences: foodPreferences || null,
              recommendations: uniquePlaces,
              hit_count: 0,
              expires_at: expiresAt,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'cache_key',
            });

          if (upsertError) {
            console.warn('Failed to upsert cache:', upsertError);
          } else {
            console.log('Successfully cached recommendations');
          }
        }
      } catch (cacheErr) {
        console.warn('Failed to cache recommendations:', cacheErr);
        // Don't fail the request if caching fails
      }
    }

    return new Response(JSON.stringify({ places: uniquePlaces, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-recommendations function:', error);
    
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ 
        error: 'Invalid input',
        details: error.errors
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
