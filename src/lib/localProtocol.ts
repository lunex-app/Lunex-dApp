export interface LimitOrder {
  id: string;
  wallet: string;
  fromToken: "USDC" | "EURC";
  toToken: "USDC" | "EURC";
  amount: string;
  targetRate: string;
  direction: "above" | "below";
  status: "open" | "executable" | "cancelled" | "filled";
  contractOrderId?: string;
  createTxHash?: string;
  cancelTxHash?: string;
  executeTxHash?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PaymentLink {
  id: string;
  merchant: string;
  recipient: string;
  amount: string;
  token: "USDC" | "EURC";
  memo: string;
  createdAt: number;
  status: "open" | "paid" | "cancelled";
}

export interface StreamPlan {
  id: string;
  sender: string;
  recipient: string;
  recipients?: { address: string; amount: string }[];
  token: "USDC" | "EURC";
  totalAmount: string;
  durationSeconds: number;
  ratePerSecond: string;
  startTime?: number;
  endTime?: number;
  cliffTime?: number;
  releaseFrequencySeconds?: number;
  streamType?: "linear" | "cliff" | "vesting" | "unlock";
  cancelable?: boolean;
  transferable?: boolean;
  recipientCanClaimAnytime?: boolean;
  status: "draft" | "ready" | "active" | "completed";
  contractStreamIds?: string[];
  createTxHash?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface NotificationRule {
  id: string;
  wallet: string;
  type: "vault_share_price" | "large_swap" | "lp_value" | "webhook";
  target: string;
  channel: "email" | "telegram" | "webhook";
  destination: string;
  threshold: string;
  active: boolean;
  createdAt: number;
}

export interface AutopilotIntent {
  id: string;
  wallet: string;
  prompt: string;
  intent: "swap" | "bridge" | "vault" | "pool" | "pay" | "stream" | "limit_order" | "unknown";
  summary: string;
  steps: string[];
  route?: string;
  status: "planned" | "needs_review" | "ready";
  createdAt: number;
}

const key = (wallet: string | undefined | null, section: string) => `lunex:${(wallet || "anonymous").toLowerCase()}:${section}`;

function loadArray<T>(wallet: string | undefined | null, section: string): T[] {
  try {
    const raw = localStorage.getItem(key(wallet, section));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveArray<T>(wallet: string | undefined | null, section: string, values: T[]) {
  localStorage.setItem(key(wallet, section), JSON.stringify(values));
}

export const protocolStorage = {
  loadLimitOrders: (wallet?: string | null) => loadArray<LimitOrder>(wallet, "limit-orders"),
  saveLimitOrder: (wallet: string, order: LimitOrder) => {
    const orders = protocolStorage.loadLimitOrders(wallet);
    saveArray(wallet, "limit-orders", [order, ...orders.filter((item) => item.id !== order.id)].slice(0, 50));
  },
  updateLimitOrder: (wallet: string, id: string, updates: Partial<LimitOrder>) => {
    const orders = protocolStorage.loadLimitOrders(wallet).map((order) => order.id === id ? { ...order, ...updates, updatedAt: Date.now() } : order);
    saveArray(wallet, "limit-orders", orders);
  },
  loadPaymentLinks: (wallet?: string | null) => loadArray<PaymentLink>(wallet, "payment-links"),
  savePaymentLink: (wallet: string, link: PaymentLink) => {
    const links = protocolStorage.loadPaymentLinks(wallet);
    saveArray(wallet, "payment-links", [link, ...links.filter((item) => item.id !== link.id)].slice(0, 50));
  },
  loadStreams: (wallet?: string | null) => loadArray<StreamPlan>(wallet, "streams"),
  saveStream: (wallet: string, stream: StreamPlan) => {
    const streams = protocolStorage.loadStreams(wallet);
    saveArray(wallet, "streams", [stream, ...streams.filter((item) => item.id !== stream.id)].slice(0, 50));
  },
  updateStream: (wallet: string, id: string, updates: Partial<StreamPlan>) => {
    const streams = protocolStorage.loadStreams(wallet).map((stream) => stream.id === id ? { ...stream, ...updates, updatedAt: Date.now() } : stream);
    saveArray(wallet, "streams", streams);
  },
  loadNotifications: (wallet?: string | null) => loadArray<NotificationRule>(wallet, "notifications"),
  saveNotification: (wallet: string, rule: NotificationRule) => {
    const rules = protocolStorage.loadNotifications(wallet);
    saveArray(wallet, "notifications", [rule, ...rules.filter((item) => item.id !== rule.id)].slice(0, 50));
  },
  updateNotification: (wallet: string, id: string, updates: Partial<NotificationRule>) => {
    const rules = protocolStorage.loadNotifications(wallet).map((rule) => rule.id === id ? { ...rule, ...updates } : rule);
    saveArray(wallet, "notifications", rules);
  },
  loadAutopilotIntents: (wallet?: string | null) => loadArray<AutopilotIntent>(wallet, "autopilot-intents"),
  saveAutopilotIntent: (wallet: string, intent: AutopilotIntent) => {
    const intents = protocolStorage.loadAutopilotIntents(wallet);
    saveArray(wallet, "autopilot-intents", [intent, ...intents.filter((item) => item.id !== intent.id)].slice(0, 25));
  },
};

export function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
