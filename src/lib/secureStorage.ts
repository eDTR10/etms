import CryptoJS from "crypto-js";

const SECRET = import.meta.env.VITE_STORAGE_KEY;

if (!SECRET) {
  console.warn(
    "VITE_STORAGE_KEY is not set: data written to localStorage will not be encrypted."
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

// Wraps localStorage so every value is AES-encrypted at rest with VITE_STORAGE_KEY.
// Note: this is obfuscation, not real secrecy — VITE_ vars are baked into the
// public JS bundle, so anyone with devtools can recover the key. It stops
// casual/plaintext inspection of localStorage, not a determined attacker.
export const secureStorage = {
  // Strings are stored raw, not JSON-quoted. ETMS, DMT-Front-end, and KMS-Front-end
  // deploy under one origin at different base paths (/etms, /dtms, /kms — see each
  // vite.config.ts), so they share this same localStorage, and DMT-Front-end's own
  // secureStorage (services/api.ts) always stores a string value as-is. JSON-quoting
  // a token here would make DTMS read it back with literal quote characters baked
  // into the Authorization header. getItem's fallback below already expected this
  // raw format when reading a token written by "another DICT app" — this makes
  // writing symmetric with that.
  setItem(key: string, value: unknown): void {
    const plain = typeof value === "string" ? value : JSON.stringify(value);
    localStorage.setItem(key, encrypt(plain));
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
