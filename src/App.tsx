import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { AnimatePresence } from "framer-motion";
import { Analytics } from "@vercel/analytics/react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { wagmiConfig } from "@/config/wagmi";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageTransition from "@/components/PageTransition";
import Landing from "@/pages/Landing";
import Swap from "@/pages/Swap";
import PoolOverview from "@/pages/PoolOverview";
import AddLiquidity from "@/pages/AddLiquidity";
import RemoveLiquidity from "@/pages/RemoveLiquidity";
import YieldOverview from "@/pages/YieldOverview";
import VaultDetail from "@/pages/VaultDetail";
import Dashboard from "@/pages/Dashboard";
import ProtocolStats from "@/pages/ProtocolStats";
import Bridge from "@/pages/Bridge";
import Docs from "@/pages/Docs";
import Points from "@/pages/Points";
import LunexSDK from "@/pages/LunexSDK";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { MaintenanceGuard } from "@/components/MaintenanceGuard";
import NotFound from "@/pages/NotFound";
import { useState, useEffect } from "react";
import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();

const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageTransition><Landing /></PageTransition>} />
        <Route path="/swap" element={<PageTransition><MaintenanceGuard module="maintenance_swap"><Swap /></MaintenanceGuard></PageTransition>} />
        <Route path="/pool" element={<PageTransition><MaintenanceGuard module="maintenance_pool"><PoolOverview /></MaintenanceGuard></PageTransition>} />
        <Route path="/pool/add" element={<PageTransition><MaintenanceGuard module="maintenance_pool"><AddLiquidity /></MaintenanceGuard></PageTransition>} />
        <Route path="/pool/remove" element={<PageTransition><MaintenanceGuard module="maintenance_pool"><RemoveLiquidity /></MaintenanceGuard></PageTransition>} />
        <Route path="/yield" element={<PageTransition><MaintenanceGuard module="maintenance_yield"><YieldOverview /></MaintenanceGuard></PageTransition>} />
        <Route path="/yield/:token" element={<PageTransition><MaintenanceGuard module="maintenance_yield"><VaultDetail /></MaintenanceGuard></PageTransition>} />
        <Route path="/bridge" element={<PageTransition><MaintenanceGuard module="maintenance_bridge"><Bridge /></MaintenanceGuard></PageTransition>} />
        <Route path="/dashboard" element={<PageTransition><MaintenanceGuard><Dashboard /></MaintenanceGuard></PageTransition>} />
        <Route path="/stats" element={<PageTransition><MaintenanceGuard><ProtocolStats /></MaintenanceGuard></PageTransition>} />
        <Route path="/protocol" element={<PageTransition><MaintenanceGuard><ProtocolStats /></MaintenanceGuard></PageTransition>} />
        <Route path="/points" element={<PageTransition><Points /></PageTransition>} />
        <Route path="/docs" element={<PageTransition><Docs /></PageTransition>} />
        <Route path="/lunexsdk" element={<PageTransition><LunexSDK /></PageTransition>} />
        <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
      </Routes>
    </AnimatePresence>
  );
};

const AppContent = () => (
  <div className="min-h-screen flex flex-col">
    <Navbar />
    <main className="flex-1">
      <AnimatedRoutes />
    </main>
    <Footer />
  </div>
);

const App = () => (
  <WagmiProvider config={wagmiConfig}>
    <QueryClientProvider client={queryClient}>
      <RainbowKitProvider
        theme={darkTheme({
          accentColor: "hsl(187 100% 45%)",
          accentColorForeground: "hsl(220 50% 6%)",
          borderRadius: "medium",
          fontStack: "system",
        })}
      >
        <TooltipProvider>
          <Toaster />
          <Sonner position="top-right" theme="dark" />
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
          <Analytics />
        </TooltipProvider>
      </RainbowKitProvider>
    </QueryClientProvider>
  </WagmiProvider>
);

export default App;
