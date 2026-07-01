/**
 * deploy-usdt-part2.ts
 * Deploys EURC/USDT pool and luneUSDT vault
 * (LunexUSDT + USDC/USDT pool already deployed in part 1)
 */
import { network } from "hardhat";

const EURC   = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const USDT   = "0x59125072f5692DdF22c99514805D1232C3999646"; // from part 1

const AMP       = 200n;
const SWAP_FEE  = 4_000_000n;
const ADMIN_FEE = 5_000_000_000n;

async function main() {
  const { ethers } = await network.create();
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // ── 1. EURC/USDT Pool ────────────────────────────────────────────────────
  console.log("\n[1/2] Deploying EURC/USDT StableSwap...");
  const Pool = await ethers.getContractFactory("LunexStableSwap");
  const poolET = await Pool.deploy(EURC, USDT, AMP, SWAP_FEE, ADMIN_FEE, "Lunex EURC/USDT LP", "lunex-ET-LP");
  await poolET.waitForDeployment();
  const POOL_EURC_USDT = await poolET.getAddress();
  const LP_EURC_USDT   = await poolET.lpToken();
  console.log("EURC/USDT Pool:", POOL_EURC_USDT);
  console.log("EURC/USDT LP:  ", LP_EURC_USDT);

  // ── 2. luneUSDT Vault ────────────────────────────────────────────────────
  console.log("\n[2/2] Deploying luneUSDT ERC-4626 vault...");
  const Vault = await ethers.getContractFactory("LuneVault");
  const vault = await Vault.deploy(USDT, "Lunex USDT Vault", "luneUSDT", deployer.address);
  await vault.waitForDeployment();
  const VAULT_USDT = await vault.getAddress();
  console.log("luneUSDT Vault:", VAULT_USDT);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n=======================================================");
  console.log("ALL DEPLOYED — update src/config/wagmi.ts:");
  console.log("=======================================================");
  console.log(`  USDT:             "0x59125072f5692DdF22c99514805D1232C3999646"`);
  console.log(`  POOL_USDC_USDT:   "0x8e60d788955CaBb247D2c003C77AdAF44C566cD3"`);
  console.log(`  LP_USDC_USDT:     "0x360427f34b3FC6Bbbf79E32879533136BF7d84Cf"`);
  console.log(`  POOL_EURC_USDT:   "${POOL_EURC_USDT}"`);
  console.log(`  LP_EURC_USDT:     "${LP_EURC_USDT}"`);
  console.log(`  LUNE_VAULT_USDT:  "${VAULT_USDT}"`);
  console.log("=======================================================");
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
