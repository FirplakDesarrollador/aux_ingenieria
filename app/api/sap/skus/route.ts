import { NextResponse } from "next/server";
import { fetchSAP } from "@/lib/sap";

type CachedSkuSearch = { payload: { data: any[]; hasMore: boolean }; expiresAt: number };
const skuSearchCache = new Map<string, CachedSkuSearch>();
const SKU_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const SKU_SEARCH_CACHE_MAX_ENTRIES = 200;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const offset = parseInt(searchParams.get("offset") || "0");
    const limit = parseInt(searchParams.get("limit") || "200");
    const salesOnly = searchParams.get("salesOnly") === "true";
    const vOnly = searchParams.get("vOnly") === "true";
    const kitComponents = searchParams.get("kitComponents") === "true";
    const exact = (searchParams.get("exact") || "").trim().toUpperCase();
    const validateKit = searchParams.get("validateKit") === "true";
    const sort = (searchParams.get("sort") || "").trim().toLowerCase();
    const sortDirection = searchParams.get("direction") === "desc" ? "desc" : "asc";

    const cacheKey = JSON.stringify({ search: search.trim().toUpperCase(), offset, limit, salesOnly, vOnly, kitComponents, sort, sortDirection });
    if (!exact && !validateKit) {
        const cached = skuSearchCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return NextResponse.json(cached.payload, {
                headers: { "X-SAP-Search-Cache": "HIT" },
            });
        }
        if (cached) skuSearchCache.delete(cacheKey);
    }

    try {
        const filters: string[] = [];

        if (exact) {
            filters.push(`ItemCode eq '${exact.replace(/'/g, "''")}'`);
        } else if (search.trim()) {
            const upperSearch = search.trim().toUpperCase();
            const words = upperSearch
                .split(/\s+/)
                .filter(w => w.length > 0)
                .map(w => w.replace(/'/g, "''"));

            const looksLikeSku = (word: string) =>
                word.startsWith("V") || word.includes("-") || /^[A-Z]{2,}\d/.test(word);

            if (words.length === 1) {
                const w = words[0];
                // Evita el OR entre código y descripción: en Service Layer ese OR
                // fuerza recorridos mucho más costosos sobre toda la tabla Items.
                filters.push(looksLikeSku(w)
                    ? `(ItemCode eq '${w}' or startswith(ItemCode,'${w}'))`
                    : `contains(ItemName,'${w}')`);
            } else {
                if (looksLikeSku(words[0])) {
                    const [first, ...rest] = words;
                    filters.push([
                        `(ItemCode eq '${first}' or startswith(ItemCode,'${first}'))`,
                        ...rest.map(w => `contains(ItemCode,'${w}')`),
                    ].join(" and "));
                } else {
                    filters.push(words.map(w => `contains(ItemName,'${w}')`).join(' and '));
                }
            }
        }

        if (salesOnly) filters.push("SalesItem eq 'tYES'");
        if (vOnly) filters.push("startswith(ItemCode,'V')");
        if (kitComponents) {
            filters.push("not contains(ItemName,'KIT')");
        }

        const filterQuery = filters.length
            ? `&$filter=${filters.map(filter => `(${filter})`).join(' and ')}`
            : "";
        // Un solo campo en $orderby para conservar la paginación estable de SAP.
        // SAP muestra el último consecutivo creado ordenando ItemCode de forma descendente.
        const orderBy = sort === "code"
            ? `ItemCode ${sortDirection}`
            : sort === "description"
                ? `ItemName ${sortDirection}`
                : "ItemCode asc";
        const endpointPath = `/Items?$select=ItemCode,ItemName,SalesItem,Frozen,Valid&$skip=${offset}&$top=${limit}&$orderby=${orderBy}${filterQuery}`;
        const itemsRes = await fetchSAP(endpointPath);

        if (!itemsRes.ok) {
            const errText = await itemsRes.text().catch(() => itemsRes.statusText);
            throw new Error(`SAP error ${itemsRes.status}: ${errText}`);
        }

        const data = await itemsRes.json();
        const rawItems: any[] = data.value || [];

        // Ordenar en el servidor antes de enviar:
        // 1. Códigos que empiezan con 'V' (VBAN, VCOC, etc.) al frente
        // 2. Luego el resto de artículos de ventas (SalesItem = tYES)
        // 3. Resto al final
        rawItems.sort((a, b) => {
            const aIsV = a.ItemCode?.startsWith('V') ? 0 : 1;
            const bIsV = b.ItemCode?.startsWith('V') ? 0 : 1;
            if (aIsV !== bIsV) return aIsV - bIsV;

            const aIsVentas = a.SalesItem === 'tYES' ? 0 : 1;
            const bIsVentas = b.SalesItem === 'tYES' ? 0 : 1;
            if (aIsVentas !== bIsVentas) return aIsVentas - bIsVentas;

            return (a.ItemCode || '').localeCompare(b.ItemCode || '');
        });

        let formattedData = rawItems.map((item: any) => {
            // En SAP Business One Service Layer el indicador se llama `Valid`.
            // `ValidFor` no pertenece a la entidad Items y provoca un error 400.
            const isActive = item.Frozen !== 'tYES' && item.Valid !== 'tNO';
            return {
                SKU: item.ItemCode,
                DESCRIPCION: item.ItemName,
                isVentas: item.SalesItem === 'tYES',
                isVCode: item.ItemCode?.startsWith('V') ?? false,
                STATUS: isActive ? 'ACTIVO' : 'INACTIVO',
                isActive,
            };
        });

        if (exact && validateKit && formattedData.length > 0) {
            formattedData = await Promise.all(formattedData.map(async item => {
                const normalizedDescription = String(item.DESCRIPCION || "").toUpperCase();
                const isSpa = item.SKU?.startsWith("VHPT") || normalizedDescription.includes("SPA");
                const escapedSku = String(item.SKU).replace(/'/g, "''");
                const treeResponse = await fetchSAP(`/ProductTrees('${escapedSku}')`);

                if (treeResponse.status === 404) {
                    return { ...item, hasProductTree: false, isSpa, isMultipersonal: false };
                }
                if (!treeResponse.ok) {
                    const details = await treeResponse.text().catch(() => treeResponse.statusText);
                    throw new Error(`SAP error ${treeResponse.status} al validar la LDM: ${details}`);
                }

                const productTree = await treeResponse.json();
                const lines: any[] = productTree.ProductTreeLines || [];
                const hasProductTree = lines.length > 0;
                const isMultipersonal = isSpa && lines.some(line =>
                    String(`${line.ItemName || ""} ${line.LineText || ""}`)
                        .toUpperCase()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .includes("MULTIPERSONAL")
                );

                return { ...item, hasProductTree, isSpa, isMultipersonal };
            }));
        }

        // hasMore: SAP envía nextLink, o como fallback si recibimos exactamente 'limit' items
        const hasMore = !!(data['odata.nextLink'] || data['@odata.nextLink']) || rawItems.length >= limit;

        const payload = { data: formattedData, hasMore };
        if (!exact && !validateKit) {
            if (skuSearchCache.size >= SKU_SEARCH_CACHE_MAX_ENTRIES) {
                const oldestKey = skuSearchCache.keys().next().value;
                if (oldestKey) skuSearchCache.delete(oldestKey);
            }
            skuSearchCache.set(cacheKey, {
                payload,
                expiresAt: Date.now() + SKU_SEARCH_CACHE_TTL_MS,
            });
        }

        return NextResponse.json(payload, {
            headers: { "X-SAP-Search-Cache": "MISS" },
        });
    } catch (error: any) {
        console.error("[API/skus]", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
