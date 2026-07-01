import { useState, useMemo } from "react";
import {
  Search,
  BookOpen,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  Layers,
  Box,
  Activity,
  Code,
  Server,
  Menu,
  X,
  Bot,
  Droplets,
  TrendingUp,
} from "lucide-react";
import BackButton from "@/components/BackButton";

interface DocSection {
  id: string;
  title: string;
  content: string;
}

interface DocCategory {
  id: string;
  category: string;
  icon: React.ReactNode;
  sections: DocSection[];
}

const docs: DocCategory[] = [
  {
    id: "overview",
    category: "Executive Summary",
    icon: <BookOpen className="h-4 w-4" />,
    sections: [
      {
        id: "what-is-lunex",
        title: "Introduction to Lunex Finance",
        content: `Lunex Finance is a decentralized exchange (DEX) and AI-powered liquidity protocol natively built on the Arc Network — Circle's purpose-built Layer-1 for payments and capital markets. By unifying three Curve-style StableSwap pools, three ERC-4626 yield vaults, native CCTP cross-chain infrastructure, and an autonomous Lunex AI Autopilot agent, Lunex delivers the complete stablecoin financial stack in a single, frictionless interface.

The protocol is built around three stablecoins: USDC, EURC, and USDT — all with 6-decimal precision on Arc. Liquidity flows freely between all three assets through deep, low-slippage pools while depositors earn auto-compounding yield in the corresponding vault.

Gas is paid natively in USDC on Arc. Blocks finalize in under a second. The entire protocol is non-custodial — no seed phrases required when using Circle's passkey-based Modular Wallets.`,
      },
      {
        id: "arc-network",
        title: "The Arc Network Foundation",
        content: `Lunex chose Arc as its native home because it removes the structural barriers that make high-frequency stablecoin DeFi unprofitable at scale.

Key Advantages:
• USDC Gas Economics: Transactions on Arc are paid natively in USDC — predictable, dollar-denominated costs with no native-token volatility.
• Sub-second Finality: Powered by Circle's "Malachite" consensus engine, Arc delivers sub-second finality rivaling centralized finance engines.
• EVM Compatibility: Full EVM execution with battle-tested Solidity tooling, viem, and wagmi.
• Circle-Native Stack: First-class access to CCTP v2, Gateway, Modular Wallets, Gas Station, and the broader Circle developer ecosystem.

Arc Testnet: Chain ID 5042002 — all Lunex contracts are deployed and verified on testnet.arcscan.app.`,
      },
    ],
  },
  {
    id: "amm-swap",
    category: "StableSwap AMM",
    icon: <RefreshCw className="h-4 w-4" />,
    sections: [
      {
        id: "stableswap-mechanics",
        title: "Curve-style StableSwap Architecture",
        content: `Lunex operates three live StableSwap pools, each using a Curve-style invariant that combines constant-product and constant-sum curves with a high amplification coefficient (A = 200).

Active Pools:
• USDC / EURC — Dollar-to-euro stablecoin pool.
• USDC / USDT — Dollar stablecoin parity pool.
• EURC / USDT — Euro stablecoin to USDT pool.

Invariant Mechanics:
The StableSwap formula A·n^n·Σx + D = A·n^n·D + D^(n+1)/(n^n·Πx) is solved iteratively via Newton's method. The high amplification factor keeps the exchange rate curve nearly flat near the 1:1 peg, ensuring trades between stable assets experience near-zero price impact. Slippage on trades up to $50,000 is typically negligible.

Fee Structure:
Swap fee: 0.04% per trade (4,000,000 / 1e10). Of each fee: 50% distributes to liquidity providers proportional to pool share, and 50% accrues to the protocol fee receiver.`,
      },
      {
        id: "price-charts",
        title: "Live TradingView Price Charts",
        content: `The Swap page embeds a live TradingView price chart that automatically updates whenever you change the selected token pair. The chart displays real exchange-rate data sourced from Binance — giving you a professional view of the current rate before you execute.

Pair Mapping:
• EURC / USDC → BINANCE:EURCUSDT (EURC priced in Tether, a USD proxy)
• EURC / USDT → BINANCE:EURCUSDT
• USDC / USDT → BINANCE:USDCUSDT

The chart supports the full TradingView feature set: multiple time intervals (1 minute through 1 week), volume overlay, and a date range selector. The chart theme automatically matches your light or dark mode preference.

Note: EURC/USDC is mapped to BINANCE:EURCUSDT because Tether is the most liquid USD proxy for EURC on Binance. The EURCUSDT chart accurately represents the EURC/USD exchange rate in a crypto-native context.`,
      },
      {
        id: "executing-swaps",
        title: "Executing Swaps",
        content: `Swapping on Lunex is atomic and deterministic:

1. Connect your wallet (passkey, email/PIN, or external EOA via RainbowKit).
2. Select the input and output token (USDC, EURC, or USDT).
3. Enter the amount — a live quote is fetched from the on-chain pool using get_dy().
4. Set slippage tolerance (default 0.5% for stable-to-stable pairs).
5. Confirm the transaction — the swap reverts automatically if execution falls below your minimum received threshold.

Gas is paid in USDC on Arc. Passkey users transact gaslessly via Circle Gas Station. Typical swap latency is under 2 seconds due to Arc's sub-second block finality.

The quote shown in the UI is sourced directly from on-chain pool state — no off-chain price oracle or trust assumption is involved.`,
      },
    ],
  },
  {
    id: "lunex-ai",
    category: "Lunex AI — Autopilot",
    icon: <Bot className="h-4 w-4" />,
    sections: [
      {
        id: "autopilot-overview",
        title: "What is Lunex AI?",
        content: `Lunex AI (Autopilot) is an autonomous AI agent embedded in the protocol at /autopilot. Powered by Claude (Anthropic), the agent understands natural-language instructions and executes real on-chain transactions on your behalf — swaps, bridges, liquidity operations, vault deposits/withdrawals, and native token top-ups.

The Autopilot interface has three views:

Dashboard: A live portfolio overview showing your wallet balances, LP positions, vault holdings, and a scrollable action card feed of every transaction the agent has executed. A spend-rate gauge tracks how much USDC the agent has consumed against your authorized limit.

Chat: A conversational interface where you type instructions in plain English — for example, "Swap 50 USDC to EURC, then deposit the EURC into the EURC vault." The agent reasons through your request, shows its decision with a full reasoning trace, and executes — or asks for clarification when something is ambiguous.

Decision Log: Every agent decision is recorded with a full audit trail: the input, the parsed intent, the chosen action, the transaction hash, and the final outcome.`,
      },
      {
        id: "autopilot-authorization",
        title: "Agent Authorization & Spending Limits",
        content: `Lunex AI requires explicit on-chain authorization before it can act on your behalf. Authorization is managed through a purpose-built AgentExecutor smart contract that enforces a hard USDC spending ceiling.

Authorization Flow:
1. Navigate to /autopilot and connect your wallet.
2. Set a USDC spending limit (e.g., 100 USDC) — the maximum the agent can spend in an authorized session.
3. Approve the AgentExecutor contract to spend USDC from your wallet (standard ERC-20 approval).
4. Authorize the agent — this writes your spending limit to the contract on-chain.
5. A green "Authorized" badge appears in the header. The agent is now active.

Revoking Authorization:
Toggle the authorization switch in the Autopilot header at any time. Revocation is instant and permanent until you re-authorize — the agent cannot execute any further transactions after revocation.

The spending limit is enforced on-chain: the AgentExecutor contract reverts any transaction that would cause cumulative USDC outflows to exceed the authorized amount. The agent has no ability to circumvent this limit.`,
      },
      {
        id: "autopilot-actions",
        title: "Available Agent Actions",
        content: `The Lunex AI agent supports the following on-chain operations:

Swap: Exchange any supported stablecoin pair (USDC/EURC, USDC/USDT, EURC/USDT) via the Lunex StableSwap pool. The agent automatically selects the correct pool and encodes the exchange() call with slippage protection.

Bridge: Transfer USDC across supported CCTP chains. The agent can initiate a bridge from Arc to Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, Avalanche Fuji, or Polygon Amoy.

Add Liquidity: Deposit stablecoins into any Lunex pool. The agent calculates the optimal split and calls add_liquidity() with a minimum LP output guard.

Remove Liquidity: Withdraw an LP position — either balanced proportional removal or single-sided via remove_liquidity_one_coin().

Deposit to Vault: Deposit USDC, EURC, or USDT into the corresponding ERC-4626 yield vault (luneUSDC, luneEURC, or luneUSDT).

Withdraw from Vault: Redeem vault shares and receive the underlying stablecoin at the current price-per-share.

Native Top-Up: Request a small ARC native token airdrop via the LunexNativeTopUpRelayer to ensure your wallet can pay gas on Arc.

All actions display a confirmation card before execution, including the encoded calldata and expected outcome. Authorization is always required.`,
      },
    ],
  },
  {
    id: "bridge",
    category: "Cross-Chain Bridge",
    icon: <Activity className="h-4 w-4" />,
    sections: [
      {
        id: "cctp-integration",
        title: "Circle CCTP v2 Integration",
        content: `Liquidity fragmentation is solved via native integration of Circle's Cross-Chain Transfer Protocol (CCTP v2) — the burn-and-mint mechanism that moves native USDC between chains with zero slippage and no wrapped-asset risk.

How CCTP Works:
USDC is burned on the source chain. Circle's attestation service cryptographically confirms the burn. USDC is then natively minted on the destination chain. You receive exactly the amount you sent — no intermediary token, no synthetic risk.

Supported Networks:
• Arc Testnet — Chain ID 5042002 · CCTP Domain 26 (native)
• Ethereum Sepolia — Domain 0
• Avalanche Fuji — Domain 1
• Arbitrum Sepolia — Domain 3
• Base Sepolia — Domain 6
• Polygon PoS Amoy — Domain 7

Transfer Modes:
Standard Transfer: Circle attestation completes in 1–3 minutes.
Fast Transfer: Accelerated path for lower-latency cross-chain moves.

Recovery Flow:
Any interrupted bridge transfer can be resumed from its originating transaction hash. The Recovery panel scans all supported chains for pending MessageSent / DepositForBurn events and resumes attestation automatically.

Bridge History: All bridge activity is decoded from on-chain events — no off-chain database required.`,
      },
      {
        id: "gateway",
        title: "Circle Gateway",
        content: `Circle Gateway provides a unified USDC balance across multiple chains through a single Gateway Wallet, available on the Bridge page under the Gateway tab.

How it works:
Deposit USDC into your Gateway Wallet from any supported chain. The balance becomes accessible on all chains simultaneously — mint USDC on the destination chain instantly via Circle's Forwarding Service (sub-second) or at standard attestation speed.

Pending and confirmed balances are surfaced separately so deposits are visible while finalizing. The Lunex Gateway panel integrates Circle's unified-balance-kit and adapter-viem-v2 SDKs directly.

Use Case: Gateway is ideal when you need USDC available on multiple chains simultaneously — for example, providing liquidity on Arc while keeping a reserve on Ethereum — without executing individual CCTP transfers each time.`,
      },
    ],
  },
  {
    id: "vaults",
    category: "ERC-4626 Yield Vaults",
    icon: <Box className="h-4 w-4" />,
    sections: [
      {
        id: "vault-architecture",
        title: "Tokenized Vault Architecture",
        content: `Lunex implements the ERC-4626 tokenized vault standard for all three protocol stablecoins, giving passive depositors auto-compounding yield with a single deposit transaction.

Available Vaults:
• luneUSDC (0x66CF…9496) — Deposits USDC and mints luneUSDC shares.
• luneEURC (0xcF2C…8713) — Deposits EURC and mints luneEURC shares.
• luneUSDT (0x6081…19dD) — Deposits USDT and mints luneUSDT shares.

ERC-4626 Mechanics:
Vault shares represent a proportional claim on the underlying assets. As accrued swap fees and protocol incentives are reinvested, the price-per-share increases — depositors automatically compound yield without manual intervention.

Because vault tokens adhere to the ERC-4626 standard, they are composable across DeFi — suitable for use as collateral, in yield aggregators, or in other protocol integrations without custom adapter logic.

All three vaults are deployed and verified on Arc Testnet. Vault shares are freely transferable and tradeable as standard ERC-20 tokens.`,
      },
      {
        id: "vault-detail-pages",
        title: "Vault Detail Pages",
        content: `Each vault has a dedicated detail page accessible at /yield/USDC, /yield/EURC, and /yield/USDT.

Information Displayed:
• Current TVL — total assets under management in the vault.
• Price per Share — current exchange rate between vault shares and the underlying token. This increases as fees compound.
• Annualized APY — estimated yield based on recent fee accrual rate.
• Your Holdings — your personal vault balance in both shares and underlying value, plus your share of the total vault.

Deposit & Withdraw:
Use the deposit/withdraw panel on the detail page to add or remove assets. The vault page previews the expected vault share output before you confirm. Withdrawals burn vault shares and return the proportional underlying stablecoin at the current price-per-share.`,
      },
    ],
  },
  {
    id: "faucet",
    category: "Testnet Faucet",
    icon: <Droplets className="h-4 w-4" />,
    sections: [
      {
        id: "usdt-faucet",
        title: "USDT Testnet Faucet",
        content: `The Lunex faucet at /faucet provides testnet USDT so you can explore the full protocol without acquiring real assets.

How to Claim:
1. Navigate to /faucet and connect your wallet.
2. Click "Claim 1,000 USDT" — the transaction calls the faucet function on the USDT contract directly.
3. 1,000 USDT (6 decimals) is immediately credited to your wallet on Arc Testnet.
4. A 24-hour cooldown begins. The faucet page shows a live countdown timer (hours, minutes, seconds).
5. Once the countdown reaches zero, you can claim again.

Technical Details:
• Token: USDT (LunexUSDT) at 0x59125072f5692DdF22c99514805D1232C3999646
• Claim Amount: 1,000 USDT per transaction
• Cooldown: 24 hours (86,400 seconds) per wallet address, enforced on-chain
• Network: Arc Testnet (Chain ID 5042002)

The cooldown is tracked in the USDT contract itself via a cooldownRemaining(address) view function — no off-chain state or backend is involved.

After claiming, you can immediately use your USDT to:
• Swap USDT to USDC or EURC via the USDC/USDT or EURC/USDT pool.
• Deposit into the luneUSDT vault for auto-compounding yield.
• Provide liquidity to the USDC/USDT or EURC/USDT pool.`,
      },
    ],
  },
  {
    id: "liquidity",
    category: "Liquidity Provision (LP)",
    icon: <Layers className="h-4 w-4" />,
    sections: [
      {
        id: "lp-mechanics",
        title: "Providing Liquidity",
        content: `Liquidity providers (LPs) supply stablecoins to one or more Lunex pools to facilitate trading. In return, LPs earn a proportional share of every swap fee generated by that pool.

Active Pools:
• USDC / EURC — 0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8
• USDC / USDT — 0x8e60d788955CaBb247D2c003C77AdAF44C566cD3
• EURC / USDT — 0xF04E8D25BF97cda82147596ba887bdF793F574DD

Adding Liquidity:
Deposits can be balanced (proportional to current reserves) or single-sided. Single-sided deposits may incur a small fee to maintain pool balance. Upon deposit, LP tokens are minted representing your proportional pool share.

Removing Liquidity:
LPs can withdraw proportionally via remove_liquidity() or single-sided via remove_liquidity_one_coin(). Single-sided withdrawals incur a small slippage cost that accrues to remaining LPs.

Fee Distribution:
Swap fee: 0.04% per trade.
LP share: 50% of the swap fee distributes to LPs proportionally by pool share.
Protocol fee: 50% accrues to the admin fee receiver and is withdrawable by the pool owner.

Dashboard Transparency:
The Pool page shows real-time TVL, 24h volume, per-pool reserves, and your current LP position and pool share percentage — all sourced live from on-chain contract state.`,
      },
    ],
  },
  {
    id: "developer-sdk",
    category: "Developer SDK & APIs",
    icon: <Code className="h-4 w-4" />,
    sections: [
      {
        id: "sdk-integration",
        title: "Lunex SDK (DEX Adapter)",
        content: `The Lunex DEX Adapter SDK is a RESTful API that enables aggregators, bots, and third-party integrations to interact programmatically with the Lunex protocol.

Key Endpoints:
• GET /dex-adapter-info — Protocol metadata, supported tokens, and fee structure.
• GET /dex-quote — Real-time swap quote from the on-chain pool (mirrors get_dy()).
• POST /dex-swap — Generate an unsigned swap transaction for wallet execution.
• GET /dex-liquidity — Pool reserves, TVL, and LP token supply.
• GET /dex-price — Current exchange rates with 24h change data.

Authentication:
Pass your API key via the x-api-key request header. Rate limits apply per key to ensure protocol stability.

All three pools (USDC/EURC, USDC/USDT, EURC/USDT) are accessible via the same SDK surface using from and to query parameters. The SDK powers DEX aggregator integrations and forms the programmatic backbone of the Lunex AI Autopilot agent.`,
      },
      {
        id: "mcp",
        title: "Model Context Protocol (MCP) Server",
        content: `The Lunex MCP server (/mcp-server) exposes the protocol as a structured tool set for AI agents over the Model Context Protocol — the emerging standard for LLM-to-tool communication.

Starting the MCP server:
npm run mcp

Available Tools:
• get_lunex_pools — Fetch real-time TVL, APY, reserves, and health for all three pools.
• get_unified_balance — Retrieve a cross-chain USDC balance consolidated across all supported networks.
• execute_swap_intent — Encode and return calldata for an agent-driven swap transaction.

The MCP server underpins the Lunex AI Autopilot. External AI agents can connect to this server and autonomously research pool state, check balances, and construct swap transactions without parsing contract ABIs directly.

Paired with Circle's x402 nanopayment standard, the MCP server will enable fully autonomous micro-transaction workflows — AI agents that harvest yields, rebalance portfolios, and bridge funds across chains without manual intervention.`,
      },
    ],
  },
  {
    id: "technical",
    category: "Technical Architecture",
    icon: <Server className="h-4 w-4" />,
    sections: [
      {
        id: "frontend-stack",
        title: "Frontend Technology Stack",
        content: `Lunex is built on a modern React + TypeScript stack optimized for on-chain data responsiveness and professional aesthetics.

Core Framework:
• React 18 (Vite) with TypeScript — strict type safety throughout the codebase.
• Tailwind CSS + Radix UI + shadcn/ui — component primitives with a refined design language.
• Framer Motion — micro-animations and seamless state transitions.

Blockchain Layer:
• wagmi + viem — type-safe contract reads/writes and transaction management.
• RainbowKit — external wallet connections (MetaMask, WalletConnect, Coinbase).
• Circle SDKs: modular-wallets-core (passkey ERC-4337), w3s-pw-web-sdk (email/PIN), unified-balance-kit + adapter-viem-v2 (Gateway), app-kit.

Data & State:
• TanStack Query — on-chain data caching and background refetching.
• React Router v6 — client-side navigation.
• TradingView — embedded price chart widget on the Swap page.
• Recharts — analytics and time-series charts on the Analytics page.

Analytics: A deterministic on-chain indexer reads Lunex contract event logs from Arc's block explorer. All TVL, volume, and fee metrics are decoded directly from events — no trusted off-chain database is required for the protocol's core data surfaces.`,
      },
      {
        id: "security",
        title: "Security & Verified Contracts",
        content: `All Lunex core contracts are deployed and verified on Arc Testnet (testnet.arcscan.app).

Verified Contracts:
• StableSwap (USDC/EURC): 0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8
• StableSwap (USDC/USDT): 0x8e60d788955CaBb247D2c003C77AdAF44C566cD3
• StableSwap (EURC/USDT): 0xF04E8D25BF97cda82147596ba887bdF793F574DD
• LP Token (USDC/USDT): 0x360427f34b3FC6Bbbf79E32879533136BF7d84Cf
• LP Token (EURC/USDT): 0x1693084fA4CEC8abD2159F0a97eC167DF1a0fe0e
• luneUSDC Vault: 0x66CF9CA9D75FD62438C6E254bA35E61775EF9496
• luneEURC Vault: 0xcF2C839B12ECf6D9eEcd4607521B73fcFb7E8713
• luneUSDT Vault: 0x60810D1a8b40B78EA82Ea16CA356DE7eD9eb19dD
• Limit Order Keeper: 0x206D5E8f126ba083b8274fd46834801aF8CB9451
• USDT Token (Faucet): 0x59125072f5692DdF22c99514805D1232C3999646

Security Practices:
• OpenZeppelin libraries for all ERC-20, ERC-4626, AccessControl, and ReentrancyGuard implementations.
• Reentrancy guards (nonReentrant modifier) on every state-changing operation.
• Role-based access control separating admin, minter, and keeper roles.
• Non-custodial: users hold their own keys at all times. The AgentExecutor operates only within an explicitly authorized, on-chain-enforced USDC spending limit.
• Secrets isolation: Circle entity secrets and API keys live exclusively in the backend service — the frontend bundle contains no private credentials.

Mainnet Preparation:
Third-party audit, bug bounty program, and time-locked multi-sig governance are planned prior to Arc mainnet launch.`,
      },
    ],
  },
];

