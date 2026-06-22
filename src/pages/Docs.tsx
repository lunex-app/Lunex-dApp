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
  Shield,
  Terminal,
  Server,
  Menu,
  X
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
        content: `Lunex Finance is a next-generation decentralized exchange (DEX) protocol natively built on the Arc Network. By synthesizing a highly optimized Curve-style StableSwap AMM, zero-slippage cross-chain infrastructure, and ERC-4626 yield vaults, Lunex aims to be the premier liquidity and yield hub for the stablecoin economy.

In a Web3 landscape plagued by fragmented liquidity, steep bridging fees, and complicated interfaces, Lunex stands out by offering a premium, frictionless user experience. We abstract away the heavy lifting, allowing retail users and institutions alike to seamlessly bridge stablecoins, provision liquidity, and farm yields across multiple ecosystems from a single, unified dashboard.`,
      },
      {
        id: "arc-network",
        title: "The Arc Network Foundation",
        content: `Lunex chose the Arc Network as its native home because of its revolutionary approach to blockchain infrastructure. Developed by Circle (the issuer of USDC), Arc is a purpose-built Layer 1 blockchain designed specifically for payments, capital markets, and institutional finance.

Key Advantages:
• USDC Gas Economics: Transactions on Arc are paid natively in USDC, giving predictable, dollar-denominated transaction costs.
• Sub-second Finality: Powered by the "Malachite" consensus engine, Arc delivers sub-second finality, rivaling centralized finance engines.
• EVM Compatibility: Harnesses battle-tested security standards while benefiting from next-level execution speeds.`,
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
        content: `At the heart of the DEX is a specialized Automated Market Maker (AMM) optimized specifically for stablecoin pairs (e.g., USDC, EURC). 

Utilizing an invariant curve design similar to Curve Finance, this AMM drastically minimizes slippage and impermanent loss, making it highly capital-efficient for traders executing large swaps.

Invariant Mechanics:
The protocol uses a hybrid curve combining constant-product (x*y=k) with constant-sum (x+y=k). A high amplification coefficient (A) keeps the curve flat near the 1:1 peg, ensuring that swaps between stable assets experience near-zero price impact.`,
      },
      {
        id: "executing-swaps",
        title: "Executing Swaps",
        content: `Swapping on Lunex is atomic and deterministic:
1. Quote Generation: Output is calculated using live onchain pricing.
2. Slippage Tolerance: Users define acceptable price deviation thresholds (e.g., 0.1% for stable pairs). If execution falls below the minimum received threshold, the transaction reverts to protect the user.
3. Execution: Gas fees are paid natively in USDC. Trades under $50,000 typically experience negligible impact.`,
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
        title: "Circle CCTP Integration",
        content: `Liquidity fragmentation is solved via our native integration of Circle's Cross-Chain Transfer Protocol (CCTP).

Supported Networks:
• Arc Testnet (Native deployment)
• Ethereum Sepolia
• Base Sepolia
• Arbitrum Sepolia
• Avalanche Fuji
• Polygon PoS Amoy

Zero-Slippage Routing:
Users can bridge native USDC from any supported network directly into the Lunex ecosystem on Arc with exactly 0 slippage. Rather than relying on wrapped or synthetic risk models, CCTP burns USDC on the origin chain and natively mints it on the destination chain following Circle's attestation.`,
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
        content: `Lunex implements the ERC-4626 tokenized vault standard, giving users one-click access to complex yield-bearing strategies.

Available Vaults:
• USDC Vault: Deposits USDC to mint luneUSDC shares.
• EURC Vault: Deposits EURC to mint luneEURC shares.

Auto-compounding Mechanics:
Vaults automatically reinvest accrued swap fees and protocol incentives back into the underlying liquidity positions, maximizing APY for passive users. Because they adhere to the ERC-4626 standard, Lunex Vault tokens can easily be plugged into other DeFi protocols as collateral.`,
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
        content: `Liquidity providers (LPs) supply assets to the StableSwap pools to facilitate trading. In exchange, they earn a portion of every swap fee generated.

Dashboard Transparency:
The Lunex frontend offers real-time tracking of TVL, 24h volume, and liquidity reserves, synced dynamically via a Supabase back-end. LPs can watch their revenue split compound in real-time.

Reward Accrual:
Beyond transaction fees (4.00% standard fee routed to LPs), protocol liquidity incentives (paid in the native $LUNEX token) accrue constantly and can be easily claimed directly from the user interface.`,
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
        content: `To become foundational infrastructure, Lunex provides a comprehensive integration toolkit. The Lunex SDK is a RESTful API that enables DEX aggregators and external applications to integrate programmatically.

Key Endpoints:
• GET /dex-adapter-info: Discovery and metadata
• GET /dex-quote: Retrieve real-time swap quotes from the onchain pool
• POST /dex-swap: Generate unsigned swap transactions for wallet execution
• GET /dex-liquidity: Monitor pool reserves and TVL
• GET /dex-price: Current exchange rates with 24h data

Authentication:
Endpoints require an API key passed via the 'x-api-key' header. Rate limiting applies per key to ensure protocol stability.`,
      },
      {
        id: "mcp",
        title: "Model Context Protocol (MCP)",
        content: `The Lunex MCP server acts as a gateway for AI agents (like Claude or autonomous bots) to interact directly with the Lunex protocol.

Agentic Workflows:
Paired with Circle's upcoming x402 nanopayment tools, our SDK and MCP implementation will enable AI agents to execute micro-transactions, harvest yields, and auto-balance portfolios autonomously.

Available Context Tools:
• get_lunex_pools: Fetch real-time TVL, APY, and pool health.
• get_unified_balance: Cross-chain USDC balance consolidation.
• execute_swap_intent: Encode transaction data for agent-driven swaps.`,
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
        title: "Frontend Experience",
        content: `Lunex marries secure smart contract infrastructure with a world-class frontend.

• Framework: Built on React (Vite) with TypeScript for strict type safety.
• Design Aesthetics: Premium, visually excellent styling utilizing Tailwind CSS and Radix UI primitives.
• Dynamic Animations: Framer Motion drives our micro-animations and seamless state transitions.
• Web3 Integration: Wagmi, Viem, and RainbowKit guarantee secure and rapid decentralized reads/writes.
• State Management: React Query (@tanstack) smoothly caches and syncs onchain data.
• Indexed Data Layer: Supabase powers our protocol statistics dashboard, serving historical volumes rapidly without heavy RPC polling.`,
      },
      {
        id: "security",
        title: "Security & Smart Contracts",
        content: `All smart contracts are verified on the Arc Testnet block explorer.

Current Protections:
• OpenZeppelin libraries for ERC-20 and ERC-4626 implementations.
• Reentrancy guards on all state-changing operations.
• Role-based access control for administrative functions.

Mainnet Preparation:
Prior to mainnet launch, the protocol will undergo full third-party smart contract audits, institute a bug bounty program, and implement time-locked multi-sig governance to ensure institutional-grade security.`,
      },
    ],
  },
];

