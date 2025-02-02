import { Link, useLocation } from "react-router-dom";
import { ReactNode, useState } from "react";
import { Menu, X } from "lucide-react";

interface NavItemProps {
  Icon: React.ElementType;
  text: string;
  path: string;
}

interface SidebarProps {
  menuItems: NavItemProps[];
  appName?: string;
  footerText?: string;
  children?: ReactNode;
}

const NavItem = ({ Icon, text, path, onClick }: NavItemProps & { onClick?: () => void }) => {
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
      <Icon className="me-3" size={20} />
      <span>{text}</span>
    </Link>
  );
};

const Sidebar = ({
  menuItems,
  appName = "Fantasy TFT",
  footerText = "Created by Dinodan",
  children,
}: SidebarProps) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
        className={`bg-dark text-white position-fixed h-100 z-2 ${
          isMobileMenuOpen ? "d-block" : "d-none"
        } d-md-block`}
        style={{ width: "250px" }}
      >
        <div className="d-flex flex-column h-100">
          <div className="p-3 border-bottom border-secondary">
            <h1
              className="h1 mb-0 text-center"
              style={{
                fontFamily: "'Smooch Sans', sans-serif",
                fontWeight: 700,
              }}
            >
              {appName}
            </h1>
          </div>
          <nav className="nav flex-column flex-grow-1 overflow-auto py-3">
            {menuItems.map((item, index) => (
              <NavItem 
                key={index} 
                {...item} 
                onClick={() => setIsMobileMenuOpen(false)}
              />
            ))}
          </nav>
          <div className="p-3 border-top border-secondary">
            <p className="small text-white mb-0">{footerText}</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="d-none d-md-block" style={{ width: "250px", flexShrink: 0 }} />
      <main className="flex-grow-1">
        <div 
          className="container-fluid px-3 px-md-4"
          style={{ 
            paddingTop: "3rem",
            paddingBottom: "1rem",
            "@media (min-width: 768px)": {
              paddingTop: "0.5rem"
            }
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
