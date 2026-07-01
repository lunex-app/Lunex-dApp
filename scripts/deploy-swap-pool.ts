import { network } from "hardhat";

const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const A    = 200n;
const FEE  = 4_000_000n;   // 0.04% swap fee
const ADMIN = "0xC81b2328f7f04DC667428DA9a84CE627338873fd"; // treasury / fee receiver

async function main() {
  const { ethers } = await network.create();
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No signer — check AGENT_PRIVATE_KEY in .env.local");
  console.log("Deployer:", deployer.address);

  const Factory = await ethers.getContractFactory("LunexSwapPool");
  const pool = await Factory.deploy([USDC, EURC], A, FEE, ADMIN);
  await pool.waitForDeployment();

  const poolAddr = await pool.getAddress();
  console.log("\nLunexSwapPool deployed at:", poolAddr);

  // Read the auto-deployed LP token address
  const lpAddr = await pool.lpToken();
  console.log("LunexLP (auto-deployed) at:", lpAddr);

  console.log("\nUpdate src/config/wagmi.ts:");
  console.log(`  LUNEX_SWAP_POOL: "${poolAddr}"`);
  console.log(`  LUNEX_LP:        "${lpAddr}"`);
  console.log("\nUpdate AgentExecutor constructor args if re-deploying:");
  console.log(`  SWAP_POOL: "${poolAddr}"`);
  console.log(`  LP_TOKEN:  "${lpAddr}"`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
