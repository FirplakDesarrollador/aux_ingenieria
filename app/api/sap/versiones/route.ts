import { NextResponse } from "next/server";
import { fetchSAP } from "@/lib/sap";
import { getCachedSearch, setCachedSearch } from "@/lib/api-search-cache";

type SapItem = {
    ItemCode?: string;
    ItemName?: string;
};

type ContextVersion = {
    CodigoVersion: string;
    Version: string;
    EjemploSAP: string;
    CantidadSAP: number;
    ContextKey: string;
};

const VERSION_LABELS: Record<string, string> = {
    "000": "ESTÁNDAR / BASE",
    MRH: "MUEBLE MRH",
    STD: "MUEBLE ESTÁNDAR",
    SNG: "SIN PERFORACIÓN",
    DER: "PERFORACIÓN DERECHA",
    IZQ: "PERFORACIÓN IZQUIERDA",
    V2D: "VERSIÓN 2 - PERFORACIÓN DERECHA",
    V2I: "VERSIÓN 2 - PERFORACIÓN IZQUIERDA",
};

// En muebles y cocinas SAP reutiliza versiones a nivel de familia comercial
// (por ejemplo VBAN05 o VCOC08), no solamente dentro de una referencia puntual.
// Consultarlas por prefijo conserva frentes, tableros y demás variantes reales,
// sin mezclar familias de mármol o fibra de vidrio.
const FURNITURE_AND_KITCHEN_PREFIXES = new Set([
    "VBAN05", "VBAN06", "VBAN12", "VBAN15", "VBAN16", "VBAN22",
    "VBAN23", "VBAN24", "VBAN27", "VBAN30", "VBAN31", "VBAN32", "VBAN33",
    "VCOC01", "VCOC02", "VCOC03", "VCOC08", "VCOC09", "VCLO01",
    "VROP03", "VROP07", "VROP10", "VROP11", "VROP12", "VOUT03",
]);
const FURNITURE_GROUP_TERMS = ["MUEBLE", "MBLE", "ALACENA", "GABINETE", "CLOSET", "TABLERO", "FRENTE"];
const MATERIAL_VERSION_FILTER = [
    "startswith(ItemCode,'VHEM')",
    "startswith(ItemCode,'VHPT')",
    "startswith(ItemCode,'VTIN')",
    "startswith(ItemCode,'VCOC04-')",
    "startswith(ItemCode,'VCOC05-')",
    "startswith(ItemCode,'VCOC07-')",
    "startswith(ItemCode,'VBAN29-')",
].join(" or ");
const VERSION_CACHE_TTL_MS = 30 * 60 * 1000;
const contextRequestsInFlight = new Map<string, Promise<ContextVersion[]>>();
const materialChecksInFlight = new Map<string, Promise<boolean>>();

const normalizeText = (value: unknown) =>
    String(value ?? "")
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

const getReferenceBase = (sku: string) => {
    const segments = normalizeText(sku).split("-").filter(Boolean);
    return segments.length >= 2 ? segments.slice(0, 2).join("-") : "";
};

const getVersionCode = (itemCode: string) => {
    const segments = normalizeText(itemCode).split("-");
    return segments.length >= 4 ? segments.at(-2) ?? "" : "";
};

const fetchItemsByFilter = async (sapFilter: string) => {
    const items: SapItem[] = [];
    let sapOffset = 0;
    const sapPageSize = 1000;

    while (sapOffset < 15000) {
        const endpoint = `/Items?$select=ItemCode,ItemName&$filter=${sapFilter}&$orderby=ItemCode asc&$skip=${sapOffset}&$top=${sapPageSize}`;
        const response = await fetchSAP(endpoint);
        if (!response.ok) {
            const details = await response.text().catch(() => response.statusText);
            throw new Error(`SAP error ${response.status}: ${details}`);
        }

        const payload = await response.json();
        const page: SapItem[] = payload.value || [];
        items.push(...page);
        sapOffset += page.length;

        const hasNextPage = Boolean(payload["odata.nextLink"] || payload["@odata.nextLink"]);
        if (!hasNextPage || page.length === 0) break;
    }

    return items;
};

