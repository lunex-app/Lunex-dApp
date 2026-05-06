import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "lunex-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_lunex_pools",
        description: "Get the active stablecoin pools on Lunex Protocol (Arc Network)",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "get_unified_balance",
        description: "Get the unified global USDC balance for a given wallet address",
        inputSchema: {
          type: "object",
          properties: {
            address: {
              type: "string",
              description: "The 0x EVM wallet address to query",
            },
          },
          required: ["address"],
        },
      },
      {
        name: "execute_swap_intent",
        description: "Creates a swap intent on Lunex. Returns transaction calldata for the user to sign.",
        inputSchema: {
          type: "object",
          properties: {
            fromToken: { type: "string" },
            toToken: { type: "string" },
            amount: { type: "string" },
            userAddress: { type: "string" },
          },
          required: ["fromToken", "toToken", "amount", "userAddress"],
        },
      },
      {
        name: "get_protocol_stats",
        description: "Get the overall protocol statistics including TVL and Volume across all chains",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "get_lunex_pools") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              pools: [
                { id: "usdc-eurc", address: "0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8", apy: "12.5%", tvl: "$4.2M" },
                { id: "usdc-vault", address: "0x66CF9CA9D75FD62438C6E254bA35E61775EF9496", apy: "8.1%", type: "ERC-4626" },
              ],
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === "get_unified_balance") {
    const address = args?.address as string;
    if (!address) {
      throw new Error("Address is required");
    }
    
    // In a real scenario, this would query viem public clients across all chains
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              address,
              globalUnifiedBalanceUSDC: "12500.00",
              breakdown: {
                arcTestnet: "5000.00",
                baseSepolia: "7500.00",
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === "execute_swap_intent") {
    const { fromToken, toToken, amount, userAddress } = args as Record<string, string>;
    return {
      content: [
        {
          type: "text",
          text: `Swap intent created: ${amount} ${fromToken} to ${toToken} for ${userAddress}. \nCalldata generated: 0xabcdef1234567890 (mock). \nPlease prompt the user to sign this transaction in their wallet.`,
        },
      ],
    };
  }

  if (name === "get_protocol_stats") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              totalValueLocked: "$12,450,000",
              volume24h: "$1,250,000",
              totalSwaps: "45,230",
              activeUsers24h: "1,240",
              chainBreakdown: {
                arcNetwork: "$4,200,000",
                base: "$3,500,000",
                arbitrum: "$2,800,000",
                ethereum: "$1,950,000",
              }
            },
            null,
            2
          ),
        },
      ],
    };
  }

  throw new Error(`Tool not found: ${name}`);
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Lunex MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error running MCP server:", error);
  process.exit(1);
});
