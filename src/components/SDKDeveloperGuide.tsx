import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";

const AVAILABLE_SERVICES = [
  { id: "quote", label: "Quote", description: "Get real-time swap quotes with expected output amounts" },
  { id: "swap", label: "Swap", description: "Generate unsigned swap transactions for on-chain execution" },
  { id: "liquidity", label: "Liquidity", description: "Query pool reserves, TVL, and token balances" },
  { id: "price", label: "Price", description: "Get exchange rates with 24h change data" },
  { id: "webhook", label: "Webhook", description: "Register webhooks for pool reserve change notifications" },
];

const CodeBlock = ({ code, language = "bash" }: { code: string; language?: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative bg-muted/50 border border-border my-3">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="text-[10px] text-muted-foreground tracking-wider uppercase">{language}</span>
        <button onClick={copy} className="text-muted-foreground hover:text-foreground">
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      <pre className="p-3 text-xs font-mono overflow-x-auto whitespace-pre">{code}</pre>
    </div>
  );
};

const Section = ({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border bg-card mb-3">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold tracking-wider uppercase text-left hover:bg-accent/50 transition-colors">
        {open ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        {title}
      </button>
      {open && <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">{children}</div>}
    </div>
  );
};

const SDKDeveloperGuide = () => {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const host = baseUrl?.replace("https://", "") || "your-project.supabase.co";

  return (
    <div className="space-y-4">
      <div className="border border-border bg-card p-4 mb-6">
        <h2 className="text-lg font-bold tracking-wider uppercase mb-2">Lunex SDK — Developer Integration Guide</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Complete reference for integrating Lunex DEX into your application. All endpoints require a valid API key passed via the <code className="bg-muted px-1 py-0.5">x-api-key</code> header.
        </p>
      </div>

      <Section title="1. Getting Started" defaultOpen>
        <p className="mb-3">To integrate Lunex into your application:</p>
        <ol className="list-decimal list-inside space-y-2 mb-3">
          <li><strong>Request an API Key</strong> — Sign up at <code className="bg-muted px-1">/lunexsdk</code>, then submit an API key request selecting the services you need.</li>
          <li><strong>Wait for Approval</strong> — An admin will review and approve your request. You'll see the key in your dashboard once approved.</li>
          <li><strong>Authenticate Requests</strong> — Include your API key in every request header.</li>
        </ol>
        <CodeBlock language="bash" code={`curl -H "x-api-key: lnx_your_api_key" \\
  "${baseUrl || "https://your-project.supabase.co"}/functions/v1/dex-quote?tokenIn=USDC&tokenOut=EURC&amountIn=1000000"`} />
      </Section>

      <Section title="2. Authentication">
        <p className="mb-3">Every request must include the <code className="bg-muted px-1">x-api-key</code> header. Keys are scoped to specific services — attempting to use an endpoint not included in your key's allowed services will return a <strong>403 Forbidden</strong>.</p>
        <CodeBlock language="http" code={`GET /functions/v1/dex-quote?tokenIn=USDC&tokenOut=EURC&amountIn=1000000
Host: ${host}
x-api-key: lnx_your_api_key`} />
        <div className="mt-3 p-3 bg-destructive/5 border border-destructive/20 text-xs">
          <strong className="text-destructive">Important:</strong> Never expose your API key in client-side code. Use a server-side proxy or backend function for production.
        </div>
      </Section>

      <Section title="3. Available Services">
        <p className="mb-3">When requesting an API key, you select which services (endpoints) the key can access:</p>
        <div className="space-y-2">
          {AVAILABLE_SERVICES.map((s) => (
            <div key={s.id} className="flex items-start gap-3 p-2 bg-muted/30 border border-border">
              <code className="bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase shrink-0">{s.id}</code>
              <div>
                <p className="text-xs font-semibold">{s.label}</p>
                <p className="text-[11px] text-muted-foreground">{s.description}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="4. GET /dex-quote — Swap Quotes">
        <p className="mb-2">Returns the expected output amount for a token swap.</p>
        <h4 className="text-xs font-semibold tracking-wider uppercase mt-4 mb-2">Parameters</h4>
        <table className="w-full text-xs border border-border">
          <thead><tr className="bg-muted/30"><th className="text-left p-2 border-b border-border">Param</th><th className="text-left p-2 border-b border-border">Type</th><th className="text-left p-2 border-b border-border">Description</th></tr></thead>
          <tbody>
            <tr><td className="p-2 border-b border-border font-mono">tokenIn</td><td className="p-2 border-b border-border">string</td><td className="p-2 border-b border-border">Input token symbol (USDC, EURC)</td></tr>
            <tr><td className="p-2 border-b border-border font-mono">tokenOut</td><td className="p-2 border-b border-border">string</td><td className="p-2 border-b border-border">Output token symbol</td></tr>
            <tr><td className="p-2 border-b border-border font-mono">amountIn</td><td className="p-2 border-b border-border">string</td><td className="p-2 border-b border-border">Amount in smallest unit (e.g., 1000000 = 1 USDC)</td></tr>
            <tr><td className="p-2 font-mono">slippage</td><td className="p-2">number</td><td className="p-2">Optional. Max slippage in bps (default: 50 = 0.5%)</td></tr>
          </tbody>
        </table>
        <CodeBlock language="bash" code={`curl "${baseUrl || ""}/functions/v1/dex-quote?tokenIn=USDC&tokenOut=EURC&amountIn=1000000&slippage=50" \\
  -H "x-api-key: lnx_your_api_key"`} />
        <h4 className="text-xs font-semibold tracking-wider uppercase mt-4 mb-2">Response</h4>
        <CodeBlock language="json" code={`{
  "tokenIn": "USDC",
  "tokenOut": "EURC",
  "amountIn": "1000000",
  "amountOut": "920000",
  "exchangeRate": "0.9200",
  "priceImpact": "0.15",
  "fee": "3000",
  "feePercent": "0.30",
  "slippage": 50,
  "minimumReceived": "915400",
  "route": ["USDC", "EURC"],
  "protocol": "lunex",
  "timestamp": 1711900000
}`} />
      </Section>

      <Section title="5. POST /dex-swap — Execute Swap">
        <p className="mb-2">Generates an unsigned transaction for executing a swap on-chain.</p>
        <CodeBlock language="bash" code={`curl -X POST "${baseUrl || ""}/functions/v1/dex-swap" \\
  -H "x-api-key: lnx_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tokenIn": "USDC",
    "tokenOut": "EURC",
    "amountIn": "1000000",
    "slippage": 50,
    "userAddress": "0xYourWalletAddress"
  }'`} />
        <h4 className="text-xs font-semibold tracking-wider uppercase mt-4 mb-2">Response</h4>
        <CodeBlock language="json" code={`{
  "tx": {
    "to": "0xRouterContractAddress",
    "data": "0x...",
    "value": "0",
    "gasLimit": "250000",
    "chainId": 84532
  },
  "quote": { ... },
  "userAddress": "0xYourWalletAddress",
  "protocol": "lunex",
  "timestamp": 1711900000
}`} />
      </Section>

      <Section title="6. GET /dex-liquidity — Pool Data">
        <p className="mb-2">Returns current pool reserves, TVL, and token balances. Essential for aggregator dashboards.</p>
        <CodeBlock language="bash" code={`curl "${baseUrl || ""}/functions/v1/dex-liquidity" \\
  -H "x-api-key: lnx_your_api_key"`} />
        <CodeBlock language="json" code={`{
  "pool": "USDC-EURC",
  "reserves": { "USDC": "500000000000", "EURC": "460000000000" },
  "tvl_usd": "960000.00",
  "token0": { "symbol": "USDC", "address": "0x...", "decimals": 6 },
  "token1": { "symbol": "EURC", "address": "0x...", "decimals": 6 },
  "fee_tier": "0.30%",
  "protocol": "lunex",
  "timestamp": 1711900000
}`} />
      </Section>

      <Section title="7. GET /dex-price — Exchange Rates">
        <p className="mb-2">Returns the current exchange rate between USDC and EURC, with 24-hour price change data.</p>
        <CodeBlock language="bash" code={`curl "${baseUrl || ""}/functions/v1/dex-price" \\
  -H "x-api-key: lnx_your_api_key"`} />
        <CodeBlock language="json" code={`{
  "pair": "USDC/EURC",
  "price": "0.9200",
  "price_24h_ago": "0.9180",
  "change_24h": "+0.22%",
  "high_24h": "0.9250",
  "low_24h": "0.9150",
  "volume_24h": "125000.00",
  "protocol": "lunex",
  "timestamp": 1711900000
}`} />
      </Section>

      <Section title="8. POST /dex-webhook — Reserve Notifications">
        <p className="mb-2">Register a webhook URL to receive notifications when pool reserves change significantly (e.g., {">"}5% change).</p>
        <CodeBlock language="bash" code={`curl -X POST "${baseUrl || ""}/functions/v1/dex-webhook" \\
  -H "x-api-key: lnx_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "callback_url": "https://your-app.com/webhook/lunex",
    "events": ["reserve_change", "large_swap"],
    "threshold_percent": 5
  }'`} />
        <h4 className="text-xs font-semibold tracking-wider uppercase mt-4 mb-2">8.1 reserve_change Payload</h4>
        <CodeBlock language="json" code={`{
  "event": "reserve_change",
  "pool": "USDC-EURC",
  "previous_reserves": { "USDC": "500000000000", "EURC": "460000000000" },
  "current_reserves": { "USDC": "525000000000", "EURC": "445000000000" },
  "change_percent": "5.2",
  "timestamp": 1711900000
}`} />
        <h4 className="text-xs font-semibold tracking-wider uppercase mt-4 mb-2">8.2 large_swap Payload</h4>
        <CodeBlock language="json" code={`{
  "event": "large_swap",
  "pool": "USDC-EURC",
  "swap": {
    "tokenIn": "USDC",
    "tokenOut": "EURC",
    "amountIn": "100000000000",
    "amountOut": "91540000000",
    "usd_value": "100000.00"
  },
  "price_impact": "2.5",
  "timestamp": 1711900000
}`} />
        <h4 className="text-xs font-semibold tracking-wider uppercase mt-4 mb-2">Webhook Events</h4>
        <table className="w-full text-xs border border-border">
          <thead><tr className="bg-muted/30"><th className="text-left p-2 border-b border-border">Event</th><th className="text-left p-2 border-b border-border">Trigger</th></tr></thead>
          <tbody>
            <tr><td className="p-2 border-b border-border font-mono">reserve_change</td><td className="p-2 border-b border-border">Pool reserves change by threshold %</td></tr>
            <tr><td className="p-2 font-mono">large_swap</td><td className="p-2">Single swap exceeds 50k USD equivalent</td></tr>
          </tbody>
        </table>
      </Section>

      <Section title="9. Rate Limits">
        <p className="mb-3">API requests are rate-limited to ensure fair usage:</p>
        <table className="w-full text-xs border border-border">
          <thead><tr className="bg-muted/30"><th className="text-left p-2 border-b border-border">Tier</th><th className="text-left p-2 border-b border-border">Requests/min</th><th className="text-left p-2 border-b border-border">Daily Limit</th></tr></thead>
          <tbody>
            <tr><td className="p-2 border-b border-border">Developer</td><td className="p-2 border-b border-border">60</td><td className="p-2 border-b border-border">10,000</td></tr>
            <tr><td className="p-2">Admin</td><td className="p-2">120</td><td className="p-2">Unlimited*</td></tr>
          </tbody>
        </table>
        <p className="mt-2 text-[10px] text-muted-foreground">*Subject to fair use policy. Contact support for {">"}100k daily requests.</p>
        <p className="mt-3 text-xs">When rate-limited, the API returns <code className="bg-muted px-1">429 Too Many Requests</code>. Implement exponential backoff in your integration.</p>
      </Section>

      <Section title="10. Error Handling">
        <p className="mb-3">All errors follow a consistent format:</p>
        <CodeBlock language="json" code={`{
  "error": "Human-readable error message",
  "code": "INVALID_TOKEN",
  "details": { ... }
}`} />
        <table className="w-full text-xs border border-border mt-3">
          <thead><tr className="bg-muted/30"><th className="text-left p-2 border-b border-border">Status</th><th className="text-left p-2 border-b border-border">Code</th><th className="text-left p-2 border-b border-border">Meaning</th></tr></thead>
          <tbody>
            <tr><td className="p-2 border-b border-border font-mono">400</td><td className="p-2 border-b border-border font-mono">INVALID_TOKEN</td><td className="p-2 border-b border-border">Token symbol not recognized</td></tr>
            <tr><td className="p-2 border-b border-border font-mono">400</td><td className="p-2 border-b border-border font-mono">INSUFFICIENT_LIQUIDITY</td><td className="p-2 border-b border-border">Pool cannot fulfill request</td></tr>
            <tr><td className="p-2 border-b border-border font-mono">400</td><td className="p-2 border-b border-border font-mono">INVALID_AMOUNT</td><td className="p-2 border-b border-border">Amount format invalid or zero</td></tr>
            <tr><td className="p-2 border-b border-border font-mono">401</td><td className="p-2 border-b border-border font-mono">MISSING_API_KEY</td><td className="p-2 border-b border-border">No x-api-key header provided</td></tr>
            <tr><td className="p-2 border-b border-border font-mono">401</td><td className="p-2 border-b border-border font-mono">INVALID_API_KEY</td><td className="p-2 border-b border-border">API key format invalid</td></tr>
            <tr><td className="p-2 border-b border-border font-mono">403</td><td className="p-2 border-b border-border font-mono">UNAUTHORIZED_SERVICE</td><td className="p-2 border-b border-border">Key not scoped for this endpoint</td></tr>
            <tr><td className="p-2 border-b border-border font-mono">403</td><td className="p-2 border-b border-border font-mono">KEY_REVOKED</td><td className="p-2 border-b border-border">API key has been revoked</td></tr>
            <tr><td className="p-2 border-b border-border font-mono">429</td><td className="p-2 border-b border-border font-mono">RATE_LIMIT_EXCEEDED</td><td className="p-2 border-b border-border">Too many requests</td></tr>
            <tr><td className="p-2 border-b border-border font-mono">500</td><td className="p-2 border-b border-border font-mono">INTERNAL_ERROR</td><td className="p-2 border-b border-border">Server error, retry with backoff</td></tr>
            <tr><td className="p-2 font-mono">503</td><td className="p-2 font-mono">CCTP_UNAVAILABLE</td><td className="p-2">Circle attestation service down</td></tr>
          </tbody>
        </table>
      </Section>

      <Section title="11. Integration Example (JavaScript)">
        <CodeBlock language="typescript" code={`class LunexSDK {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async request(endpoint: string, params?: Record<string, string>) {
    const url = new URL(\`\${this.baseUrl}/functions/v1/\${endpoint}\`);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    
    const res = await fetch(url.toString(), {
      headers: { "x-api-key": this.apiKey },
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || \`HTTP \${res.status}\`);
    }
    return res.json();
  }

  async getQuote(tokenIn: string, tokenOut: string, amountIn: string) {
    return this.request("dex-quote", { tokenIn, tokenOut, amountIn });
  }

  async getPrice() {
    return this.request("dex-price");
  }

  async getLiquidity() {
    return this.request("dex-liquidity");
  }

  async swap(tokenIn: string, tokenOut: string, amountIn: string, userAddress: string) {
    const url = new URL(\`\${this.baseUrl}/functions/v1/dex-swap\`);
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tokenIn, tokenOut, amountIn, userAddress }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }
}

// Usage
const lunex = new LunexSDK("lnx_your_api_key", "${baseUrl || "https://your-project.supabase.co"}");
const quote = await lunex.getQuote("USDC", "EURC", "1000000");
console.log("Expected output:", quote.amountOut);`} />
      </Section>

      <Section title="12. CCTP Bridge Integration">
        <p className="mb-3">Lunex supports cross-chain USDC transfers via Circle's Cross-Chain Transfer Protocol (CCTP V2). The bridge supports the following chains:</p>
        <div className="space-y-1 mb-4">
          {["Ethereum Sepolia", "Base Sepolia", "Arbitrum Sepolia", "Avalanche Fuji", "Polygon Amoy", "Arc Testnet"].map(c => (
            <div key={c} className="flex items-center gap-2 text-xs">
              <span className="w-1.5 h-1.5 bg-primary rounded-full" />
              {c}
            </div>
          ))}
        </div>

        <h4 className="text-xs font-semibold tracking-wider uppercase mt-4 mb-2">12.1 POST /cctp-deposit — Initiate Bridge</h4>
        <CodeBlock language="bash" code={`curl -X POST "${baseUrl || ""}/functions/v1/cctp-deposit" \\
  -H "x-api-key: lnx_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": "1000000000",
    "sourceChain": "base-sepolia",
    "destinationChain": "ethereum-sepolia",
    "mintRecipient": "0xRecipientAddress"
  }'`} />
        <h4 className="text-xs font-semibold tracking-wider uppercase mt-2 mb-2">Response</h4>
        <CodeBlock language="json" code={`{
  "depositTx": {
    "to": "0xTokenMessenger",
    "data": "0x...",
    "value": "0",
    "chainId": 84532
  },
  "messageBytes": "0x...",
  "messageHash": "0x...",
  "attestationApi": "https://iris-api-sandbox.circle.com/v2/messages"
}`} />

        <h4 className="text-xs font-semibold tracking-wider uppercase mt-4 mb-2">12.2 GET /cctp-attestation — Check Attestation Status</h4>
        <CodeBlock language="bash" code={`curl "${baseUrl || ""}/functions/v1/cctp-attestation?domain=6&txHash=0xYourBurnTxHash" \\
  -H "x-api-key: lnx_your_api_key"`} />
        <h4 className="text-xs font-semibold tracking-wider uppercase mt-2 mb-2">Response</h4>
        <CodeBlock language="json" code={`{
  "status": "complete",
  "attestation": "0x...",
  "message": "0x...",
  "timestamp": 1711900000
}`} />

        <h4 className="text-xs font-semibold tracking-wider uppercase mt-4 mb-2">12.3 POST /cctp-receive — Complete Bridge (Mint)</h4>
        <CodeBlock language="bash" code={`curl -X POST "${baseUrl || ""}/functions/v1/cctp-receive" \\
  -H "x-api-key: lnx_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messageBytes": "0x...",
    "attestation": "0x...",
    "destinationChain": "ethereum-sepolia"
  }'`} />
        <h4 className="text-xs font-semibold tracking-wider uppercase mt-2 mb-2">Response</h4>
        <CodeBlock language="json" code={`{
  "receiveTx": {
    "to": "0xMessageTransmitter",
    "data": "0x...",
    "chainId": 11155111
  },
  "estimatedGas": "150000"
}`} />

        <p className="text-xs mt-4 mb-2"><strong>Bridge Flow:</strong></p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>Approve USDC spend to TokenMessenger contract</li>
          <li>Call <code className="bg-muted px-1">depositForBurn</code> on source chain (CCTP V2 — 7 parameters)</li>
          <li>Poll Circle Iris API for attestation (5-20 minutes)</li>
          <li>Call <code className="bg-muted px-1">receiveMessage</code> on destination chain with attestation</li>
        </ol>
      </Section>
    </div>
  );
};

export { AVAILABLE_SERVICES };
export default SDKDeveloperGuide;