const isMaterialVersionCode = async (versionCode: string) => {
    if (!versionCode || versionCode === "000") return false;

    const cacheKey = `version-material-check:${versionCode}`;
    const cached = getCachedSearch<boolean>(cacheKey);
    if (cached !== null) return cached;

    const pending = materialChecksInFlight.get(versionCode);
    if (pending) return pending;

    const task = (async () => {
        const escapedCode = versionCode.replace(/'/g, "''");
        const endpoint = `/Items?$select=ItemCode&$filter=SalesItem eq 'tYES' and (${MATERIAL_VERSION_FILTER}) and contains(ItemCode,'-${escapedCode}-')&$top=1`;
        const response = await fetchSAP(endpoint);
        if (!response.ok) {
            const details = await response.text().catch(() => response.statusText);
            throw new Error(`SAP error ${response.status}: ${details}`);
        }

        const payload = await response.json();
        const isRestricted = (payload.value || []).length > 0;
        setCachedSearch(cacheKey, isRestricted, VERSION_CACHE_TTL_MS);
        return isRestricted;
    })();

    materialChecksInFlight.set(versionCode, task);
    try {
        return await task;
    } finally {
        materialChecksInFlight.delete(versionCode);
    }
};

const loadVersionsFromExistingItems = async (contextKey: string, sapFilter: string, excludeMaterialVersions: boolean) => {
    const cacheKey = `versions-context:v3:${contextKey}:${excludeMaterialVersions ? "without-material" : "all"}`;
    const cached = getCachedSearch<ContextVersion[]>(cacheKey);
    if (cached) return cached;

    const pending = contextRequestsInFlight.get(cacheKey);
    if (pending) return pending;

    const task = (async () => {
        const items = await fetchItemsByFilter(sapFilter);

        const versions = new Map<string, { sample: string; count: number }>();
        for (const item of items) {
            const code = getVersionCode(item.ItemCode || "");
            if (!code) continue;

            const current = versions.get(code);
            if (current) {
                current.count += 1;
            } else {
                versions.set(code, {
                    sample: String(item.ItemName || item.ItemCode || code),
                    count: 1,
                });
            }
        }

        if (excludeMaterialVersions) {
            const checks = await Promise.all([...versions.keys()].map(async code => ({
                code,
                restricted: await isMaterialVersionCode(code),
            })));
            for (const check of checks) {
                if (check.restricted) versions.delete(check.code);
            }
        }

        const data = [...versions.entries()]
            .map(([code, details]) => ({
                CodigoVersion: code,
                Version: VERSION_LABELS[code] || `USADA EN SAP: ${details.sample}`,
                EjemploSAP: details.sample,
                CantidadSAP: details.count,
                ContextKey: contextKey,
            }))
            .sort((left, right) => left.CodigoVersion.localeCompare(right.CodigoVersion, "es", {
                numeric: true,
                sensitivity: "base",
            }));

        setCachedSearch(cacheKey, data, VERSION_CACHE_TTL_MS);
        return data;
    })();

    contextRequestsInFlight.set(cacheKey, task);
    try {
        return await task;
    } finally {
        contextRequestsInFlight.delete(cacheKey);
    }
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const search = normalizeText(searchParams.get("search"));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "100", 10) || 100));
    const referenceBase = getReferenceBase(searchParams.get("sku") || "");
    const groupCode = Number.parseInt(searchParams.get("groupCode") || "", 10);
    const contextName = normalizeText(searchParams.get("productName"));

    try {
        let contextKey = "";
        let sapFilter = "";
        let excludeMaterialVersions = false;

        if (referenceBase) {
            const escapedBase = referenceBase.replace(/'/g, "''");
            const skuPrefix = referenceBase.split("-")[0];
            if (FURNITURE_AND_KITCHEN_PREFIXES.has(skuPrefix)) {
                contextKey = `SKU-FAMILY:${skuPrefix}`;
                sapFilter = `SalesItem eq 'tYES' and startswith(ItemCode,'${skuPrefix}-')`;
                excludeMaterialVersions = true;
            } else {
                contextKey = `SKU:${referenceBase}`;
                sapFilter = `SalesItem eq 'tYES' and startswith(ItemCode,'${escapedBase}-')`;
            }
        } else if (Number.isFinite(groupCode)) {
            contextKey = `GROUP:${groupCode}`;
            sapFilter = `SalesItem eq 'tYES' and startswith(ItemCode,'V') and ItemsGroupCode eq ${groupCode}`;
            excludeMaterialVersions = FURNITURE_GROUP_TERMS.some(term => contextName.includes(term));
        } else {
            return NextResponse.json({
                data: [],
                hasMore: false,
                error: "Selecciona primero un SKU de referencia o un grupo de artículos para consultar sus versiones existentes en SAP.",
            }, { status: 400 });
        }

        const contextualVersions = await loadVersionsFromExistingItems(contextKey, sapFilter, excludeMaterialVersions);
        const filteredVersions = search
            ? contextualVersions.filter(version =>
                normalizeText(`${version.CodigoVersion} ${version.Version} ${version.EjemploSAP}`).includes(search)
            )
            : contextualVersions;
        const page = filteredVersions.slice(offset, offset + limit);

        return NextResponse.json({
            data: page,
            hasMore: offset + page.length < filteredVersions.length,
            contextKey,
            total: filteredVersions.length,
        });
    } catch (error: any) {
        console.error("[API/versiones]", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
