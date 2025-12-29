export const randomCode = (length = 10) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(length);
  window.crypto.getRandomValues(bytes);
  let out = '';
  for (let b of bytes) out += alphabet[b % alphabet.length];
  return out;
};

export const genSaltB64 = () => {
  const s = new Uint8Array(16);
  window.crypto.getRandomValues(s);
  return bufToBase64(s.buffer);
};

export const bufToBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

export const base64ToBuf = (b64: string) => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

export async function deriveAesKeyFromCode(code: string, saltB64: string) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw', enc.encode(code),
    { name: 'PBKDF2' }, false, ['deriveKey']
  );
  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: base64ToBuf(saltB64),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return key;
}

export async function encryptText(key: CryptoKey, text: string) {
  const iv = new Uint8Array(12);
  window.crypto.getRandomValues(iv);
  const enc = new TextEncoder();
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(text)
  );
  return { ivB64: bufToBase64(iv.buffer), ciphertextB64: bufToBase64(ciphertext) };
}

export async function decryptText(key: CryptoKey, ivB64: string, ciphertextB64: string) {
  const iv = new Uint8Array(base64ToBuf(ivB64));
  const plaintextBuf = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    base64ToBuf(ciphertextB64)
  );
  const dec = new TextDecoder();
  return dec.decode(plaintextBuf);
}

export async function encryptFile(key: CryptoKey, file: File) {
  const iv = new Uint8Array(12);
  window.crypto.getRandomValues(iv);
  
  const arrayBuffer = await file.arrayBuffer();
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    arrayBuffer
  );
  
  return { 
    ivB64: bufToBase64(iv.buffer), 
    ciphertextB64: bufToBase64(ciphertext),
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size
  };
}

export async function decryptFile(key: CryptoKey, ivB64: string, ciphertextB64: string, fileName: string, fileType: string) {
  const iv = new Uint8Array(base64ToBuf(ivB64));
  const plaintextBuf = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    base64ToBuf(ciphertextB64)
  );
  
  return new File([plaintextBuf], fileName, { type: fileType });
}
