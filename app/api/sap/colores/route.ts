import { NextResponse } from "next/server";
import { fetchSAP } from "@/lib/sap";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const offset = parseInt(searchParams.get("offset") || "0");
    const limit = parseInt(searchParams.get("limit") || "200");

    try {
        let filterQuery = "";
        if (search.trim()) {
            const upperSearch = search.trim().toUpperCase();
            const words = upperSearch.split(/\s+/).filter(w => w.length > 0);

            if (words.length === 1) {
                filterQuery = `&$filter=contains(Code,'${words[0]}') or contains(Name,'${words[0]}')`;
            } else {
                const nameFilters = words.map(w => `contains(Name,'${w}')`).join(' and ');
                filterQuery = `&$filter=(${nameFilters}) or contains(Code,'${words[0]}')`;
            }
        }

        const endpointPath = `/U_FIR_COLOR?$skip=${offset}&$top=${limit}&$orderby=Code asc${filterQuery}`;
        const res = await fetchSAP(endpointPath);

        if (!res.ok) {
            const errText = await res.text().catch(() => res.statusText);
            throw new Error(`SAP error ${res.status}: ${errText}`);
        }

        const data = await res.json();

        const formattedData = (data.value || []).map((item: any) => ({
            CodigoColor: item.Code,
            Color: item.Name
        }));

        const hasMore = !!(data['odata.nextLink'] || data['@odata.nextLink']);

        return NextResponse.json({ data: formattedData, hasMore });
    } catch (error: any) {
        console.error("[API/colores]", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
