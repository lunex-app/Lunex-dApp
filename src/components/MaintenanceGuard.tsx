import { useMaintenance } from "@/hooks/useMaintenance";
import { Hammer, Loader2 } from "lucide-react";
import { useAccount } from "wagmi";

// Add administrative wallet addresses here for maintenance bypass
const ADMIN_WALLETS = [
  "0x66CF9CA9D75FD62438C6E254bA35E61775EF9496", // Default Protocol Admin
];

interface MaintenanceGuardProps {
  children: React.ReactNode;
  module?: "maintenance_swap" | "maintenance_bridge" | "maintenance_yield" | "maintenance_pool";
}

export const MaintenanceGuard = ({ children, module }: MaintenanceGuardProps) => {
  const { address } = useAccount();
  const { isMaintenance, loading } = useMaintenance(module || "maintenance_all");

  const isAdminWallet = address && ADMIN_WALLETS.some(a => a.toLowerCase() === address.toLowerCase());

  // Removed loading check to prevent transitions flicker

  // Bypass the maintenance screen if the connected wallet is in the ADMIN_WALLETS whitelist
  if (isMaintenance && !isAdminWallet) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 px-4 text-center animate-in fade-in duration-500">
        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-8 ring-1 ring-primary/20">
           <Hammer className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-3xl font-bold uppercase tracking-tighter mb-4">Protocol Under Maintenance</h2>
        <p className="max-w-md text-sm text-muted-foreground font-mono leading-relaxed mb-8">
           We are currently performing critical protocol upgrades to the {module ? module.replace("maintenance_", "").toUpperCase() : "Lunex ecosystem"}. 
           Interaction is temporarily suspended to ensure security and consensus integrity.
        </p>
        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-primary/60">
           <span className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Real-time Monitoring Active
           </span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
