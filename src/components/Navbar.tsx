import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Trophy, Crown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { useTheme } from "next-themes";
import lunexLogo from "@/assets/lunex-logo.png";

const navLinks = [
  { to: "/swap", label: "SWAP" },
  { to: "/pool", label: "POOL" },
  { to: "/yield", label: "YIELD" },
  { to: "/bridge", label: "BRIDGE" },
  { to: "/points", label: "POINTS", comingSoon: true },
  { to: "/stats", label: "STATS" },
  { to: "/dashboard", label: "DASHBOARD" },
  { to: "/docs", label: "DOCS" },
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

        <div className="hidden md:flex items-center justify-center gap-2 flex-[2]">
          {navLinks.map((link) => (
            link.comingSoon ? (
              <Tooltip key={link.to}>
                <TooltipTrigger asChild>
                  <div className="px-3 py-1.5 text-xs font-semibold tracking-wider text-muted-foreground/50 cursor-help flex items-center gap-1.5 uppercase">
                    <Trophy className="h-3 w-3" />
                    {link.label}
                    <span className="text-[8px] bg-primary/20 text-primary px-1 rounded-sm">SOON</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-[10px] uppercase tracking-widest font-bold">Earn points by swapping, bridging and providing liquidity. Coming Very Soon.</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-1.5 text-xs font-semibold tracking-wider transition-colors uppercase flex items-center gap-1.5 ${
                  location.pathname.startsWith(link.to) ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label === "POINTS" && <Crown className="h-3 w-3" />}
                {link.label}
              </Link>
            )
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 flex-1">
          <ThemeSwitcher />
          <ConnectButton.Custom>
            {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
              const connected = mounted && account && chain;
              return (
                <div {...(!mounted && { "aria-hidden": true, style: { opacity: 0, pointerEvents: "none" as const, userSelect: "none" as const } })}>
                  {!connected ? (
                    <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold tracking-wider uppercase h-8 px-4" onClick={openConnectModal}>Connect</Button>
                  ) : chain.unsupported ? (
                    <Button size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs font-semibold h-8 px-4" onClick={openChainModal}>Wrong Network</Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={openChainModal} className="hidden md:flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors">{chain.name}</button>
                      <Button size="sm" className="bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 text-xs font-mono h-8 px-3" onClick={openAccountModal}>{account.displayName}</Button>
                    </div>
                  )}
                </div>
              );
            }}
          </ConnectButton.Custom>
          <button className="md:hidden text-muted-foreground" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background px-4 py-3 space-y-1">
          {navLinks.map((link) => (
            link.comingSoon ? (
              <div key={link.to} className="block px-3 py-2 text-xs font-semibold tracking-wider text-muted-foreground/50 flex items-center gap-2 uppercase">
                <Trophy className="h-3 w-3" />
                {link.label}
                <span className="text-[8px] bg-primary/10 text-primary px-1 rounded-sm uppercase tracking-tighter">Coming Soon</span>
              </div>
            ) : (
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
            )
          ))}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
