import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Plus, LogIn } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

interface SessionManagerProps {
  onSessionCreated: (sessionId: string, sessionCode: string) => void;
  onSessionJoined: (sessionId: string) => void;
}

const SessionManager = ({ onSessionCreated, onSessionJoined }: SessionManagerProps) => {
  const [sessionCode, setSessionCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const generateSessionCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleCreateSession = async (preferences: {
    startAddress: string;
    radius: number;
    activities: string;
    foodPreferences: string;
  }) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in to create a session");
        return;
      }

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

// Host is auto-added as participant by backend trigger


      onSessionCreated(session.id, code);
      toast.success(`Session created! Code: ${code}`);
    } catch (error) {
      console.error('Error creating session:', error);
      toast.error("Failed to create session");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinSession = async () => {
    if (!sessionCode) {
      toast.error("Please enter a session code");
      return;
    }

    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in to join a session");
        return;
      }

      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select()
        .eq('session_code', sessionCode.toUpperCase())
        .single();

      if (sessionError) {
        toast.error("Session not found");
        return;
      }

      // Add user as participant
      const { error: participantError } = await supabase
        .from('session_participants')
        .insert({
          session_id: session.id,
          user_id: user.id,
        });

      if (participantError && !participantError.message.includes('duplicate')) {
        throw participantError;
      }

      onSessionJoined(session.id);
      toast.success("Joined session successfully!");
    } catch (error) {
      console.error('Error joining session:', error);
      toast.error("Failed to join session");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-6 h-6" />
            Collaborative Session
          </CardTitle>
          <CardDescription>
            Create a new session or join an existing one to find places together
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
                  value={sessionCode}
                  onChange={(e) => setSessionCode(e.target.value)}
                  maxLength={6}
                  className="uppercase"
                />
              </div>
              <Button 
                onClick={handleJoinSession}
                disabled={isLoading}
                className="w-full"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Join Session
              </Button>
            </TabsContent>
            
            <TabsContent value="create" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You'll configure preferences in the next step
              </p>
              <Button
                onClick={() => {
                  // This will be triggered from PreferencesPanel
                  toast.info("Fill in your preferences to create a session");
                }}
                disabled={isLoading}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Continue to Preferences
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default SessionManager;
export { SessionManager };
