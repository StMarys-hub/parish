// Generates ECDSA P-256 VAPID keys using Node's built-in Web Crypto API (zero deps).
// Outputs:
// 1) VITE_VAPID_PUBLIC_KEY (Base64URL uncompressed point for browser PushManager)
// 2) VAPID_KEYS_JSON (JWK pair compatible with jsr:@negrel/webpush importVapidKeys)

import { webcrypto } from 'node:crypto';

function toBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

const keyPair = await webcrypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify']
);

const publicJwk = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
const privateJwk = await webcrypto.subtle.exportKey('jwk', keyPair.privateKey);
const rawPublic = new Uint8Array(await webcrypto.subtle.exportKey('raw', keyPair.publicKey));

const vitePublicKey = toBase64Url(rawPublic);
const vapidKeysJson = JSON.stringify({ publicKey: publicJwk, privateKey: privateJwk });

console.log('\n=== VAPID Keys Generated Successfully ===\n');
console.log('1) Add to .env and Cloudflare Pages Environment Variables:');
console.log(`VITE_VAPID_PUBLIC_KEY=${vitePublicKey}\n`);
console.log('2) Add to Supabase Edge Function Secrets (VAPID_KEYS_JSON):');
console.log(vapidKeysJson);
console.log('\n3) Also set Supabase Secret:');
console.log('VAPID_SUBJECT=mailto:vicar@stmarysyroclt.org\n');
