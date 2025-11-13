import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Heart, Users, MapPin, Sparkles, CheckCircle, Star, ArrowRight, ArrowLeft } from "lucide-react";

const LandingGroups = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(210,90%,95%)] via-[hsl(200,85%,92%)] to-[hsl(190,80%,90%)]" />
        
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 left-20 w-72 h-72 bg-[hsl(210,70%,60%)]/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-[hsl(190,60%,55%)]/20 rounded-full blur-3xl animate-pulse delay-1000" />
        </div>

        {/* Contact Button */}
        <Button
          onClick={() => navigate("/contact")}
          variant="outline"
          className="absolute top-6 left-6 z-20 border-2 border-[hsl(210,70%,60%)]/30 hover:border-[hsl(210,70%,60%)]/50"
          size="lg"
        >
          Contact
        </Button>

        {/* Toggle Button */}
        <Button
          onClick={() => navigate("/")}
          className="absolute top-6 right-6 z-20 bg-gradient-to-r from-[hsl(210,70%,60%)] to-[hsl(190,60%,55%)] hover:opacity-90"
          size="lg"
        >
          <ArrowLeft className="mr-2 h-5 w-5" />
          Switch to Dateify
        </Button>
        
        <div className="relative z-10 max-w-6xl mx-auto px-4 py-20 text-center">
          <div className="mb-8 inline-block animate-fade-in">
            <div className="flex items-center justify-center gap-4 mb-6 px-4">
              <Users className="w-14 h-14 md:w-16 md:h-16 text-[hsl(210,70%,55%)] fill-[hsl(210,70%,55%)] animate-pulse flex-shrink-0" />
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-playfair font-bold bg-gradient-to-r from-[hsl(210,70%,55%)] to-[hsl(190,60%,50%)] bg-clip-text text-transparent my-20 py-4 pb-8">
                Dateify Groups
              </h1>
            </div>
          </div>
          
          <p className="text-3xl text-foreground/90 mb-4 max-w-3xl mx-auto font-montserrat font-semibold animate-fade-in pb-2">
            Find the perfect hangout spot together.
          </p>
          <p className="text-xl text-foreground/70 mb-12 max-w-2xl mx-auto font-inter animate-fade-in pb-2">
            Swipe with your squad to discover places everyone will love. No more group chat chaos!
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-20 animate-fade-in">
            <Button 
              size="lg" 
              className="text-lg px-10 py-7 bg-gradient-to-r from-[hsl(210,70%,60%)] to-[hsl(190,60%,55%)] hover:opacity-90 transition-all hover:scale-105 shadow-lg"
              onClick={() => navigate("/auth?mode=signup")}
            >
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="text-lg px-10 py-7 border-2 border-[hsl(210,70%,60%)]/30 hover:border-[hsl(210,70%,60%)]/50 transition-all hover:scale-105"
              onClick={() => navigate("/auth")}
            >
              Login
            </Button>
            <Button 
              size="lg" 
              className="text-lg px-10 py-7 bg-gradient-to-r from-[hsl(210,70%,60%)] to-[hsl(190,60%,55%)] hover:opacity-90 transition-all hover:scale-105 shadow-lg"
              onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
            >
              Learn More
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto animate-fade-in">
            <div className="bg-white/60 backdrop-blur-md rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all hover:scale-105">
              <div className="text-5xl font-bold bg-gradient-to-r from-[hsl(210,70%,55%)] to-[hsl(190,60%,50%)] bg-clip-text text-transparent mb-2">
                1000+
              </div>
              <p className="text-foreground/80 font-medium pb-1">Group Spots</p>
            </div>
            <div className="bg-white/60 backdrop-blur-md rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all hover:scale-105">
              <div className="text-5xl font-bold bg-gradient-to-r from-[hsl(210,70%,55%)] to-[hsl(190,60%,50%)] bg-clip-text text-transparent mb-2">
                10
              </div>
              <p className="text-foreground/80 font-medium pb-1">Max Squad Size</p>
            </div>
            <div className="bg-white/60 backdrop-blur-md rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all hover:scale-105">
              <div className="text-5xl font-bold bg-gradient-to-r from-[hsl(210,70%,55%)] to-[hsl(190,60%,50%)] bg-clip-text text-transparent mb-2 pb-2">
                Unlimited
              </div>
              <p className="text-foreground/80 font-medium pb-1">Perfect Hangouts</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-background">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-6xl font-montserrat font-bold text-center mb-6 bg-gradient-to-r from-[hsl(210,70%,55%)] to-[hsl(190,60%,50%)] bg-clip-text text-transparent pb-3">
            How It Works
          </h2>
          <p className="text-center text-foreground/70 mb-20 text-xl max-w-2xl mx-auto font-inter pb-2">
            Finding the perfect group hangout has never been easier. Just three simple steps to squad success.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <div className="text-center p-10 rounded-3xl bg-gradient-to-br from-[hsl(210,70%,60%)]/10 to-[hsl(190,60%,55%)]/10 hover:shadow-2xl transition-all hover:scale-105 border border-[hsl(210,70%,60%)]/20">
              <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-gradient-to-r from-[hsl(210,70%,60%)] to-[hsl(190,60%,55%)] flex items-center justify-center shadow-lg">
                <Users className="w-10 h-10 text-white" />
              </div>
              <div className="inline-block px-4 py-1 bg-[hsl(210,70%,60%)]/20 rounded-full text-sm font-semibold text-[hsl(210,70%,50%)] mb-4">
                Step 1
              </div>
              <h3 className="text-2xl font-montserrat font-bold mb-4 pb-1">Create Your Squad</h3>
              <p className="text-foreground/70 text-lg font-inter pb-2">
                Start a group session with a simple code. Invite up to 10 friends to join the fun!
              </p>
            </div>

            <div className="text-center p-10 rounded-3xl bg-gradient-to-br from-[hsl(210,70%,60%)]/10 to-[hsl(190,60%,55%)]/10 hover:shadow-2xl transition-all hover:scale-105 border border-[hsl(190,60%,55%)]/20">
              <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-gradient-to-r from-[hsl(210,70%,60%)] to-[hsl(190,60%,55%)] flex items-center justify-center shadow-lg">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <div className="inline-block px-4 py-1 bg-[hsl(190,60%,55%)]/20 rounded-full text-sm font-semibold text-[hsl(190,60%,45%)] mb-4">
                Step 2
              </div>
              <h3 className="text-2xl font-montserrat font-bold mb-4 pb-1">Swipe Together</h3>
              <p className="text-foreground/70 text-lg font-inter pb-2">
                Everyone swipes on group-friendly venues based on your collective preferences and location.
              </p>
            </div>

            <div className="text-center p-10 rounded-3xl bg-gradient-to-br from-[hsl(210,70%,60%)]/10 to-[hsl(190,60%,55%)]/10 hover:shadow-2xl transition-all hover:scale-105 border border-[hsl(210,70%,60%)]/20">
              <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-gradient-to-r from-[hsl(210,70%,60%)] to-[hsl(190,60%,55%)] flex items-center justify-center shadow-lg">
                <MapPin className="w-10 h-10 text-white" />
              </div>
              <div className="inline-block px-4 py-1 bg-[hsl(210,70%,60%)]/20 rounded-full text-sm font-semibold text-[hsl(210,70%,50%)] mb-4">
                Step 3
              </div>
              <h3 className="text-2xl font-montserrat font-bold mb-4 pb-1">Find Matches</h3>
              <p className="text-foreground/70 text-lg font-inter pb-2">
                Instantly see places everyone liked and make group plans. No more endless group debates!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 bg-gradient-to-br from-[hsl(210,90%,95%)] via-[hsl(200,85%,92%)] to-[hsl(190,80%,90%)]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-montserrat font-bold mb-6 bg-gradient-to-r from-[hsl(210,70%,55%)] to-[hsl(190,60%,50%)] bg-clip-text text-transparent pb-3">
              Why Groups Love Dateify
            </h2>
            <p className="text-xl text-foreground/70 max-w-2xl mx-auto font-inter pb-2">
              Make group planning fun instead of frustrating
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-white/60 backdrop-blur-md rounded-2xl p-8 shadow-xl">
              <CheckCircle className="w-12 h-12 text-[hsl(210,70%,55%)] mb-4" />
              <h3 className="text-2xl font-montserrat font-bold mb-3 pb-1">End Group Chat Chaos</h3>
              <p className="text-foreground/70 text-lg font-inter pb-2">
                No more endless back-and-forth messages. Let your swipes make the decision!
              </p>
            </div>

            <div className="bg-white/60 backdrop-blur-md rounded-2xl p-8 shadow-xl">
              <Star className="w-12 h-12 text-[hsl(190,60%,50%)] mb-4" />
              <h3 className="text-2xl font-montserrat font-bold mb-3 pb-1">Discover Group Spots</h3>
              <p className="text-foreground/70 text-lg font-inter pb-2">
                Find venues perfect for groups - restaurants, activities, and entertainment.
              </p>
            </div>

            <div className="bg-white/60 backdrop-blur-md rounded-2xl p-8 shadow-xl">
              <Users className="w-12 h-12 text-[hsl(210,70%,55%)] fill-[hsl(210,70%,55%)] mb-4" />
              <h3 className="text-2xl font-montserrat font-bold mb-3 pb-1">Build Squad Memories</h3>
              <p className="text-foreground/70 text-lg font-inter pb-2">
                Every match is a new adventure waiting to happen with your crew.
              </p>
            </div>

            <div className="bg-white/60 backdrop-blur-md rounded-2xl p-8 shadow-xl">
              <Sparkles className="w-12 h-12 text-[hsl(190,60%,50%)] mb-4" />
              <h3 className="text-2xl font-montserrat font-bold mb-3 pb-1">Smart Group Matching</h3>
              <p className="text-foreground/70 text-lg font-inter pb-2">
                Our algorithm finds places that work for everyone in your group.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-background">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-6xl font-montserrat font-bold mb-8 bg-gradient-to-r from-[hsl(210,70%,55%)] to-[hsl(190,60%,50%)] bg-clip-text text-transparent pb-3">
            Ready to Find Your Perfect Hangout?
          </h2>
          <p className="text-2xl text-foreground/70 mb-12 max-w-2xl mx-auto font-inter pb-2">
            Join groups making better hangout decisions together
          </p>
          <Button 
            size="lg" 
            className="text-xl px-14 py-8 bg-gradient-to-r from-[hsl(210,70%,60%)] to-[hsl(190,60%,55%)] hover:opacity-90 transition-all hover:scale-105 shadow-xl"
            onClick={() => navigate("/auth?mode=signup")}
          >
            Start Swiping Now
            <ArrowRight className="ml-2 h-6 w-6" />
          </Button>
          <p className="mt-6 text-foreground/60">
            No credit card required. Free to start.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 bg-gradient-to-br from-[hsl(210,90%,95%)] via-[hsl(200,85%,92%)] to-[hsl(190,80%,90%)] border-t border-[hsl(210,70%,60%)]/20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <Users className="w-8 h-8 text-[hsl(210,70%,55%)] fill-[hsl(210,70%,55%)]" />
              <span className="text-xl font-bold bg-gradient-to-r from-[hsl(210,70%,55%)] to-[hsl(190,60%,50%)] bg-clip-text text-transparent">
                Dateify Groups
              </span>
            </div>
            <div className="flex gap-6">
              <button 
                onClick={() => navigate("/contact")}
                className="text-foreground/70 hover:text-foreground transition-colors"
              >
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
            <p>© 2025 Dateify Groups. Making group planning magical.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingGroups;
