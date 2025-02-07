import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { Trophy, Settings, User, LogIn, FileText } from "lucide-react";
import Home from "./pages/Home";
import MyLeagues from "./pages/MyLeagues";
import LeagueView from "./pages/League";
import UserSettings from "./pages/UserSettings";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import MyDrafts from "./pages/MyDrafts";
import Draft from "./pages/Draft";
import JoinDraft from './pages/JoinDraft';
import { useEffect, useState } from "react";
import { useAuth } from "./firebase/auth";
import PerfectRoster from "./pages/PerfectRoster";
import ChallengeView from "./pages/ChallengeView";
import RequireAuth from './components/RequireAuth';
import { ThemeProvider } from "./contexts/ThemeContext";
import JoinLeague from "./pages/JoinLeague";
import 'bootstrap-icons/font/bootstrap-icons.css';

function App() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = useAuth((authUser) => {
      setUser(authUser);
    });
    return () => unsubscribe();
  }, []);

  const authenticatedMenuItems = [
    { Icon: Trophy, text: "Leagues", path: "/leagues" },
    { Icon: FileText, text: "Drafts", path: "/drafts" },
    { Icon: Trophy, text: "Perfect Roster Challenge", path: "/perfect-roster" },
    { Icon: Settings, text: "Settings", path: "/settings" },
    { Icon: User, text: "Profile", path: "/profile" },
  ];

  const unauthenticatedMenuItems = [
    { Icon: LogIn, text: "Login / Sign Up", path: "/login" },
  ];

  const menuItems = user ? authenticatedMenuItems : unauthenticatedMenuItems;

  return (
    <ThemeProvider>
      <Router>
        <Sidebar
          menuItems={menuItems}
          appName="Fantasy TFT"
          footerText="Created by Dinodan"
        >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            
            {/* Public Routes */}
            <Route path="/perfect-roster" element={<PerfectRoster />} />
            <Route path="/perfect-roster/:challengeId" element={<ChallengeView />} />
            <Route path="/leagues" element={<MyLeagues />} />
            <Route path="/drafts" element={<MyDrafts />} />
            
            {/* Protected Routes - only specific actions need auth */}
            <Route path="/leagues/:leagueId" element={
              <RequireAuth>
                <LeagueView />
              </RequireAuth>
            } />
            <Route path="/drafts/:draftId" element={
              <RequireAuth>
                <Draft />
              </RequireAuth>
            } />
            <Route path="/drafts/join/:inviteCode" element={<JoinDraft />} />
            <Route path="/join/:inviteCode" element={<JoinLeague />} />
            <Route path="/profile" element={
              <RequireAuth>
                <Profile />
              </RequireAuth>
            } />
            <Route path="/settings" element={
              <RequireAuth>
                <UserSettings />
              </RequireAuth>
            } />
            <Route path="/leagues/join/:leagueId" element={<JoinLeague />} />
          </Routes>
        </Sidebar>
      </Router>
    </ThemeProvider>
  );
}

export default App;
