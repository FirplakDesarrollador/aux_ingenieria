import { NextResponse } from "next/server";
import { fetchSAP } from "@/lib/sap";
import { getCachedSearch, setCachedSearch } from "@/lib/api-search-cache";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "200", 10) || 200));
    const cacheKey = `item-groups:${search.toUpperCase()}:${offset}:${limit}`;
    const cached = getCachedSearch<{ data: any[]; hasMore: boolean }>(cacheKey);
    if (cached) return NextResponse.json(cached, { headers: { "X-SAP-Search-Cache": "HIT" } });

    try {
        const escapedSearch = search.toUpperCase().replace(/'/g, "''");
        const isNumericSearch = /^\d+$/.test(escapedSearch);
        const filterQuery = escapedSearch
            ? `&$filter=${isNumericSearch
                ? `Number eq ${Number.parseInt(escapedSearch, 10)}`
                : `contains(GroupName,'${escapedSearch}')`}`
            : "";
        const endpointPath = `/ItemGroups?$select=Number,GroupName&$skip=${offset}&$top=${limit}&$orderby=GroupName asc${filterQuery}`;
        const response = await fetchSAP(endpointPath);

        if (!response.ok) {
            const errorText = await response.text().catch(() => response.statusText);
            throw new Error(`SAP error ${response.status}: ${errorText}`);
        }

        const payload = await response.json();
        const groups: any[] = payload.value || [];
        const data = groups.map(group => ({
            SKU: String(group.Number),
            DESCRIPCION: group.GroupName,
            GROUP_CODE: group.Number,
            GROUP_NAME: group.GroupName,
        }));
        const hasMore = Boolean(payload["odata.nextLink"] || payload["@odata.nextLink"]) || groups.length >= limit;

        const result = { data, hasMore };
        setCachedSearch(cacheKey, result);
        return NextResponse.json(result, { headers: { "X-SAP-Search-Cache": "MISS" } });
    } catch (error: any) {
        console.error("[API/item-groups]", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
