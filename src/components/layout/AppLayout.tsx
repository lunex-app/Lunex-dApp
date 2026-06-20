import { useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Repeat,
  Droplets,
  Sprout,
  ArrowLeftRight,
  CreditCard,
  Bot,
  Crown,
  LayoutDashboard,
  BarChart3,
  LineChart,
  BookOpen,
  Menu,
  X,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import WalletButton from "@/components/WalletButton";
import lunexLogo from "@/assets/lunex-logo.png";

const NAV = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/swap", icon: Repeat, label: "Swap" },
  { to: "/pool", icon: Droplets, label: "Pool" },
  { to: "/yield", icon: Sprout, label: "Yield" },
  { to: "/bridge", icon: ArrowLeftRight, label: "Bridge" },
  // Temporarily disabled for the main release:
  // { to: "/pay", icon: CreditCard, label: "Pay" },
  // { to: "/autopilot", icon: Bot, label: "Autopilot" },
  { to: "/points", icon: Crown, label: "Points" },
  { to: "/stats", icon: BarChart3, label: "Stats" },
  { to: "/analytics", icon: LineChart, label: "Analytics" },
  { to: "/docs", icon: BookOpen, label: "Docs" },
];

const PATH_LABELS: Record<string, string> = {
  "/": "home",
  "/swap": "swap",
  "/pool": "liquidity",
  "/yield": "yield-vaults",
  "/bridge": "cctp-bridge",
  "/pay": "lunex-pay",
  "/autopilot": "autopilot",
  "/points": "points",
  "/dashboard": "dashboard",
  "/stats": "protocol-stats",
  "/analytics": "analytics",
  "/docs": "docs",
};

function Sidebar({
  collapsed,
  mobileOpen,
  onNavigate,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-border bg-background/95 py-4 backdrop-blur-xl transition-all duration-300",
        collapsed ? "w-[68px]" : "w-[232px]",
        "max-lg:transition-transform",
        mobileOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
      )}
    >
      <NavLink
        to="/"
        onClick={onNavigate}
        className={cn("mb-6 flex px-4", collapsed ? "flex-col items-center gap-1 px-0" : "items-center gap-2")}
      >
        <img src={lunexLogo} alt="LUNEX" className="h-9 w-auto shrink-0" />
        <span
          className={cn(
            "font-bold uppercase text-foreground",
            collapsed ? "text-[9px] tracking-tight leading-none" : "text-lg tracking-wide",
          )}
        >
          Lunex
        </span>
      </NavLink>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={onNavigate}
            title={label}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-3 rounded-lg py-2.5 text-muted-foreground transition-all hover:bg-card hover:text-foreground",
                collapsed ? "justify-center px-0" : "px-3",
                isActive && "bg-card text-primary",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-0 h-6 w-[3px] -translate-x-[12px] rounded-r bg-primary" />}
                <Icon size={19} strokeWidth={2} className="shrink-0" />
                {!collapsed && <span className="text-sm font-medium">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

function Topbar({
  collapsed,
  onToggleCollapse,
  onOpenMobile,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobile: () => void;
}) {
  const { pathname } = useLocation();
  const seg = "/" + (pathname.split("/")[1] ?? "");
  const label = PATH_LABELS[seg] ?? pathname.replace("/", "");
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobile}
          className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground lg:hidden"
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>
        <button
          onClick={onToggleCollapse}
          className="hidden h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground lg:grid"
          aria-label="Collapse sidebar"
        >
          {collapsed ? <PanelLeft size={17} /> : <PanelLeftClose size={17} />}
        </button>
        <NavLink to="/" className="flex items-center gap-1">
          <img src={lunexLogo} alt="LUNEX" className="h-7 w-auto shrink-0" />
          <span className="-ml-0.5 text-base font-bold uppercase tracking-wide text-foreground hover:text-primary transition-colors">LUNEX</span>
        </NavLink>
        <span className="hidden font-mono text-xs text-muted-foreground md:inline">/ {label}</span>
      </div>
      <div className="flex items-center gap-2 sm:gap-2.5">
        <span className="hidden rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] uppercase tracking-widest text-primary md:inline">
          Arc Testnet
        </span>
        <ThemeSwitcher />
        <WalletButton />
      </div>
    </header>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen">
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />

      {mobileOpen && (
        <button
          onClick={() => setMobileOpen(false)}
          className="fixed left-[244px] top-4 z-50 grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-foreground lg:hidden"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      )}

      <div className={cn("min-w-0 overflow-x-clip transition-all duration-300", collapsed ? "lg:pl-[68px]" : "lg:pl-[232px]")}>
        <Topbar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
      </div>
    </div>
  );
}
