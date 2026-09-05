const suffixes = /(旗舰店|概念店|主题店|酒吧|咖啡店|美甲店|餐厅|店)$/g;

export function normalizeText(value = ""): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[（(].*?[）)]/g, "")
    .replace(/九又四分之三|93[⁄/]4/g, "9¾")
    .replace(/harry\s*potter/g, "哈利波特")
    .replace(/[^\p{L}\p{N}¾]+/gu, "")
    .replace(suffixes, "");
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function tokenize(value = ""): string[] {
  const normalized = value.toLowerCase().normalize("NFKC");
  const latin = normalized.match(/[a-z0-9]+/g) ?? [];
  const chinese = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  const grams = chinese.flatMap((word) => {
    const output = [word];
    for (let size = 2; size <= Math.min(4, word.length); size += 1) {
      for (let i = 0; i <= word.length - size; i += 1) output.push(word.slice(i, i + size));
    }
    return output;
  });
  return unique([...latin, ...grams]);
}

export function similarity(left: string, right: string): number {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length) + 0.18;
  const aa = new Set(tokenize(a));
  const bb = new Set(tokenize(b));
  const common = [...aa].filter((item) => bb.has(item)).length;
  return common / Math.max(aa.size, bb.size, 1);
}

export function containsAny(haystack: string, needles: string[]): boolean {
  const text = haystack.toLowerCase();
  return needles.some((needle) => needle && text.includes(needle.toLowerCase()));
}

export function slugify(value: string): string {
  const ascii = value.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase();
  return ascii || "nichescout";
}
