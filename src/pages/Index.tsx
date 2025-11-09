import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import PreferencesPanel from "@/components/PreferencesPanel";
import RecommendationsPanel from "@/components/RecommendationsPanel";
import DetailsPanel from "@/components/DetailsPanel";
import SwipeView from "@/components/SwipeView";
import { Place } from "@/types/place";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User } from "@supabase/supabase-js";
import { LogOut, Mail, Users, Plus, LogIn } from "lucide-react";
import { toast } from "sonner";

const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [recommendations, setRecommendations] = useState<Place[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [view, setView] = useState<'mode-select' | 'solo' | 'session-setup' | 'swipe'>('mode-select');

  useEffect(() => {
    // Check auth status
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const generateSessionCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleCreateSession = async (preferences: {
    startAddress: string;
    radius: number;
    activities: string;
    foodPreferences: string;
  }) => {
    try {
      if (!user) throw new Error("Not authenticated");

      const code = generateSessionCode();
      
      const { data: session, error } = await supabase
        .from('sessions')
        .insert({
          created_by: user.id,
          session_code: code,
          start_address: preferences.startAddress,
          radius: preferences.radius,
          activities: preferences.activities,
          food_preferences: preferences.foodPreferences,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase
        .from('session_participants')
        .insert({
          session_id: session.id,
          user_id: user.id,
        });

      // Generate recommendations
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-recommendations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify(preferences),
        }
      );

      if (!response.ok) throw new Error('Failed to generate recommendations');

      const data = await response.json();
      setRecommendations(data.places);
      setSessionId(session.id);
      setSessionCode(code);
      setView('swipe');
      toast.success(`Session created! Code: ${code}`);
    } catch (error) {
      console.error('Error creating session:', error);
      toast.error("Failed to create session");
    }
  };

  const handleJoinSession = async () => {
    if (!joinCode) {
      toast.error("Please enter a session code");
      return;
    }

    try {
      if (!user) throw new Error("Not authenticated");

      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select()
        .eq('session_code', joinCode.toUpperCase())
        .single();

      if (sessionError) {
        toast.error("Session not found");
        return;
      }

      const { error: participantError } = await supabase
        .from('session_participants')
        .insert({
          session_id: session.id,
          user_id: user.id,
        });

      if (participantError && !participantError.message.includes('duplicate')) {
        throw participantError;
      }

      // Generate recommendations based on session preferences
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-recommendations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            startAddress: session.start_address,
            radius: session.radius,
            activities: session.activities,
            foodPreferences: session.food_preferences,
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to generate recommendations');

      const data = await response.json();
      setRecommendations(data.places);
      setSessionId(session.id);
      setSessionCode(session.session_code);
      setView('swipe');
      toast.success("Joined session successfully!");
    } catch (error) {
      console.error('Error joining session:', error);
      toast.error("Failed to join session");
    }
  };

  if (!user) return null;

  if (view === 'mode-select') {
    return (
      <div className="min-h-screen bg-background">
        <header className="flex items-center justify-between px-6 py-4 border-b bg-card">
          <h1 className="text-2xl font-bold">Place Finder</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/contact")}>
              <Mail className="h-4 w-4 mr-2" />
              Contact
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </header>
        
        <div className="flex items-center justify-center p-4 min-h-[calc(100vh-80px)]">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-6 h-6" />
                Choose Your Mode
              </CardTitle>
              <CardDescription>
                Find places by yourself or collaborate with a friend
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="join" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="join">Join Session</TabsTrigger>
                  <TabsTrigger value="create">Create Session</TabsTrigger>
                </TabsList>
                
                <TabsContent value="join" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="session-code">Session Code</Label>
                    <Input
                      id="session-code"
                      placeholder="Enter 6-digit code"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      maxLength={6}
                      className="uppercase"
                    />
                  </div>
                  <Button onClick={handleJoinSession} className="w-full">
                    <LogIn className="w-4 h-4 mr-2" />
                    Join Session
                  </Button>
                </TabsContent>
                
                <TabsContent value="create" className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Configure your preferences to create a collaborative session
                  </p>
                  <Button
                    onClick={() => setView('session-setup')}
                    className="w-full"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Continue to Preferences
                  </Button>
                </TabsContent>
              </Tabs>
              
              <div className="mt-6 pt-6 border-t">
                <Button
                  variant="outline"
                  onClick={() => setView('solo')}
                  className="w-full"
                >
                  Browse Solo
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (view === 'swipe' && sessionId && sessionCode) {
    return (
      <SwipeView
        sessionId={sessionId}
        sessionCode={sessionCode}
        recommendations={recommendations}
        onBack={() => {
          setView('mode-select');
          setSessionId(null);
          setSessionCode(null);
          setRecommendations([]);
        }}
      />
    );
  }

  if (view === 'session-setup') {
    return (
      <div className="flex h-screen overflow-hidden">
        <PreferencesPanel 
          onRecommendationsGenerated={setRecommendations}
          onCreateSession={handleCreateSession}
          sessionMode={true}
        />
        <div className="flex-1 flex items-center justify-center p-8">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>Collaborative Session</CardTitle>
              <CardDescription>
                Set your preferences to create a session. You'll get a code to share with a friend, and you can both swipe on places together!
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => setView('mode-select')}>
                Back to Mode Selection
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <h1 className="text-2xl font-bold">Place Finder</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setView('mode-select')}>
            Back to Modes
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/contact")}>
            <Mail className="h-4 w-4 mr-2" />
            Contact
          </Button>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <PreferencesPanel onRecommendationsGenerated={setRecommendations} />
        <RecommendationsPanel 
          places={recommendations}
          selectedPlace={selectedPlace}
          onSelectPlace={setSelectedPlace}
        />
        <DetailsPanel place={selectedPlace} />
      </div>
    </div>
  );
};

export default Index;
