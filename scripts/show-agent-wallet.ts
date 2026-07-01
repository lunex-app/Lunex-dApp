/**
 * Prints the public address for a given private key.
 * Run: npx hardhat run scripts/show-agent-wallet.ts
 */
import { network } from "hardhat";

async function main() {
  const { ethers } = await network.create();
  const signers = await ethers.getSigners();
  const wallet = signers[0];
  if (!wallet) throw new Error("No signer — set DEPLOYER_PRIVATE_KEY in .env.local");
  const address = await wallet.getAddress();
  console.log("\nAgent wallet address:", address);
  console.log("\nAdd these lines to .env.local:");
  console.log(`AGENT_PRIVATE_KEY=${process.env.DEPLOYER_PRIVATE_KEY}`);
  console.log(`AGENT_EXECUTOR_ADDRESS=<run deploy-agent-executor.ts to get this>`);
  console.log(`VITE_AGENT_EXECUTOR_ADDRESS=<same as above>`);
  console.log(`VITE_AGENT_WALLET_ADDRESS=${address}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
