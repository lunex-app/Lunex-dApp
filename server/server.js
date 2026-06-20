import express from "express";
import cors from "cors";
import "dotenv/config";
import {
  ucEnabled,
  createSession,
  refreshSession,
  initChallenge,
  getWallet,
  emailDeviceToken,
  walletByToken,
  createWalletForToken,
  pinSetupByToken,
  contractExecutionChallenge,
  contractExecutionChallengeByToken,
} from "./circle-user.js";

const app = express();
app.use(cors()); // open CORS — the frontend may be served from any origin/tunnel
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "lunex-server" }));

// ── Circle user-controlled wallets (email/PIN) ───────────────────────────────
if (ucEnabled()) {
  app.get("/api/uc/enabled", (_req, res) => res.json({ enabled: true }));

  app.post("/api/uc/session", async (_req, res) => {
    try { res.json(await createSession()); } catch (e) { res.status(502).json({ error: e.message }); }
  });

  app.post("/api/uc/refresh", async (req, res) => {
    const { userId } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: "userId required" });
    try { res.json(await refreshSession(userId)); } catch (e) { res.status(502).json({ error: e.message }); }
  });

  app.post("/api/uc/init", async (req, res) => {
    const { userId } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: "userId required" });
    try { res.json(await initChallenge(userId)); } catch (e) { res.status(502).json({ error: e.message }); }
  });

  app.get("/api/uc/wallet", async (req, res) => {
    const { userId } = req.query ?? {};
    if (!userId) return res.status(400).json({ error: "userId required" });
    try { res.json((await getWallet(userId)) ?? {}); } catch (e) { res.status(502).json({ error: e.message }); }
  });

  app.post("/api/uc/execute", async (req, res) => {
    const { userId, userToken, walletId, contractAddress, abiFunctionSignature, abiParameters } = req.body ?? {};
    if (!walletId || !contractAddress || !abiFunctionSignature || (!userId && !userToken)) {
      return res.status(400).json({ error: "walletId, contractAddress, abiFunctionSignature, and userId or userToken required" });
    }
    try {
      const out = userToken
        ? await contractExecutionChallengeByToken(userToken, walletId, contractAddress, abiFunctionSignature, abiParameters ?? [])
        : await contractExecutionChallenge(userId, walletId, contractAddress, abiFunctionSignature, abiParameters ?? []);
      res.json(out);
    } catch (e) { res.status(502).json({ error: e.message }); }
  });

  app.post("/api/uc/email-token", async (req, res) => {
    const { deviceId, email } = req.body ?? {};
    if (!deviceId || !email) return res.status(400).json({ error: "deviceId and email required" });
    try { res.json(await emailDeviceToken(deviceId, email)); } catch (e) { res.status(502).json({ error: e.message }); }
  });

  app.post("/api/uc/wallet-by-token", async (req, res) => {
    const { userToken } = req.body ?? {};
    if (!userToken) return res.status(400).json({ error: "userToken required" });
    try { res.json((await walletByToken(userToken)) ?? {}); } catch (e) { res.status(502).json({ error: e.message }); }
  });

  app.post("/api/uc/create-wallet", async (req, res) => {
    const { userToken } = req.body ?? {};
    if (!userToken) return res.status(400).json({ error: "userToken required" });
    try { res.json(await createWalletForToken(userToken)); } catch (e) { res.status(502).json({ error: e.message }); }
  });

  app.post("/api/uc/pin-setup", async (req, res) => {
    const { userToken } = req.body ?? {};
    if (!userToken) return res.status(400).json({ error: "userToken required" });
    try { res.json(await pinSetupByToken(userToken)); } catch (e) { res.status(502).json({ error: e.message }); }
  });

  console.log("Circle user-controlled wallets: /api/uc/* enabled (Lunex entity)");
} else {
  console.log("Circle user-controlled wallets disabled (set CIRCLE_UC_API_KEY + CIRCLE_UC_ENTITY_SECRET)");
}

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`Lunex server on :${PORT}`));