// Flat ordered list of every doc section, for the hamburger menu + prev/next.
const ALL_SECTIONS = docs.flatMap((cat) => cat.sections.map((s) => ({ ...s, category: cat.category })));

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
      {/* Hamburger drawer — mobile only; desktop uses the persistent sidebar */}
      {navOpen && (
        <div className="lg:hidden">
          <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={() => setNavOpen(false)} />
          <aside className="fixed left-0 top-0 z-[70] h-screen w-72 max-w-[80vw] overflow-y-auto border-r border-border bg-card p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-primary">All Features</span>
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
        
        {/* Header Section */}
        <div className="mb-10 border-b border-border pb-8 mt-4 text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            <button
              onClick={() => setNavOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-primary transition-colors shrink-0 lg:hidden"
              aria-label="Open docs menu"
              title="All features"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <BookOpen className="h-7 w-7" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Lunex Developer Documentation</h1>
          </div>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto">
            Official guides, integration protocols, and architectural overviews for the Lunex Finance ecosystem on Arc Network.
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
          {/* Persistent desktop sidebar — replaces the drawer on large screens */}
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
          /* Content + Prev/Next (section list lives in the hamburger drawer) */
          <div className="flex flex-col">
            {/* Main Content Area */}
            <main className="flex-1 min-w-0 max-w-4xl mx-auto w-full">
              {activeDoc && (
                <article className="border border-border bg-card/40 rounded-2xl p-6 sm:p-10 shadow-sm">
                  <h2 className="text-2xl font-bold text-foreground mb-6 tracking-tight">{activeDoc.title}</h2>
                  <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none text-muted-foreground">
                    {activeDoc.content.split('\n\n').map((paragraph, idx) => (
                      <p key={idx} className="mb-4 leading-relaxed">
                        {paragraph.split('\n').map((line, i) => (
                          <span key={i}>
                            {line}
                            {i !== paragraph.split('\n').length - 1 && <br />}
                          </span>
                        ))}
                      </p>
                    ))}
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
