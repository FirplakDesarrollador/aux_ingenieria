type SearchCacheEntry = {
    payload: unknown;
    expiresAt: number;
};

const searchCache = new Map<string, SearchCacheEntry>();
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_CACHE_MAX_ENTRIES = 400;

export const getCachedSearch = <T>(key: string): T | null => {
    const cached = searchCache.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
        searchCache.delete(key);
        return null;
    }

    // Renueva su posición para conservar las búsquedas usadas recientemente.
    searchCache.delete(key);
    searchCache.set(key, cached);
    return cached.payload as T;
};

export const setCachedSearch = <T>(key: string, payload: T, ttlMs = SEARCH_CACHE_TTL_MS) => {
    if (searchCache.has(key)) searchCache.delete(key);
    while (searchCache.size >= SEARCH_CACHE_MAX_ENTRIES) {
        const oldestKey = searchCache.keys().next().value;
        if (!oldestKey) break;
        searchCache.delete(oldestKey);
    }

    searchCache.set(key, {
        payload,
        expiresAt: Date.now() + ttlMs,
    });
};
