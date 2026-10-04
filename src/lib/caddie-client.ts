export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function streamCaddie(
  payload: { context: string; messages: ChatMessage[] },
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/caddie", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: signal ?? null,
  });

  if (!res.ok || !res.body) {
    const message = await res.text().catch(() => "");
    throw new Error(message || "Le caddie IA est indisponible.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onDelta(decoder.decode(value, { stream: true }));
  }
}
