import { Inbox, Droplets, Wallet } from "lucide-react";
import { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  variant?: "pool" | "deposits" | "default";
}

const iconMap = {
  pool: <Droplets className="h-12 w-12 text-primary/40" />,
  deposits: <Wallet className="h-12 w-12 text-secondary/40" />,
  default: <Inbox className="h-12 w-12 text-muted-foreground/40" />,
};

const EmptyState = ({ icon, title, description, action, variant = "default" }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
    <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-muted/50">
      {icon || iconMap[variant]}
    </div>
    <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
    <p className="text-sm text-muted-foreground max-w-sm mb-6">{description}</p>
    {action}
  </div>
);

export default EmptyState;
