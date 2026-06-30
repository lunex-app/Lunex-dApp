export interface LLMResponse {
  text: string;
  action?: string | null;
  params?: Record<string, unknown>;
}

export async function callAutopilotLLM(
  message: string,
  context: Record<string, unknown>,
  history: { role: string; content: string }[],
): Promise<LLMResponse> {
  const res = await fetch("/api/autopilot-agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, context, history }),
  });

  const data = await res.json() as LLMResponse & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}
