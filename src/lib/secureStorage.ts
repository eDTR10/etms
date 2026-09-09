import CryptoJS from "crypto-js";

const SECRET = import.meta.env.VITE_PASSWORD;

if (!SECRET) {
  console.warn(
    "VITE_PASSWORD is not set: data written to localStorage will not be encrypted."
  );
}

function encrypt(value: string): string {
  return CryptoJS.AES.encrypt(value, SECRET).toString();
}

function decrypt(cipherText: string): string | null {
  try {
    const plain = CryptoJS.AES.decrypt(cipherText, SECRET).toString(CryptoJS.enc.Utf8);
    return plain || null;
  } catch {
    return null;
  }
}

// Wraps localStorage so every value is AES-encrypted at rest with VITE_PASSWORD.
// Note: this is obfuscation, not real secrecy — VITE_ vars are baked into the
// public JS bundle, so anyone with devtools can recover the key. It stops
// casual/plaintext inspection of localStorage, not a determined attacker.
export const secureStorage = {
  setItem(key: string, value: unknown): void {
    localStorage.setItem(key, encrypt(JSON.stringify(value)));
  },

  getItem<T = unknown>(key: string): T | null {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const decrypted = decrypt(raw);
    if (decrypted === null) {
      localStorage.removeItem(key);
      return null;
    }

    try {
      return JSON.parse(decrypted) as T;
    } catch {
      // Not JSON — e.g. a raw auth token another DICT app encrypted directly
      // without JSON.stringify-ing it first. It still decrypted correctly with
      // the shared secret, so return it as-is instead of discarding a good value.
      return decrypted as unknown as T;
    }
  },

  removeItem(key: string): void {
    localStorage.removeItem(key);
  },

  clear(): void {
  },
};
