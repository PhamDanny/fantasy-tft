import { Link, useLocation } from "react-router-dom";
import { ReactNode } from "react";

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

const NavItem = ({ Icon, text, path }: NavItemProps) => {
  const location = useLocation();
  const isActive = location.pathname === path;
  return (
    <Link
      to={path}
      className={`nav-link py-3 d-flex align-items-center ${
        isActive ? "active" : ""
      }`}
    >
      <Icon className="me-3" size={20} />
      <span>{text}</span>
    </Link>
  );
};

const Sidebar = ({
  menuItems,
  appName = "Header",
  footerText = "Footer",
  children,
}: SidebarProps) => {
  return (
    <div className="d-flex min-vh-100">
      <div
        className="bg-dark text-white position-fixed h-100"
        style={{ width: "250px" }}
      >
        <div className="d-flex flex-column h-100">
          <div className="p-3 border-bottom border-secondary">
            <h1 className="h5 mb-0 text-center">{appName}</h1>
          </div>
          <nav className="nav flex-column flex-grow-1 overflow-auto py-3">
            {menuItems.map((item, index) => (
              <NavItem key={index} {...item} />
            ))}
          </nav>
          <div className="p-3 border-top border-secondary">
            <p className="small text-muted mb-0">{footerText}</p>
          </div>
        </div>
      </div>
      <main className="flex-grow-1" style={{ marginLeft: "250px" }}>
        <div className="p-4">{children}</div>
      </main>
    </div>
  );
};

export default Sidebar;
