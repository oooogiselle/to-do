import * as Crypto from "expo-crypto";

// Optimistic rows get client-side UUIDs (`uuid()` in @tt/client), which needs Web Crypto.
const g = globalThis as { crypto?: Partial<Crypto> };
g.crypto ??= {};
g.crypto.randomUUID ??= Crypto.randomUUID as Crypto["randomUUID"];
g.crypto.getRandomValues ??= Crypto.getRandomValues as Crypto["getRandomValues"];
