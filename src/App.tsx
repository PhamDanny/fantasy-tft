import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { Swords, Search, Settings, User } from "lucide-react";
import Home from "./pages/Home";
import MyLeagues from "./pages/MyLeagues";
import LeagueView from "./pages/League";
import FindLeagues from "./pages/FindLeagues";
import UserSettings from "./pages/UserSettings";
import Profile from "./pages/Profile";
import { JoinLeague } from "./pages/JoinLeague";

function App() {
  const sidebarMenuItems = [
    { Icon: Swords, text: "My Leagues", path: "/leagues" },
    { Icon: Search, text: "Find Leagues", path: "/findleagues" },
    { Icon: Settings, text: "Settings", path: "/settings" },
    { Icon: User, text: "Profile", path: "/profile" },
  ];

  return (
    <BrowserRouter>
      <Sidebar
        menuItems={sidebarMenuItems}
        appName="Fantasy TFT"
        footerText="Created by Dinodan"
      >
        <Routes>
          <Route path="/leagues" element={<MyLeagues />} />
          <Route path="/leagues/:leagueId" element={<LeagueView />} />
          <Route path="/join/:inviteCode" element={<JoinLeague />} />
          <Route path="/findleagues" element={<FindLeagues />} />
          <Route path="/settings" element={<UserSettings />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/" element={<Home />} />
        </Routes>
      </Sidebar>
    </BrowserRouter>
  );
}

export default App;
