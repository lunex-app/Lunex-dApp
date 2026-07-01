/**
 * deploy-usdt-ecosystem.ts
 *
 * Deploys the full USDT extension for Lunex Finance on Arc Testnet:
 *   1. LunexUSDT      — mintable testnet USDT (faucet token)
 *   2. LunexStableSwap (USDC/USDT) + LunexLPToken (lunex-UT-LP)
 *   3. LunexStableSwap (EURC/USDT) + LunexLPToken (lunex-ET-LP)
 *   4. LuneVault (luneUSDT)        — ERC-4626 vault for USDT
 *
 * Usage:
 *   export DEPLOYER_PRIVATE_KEY=0x...
 *   npx hardhat run scripts/deploy-usdt-ecosystem.ts --network arcTestnet
 */

import { network } from "hardhat";

// ── Pre-deployed tokens on Arc Testnet ──────────────────────────────────────
const USDC   = "0x3600000000000000000000000000000000000000";
const EURC   = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const TREASURY = "0xC81b2328f7f04DC667428DA9a84CE627338873fd";

// Pool parameters (same as existing USDC/EURC pool)
const AMP        = 200n;      // amplification coefficient
const SWAP_FEE   = 4_000_000n; // 0.04% — 4e6 / 1e10
const ADMIN_FEE  = 5_000_000_000n; // 50% of swap fee to treasury

const SEED_USDC  = 50_000n * 1_000_000n; // 50,000 USDC  (6 dec)
const SEED_USDT  = 50_000n * 1_000_000n; // 50,000 USDT  (6 dec)
const SEED_EURC  = 50_000n * 1_000_000n; // 50,000 EURC  (6 dec)

async function main() {
  const { ethers } = await network.create();
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // ── 1. Deploy LunexUSDT ────────────────────────────────────────────────────
  console.log("\n[1/4] Deploying LunexUSDT...");
  const USDT_Factory = await ethers.getContractFactory("LunexUSDT");
  const usdt = await USDT_Factory.deploy(deployer.address);
  await usdt.waitForDeployment();
  const USDT = await usdt.getAddress();
  console.log("LunexUSDT deployed:", USDT);

  // ── 2. Deploy USDC/USDT StableSwap ────────────────────────────────────────
  console.log("\n[2/4] Deploying USDC/USDT StableSwap pool...");
  const Pool_Factory = await ethers.getContractFactory("LunexStableSwap");

  const poolUT = await Pool_Factory.deploy(
    USDC,
    USDT,
    AMP,
    SWAP_FEE,
    ADMIN_FEE,
    "Lunex USDC/USDT LP",
    "lunex-UT-LP",
  );
  await poolUT.waitForDeployment();
  const POOL_USDC_USDT = await poolUT.getAddress();
  const LP_USDC_USDT = await poolUT.lpToken();
  console.log("USDC/USDT Pool deployed:", POOL_USDC_USDT);
  console.log("USDC/USDT LP Token:     ", LP_USDC_USDT);

  // Seed USDC/USDT pool with initial liquidity
  console.log("  Seeding USDC/USDT pool with 50k USDC + 50k USDT...");
  const erc20Abi = ["function approve(address,uint256) returns (bool)"];
  const usdcErc20 = new ethers.Contract(USDC, erc20Abi, deployer);
  await (await usdcErc20.approve(POOL_USDC_USDT, SEED_USDC)).wait();
  await (await usdt.approve(POOL_USDC_USDT, SEED_USDT)).wait();
  await (await poolUT.add_liquidity([SEED_USDC, SEED_USDT], 0n)).wait();
  console.log("  USDC/USDT pool seeded.");

  // ── 3. Deploy EURC/USDT StableSwap ────────────────────────────────────────
  console.log("\n[3/4] Deploying EURC/USDT StableSwap pool...");
  const poolET = await Pool_Factory.deploy(
    EURC,
    USDT,
    AMP,
    SWAP_FEE,
    ADMIN_FEE,
    "Lunex EURC/USDT LP",
    "lunex-ET-LP",
  );
  await poolET.waitForDeployment();
  const POOL_EURC_USDT = await poolET.getAddress();
  const LP_EURC_USDT = await poolET.lpToken();
  console.log("EURC/USDT Pool deployed:", POOL_EURC_USDT);
  console.log("EURC/USDT LP Token:     ", LP_EURC_USDT);

  // Seed EURC/USDT pool
  console.log("  Seeding EURC/USDT pool with 50k EURC + 50k USDT...");
  const eurcErc20 = new ethers.Contract(EURC, erc20Abi, deployer);
  await (await eurcErc20.approve(POOL_EURC_USDT, SEED_EURC)).wait();
  await (await usdtC.approve(POOL_EURC_USDT, SEED_USDT)).wait();
  await (await poolET.add_liquidity([SEED_EURC, SEED_USDT], 0n)).wait();
  console.log("  EURC/USDT pool seeded.");

  // ── 4. Deploy luneUSDT Vault ───────────────────────────────────────────────
  console.log("\n[4/4] Deploying luneUSDT ERC-4626 vault...");
  const Vault_Factory = await ethers.getContractFactory("LuneVault");
  const vaultUSDT = await Vault_Factory.deploy(
    USDT,
    "Lunex USDT Vault",
    "luneUSDT",
    deployer.address,
  );
  await vaultUSDT.waitForDeployment();
  const VAULT_USDT = await vaultUSDT.getAddress();
  console.log("luneUSDT Vault deployed:", VAULT_USDT);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n=======================================================");
  console.log("DEPLOYMENT COMPLETE — add these to src/config/wagmi.ts:");
  console.log("=======================================================");
  console.log(`  USDT:             "${USDT}"`);
  console.log(`  POOL_USDC_USDT:   "${POOL_USDC_USDT}"`);
  console.log(`  LP_USDC_USDT:     "${LP_USDC_USDT}"`);
  console.log(`  POOL_EURC_USDT:   "${POOL_EURC_USDT}"`);
  console.log(`  LP_EURC_USDT:     "${LP_EURC_USDT}"`);
  console.log(`  VAULT_USDT:       "${VAULT_USDT}"`);
  console.log("=======================================================");
  console.log("\nVerify on ArcScan:");
  console.log(`  https://testnet.arcscan.app/address/${USDT}`);
  console.log(`  https://testnet.arcscan.app/address/${POOL_USDC_USDT}`);
  console.log(`  https://testnet.arcscan.app/address/${POOL_EURC_USDT}`);
  console.log(`  https://testnet.arcscan.app/address/${VAULT_USDT}`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
