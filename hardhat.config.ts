import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import "dotenv/config";
import dotenv from "dotenv";
import { existsSync } from "fs";
import type { HardhatUserConfig } from "hardhat/config";

// Also load .env.local (Vite convention) — vars already in env take precedence
if (existsSync(".env.local")) dotenv.config({ path: ".env.local", override: false });

const deployerKey = process.env.AGENT_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  plugins: [hardhatEthers],
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    arcTestnet: {
      type: "http",
      url: process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network",
      chainId: 5042002,
      accounts: deployerKey ? [deployerKey] : [],
    },
    baseSepolia: {
      type: "http",
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://base-sepolia-rpc.publicnode.com",
      chainId: 84532,
      accounts: deployerKey ? [deployerKey] : [],
    },
  },
};

export default config;
