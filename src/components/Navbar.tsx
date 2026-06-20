import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Crown } from "lucide-react";
import WalletButton from "@/components/WalletButton";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { useTheme } from "next-themes";
import lunexLogo from "@/assets/lunex-logo.png";

const navLinks = [
  { to: "/swap", label: "SWAP" },
  { to: "/pool", label: "POOL" },
  { to: "/yield", label: "YIELD" },
  { to: "/bridge", label: "BRIDGE" },
  { to: "/pay", label: "PAY" },
  { to: "/autopilot", label: "AUTOPILOT" },
  { to: "/points", label: "POINTS" },
  { to: "/dashboard", label: "DASHBOARD" },
];

const Navbar = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme } = useTheme();

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center flex-1">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="flex items-center">
              <img src={lunexLogo} alt="LUNEX" className="h-10 w-auto" />
            </div>
            <span className="text-lg font-bold text-foreground tracking-wide uppercase leading-none">LUNEX</span>
          </Link>
        </div>

        <div className="hidden lg:flex items-center justify-center gap-1 flex-[3]">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`px-2 py-1.5 text-[11px] font-semibold tracking-wider transition-colors uppercase flex items-center gap-1.5 ${
                location.pathname.startsWith(link.to) ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {link.label === "POINTS" && <Crown className="h-3 w-3" />}
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 flex-1">
          <ThemeSwitcher />
          <WalletButton />
          <button className="lg:hidden text-muted-foreground" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-border bg-background px-4 py-3 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              className={`block px-3 py-2 text-xs font-semibold tracking-wider uppercase ${
                location.pathname.startsWith(link.to) ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {link.label === "POINTS" && <Crown className="h-3 w-3" />}
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
