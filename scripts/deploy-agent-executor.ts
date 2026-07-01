import { network } from "hardhat";

// Addresses from src/config/wagmi.ts
const LP_TOKEN   = "0x090BBEb2690eC75633f1804865D99a3143DB8042";
const SWAP_POOL  = "0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8";
const VAULT_USDC = "0x66CF9CA9D75FD62438C6E254bA35E61775EF9496";
const USDC       = "0x3600000000000000000000000000000000000000";

async function main() {
  const { ethers } = await network.create();
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) throw new Error("No signer — ensure AGENT_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY is set in .env.local");
  console.log("Deploying AgentExecutor from:", deployer.address);

  const Factory = await ethers.getContractFactory("AgentExecutor");
  const contract = await Factory.deploy(LP_TOKEN, SWAP_POOL, VAULT_USDC, USDC);
  await contract.waitForDeployment();

  const addr = await contract.getAddress();
  console.log("\nAgentExecutor deployed at:", addr);
  console.log("\nAdd to your .env.local:");
  console.log(`VITE_AGENT_EXECUTOR_ADDRESS=${addr}`);
  console.log(`AGENT_EXECUTOR_ADDRESS=${addr}`);
  console.log("\nAlso set (no VITE_ prefix — stays server-side):");
  console.log("AGENT_PRIVATE_KEY=0x<hot-wallet-private-key>");
  console.log("\nAnd expose the agent wallet's public address:");
  console.log("VITE_AGENT_WALLET_ADDRESS=0x<hot-wallet-address>");
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
