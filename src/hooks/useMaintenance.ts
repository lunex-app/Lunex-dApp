import { useState, useEffect } from "react";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

export function useMaintenance(key: "maintenance_all" | "maintenance_swap" | "maintenance_bridge" | "maintenance_yield" | "maintenance_pool" = "maintenance_all") {
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkMaintenance() {
      try {
        let isMaint = false;
        let dbResponded = false;

        // Fetch from Supabase as the ultimate source of truth when configured.
        if (isSupabaseConfigured) {
          try {
            const { data, error } = await supabase
              .from("protocol_settings" as any)
              .select("value, key")
              .in("key", [key, "maintenance_all"]);

            if (!error && data) {
               dbResponded = true;
               const rows = data as unknown as Array<{ key: string; value: unknown }>;
               const hasMaint = rows.some(d => d.value === true || d.value === "true");
               if (hasMaint) isMaint = true;

               // Sync local storage with DB truth
               const exactKeyData = rows.find(d => d.key === key);
               if (exactKeyData) {
                 localStorage.setItem(key, exactKeyData.value === true || exactKeyData.value === "true" ? "true" : "false");
               }
            }
          } catch (dbErr) {
            // Ignore DB errors if table doesn't exist
          }
        }

        // If DB didn't respond (e.g. no table or offline), fallback to optimistic local storage
        if (!dbResponded) {
          const localVal = localStorage.getItem(key);
          const globalVal = localStorage.getItem("maintenance_all");
          if (globalVal === "true" || localVal === "true") {
             isMaint = true;
          }
        }

        setIsMaintenance(isMaint);
      } catch (err) {
        console.error("Maintenance check failed:", err);
      } finally {
        setLoading(false);
      }
    }

    checkMaintenance();

    // Listen for local changes
    const handleStorage = () => checkMaintenance();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("maintenance_change", handleStorage);

    const channel = isSupabaseConfigured
      ? supabase
          .channel("maintenance_changes")
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "protocol_settings" }, () => {
            checkMaintenance();
          })
          .subscribe()
      : null;

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("maintenance_change", handleStorage);
      if (channel) supabase.removeChannel(channel);
    };
  }, [key]);

  return { isMaintenance, loading };
}
