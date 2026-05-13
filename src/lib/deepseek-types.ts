export type DeepSeekRole = "system" | "user" | "assistant";
export type DeepSeekMessage = { role: DeepSeekRole; content: string };
