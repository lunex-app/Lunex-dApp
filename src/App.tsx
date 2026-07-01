import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { WalletProvider } from "@/context/WalletProvider";
import { AnimatePresence } from "framer-motion";
import { Analytics } from "@vercel/analytics/react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { wagmiConfig } from "@/config/wagmi";
import AppLayout from "@/components/layout/AppLayout";
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
import AnalyticsPage from "@/pages/Analytics";
import Bridge from "@/pages/Bridge";
import Send from "@/pages/Send";
import Docs from "@/pages/Docs";
import ComingSoon from "@/pages/ComingSoon";
import LunexSDK from "@/pages/LunexSDK";
// Temporarily disabled for the main release - re-enable when ready.
// import Points from "@/pages/Points";
// import LunexPay from "@/pages/LunexPay";
import Autopilot from "@/pages/Autopilot";
// import RecurringTasks from "@/pages/RecurringTasks";
import Faucet from "@/pages/Faucet";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { MaintenanceGuard } from "@/components/MaintenanceGuard";
import NotFound from "@/pages/NotFound";
import { useState, useEffect } from "react";
import { fetchProtocolAnalytics } from "@/lib/onchainAnalytics";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";

const queryClient = new QueryClient();

// App routes that live inside the sidebar shell (AppLayout).
const AppRoutes = () => {
  const location = useLocation();
  return (
    <AppLayout>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/swap" element={<PageTransition><MaintenanceGuard module="maintenance_swap"><Swap /></MaintenanceGuard></PageTransition>} />
          <Route path="/pool" element={<PageTransition><MaintenanceGuard module="maintenance_pool"><PoolOverview /></MaintenanceGuard></PageTransition>} />
          <Route path="/pool/add" element={<PageTransition><MaintenanceGuard module="maintenance_pool"><AddLiquidity /></MaintenanceGuard></PageTransition>} />
          <Route path="/pool/remove" element={<PageTransition><MaintenanceGuard module="maintenance_pool"><RemoveLiquidity /></MaintenanceGuard></PageTransition>} />
          <Route path="/yield" element={<PageTransition><MaintenanceGuard module="maintenance_yield"><YieldOverview /></MaintenanceGuard></PageTransition>} />
          <Route path="/yield/:token" element={<PageTransition><MaintenanceGuard module="maintenance_yield"><VaultDetail /></MaintenanceGuard></PageTransition>} />
          <Route path="/bridge" element={<PageTransition><MaintenanceGuard module="maintenance_bridge"><Bridge /></MaintenanceGuard></PageTransition>} />
          <Route path="/send" element={<PageTransition><MaintenanceGuard><Send /></MaintenanceGuard></PageTransition>} />
          <Route path="/dashboard" element={<PageTransition><MaintenanceGuard><Dashboard /></MaintenanceGuard></PageTransition>} />
          <Route path="/analytics" element={<PageTransition><AnalyticsPage /></PageTransition>} />
          <Route path="/points" element={<PageTransition><ComingSoon /></PageTransition>} />
          {/* Temporarily disabled for the main release:
          <Route path="/pay" element={<PageTransition><MaintenanceGuard><LunexPay /></MaintenanceGuard></PageTransition>} /> */}
          <Route path="/autopilot" element={<PageTransition><MaintenanceGuard><Autopilot /></MaintenanceGuard></PageTransition>} />
          {/* <Route path="/agent-network" element={<PageTransition><RecurringTasks /></PageTransition>} /> */}
          <Route path="/faucet" element={<PageTransition><Faucet /></PageTransition>} />
          <Route path="/docs" element={<PageTransition><Docs /></PageTransition>} />
          <Route path="/lunexsdk" element={<PageTransition><LunexSDK /></PageTransition>} />
          <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
        </Routes>
      </AnimatePresence>
      <Footer />
    </AppLayout>
  );
};

// Prefetch analytics as soon as the app loads so data is cached by the time
// the user navigates to the Analytics page.
const AppContent = () => {
  useEffect(() => { fetchProtocolAnalytics(); }, []);
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="*" element={<AppRoutes />} />
    </Routes>
  );
};

const App = () => (
  <WagmiProvider config={wagmiConfig}>
    <QueryClientProvider client={queryClient}>
      <RainbowKitProvider theme={darkTheme({ accentColor: "#19E0E6", accentColorForeground: "#04070F" })} modalSize="compact">
        <WalletProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner position="top-right" theme="dark" offset="72px" />
            <PWAUpdatePrompt />
            <BrowserRouter>
              <AppContent />
            </BrowserRouter>
            <Analytics />
          </TooltipProvider>
        </WalletProvider>
      </RainbowKitProvider>
    </QueryClientProvider>
  </WagmiProvider>
);

export default App;
