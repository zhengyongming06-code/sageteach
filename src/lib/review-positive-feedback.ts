/** Sage confirming practice / thinking is on the right track (Today archive refresh hint). */
export function assistantSignalsCorrectness(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/(不对|不正确|错了|错误|误区|反差)/.test(t)) return false;
  if (/(完全正确|思路对)/.test(t)) return true;
  if (/(?<![不莫])正确/.test(t)) return true;
  if (
    /(?:^|[。；\n])(?:嗯|好)?对[，。！？]|^对[，。！？]|说是对|做得对|想对了|方向对|这一步对/.test(t)
  ) {
    return true;
  }
  return false;
}
