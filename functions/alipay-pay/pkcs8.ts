// PKCS#8 PEM → CryptoKey（RSASSA-PKCS1-v1_5 / SHA-256），供支付宝 RSA2 签名/验签使用。
// Deno Edge Runtime 原生 WebCrypto，无第三方依赖。

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der;
}

/** 应用私钥（PKCS#8 PEM 或裸 base64）导入为签名用 CryptoKey */
export async function importPrivateKey(key: string): Promise<CryptoKey> {
  const pem = key.includes('BEGIN') ? key : `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
  return crypto.subtle.importKey(
    'pkcs8',
    pemToDer(pem).buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/** 支付宝公钥（PEM 或裸 base64）导入为验签用 CryptoKey */
export async function importPublicKey(key: string): Promise<CryptoKey> {
  const pem = key.includes('BEGIN') ? key : `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
  return crypto.subtle.importKey(
    'spki',
    pemToDer(pem).buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

/** 从应用私钥（PKCS#8 PEM 或裸 base64）推导出配对的「应用公钥」，返回单行 SPKI base64。
 *  用途：自检时与开放平台登记的应用公钥逐字符比对，避免两边不同步却看不出来。
 *  实现：全程走 WebCrypto —— pkcs8 导入为 extractable 私钥 → exportKey('jwk') 取 n/e
 *       → 以 RSASSA-PKCS1-v1_5 public key 重新导入 → exportKey('spki') 由标准库编码 DER。
 *       不手写 ASN.1，杜绝 modulus 前导零 / 长度字段错位问题。 */
export async function deriveAppPublicKeyB64(privateKeyB64OrPem: string): Promise<string> {
  const pem = privateKeyB64OrPem.includes('BEGIN')
    ? privateKeyB64OrPem
    : `-----BEGIN PRIVATE KEY-----\n${privateKeyB64OrPem}\n-----END PRIVATE KEY-----`;
  const alg = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;

  const priv = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(pem).buffer as ArrayBuffer,
    alg,
    true,
    ['sign'],
  );

  // 关键：先导出 JWK 只取模数/指数，再作为「公钥」重新导入。
  // 直接对私钥 CryptoKey 调 exportKey('spki') 在部分运行时会被拒绝或导出成私钥结构。
  const jwk = (await crypto.subtle.exportKey('jwk', priv)) as JsonWebKey;
  const pubOnly: JsonWebKey = {
    kty: 'RSA',
    n: jwk.n as string,
    e: jwk.e as string,
    alg: 'RS256',
    ext: true,
    key_ops: ['verify'],
  };
  const pub = await crypto.subtle.importKey('jwk', pubOnly, alg, true, ['verify']);
  const spki = await crypto.subtle.exportKey('spki', pub);
  return bufToBase64(spki);
}

export function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/** RSA2（SHA256withRSA）签名，返回 base64 */
export async function rsaSign(text: string, privateKey: CryptoKey): Promise<string> {
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(text));
  return bufToBase64(sig);
}

/** 拼接待签串。
 *  ⚠️ 支付宝两套口径必须区分，混用会直接导致 isv.invalid-signature：
 *   - 请求下单签名（含 page.pay / precreate / query）：仅剔除 sign，**必须保留 sign_type=RSA2**
 *     （官方文档《电脑网站支付-加签与验签》明确说明）。
 *   - 验证异步通知：同时剔除 sign 与 sign_type。
 *  历史实现无条件剔除 sign_type，与网关回显的待验串一致地「自洽」，但与支付宝实际校验口径不一致，
 *  因此本地怎么验都对、网关却一直拒——这是本次验签失败的真正根因。 */
export function buildSignContent(params: Record<string, string>, excludeKeys: string[] = ['sign']): string {
  return Object.keys(params)
    .filter((k) => !excludeKeys.includes(k) && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
}
