import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { Swords, Search, Settings, User, LogIn, FileText } from "lucide-react";
import Home from "./pages/Home";
import MyLeagues from "./pages/MyLeagues";
import LeagueView from "./pages/League";
import FindLeagues from "./pages/FindLeagues";
import UserSettings from "./pages/UserSettings";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import { JoinLeague } from "./pages/JoinLeague";
import MyDrafts from "./pages/MyDrafts";
import Draft from "./pages/Draft";
import JoinDraft from './pages/JoinDraft';
import { useEffect, useState } from "react";
import { useAuth } from "./firebase/auth";

function App() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = useAuth((authUser) => {
      setUser(authUser);
    });
    return () => unsubscribe();
  }, []);

  const authenticatedMenuItems = [
    { Icon: Swords, text: "Leagues", path: "/leagues" },
    { Icon: FileText, text: "Drafts", path: "/drafts" },
    { Icon: Search, text: "Find Leagues", path: "/findleagues" },
    { Icon: Settings, text: "Settings", path: "/settings" },
    { Icon: User, text: "Profile", path: "/profile" },
  ];

  const unauthenticatedMenuItems = [
    { Icon: LogIn, text: "Login / Sign Up", path: "/login" },
  ];

  const menuItems = user ? authenticatedMenuItems : unauthenticatedMenuItems;

  return (
    <BrowserRouter>
      <Sidebar
        menuItems={menuItems}
        appName="Fantasy TFT"
        footerText="Created by Dinodan"
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/leagues" element={<MyLeagues />} />
          <Route path="/leagues/:leagueId" element={<LeagueView />} />
          <Route path="/drafts" element={<MyDrafts />} />
          <Route path="/drafts/:draftId" element={<Draft />} />
          <Route path="/drafts/join/:inviteCode" element={<JoinDraft />} />
          <Route path="/join/:inviteCode" element={<JoinLeague />} />
          <Route path="/findleagues" element={<FindLeagues />} />
          <Route path="/settings" element={<UserSettings />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </Sidebar>
    </BrowserRouter>
  );
}

export default App;
