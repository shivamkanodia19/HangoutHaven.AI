import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { startAddress, radius, activities, foodPreferences } = await req.json();
    console.log('Generating recommendations for:', { startAddress, radius, activities, foodPreferences });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const prompt = `Search the internet and find 6 real places (restaurants, activities, attractions) within ${radius} miles of ${startAddress}. 
    
User preferences:
- Starting from: ${startAddress}
- Search radius: ${radius} miles
- Activities interested in: ${activities || 'any activities'}
- Food preferences: ${foodPreferences || 'any cuisine'}

For each place, provide:
1. Exact name of the establishment
2. Type (Restaurant, Outdoor Activity, Cultural Activity, etc.)
3. Real rating (if available, otherwise estimate based on reviews)
4. Detailed description (2-3 sentences about what makes it special)
5. Full address
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
    
    // Extract JSON from the response
    let places;
    try {
      // Try to parse the content directly
      places = JSON.parse(content);
    } catch (e) {
      // If that fails, try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        places = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find JSON array in the text
        const arrayMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (arrayMatch) {
          places = JSON.parse(arrayMatch[0]);
        } else {
          console.error('Could not extract JSON from response:', content);
          throw new Error('Failed to parse AI response');
        }
      }
    }

    console.log('Parsed places:', places);

    return new Response(JSON.stringify({ places }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-recommendations function:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
