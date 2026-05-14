import type { DeepSeekMessage, DeepSeekRole } from "./deepseek-types";

/** Limits abuse / runaway cost on the DeepSeek proxy. Tune as needed. */
export const DEEPSEEK_PROXY_LIMITS = {
  maxMessages: 80,
  maxContentCharsPerMessage: 32_000,
  maxTotalContentChars: 280_000,
  maxMaxTokens: 8_192,
  minMaxTokens: 1,
} as const;

const ROLES = new Set<DeepSeekRole>(["system", "user", "assistant"]);

function isDeepSeekRole(r: unknown): r is DeepSeekRole {
  return typeof r === "string" && ROLES.has(r as DeepSeekRole);
}

/**
 * Validates and returns sanitized messages + clamped max_tokens for the server proxy.
 * Throws Error with a short user-safe message on violation.
 */
export function assertValidDeepSeekProxyPayload(input: {
  messages: unknown;
  max_tokens?: unknown;
}): { messages: DeepSeekMessage[]; max_tokens: number } {
  const {
    maxMessages,
    maxContentCharsPerMessage,
    maxTotalContentChars,
    maxMaxTokens,
    minMaxTokens,
  } = DEEPSEEK_PROXY_LIMITS;

  if (!Array.isArray(input?.messages)) throw new Error("messages required");
  if (input.messages.length === 0) throw new Error("messages 不能为空");
  if (input.messages.length > maxMessages) {
    throw new Error(`对话条数过多（最多 ${maxMessages} 条）`);
  }

  let totalChars = 0;
  const messages: DeepSeekMessage[] = [];

  for (let i = 0; i < input.messages.length; i++) {
    const m = input.messages[i] as Record<string, unknown> | null;
    if (!m || typeof m !== "object") throw new Error(`messages[${i}] 格式无效`);
    if (!isDeepSeekRole(m.role)) throw new Error(`messages[${i}].role 无效`);
    if (typeof m.content !== "string") throw new Error(`messages[${i}].content 须为字符串`);
    const content = m.content;
    if (content.length > maxContentCharsPerMessage) {
      throw new Error(`单条消息过长（每条最多 ${maxContentCharsPerMessage} 字符）`);
    }
    totalChars += content.length;
    if (totalChars > maxTotalContentChars) {
      throw new Error("对话总长度超出限制，请缩短后再试");
    }
    messages.push({ role: m.role, content });
  }

  let max_tokens =
    typeof input.max_tokens === "number" && Number.isFinite(input.max_tokens)
      ? Math.floor(input.max_tokens)
      : 1000;
  max_tokens = Math.min(maxMaxTokens, Math.max(minMaxTokens, max_tokens));

  return { messages, max_tokens };
}