// Flat ordered list of every doc section, for the hamburger menu + prev/next.
const ALL_SECTIONS = docs.flatMap((cat) => cat.sections.map((s) => ({ ...s, category: cat.category })));

function renderContent(content: string) {
  const paragraphs = content.split('\n\n');
  return paragraphs.map((para, pIdx) => {
    const lines = para.split('\n').filter((l) => l !== '');
    if (!lines.length) return null;

    return (
      <div key={pIdx} className="mb-5 last:mb-0">
        {lines.map((line, i) => {
          const trimmed = line.trim();

          // Bullet point
          if (trimmed.startsWith('•')) {
            return (
              <div key={i} className="flex items-start gap-2.5 py-[3px]">
                <span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                <span className="leading-relaxed text-muted-foreground">{trimmed.slice(1).trim()}</span>
              </div>
            );
          }

          // Numbered step
          const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
          if (numMatch) {
            return (
              <div key={i} className="flex items-start gap-2.5 py-[3px]">
                <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                  {numMatch[1]}
                </span>
                <span className="leading-relaxed text-muted-foreground">{numMatch[2]}</span>
              </div>
            );
          }

          // Code-like line (shell commands or HTTP verbs)
          if (/^(npm |node |GET |POST |PUT |DELETE |cd )/.test(trimmed)) {
            return (
              <div key={i} className="my-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5 font-mono text-xs text-foreground/80">
                {trimmed}
              </div>
            );
          }

          // Sub-header: short line ending with : that contains no period
          if (trimmed.endsWith(':') && trimmed.length < 60 && !trimmed.includes('. ') && !trimmed.startsWith('0x')) {
            return (
              <p key={i} className={`text-sm font-semibold text-foreground${i > 0 ? ' mt-4' : ''}`}>
                {trimmed}
              </p>
            );
          }

          // Regular text
          return (
            <p key={i} className="leading-relaxed text-muted-foreground">
              {trimmed}
            </p>
          );
        })}
      </div>
    );
  });
}

