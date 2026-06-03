import { useEffect, useState } from "react";
import { Bell, Mail, Send, Webhook } from "lucide-react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createId, protocolStorage, type NotificationRule } from "@/lib/localProtocol";

const ruleTypes: NotificationRule["type"][] = ["vault_share_price", "large_swap", "lp_value", "webhook"];
const channels: NotificationRule["channel"][] = ["email", "telegram", "webhook"];

const iconByChannel = {
  email: Mail,
  telegram: Send,
  webhook: Webhook,
};

export function NotifyPanel() {
  const { address } = useAccount();
  const [type, setType] = useState<NotificationRule["type"]>("vault_share_price");
  const [channel, setChannel] = useState<NotificationRule["channel"]>("email");
  const [destination, setDestination] = useState("");
  const [threshold, setThreshold] = useState("");
  const [target, setTarget] = useState("USDC");
  const [rules, setRules] = useState<NotificationRule[]>(() => protocolStorage.loadNotifications(address));

  const refresh = () => setRules(protocolStorage.loadNotifications(address));

  useEffect(() => {
    refresh();
  }, [address]);

  const createRule = () => {
    if (!address || !destination || !threshold) return;
    protocolStorage.saveNotification(address, {
      id: createId("notify"),
      wallet: address,
      type,
      channel,
      destination,
      threshold,
      target,
      active: true,
      createdAt: Date.now(),
    });
    refresh();
  };

  const toggleRule = (id: string, active: boolean) => {
    if (!address) return;
    protocolStorage.updateNotification(address, id, { active });
    refresh();
  };

  return (
    <section className="border border-border bg-card rounded-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <h3 className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">Lunex Notify</h3>
      </div>
      <div className="p-6 grid lg:grid-cols-[1fr_0.9fr] gap-8">
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="flex gap-px bg-border h-11">
              {ruleTypes.slice(0, 2).map((item) => (
                <button key={item} onClick={() => setType(item)} className={`flex-1 text-[9px] font-black uppercase tracking-widest ${type === item ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>
                  {item === "vault_share_price" ? "Vault" : "Swap"}
                </button>
              ))}
            </div>
            <div className="flex gap-px bg-border h-11">
              {channels.map((item) => (
                <button key={item} onClick={() => setChannel(item)} className={`flex-1 text-[9px] font-black uppercase tracking-widest ${channel === item ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Target, e.g. USDC vault" className="h-11" />
            <Input value={threshold} onChange={(event) => setThreshold(event.target.value)} placeholder="Threshold" className="h-11 font-mono" />
          </div>
          <Input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Email, Telegram handle, or webhook URL" className="h-11" />
          <Button disabled={!address || !destination || !threshold} onClick={createRule} className="w-full h-11 font-black uppercase tracking-widest text-[10px]">
            Create Alert
          </Button>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Rules are saved in the dashboard. Email, Telegram, and webhook delivery require the Lunex notification worker to be deployed with these subscriptions.
          </p>
        </div>

        <div className="space-y-3">
          {rules.slice(0, 6).map((rule) => {
            const Icon = iconByChannel[rule.channel];
            return (
              <div key={rule.id} className="border border-border bg-muted/10 p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-3 w-3 text-primary" />
                    <p className="text-xs font-bold uppercase">{rule.type.replaceAll("_", " ")}</p>
                  </div>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-widest truncate">{rule.target} · {rule.threshold} · {rule.channel}</p>
                </div>
                <button onClick={() => toggleRule(rule.id, !rule.active)} className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest border ${rule.active ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                  {rule.active ? "On" : "Off"}
                </button>
              </div>
            );
          })}
          {rules.length === 0 && <p className="text-xs text-muted-foreground text-center py-10">No alerts configured.</p>}
        </div>
      </div>
    </section>
  );
}
