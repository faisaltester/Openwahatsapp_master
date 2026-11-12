export function parseTeamNumbers(raw: string) {
  const numbers = new Set<string>();
  const invalid: string[] = [];
  let duplicates = 0;
  for (const line of raw.split(/[\n,;]+/)) {
    const value = line.trim().replace(/^"|"$/g, '');
    if (!value || /^(phone|phone number|number|numbers|mobile)$/i.test(value)) continue;
    const number = value.replace(/[+\s()\-]/g, '');
    if (!/^\d{7,15}$/.test(number)) { invalid.push(value); continue; }
    if (numbers.has(number)) duplicates++; else numbers.add(number);
  }
  return { numbers: [...numbers], invalid, duplicates };
}
