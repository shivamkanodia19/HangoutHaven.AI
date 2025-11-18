import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const inputSchema = z.object({
  input: z.string().min(1, "Input cannot be empty").max(500, "Input must be less than 500 characters"),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { input } = inputSchema.parse(body);
    
    const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!GOOGLE_PLACES_API_KEY) {
      throw new Error('GOOGLE_PLACES_API_KEY is not configured');
    }

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${GOOGLE_PLACES_API_KEY}&types=address`,
    );

    if (!response.ok) {
      if (response.status === 403) {
        return new Response(JSON.stringify({ 
          error: 'Google Places API quota exceeded. Please try again later.',
          predictions: []
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Google Places API error: ${response.status}`);
    }

    const data = await response.json();

    // Handle Google API errors
    if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      if (data.status === 'OVER_QUERY_LIMIT') {
        return new Response(JSON.stringify({ 
          error: 'Google Places API quota exceeded. Please try again later.',
          predictions: []
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      return new Response(JSON.stringify({ 
        error: `Google Places API error: ${data.status}`,
        predictions: []
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      predictions: data.predictions || [],
      status: data.status || 'OK'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in autocomplete-address function:', error);
    
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ 
        error: 'Invalid input',
        details: error.errors,
        predictions: []
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      predictions: []
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
