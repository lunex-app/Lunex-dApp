/**
 * Calls the /api/agent-execute dev endpoint which uses the agent hot wallet
 * to submit a rebalance tx on behalf of the user — no wallet popup needed.
 */
export async function callAgentExecute(
  action: "rebalanceToVault" | "rebalanceToPool",
  userAddress: string,
): Promise<{ txHash: string }> {
  const res = await fetch("/api/agent-execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, userAddress }),
  });

  const data = await res.json() as { txHash?: string; error?: string };

  if (!res.ok || data.error) {
    throw new Error(data.error ?? `Agent execute failed (${res.status})`);
  }

  return { txHash: data.txHash! };
}
