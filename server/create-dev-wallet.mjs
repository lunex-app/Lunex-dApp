/**
 * One-time: create Lunex's Circle developer-controlled wallet infrastructure.
 *
 *  1. Generate a 32-byte entity secret (root key for this Circle entity).
 *  2. Register its ciphertext with Circle (downloads a recovery file).
 *  3. Create a wallet set.
 *  4. Create an SCA (gasless) wallet on ARC-TESTNET — the auto-compound harvest bot.
 *
 * Outputs everything to ./circle-dev-wallet.json. The entity secret + recovery
 * file are the crown jewels — keep them safe.
 */
import {
  registerEntitySecretCiphertext,
  initiateDeveloperControlledWalletsClient,
} from "@circle-fin/developer-controlled-wallets";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const API_KEY = process.env.CIRCLE_API_KEY;
if (!API_KEY) {
  console.error("Set CIRCLE_API_KEY");
  process.exit(1);
}

const out = {};

async function main() {
  // 1. Entity secret
  const entitySecret = randomBytes(32).toString("hex");
  out.entitySecret = entitySecret;
  console.log("→ entity secret generated");

  // 2. Register ciphertext + download recovery file
  await registerEntitySecretCiphertext({
    apiKey: API_KEY,
    entitySecret,
    recoveryFileDownloadPath: "./",
  });
  console.log("→ entity secret registered with Circle (recovery file saved)");

  const client = initiateDeveloperControlledWalletsClient({ apiKey: API_KEY, entitySecret });

  // 3. Wallet set
  const ws = await client.createWalletSet({ name: "Lunex Auto-Compound" });
  const walletSetId = ws.data?.walletSet?.id;
  out.walletSetId = walletSetId;
  console.log("→ wallet set:", walletSetId);

  // 4. ARC-TESTNET wallet (SCA = gasless smart account; fall back to EOA)
  let wallets;
  for (const accountType of ["SCA", "EOA"]) {
    try {
      const res = await client.createWallets({
        walletSetId,
        blockchains: ["ARC-TESTNET"],
        count: 1,
        accountType,
      });
      wallets = res.data?.wallets;
      out.accountType = accountType;
      break;
    } catch (e) {
      console.log(`  ${accountType} failed: ${e?.response?.data?.message || e.message}`);
    }
  }
  out.wallets = wallets;
  console.log("→ wallet(s):", JSON.stringify(wallets, null, 2));

  writeFileSync("./circle-dev-wallet.json", JSON.stringify(out, null, 2));
  console.log("\nSaved ./circle-dev-wallet.json");
}

main().catch((e) => {
  console.error("ERROR:", e?.response?.data || e.message);
  // Persist whatever we have (e.g. the entity secret) so it is never lost.
  if (out.entitySecret) writeFileSync("./circle-dev-wallet-partial.json", JSON.stringify(out, null, 2));
  process.exit(1);
});
