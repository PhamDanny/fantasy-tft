import './Sidebar.css';
import { Link, useLocation } from "react-router-dom";
import { ReactNode, useState, useEffect } from "react";
import { Menu, X, Trophy, Settings, FileText, User, Crown } from "lucide-react";
import { useAuth } from "../firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import type { PerfectRosterChallenge } from '../types';
import { useTheme } from '../contexts/ThemeContext';

interface NavItemProps {
  Icon: React.ElementType;
  text: string;
  path: string;
  badge?: string | number;
  badgeColor?: string;
}

interface SidebarProps {
  menuItems: NavItemProps[];
  appName?: string;
  footerText?: string;
  children?: ReactNode;
}

const NavItem = ({ Icon, text, path, onClick, badge, badgeColor = "danger" }: NavItemProps & { onClick?: () => void }) => {
  const location = useLocation();
  const isActive = location.pathname === path;
  return (
    <Link
      to={path}
      className={`nav-link py-3 d-flex align-items-center ${
        isActive ? "active" : ""
      }`}
      onClick={onClick}
    >
      <div className="d-flex align-items-start position-relative flex-grow-1">
        <Icon className="me-3" size={20} />
        <div className="d-flex flex-column">
          <span>{text}</span>
          {badge && (
            <span className={`mt-1 badge bg-${badgeColor} text-dark text-wrap d-inline-block`} 
                  style={{ fontSize: '0.75rem', lineHeight: '1.2', width: 'fit-content' }}>
              {badge}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
};

const Sidebar = ({
  footerText = "Created by Dinodan",
  children,
}: SidebarProps) => {
  const { isDarkMode } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [hasActiveChallenge, setHasActiveChallenge] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  useEffect(() => {
    const unsubscribe = useAuth((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (currentUser) {
      const checkChallengeStatus = async () => {
        try {
          // Get all challenges
          const unsubscribe = onSnapshot(
            collection(db, 'perfectRosterChallenges'),
            (snapshot) => {
              const challenges = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              })) as PerfectRosterChallenge[];

              // Find the latest active challenge
              const now = new Date();
              const activeChallenge = challenges.find(challenge => {
                const endDate = challenge.endDate.toDate();
                return now <= endDate;
              });

              if (activeChallenge) {
                setHasActiveChallenge(true);
                // Check if user has already submitted an entry
                const hasEntry = !!activeChallenge.entries[currentUser.uid];
                setHasSubmitted(hasEntry);
              } else {
                setHasActiveChallenge(false);
                setHasSubmitted(false);
              }
            }
          );

          return () => unsubscribe();
        } catch (error) {
          console.error("Error checking challenge status:", error);
          setHasActiveChallenge(false);
          setHasSubmitted(false);
        }
      };

      checkChallengeStatus();
    } else {
      setHasActiveChallenge(false);
      setHasSubmitted(false);
    }
  }, [currentUser]);

  const updatedMenuItems = [
    { Icon: Trophy, text: "Leagues", path: "/leagues" },
    { Icon: FileText, text: "Drafts", path: "/drafts" },
    { 
      Icon: Crown, 
      text: "Perfect Roster Challenge", 
      path: "/perfect-roster",
      badge: hasActiveChallenge && !hasSubmitted ? "New Challenge!" : undefined,
      badgeColor: "warning"
    },
    { Icon: Settings, text: "Settings", path: "/settings" },
    currentUser 
      ? { Icon: User, text: "Profile", path: "/profile" }
      : { Icon: User, text: "Login / Signup", path: "/login" }
  ].filter(item => currentUser || !['Settings'].includes(item.text));

  return (
    <div className="d-flex min-vh-100">
      {/* Mobile Menu Button */}
      <button
        className="btn btn-dark d-md-none position-fixed top-0 start-0 m-2 z-3"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        style={{ width: "48px", height: "48px" }}
      >
        {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <div
        className={`text-white position-fixed h-100 z-2 ${
          isMobileMenuOpen ? "d-block" : "d-none"
        } d-md-block`}
        style={{ 
          width: "250px",
          backgroundColor: isDarkMode ? '#1a1d20' : '#212529'
        }}
      >
        <div className="d-flex flex-column h-100">
          <div className="p-3">
            <div className="text-center">
              <Link to="/">
                <img 
                  src="/logo.png" 
                  alt="Fantasy TFT" 
                  className="img-fluid"
                  style={{ maxWidth: '200px' }}
                />
              </Link>
            </div>
          </div>
          <nav className="nav flex-column flex-grow-1 overflow-auto py-3">
            {updatedMenuItems.map((item, index) => (
              <NavItem 
                key={index} 
                {...item} 
                onClick={() => setIsMobileMenuOpen(false)}
              />
            ))}
          </nav>
          <div className="p-3 border-top border-secondary">
            <p className="small text-white mb-0">{footerText}<br />{"Logo by CLE"}</p>
          </div>
        </div>
      </div>

      {/* Main Content spacer - update background color here too */}
      <div 
        className="d-none d-md-block" 
        style={{ 
          width: "250px", 
          flexShrink: 0,
          backgroundColor: isDarkMode ? '#1a1d20' : '#212529'
        }} 
      />
      <main className="flex-grow-1">
        <div 
          className="container-fluid px-3 px-md-4 main-content"
          style={{ 
            paddingTop: "3rem",
            paddingBottom: "1rem"
          }}
        >
          {children}
        </div>
      </main>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-50 d-md-none"
          style={{ zIndex: 1 }}
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
};

export default Sidebar;
