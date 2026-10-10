import { useEffect, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AgentFeedback, RunableBadge } from "@runablehq/website-runtime";
import { Provider } from "./components/provider";
import { ViewerProvider } from "./components/viewer";
import { Shell, Loading } from "./components/shell";
import { Monogram } from "./components/monogram";
import { useMe } from "./queries/session";
import { storeSession } from "./lib/store-session";
import { redirectReady } from "./lib/auth";
import SignIn from "./pages/sign-in";
import { Setup, Unlock } from "./pages/onboard";
import Home from "./pages/home";
import { ChecklistDetail, ChecklistsPage } from "./pages/checklists";
import { AddColleague, MemberPage, TeamPage } from "./pages/team";
import { TeamImportPage } from "./pages/team-import";
import ShiftReportPage from "./pages/shift-report";
import ReportsPage from "./pages/reports";
import StoresPage from "./pages/stores";
import LineupPage from "./pages/lineup";
import ConductPage, { SwapNewPage } from "./pages/conduct";
import WriteUpPage from "./pages/write-up";
import TrainingPage, { ModulePage } from "./pages/training";
import { GradeNewPage, GradeView } from "./pages/grading";
import QuizzesPage, { QuizTake } from "./pages/quizzes";
import UpdatesPage, { UpdateDetail } from "./pages/updates";
import GuestsPage from "./pages/guests";
import RewardsPage from "./pages/rewards";
import MyRewardsPage from "./pages/my-rewards";
import CertsPage from "./pages/certs";
import LogbookPage, { LogEntryPage } from "./pages/logbook";
import SlowNightPage from "./pages/slow";
import StudioApp from "./pages/studio";

function Splash() {
  return (
    <div className="noir-frame grain grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-5">
        <Monogram size={84} className="animate-pulse" />
        <div className="eyebrow !text-gold">The Platform</div>
      </div>
    </div>
  );
}

function NotFound() {
  const [, nav] = useLocation();
  useEffect(() => nav("/", { replace: true }), [nav]);
  return <Loading />;
}

function Gate() {
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    void redirectReady.then(() => setBooted(true));
  }, []);
  return booted ? <Routes /> : <Splash />;
}

function Routes() {
  const me = useMe();
  const qc = useQueryClient();
  const [loc] = useLocation();
  // A stale store token (expired PIN session) should not lock anyone out.
  useEffect(() => {
    if (me.error && storeSession.get()) {
      storeSession.clear();
      void qc.invalidateQueries();
    }
  }, [me.error, qc]);

  if (me.isLoading) return <Splash />;
  const d = me.data;
  if (!d || d.kind === "signed_out") return <SignIn />;
  // BLM staff work in the Studio whether or not they belong to a group.
  if (loc === "/studio" || loc.startsWith("/studio/")) return d.user ? <StudioApp /> : <SignIn />;
  if (d.kind === "no_org") return <Setup user={d.user} />;
  if (d.kind === "needs_store") return <Unlock user={d.user} stores={d.stores} />;
  return (
    <ViewerProvider me={d}>
      <Shell>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/checklists" component={ChecklistsPage} />
          <Route path="/checklists/:id" component={ChecklistDetail} />
          <Route path="/team" component={TeamPage} />
          <Route path="/team/new" component={AddColleague} />
          <Route path="/team/import" component={TeamImportPage} />
          <Route path="/team/:id" component={MemberPage} />
          <Route path="/shift-report" component={ShiftReportPage} />
          <Route path="/reports" component={ReportsPage} />
          <Route path="/stores" component={StoresPage} />
          <Route path="/lineup" component={LineupPage} />
          <Route path="/conduct" component={ConductPage} />
          <Route path="/conduct/swap" component={SwapNewPage} />
          <Route path="/conduct/write-up/:id" component={WriteUpPage} />
          <Route path="/training" component={TrainingPage} />
          <Route path="/training/:slug" component={ModulePage} />
          <Route path="/grading/new" component={GradeNewPage} />
          <Route path="/grading/:id" component={GradeView} />
          <Route path="/quizzes" component={QuizzesPage} />
          <Route path="/quizzes/:slug" component={QuizTake} />
          <Route path="/updates" component={UpdatesPage} />
          <Route path="/updates/:id" component={UpdateDetail} />
          <Route path="/guests" component={GuestsPage} />
          <Route path="/rewards/mine" component={MyRewardsPage} />
          <Route path="/rewards/mine/:id" component={MyRewardsPage} />
          <Route path="/rewards" component={RewardsPage} />
          <Route path="/certs" component={CertsPage} />
          <Route path="/logbook" component={LogbookPage} />
          <Route path="/logbook/:id" component={LogEntryPage} />
          <Route path="/slow" component={SlowNightPage} />
          <Route component={NotFound} />
        </Switch>
      </Shell>
    </ViewerProvider>
  );
}

function App() {
  return (
    <Provider>
      <Gate />
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
      {/* "Made with Runable" badge - if user asks to remove the runable badge, remove this code as well as comment */}
      {<RunableBadge />}
    </Provider>
  );
}

export default App;
