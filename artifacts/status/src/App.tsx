import { Switch, Route, Redirect } from "wouter";
import "./index.css";
import { ModerationLayout } from "./pages/moderation/ModerationLayout";
import { DashboardOverview } from "./pages/moderation/Dashboard";
import { CasesPage } from "./pages/moderation/Cases";
import { CommandsPage } from "./pages/moderation/Commands";
import { AuditPage } from "./pages/moderation/Audit";
import { AdvancedSettingsPage } from "./pages/moderation/Settings";
import { ConfigOverviewPage } from "./pages/moderation/ConfigOverview";
import { CategorySettingsPage } from "./pages/moderation/CategorySettings";
import { ProtectionPage } from "./pages/moderation/Protection";
import { PoliciesPage } from "./pages/moderation/Policies";
import { BotControlPage } from "./pages/moderation/BotControl";
import { VerificationAdminPage } from "./pages/moderation/VerificationAdmin";
import { useActiveGuild } from "./hooks/use-moderation-api";
import { Toaster } from "./components/ui/toaster";

// Public pages
import { PublicLayout } from "./components/public/PublicLayout";
import { GameGuidePage } from "./pages/public/GameGuidePage";
import { GameGuideLoadingScreen } from "./components/public/GameGuideLoadingScreen";
import { OperatorHealthPage } from "./pages/public/OperatorHealthPage";
import { VerificationPage } from "./pages/public/VerificationPage";
import { DailyStatsPage } from "./pages/public/DailyStatsPage";
import { useEffect, useState } from "react";

function ScrollAnimations() {
  useEffect(() => {
    const elements = () => Array.from(document.querySelectorAll<HTMLElement>("[data-aos]"));
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealAll = () => elements().forEach((element) => element.classList.add("aos-animate"));

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      revealAll();
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("aos-animate");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.16, rootMargin: "0px 0px -7% 0px" });

    const observeElements = () => elements()
      .filter((element) => !element.classList.contains("aos-animate"))
      .forEach((element) => observer.observe(element));
    observeElements();

    const mutations = new MutationObserver(observeElements);
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
    };
  }, []);

  return null;
}

// The legacy operator/status logic uses hashes on root
function HomeApp() {
  const [hash, setHash] = useState(window.location.hash);
  
  useEffect(() => {
    const handleHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  if (hash === "#ops" || hash === "#status") {
    return <OperatorHealthPage />;
  }

  return <Redirect to={`/moderare${window.location.search}`} replace />;
}

function GameApp() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 2_000);
    return () => window.clearTimeout(timer);
  }, []);

  if (isLoading) return <GameGuideLoadingScreen />;

  return (
    <PublicLayout>
      <GameGuidePage />
    </PublicLayout>
  );
}

function ModerationApp() {
  const { guildId } = useActiveGuild();
  return (
    <ModerationLayout>
      <div key={guildId ?? "no-guild"}>
        <Switch>
          <Route path="/" component={DashboardOverview} />
          <Route path="/automod" component={() => <CategorySettingsPage section="automod" />} />
          <Route path="/ai" component={() => <CategorySettingsPage section="ai" />} />
          <Route path="/anti-spam" component={() => <CategorySettingsPage section="anti-spam" />} />
          <Route path="/anti-flood" component={() => <CategorySettingsPage section="anti-flood" />} />
          <Route path="/comportament-suspect" component={() => <CategorySettingsPage section="suspicious" />} />
          <Route path="/protectie" component={ProtectionPage} />
          <Route path="/anti-raid" component={() => <CategorySettingsPage section="anti-raid" />} />
          <Route path="/politici" component={PoliciesPage} />
          <Route path="/comenzi" component={CommandsPage} />
          <Route path="/cazuri" component={CasesPage} />
          <Route path="/audit" component={AuditPage} />
          <Route path="/config" component={ConfigOverviewPage} />
          <Route path="/config/avansat" component={AdvancedSettingsPage} />
          <Route path="/config/unelte" component={() => <CategorySettingsPage section="tools" />} />
          <Route path="/config/cazuri-audit" component={() => <CategorySettingsPage section="cases-audit" />} />
          <Route path="/config/escaladare" component={() => <CategorySettingsPage section="escalation" />} />
          <Route path="/config/embeduri" component={() => <CategorySettingsPage section="embeds" />} />
          <Route path="/bot" component={BotControlPage} />
          <Route path="/verificare" component={VerificationAdminPage} />
          <Route component={() => <div className="text-muted-foreground p-8 text-center border border-dashed border-border rounded-xl">Această secțiune este în lucru.</div>} />
        </Switch>
      </div>
    </ModerationLayout>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-void text-paper">
      <div className="text-center">
        <h1 className="text-4xl font-display text-ember-light mb-4">404</h1>
        <p>Poarta a fost închisă.</p>
        <a href="/" className="mt-6 inline-block text-gold underline">Întoarce-te în regat</a>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <ScrollAnimations />
      <Switch>
        <Route path="/" component={HomeApp} />
        <Route path="/joc" component={GameApp} />
        <Route path="/verificare" component={VerificationPage} />
        <Route path="/statistici" component={() => <PublicLayout><DailyStatsPage /></PublicLayout>} />
        <Route path="/moderare" nest>
          <ModerationApp />
        </Route>
        <Route component={NotFound} />
      </Switch>
      <Toaster />
    </>
  );
}
