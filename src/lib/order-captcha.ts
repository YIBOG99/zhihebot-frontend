/** Lightweight local checkout code. This is a usability hurdle, not a security boundary. */
export interface CaptchaChallenge {
  id: string;
  prompt: string;
}

const CODE_CHARS = 'ACDEFGHJKMNPQRTUVWXY34679';

function randomInt(maxExclusive: number): number {
  const values = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  do {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(values);
    else values[0] = Math.floor(Math.random() * 0x1_0000_0000);
  } while (values[0] >= limit);
  return values[0] % maxExclusive;
}

/** Generate a 4-character code locally; no Edge Function/network dependency. */
export async function requestCaptcha(): Promise<CaptchaChallenge> {
  let prompt = '';
  for (let i = 0; i < 4; i++) prompt += CODE_CHARS[randomInt(CODE_CHARS.length)];
  let id: string;
  try {
    id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Array.from({ length: 16 }, () => randomInt(16).toString(16)).join('');
  } catch {
    id = Array.from({ length: 16 }, () => randomInt(16).toString(16)).join('');
  }
  return { id: `local-${id}`, prompt };
}
