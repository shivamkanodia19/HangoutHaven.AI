import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
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
import { LogOut, Mail, Users, LogIn, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const AppGroups = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [recommendations, setRecommendations] = useState<Place[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [participantsCount, setParticipantsCount] = useState<number>(1);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [view, setView] = useState<'mode-select' | 'solo' | 'session-setup' | 'waiting' | 'swipe'>('mode-select');
  
  useEffect(() => {
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

  const watchParticipants = async (sid: string, hostUserId: string) => {
    try {
      setIsHost(user?.id === hostUserId);

      const { data: session } = await supabase
        .from('sessions')
        .select('started_at')
        .eq('id', sid)
        .single();

      const { count } = await supabase
        .from('session_participants')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sid);

      const initialCount = count ?? 1;
      setParticipantsCount(initialCount);

      if (session?.started_at) {
        setView('swipe');
        return;
      }

      const channel = supabase
        .channel(`session_${sid}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'session_participants', filter: `session_id=eq.${sid}` },
          async () => {
            const { count: newCount } = await supabase
              .from('session_participants')
              .select('*', { count: 'exact', head: true })
              .eq('session_id', sid);
            setParticipantsCount(newCount ?? 1);
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sid}` },
          async (payload) => {
            if (payload.new.started_at) {
              setView('swipe');
              supabase.removeChannel(channel);
            }
          }
        )
        .subscribe();
    } catch (e) {
      console.error('Error watching participants:', e);
      setView('swipe');
    }
  };

  const handleStartRound = async () => {
    if (!sessionId) return;
    
    try {
      await supabase
        .from('sessions')
        .update({ started_at: new Date().toISOString() })
        .eq('id', sessionId);
      
      toast.success("Round started!");
    } catch (error) {
      console.error('Error starting round:', error);
      toast.error("Failed to start round");
    }
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
          session_type: 'group',
        })
        .select()
        .single();

      if (error) throw error;

      const { data: recData, error: recError } = await supabase.functions.invoke('generate-recommendations', {
        body: preferences,
      });
      if (recError) throw recError;

      const data = recData as any;

      if (!response.ok) throw new Error('Failed to generate recommendations');

      const data = await response.json();
      setRecommendations(data.places);
      setSessionId(session.id);
      setSessionCode(code);
      toast.success(`Session created! Code: ${code}`);
      
      setView('waiting');
      setIsHost(true);
      setParticipantsCount(1);
      
      await watchParticipants(session.id, user.id);
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

      const { data: session, error: joinError } = await (supabase as any).rpc('join_session_with_code', {
        code: joinCode.toUpperCase(),
      });

      if (joinError || !session) {
        console.error('Join error:', joinError);
        toast.error("Session not found");
        return;
      }

      // Only allow joining group sessions
      if (session.session_type !== 'group') {
        toast.error("This is a date session. Please use regular Dateify.");
        return;
      }

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
      toast.success("Joined session successfully!");
      await watchParticipants(session.id, session.created_by);
    } catch (error) {
      console.error('Error joining session:', error);
      toast.error("Failed to join session");
    }
  };

  if (!user) return null;

  if (view === 'mode-select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(210,90%,95%)] via-[hsl(200,85%,92%)] to-[hsl(190,80%,90%)]">
        <header className="flex items-center justify-between px-6 py-4 border-b bg-card/80 backdrop-blur-sm">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 fill-[hsl(210,70%,55%)] text-[hsl(210,70%,55%)]" />
            Dateify Groups
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Switch to Dates
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
        
        <div className="flex items-center justify-center p-4 min-h-[calc(100vh-80px)]">
          <Card className="w-full max-w-md shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-6 h-6 fill-[hsl(210,70%,55%)] text-[hsl(210,70%,55%)]" />
                Group Mode
              </CardTitle>
              <CardDescription>
                Find the perfect hangout spot for your squad (up to 10 people)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="join" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="join">Join Group</TabsTrigger>
                  <TabsTrigger value="create">Create Group</TabsTrigger>
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
                  <Button onClick={handleJoinSession} className="w-full bg-gradient-to-r from-[hsl(210,70%,60%)] to-[hsl(190,60%,55%)]">
                    <LogIn className="w-4 h-4 mr-2" />
                    Join Group Session
                  </Button>
                </TabsContent>
                
                <TabsContent value="create" className="space-y-4">
                  <p className="text-sm text-muted-foreground mb-4">
                    Create a group session for up to 10 people
                  </p>
                  <Button
                    onClick={() => setView('session-setup')}
                    className="w-full h-auto py-6 flex-col bg-gradient-to-r from-[hsl(210,70%,60%)] to-[hsl(190,60%,55%)]"
                  >
                    <span className="font-semibold">Start Group Session</span>
                    <span className="text-xs mt-1">Up to 10 people</span>
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

  if (view === 'waiting' && sessionCode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(210,90%,95%)] via-[hsl(200,85%,92%)] to-[hsl(190,80%,90%)] p-4">
        <div className="max-w-md mx-auto">
          <Card className="animate-enter">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-6 h-6 fill-[hsl(210,70%,55%)] text-[hsl(210,70%,55%)]" />
                Waiting Room
              </CardTitle>
              <CardDescription>
                {isHost 
                  ? `${participantsCount}/10 participants. Start when ready or wait until 10 join.`
                  : 'Waiting for host to start the round...'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <p className="text-sm font-medium">Session Code</p>
                <div className="text-3xl font-bold tracking-widest select-all">
                  {sessionCode}
                </div>
              </div>
              <p className="text-center text-muted-foreground">
                {participantsCount} of 10 participant{participantsCount !== 1 ? 's' : ''} joined
                {participantsCount === 10 && ' - Starting automatically!'}
              </p>
              <div className="flex gap-2 justify-center">
                {isHost && participantsCount >= 1 && participantsCount < 10 && (
                  <Button onClick={handleStartRound} className="flex-1 bg-gradient-to-r from-[hsl(210,70%,60%)] to-[hsl(190,60%,55%)]">
                    Start Round ({participantsCount} player{participantsCount !== 1 ? 's' : ''})
                  </Button>
                )}
                <Button variant="outline" onClick={() => setView('mode-select')}>
                  Cancel
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
      <div className="flex h-screen overflow-hidden bg-gradient-to-br from-[hsl(210,90%,95%)] via-[hsl(200,85%,92%)] to-[hsl(190,80%,90%)]">
        <PreferencesPanel 
          onRecommendationsGenerated={setRecommendations}
          onCreateSession={handleCreateSession}
          sessionMode={true}
        />
        <div className="flex-1 flex items-center justify-center p-8">
          <Card className="max-w-md shadow-xl">
            <CardHeader>
              <CardTitle>👥 Group Hangout</CardTitle>
              <CardDescription>
                Set your preferences to create a group session for up to 10 people. You'll get a code to share!
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
    <div className="flex flex-col h-screen bg-gradient-to-br from-[hsl(210,90%,95%)] via-[hsl(200,85%,92%)] to-[hsl(190,80%,90%)] overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 border-b bg-card/80 backdrop-blur-sm">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6 fill-[hsl(210,70%,55%)] text-[hsl(210,70%,55%)]" />
          Dateify Groups
        </h1>
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

export default AppGroups;
