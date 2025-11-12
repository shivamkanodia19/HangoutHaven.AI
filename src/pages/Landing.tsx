import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Heart, Users, MapPin, Sparkles, CheckCircle, Star, ArrowRight } from "lucide-react";
const Landing = () => {
  const navigate = useNavigate();
  return <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(200,90%,95%)] via-[hsl(320,80%,95%)] to-[hsl(340,80%,95%)]" />
        
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 left-20 w-72 h-72 bg-primary/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-secondary/20 rounded-full blur-3xl animate-pulse delay-1000" />
        </div>

        {/* Toggle Button */}
        <Button onClick={() => navigate("/groups")} className="absolute top-6 right-6 z-20 bg-gradient-to-r from-primary to-secondary hover:opacity-90" size="lg">
          Switch to Groups
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
        
        <div className="relative z-10 max-w-6xl mx-auto px-4 py-20 text-center">
          <div className="mb-8 inline-block animate-fade-in">
            <div className="flex items-center justify-center gap-4 mb-6 px-4">
              <Heart className="w-14 h-14 md:w-16 md:h-16 text-primary fill-primary animate-pulse flex-shrink-0" />
              <h1 className="text-6xl md:text-7xl lg:text-8xl font-poppins font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Dateify
              </h1>
            </div>
          </div>
          
          <p className="text-3xl text-foreground/90 mb-4 max-w-3xl mx-auto font-semibold animate-fade-in">
            Find the perfect date spot together.
          </p>
          <p className="text-xl text-foreground/70 mb-12 max-w-2xl mx-auto animate-fade-in">
            Swipe, match, and discover places you'll both love. No more endless debates about where to go!
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-20 animate-fade-in">
            <Button size="lg" className="text-lg px-10 py-7 bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-all hover:scale-105 shadow-lg" onClick={() => navigate("/auth?mode=signup")}>
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-10 py-7 border-2 border-primary/30 hover:border-primary/50 transition-all hover:scale-105" onClick={() => navigate("/auth")}>
              Login
            </Button>
            <Button size="lg" className="text-lg px-10 py-7 bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-all hover:scale-105 shadow-lg" onClick={() => document.getElementById("features")?.scrollIntoView({
            behavior: "smooth"
          })}>
              Learn More
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto animate-fade-in">
            <div className="bg-white/60 backdrop-blur-md rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all hover:scale-105">
              <div className="text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-2">
                1000+
              </div>
              <p className="text-foreground/80 font-medium">Places to Discover</p>
            </div>
            <div className="bg-white/60 backdrop-blur-md rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all hover:scale-105">
              <div className="text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-2">
                100%
              </div>
              <p className="text-foreground/80 font-medium">Match Accuracy</p>
            </div>
            <div className="bg-white/60 backdrop-blur-md rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all hover:scale-105">
              <div className="text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-2">
                ∞
              </div>
              <p className="text-foreground/80 font-medium">Perfect Dates</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-background">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-6xl font-bold text-center mb-6 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            How It Works
          </h2>
          <p className="text-center text-foreground/70 mb-20 text-xl max-w-2xl mx-auto">
            Finding the perfect date spot has never been easier. Just three simple steps to date night success.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <div className="text-center p-10 rounded-3xl bg-gradient-to-br from-primary/10 to-secondary/10 hover:shadow-2xl transition-all hover:scale-105 border border-primary/20">
              <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center shadow-lg">
                <Users className="w-10 h-10 text-white" />
              </div>
              <div className="inline-block px-4 py-1 bg-primary/20 rounded-full text-sm font-semibold text-primary mb-4">
                Step 1
              </div>
              <h3 className="text-2xl font-bold mb-4">Create or Join</h3>
              <p className="text-foreground/70 text-lg">
                Start a session or join your partner's session with a simple code. It takes just seconds!
              </p>
            </div>

            <div className="text-center p-10 rounded-3xl bg-gradient-to-br from-primary/10 to-secondary/10 hover:shadow-2xl transition-all hover:scale-105 border border-secondary/20">
              <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center shadow-lg">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <div className="inline-block px-4 py-1 bg-secondary/20 rounded-full text-sm font-semibold text-secondary mb-4">
                Step 2
              </div>
              <h3 className="text-2xl font-bold mb-4">Swipe Together</h3>
              <p className="text-foreground/70 text-lg">
                Both of you swipe on personalized recommendations based on your preferences and location.
              </p>
            </div>

            <div className="text-center p-10 rounded-3xl bg-gradient-to-br from-primary/10 to-secondary/10 hover:shadow-2xl transition-all hover:scale-105 border border-primary/20">
              <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center shadow-lg">
                <MapPin className="w-10 h-10 text-white" />
              </div>
              <div className="inline-block px-4 py-1 bg-primary/20 rounded-full text-sm font-semibold text-primary mb-4">
                Step 3
              </div>
              <h3 className="text-2xl font-bold mb-4">Find Matches</h3>
              <p className="text-foreground/70 text-lg">
                Instantly discover places you both liked and make your plans. No more arguments!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 bg-gradient-to-br from-[hsl(200,90%,95%)] via-[hsl(320,80%,95%)] to-[hsl(340,80%,95%)]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold mb-6 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Why Couples Love Dateify
            </h2>
            <p className="text-xl text-foreground/70 max-w-2xl mx-auto">
              Make date planning fun instead of frustrating
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-white/60 backdrop-blur-md rounded-2xl p-8 shadow-xl">
              <CheckCircle className="w-12 h-12 text-primary mb-4" />
              <h3 className="text-2xl font-bold mb-3">No More Indecision</h3>
              <p className="text-foreground/70 text-lg">
                Stop the "I don't know, what do you want?" cycle. Let your swipes do the talking!
              </p>
            </div>

            <div className="bg-white/60 backdrop-blur-md rounded-2xl p-8 shadow-xl">
              <Star className="w-12 h-12 text-secondary mb-4" />
              <h3 className="text-2xl font-bold mb-3">Discover New Places</h3>
              <p className="text-foreground/70 text-lg">
                Find hidden gems and popular spots you've both been wanting to try.
              </p>
            </div>

            <div className="bg-white/60 backdrop-blur-md rounded-2xl p-8 shadow-xl">
              <Heart className="w-12 h-12 text-primary fill-primary mb-4" />
              <h3 className="text-2xl font-bold mb-3">Build Memories</h3>
              <p className="text-foreground/70 text-lg">
                Every match is a new adventure waiting to happen together.
              </p>
            </div>

            <div className="bg-white/60 backdrop-blur-md rounded-2xl p-8 shadow-xl">
              <Sparkles className="w-12 h-12 text-secondary mb-4" />
              <h3 className="text-2xl font-bold mb-3">Smart Recommendations</h3>
              <p className="text-foreground/70 text-lg">
                Our algorithm learns your preferences to suggest places you'll both love.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-background">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-6xl font-bold mb-8 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Ready to Find Your Perfect Date Spot?
          </h2>
          <p className="text-2xl text-foreground/70 mb-12 max-w-2xl mx-auto">
            Join thousands of couples making better date decisions together
          </p>
          <Button size="lg" className="text-xl px-14 py-8 bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-all hover:scale-105 shadow-xl" onClick={() => navigate("/auth?mode=signup")}>
            Start Swiping Now
            <ArrowRight className="ml-2 h-6 w-6" />
          </Button>
          <p className="mt-6 text-foreground/60">
            No credit card required. Free to start.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 bg-gradient-to-br from-[hsl(200,90%,95%)] via-[hsl(320,80%,95%)] to-[hsl(340,80%,95%)] border-t border-primary/20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <Heart className="w-8 h-8 text-primary fill-primary" />
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Dateify
              </span>
            </div>
            <div className="flex gap-6">
              <button onClick={() => navigate("/contact")} className="text-foreground/70 hover:text-foreground transition-colors">
                Contact
              </button>
              <button className="text-foreground/70 hover:text-foreground transition-colors">
                Privacy
              </button>
              <button className="text-foreground/70 hover:text-foreground transition-colors">
                Terms
              </button>
            </div>
          </div>
          <div className="text-center mt-8 text-foreground/60">
            <p>© 2024 Dateify. Making date planning magical. ✨</p>
          </div>
        </div>
      </footer>
    </div>;
};
export default Landing;