const Docs = () => {
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<string>("what-is-lunex");
  const [navOpen, setNavOpen] = useState(false);

  const currentIndex = ALL_SECTIONS.findIndex((s) => s.id === activeSection);
  const prevSection = currentIndex > 0 ? ALL_SECTIONS[currentIndex - 1] : null;
  const nextSection = currentIndex < ALL_SECTIONS.length - 1 ? ALL_SECTIONS[currentIndex + 1] : null;
  const goTo = (id: string) => {
    setActiveSection(id);
    setNavOpen(false);
    setSearch("");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return docs;
    const q = search.toLowerCase();
    return docs
      .map((cat) => ({
        ...cat,
        sections: cat.sections.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.content.toLowerCase().includes(q) ||
            cat.category.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.sections.length > 0);
  }, [search]);

  const activeDoc = useMemo(() => {
    for (const cat of docs) {
      for (const s of cat.sections) {
        if (s.id === activeSection) return s;
      }
    }
    return docs[0]?.sections[0];
  }, [activeSection]);

  const isSearching = search.trim().length > 0;

  return (
    <div className="page-fade-in min-h-[calc(100vh-3.5rem)]">
      {/* Hamburger drawer — mobile only */}
      {navOpen && (
        <div className="lg:hidden">
          <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={() => setNavOpen(false)} />
          <aside className="fixed left-0 top-0 z-[70] h-screen w-72 max-w-[80vw] overflow-y-auto border-r border-border bg-card p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-primary">Documentation</span>
              <button onClick={() => setNavOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            {docs.map((cat) => (
              <div key={cat.id} className="mb-5">
                <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span className="text-primary/70">{cat.icon}</span> {cat.category}
                </p>
                <div className="space-y-0.5">
                  {cat.sections.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => goTo(s.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all ${
                        activeSection === s.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      }`}
                    >
                      {activeSection === s.id && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                      <span className="truncate">{s.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </aside>
        </div>
      )}

      <div className="container max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <BackButton />

        {/* Header */}
        <div className="mb-10 border-b border-border pb-8 mt-4 text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            <button
              onClick={() => setNavOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-primary transition-colors shrink-0 lg:hidden"
              aria-label="Open docs menu"
              title="All sections"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <BookOpen className="h-7 w-7" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Lunex Documentation</h1>
          </div>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto">
            Guides, integration references, and architectural overviews for the Lunex Finance protocol on Arc Network.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-10 max-w-2xl mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documentation..."
            className="w-full pl-12 pr-4 py-3.5 text-sm border border-border bg-card/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all rounded-xl shadow-sm"
          />
        </div>

        <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10 lg:items-start">
          {/* Persistent desktop sidebar */}
          <aside className="hidden lg:block sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">
            {docs.map((cat) => (
              <div key={cat.id} className="mb-5">
                <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span className="text-primary/70">{cat.icon}</span> {cat.category}
                </p>
                <div className="space-y-0.5">
                  {cat.sections.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => goTo(s.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all ${
                        activeSection === s.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      }`}
                    >
                      {activeSection === s.id && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                      <span className="truncate">{s.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </aside>

          <div className="min-w-0">
            {isSearching ? (
              /* Search Results */
              <div className="max-w-4xl">
                {filtered.length === 0 ? (
                  <div className="text-center py-16 bg-card/30 border border-border rounded-xl">
                    <Search className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No matching documents found for "{search}"</p>
                  </div>
                ) : (
                  filtered.map((cat) => (
                    <div key={cat.id} className="mb-10">
                      <h2 className="text-xs font-bold uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
                        {cat.icon}
                        <span>{cat.category}</span>
                      </h2>
                      <div className="grid gap-3">
                        {cat.sections.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => { setActiveSection(s.id); setSearch(""); }}
                            className="w-full text-left border border-border bg-card hover:border-primary/40 hover:bg-muted/20 p-5 transition-all rounded-xl shadow-sm"
                          >
                            <p className="text-base font-semibold text-foreground mb-2">{s.title}</p>
                            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{s.content.slice(0, 160)}...</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* Article + Prev / Next */
              <div className="flex flex-col">
                <main className="flex-1 min-w-0 max-w-4xl mx-auto w-full">
                  {activeDoc && (
                    <article className="border border-border bg-card/40 rounded-2xl p-6 sm:p-10 shadow-sm">
                      <h2 className="text-2xl font-bold text-foreground mb-6 tracking-tight">{activeDoc.title}</h2>
                      <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none text-sm">
                        {renderContent(activeDoc.content)}
                      </div>
                    </article>
                  )}

                  {/* Prev / Next navigation */}
                  <div className="mt-8 grid grid-cols-2 gap-4">
                    {prevSection ? (
                      <button
                        onClick={() => goTo(prevSection.id)}
                        className="group flex flex-col items-start gap-1 rounded-xl border border-border bg-card/40 p-4 text-left transition-all hover:border-primary/40 hover:bg-muted/20"
                      >
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          <ChevronLeft className="h-3 w-3" /> Previous
                        </span>
                        <span className="text-sm font-semibold text-foreground group-hover:text-primary line-clamp-1">{prevSection.title}</span>
                      </button>
                    ) : <div />}
                    {nextSection ? (
                      <button
                        onClick={() => goTo(nextSection.id)}
                        className="group flex flex-col items-end gap-1 rounded-xl border border-border bg-card/40 p-4 text-right transition-all hover:border-primary/40 hover:bg-muted/20"
                      >
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Next <ChevronRight className="h-3 w-3" />
                        </span>
                        <span className="text-sm font-semibold text-foreground group-hover:text-primary line-clamp-1">{nextSection.title}</span>
                      </button>
                    ) : <div />}
                  </div>
                </main>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Docs;
