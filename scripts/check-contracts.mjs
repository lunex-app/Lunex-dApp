// Check verification status for all Lunex protocol contracts on ArcScan
const CONTRACTS = [
  { name: "LUNEX_SWAP_POOL",                addr: "0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8" },
  { name: "LUNEX_LP",                       addr: "0x090BBEb2690eC75633f1804865D99a3143DB8042" },
  { name: "LUNE_VAULT_USDC",               addr: "0x66CF9CA9D75FD62438C6E254bA35E61775EF9496" },
  { name: "LUNE_VAULT_EURC",               addr: "0xcF2C839B12ECf6D9eEcd4607521B73fcFb7E8713" },
  { name: "LUNE_VAULT_USDT",               addr: "0x60810D1a8b40B78EA82Ea16CA356DE7eD9eb19dD" },
  { name: "POOL_USDC_USDT",                addr: "0x8e60d788955CaBb247D2c003C77AdAF44C566cD3" },
  { name: "LP_USDC_USDT",                  addr: "0x360427f34b3FC6Bbbf79E32879533136BF7d84Cf" },
  { name: "POOL_EURC_USDT",               addr: "0xF04E8D25BF97cda82147596ba887bdF793F574DD" },
  { name: "LP_EURC_USDT",                 addr: "0x1693084fA4CEC8abD2159F0a97eC167DF1a0fe0e" },
  { name: "LUNEX_LIMIT_ORDER_KEEPER",      addr: "0x206D5E8f126ba083b8274fd46834801aF8CB9451" },
  { name: "LUNEX_STREAM",                  addr: "0x131212B79e47C94Bce428509B4372EA85Be7B304" },
  { name: "LUNEX_NATIVE_TOP_UP_RELAYER",  addr: "0xE718D60dAE94b1Cd3D680C9a731d9cAB60DD0A64" },
  { name: "AGENT_EXECUTOR",               addr: "0x175C815f3ba66D1aaA82fa7120728341164198E8" },
  { name: "USDT_TOKEN",                    addr: "0x59125072f5692DdF22c99514805D1232C3999646" },
  { name: "EURC_TOKEN",                    addr: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" },
];

const BASE = "https://testnet.arcscan.app/api/v2/smart-contracts";

const verified = [];
const unverified = [];
const errored = [];

for (const c of CONTRACTS) {
  try {
    const res = await fetch(`${BASE}/${c.addr}`);
    if (res.status === 404) {
      unverified.push({ ...c, note: "not found / unverified" });
      continue;
    }
    const data = await res.json();
    if (data?.is_verified) {
      verified.push({ ...c, contractName: data.name ?? "?" });
    } else {
      unverified.push({ ...c, note: data?.message ?? "is_verified=false" });
    }
  } catch (e) {
    errored.push({ ...c, err: e.message });
  }
}

console.log("\n=== VERIFIED ===");
for (const c of verified) console.log(`  ✓ ${c.name.padEnd(35)} ${c.addr}  (${c.contractName})`);

console.log("\n=== UNVERIFIED ===");
for (const c of unverified) console.log(`  ✗ ${c.name.padEnd(35)} ${c.addr}  [${c.note}]`);

if (errored.length) {
  console.log("\n=== ERRORS ===");
  for (const c of errored) console.log(`  ? ${c.name.padEnd(35)} ${c.addr}  ERR: ${c.err}`);
}

console.log(`\nSummary: ${verified.length} verified, ${unverified.length} unverified, ${errored.length} errors`);
