import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";

const Landing = lazy(() => import("./pages/Landing"));
const LandingGroups = lazy(() => import("./pages/LandingGroups"));
const AppPage = lazy(() => import("./pages/App"));
const AppDates = lazy(() => import("./pages/AppDates"));
const AppGroups = lazy(() => import("./pages/AppGroups"));
const Auth = lazy(() => import("./pages/Auth"));
const Contact = lazy(() => import("./pages/Contact"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/groups" element={<LandingGroups />} />
            <Route path="/app" element={<AppPage />} />
            <Route path="/app/dates" element={<AppDates />} />
            <Route path="/app/groups" element={<AppGroups />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/contact" element={<Contact />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
