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

const FURNITURE_CONTEXT_TERMS = [
    "MUEBLE", "MBLE", "ALACENA", "GABINETE", "CLOSET", "TABLERO",
];
const FURNITURE_CONTEXT_PREFIXES = [
    "VBAN05", "VBAN06", "VBAN12", "VBAN15", "VBAN16", "VBAN22",
    "VBAN23", "VBAN24", "VBAN27", "VBAN30", "VBAN31", "VBAN32", "VBAN33",
    "VCOC01", "VCOC02", "VCOC03", "VCOC08", "VCOC09", "VCLO01",
    "VROP03", "VROP07", "VROP10", "VROP11", "VROP12", "VOUT03",
];

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

const loadVersionsFromExistingItems = async (contextKey: string, contextName: string, sapFilter: string) => {
    const cacheKey = `versions-context:${contextKey}`;
    const cached = getCachedSearch<ContextVersion[]>(cacheKey);
    if (cached) return cached;

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

    const normalizedContextName = normalizeText(contextName);
    const contextSkuPrefix = contextKey.startsWith("SKU:")
        ? contextKey.slice(4).split("-")[0]
        : "";
    const isFurnitureContext = FURNITURE_CONTEXT_PREFIXES.includes(contextSkuPrefix) ||
        FURNITURE_CONTEXT_TERMS.some(term => normalizedContextName.includes(term)) ||
        (!contextKey.startsWith("GROUP:") && items.some(item => {
            const itemName = normalizeText(item.ItemName);
            return FURNITURE_CONTEXT_TERMS.some(term => itemName.includes(term));
        }));
    if (isFurnitureContext) {
        const standardDetails = versions.get("STD") || versions.get("000");
        const moistureResistantDetails = versions.get("MRH");
        const furnitureVersions: ContextVersion[] = [
            {
                CodigoVersion: "STD",
                Version: "MUEBLE ESTÁNDAR (STD)",
                EjemploSAP: standardDetails?.sample || "Versión estándar para muebles y muebles de cocina",
                CantidadSAP: standardDetails?.count || 0,
                ContextKey: contextKey,
            },
            {
                CodigoVersion: "MRH",
                Version: "MUEBLE RESISTENTE A LA HUMEDAD (MRH)",
                EjemploSAP: moistureResistantDetails?.sample || "Versión resistente a la humedad para muebles y muebles de cocina",
                CantidadSAP: moistureResistantDetails?.count || 0,
                ContextKey: contextKey,
            },
        ];
        setCachedSearch(cacheKey, furnitureVersions);
        return furnitureVersions;
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

    setCachedSearch(cacheKey, data);
    return data;
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const search = normalizeText(searchParams.get("search"));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "100", 10) || 100));
    const referenceBase = getReferenceBase(searchParams.get("sku") || "");
    const groupCode = Number.parseInt(searchParams.get("groupCode") || "", 10);
    const contextName = searchParams.get("productName") || "";

    try {
        let contextKey = "";
        let sapFilter = "";

        if (referenceBase) {
            const escapedBase = referenceBase.replace(/'/g, "''");
            contextKey = `SKU:${referenceBase}`;
            sapFilter = `SalesItem eq 'tYES' and startswith(ItemCode,'${escapedBase}-')`;
        } else if (Number.isFinite(groupCode)) {
            contextKey = `GROUP:${groupCode}`;
            sapFilter = `SalesItem eq 'tYES' and startswith(ItemCode,'V') and ItemsGroupCode eq ${groupCode}`;
        } else {
            return NextResponse.json({
                data: [],
                hasMore: false,
                error: "Selecciona primero un SKU de referencia o un grupo de artículos para consultar sus versiones existentes en SAP.",
            }, { status: 400 });
        }

        const contextualVersions = await loadVersionsFromExistingItems(contextKey, contextName, sapFilter);
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
