"use client";

import { ChevronLeft, PlusCircle, Package, Copy, Search, Loader2, ChevronRight, Bug, Database, XCircle, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCompleteKitRestriction, suggestKitName, validateKitCandidate } from "@/lib/kit-mix-match";

type ActiveField = "sku" | "color" | "version" | "kit_sku" | null;
type SortColumn = "code" | "description";
type SortConfig = { field: Exclude<ActiveField, null>; column: SortColumn; direction: "asc" | "desc" } | null;

const FieldHelp = ({ label, help, large = false }: { label: string; help: string; large?: boolean }) => (
    <div className="group/field-help relative ml-2 flex w-fit items-center gap-2">
        <label className={`font-bold text-[#64748B] ${large ? "text-[1rem]" : "text-[0.9rem]"}`}>{label}</label>
        <button type="button" aria-label={`Ver ejemplo de ${label}`} className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#3499CD] text-[0.7rem] font-black leading-none text-[#3499CD] outline-none transition-transform hover:scale-110 focus:scale-110">
            ?
        </button>
        <div className="pointer-events-none absolute left-0 top-full z-[220] mt-3 w-[360px] max-w-[80vw] rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-[0.78rem] font-semibold leading-relaxed text-[#527083] opacity-0 shadow-xl transition-all duration-200 group-hover/field-help:opacity-100 group-focus-within/field-help:opacity-100">
            <span className="font-black text-[#0F364B]">Ejemplo: </span>{help}
        </div>
    </div>
);

// El blanco 0100 es el único acabado compartido entre muebles y productos
// de mármol/fibra de vidrio.
const SHARED_COLOR_CODES = new Set(["0100"]);

// Acabados exclusivos de mármol y fibra de vidrio. Ninguno de estos puede
// utilizarse en muebles; el resto del catálogo se considera color de mueble.
const MATERIAL_ONLY_COLOR_CODES = new Set([
    "0056", "0101", "0102", "0103", "0106", "0107", "0111",
    "0115", "0116", "0118", "0125", "0129", "0141", "0147",
    "0149", "0150", "0155", "0160", "0300", "0347", "0348",
    "0360", "0371", "0380", "0381", "0382", "0383", "0437",
    "0500", "0501", "0502", "0503", "0504", "0508", "0510", "0512",
    "0541", "0561", "0590", "0647", "0685", "0721", "0727",
    "0763", "0773", "0775", "0900", "0901", "0902", "0904",
    "0943", "0947", "0950", "0960", "0961",
]);

const MATERIAL_ALLOWED_COLOR_CODES = new Set([
    ...MATERIAL_ONLY_COLOR_CODES,
    ...SHARED_COLOR_CODES,
]);
// Acabados de la línea mármol/granito. No son fabricables en hidroaeros,
// hidromasajes, tinas ni en kits derivados de esas familias.
const MARBLE_LINE_COLOR_CODES = new Set([
    "0347", "0348", "0360", "0380", "0381", "0382", "0383",
    "0900", "0901", "0902", "0904", "0943", "0947", "0950",
    "0960", "0961",
]);
const MARBLE_LINE_COLOR_TERMS = [
    "GRANITO", "STONE", "UVATUBA", "GALAXIA",
];
// Acabados de uso exclusivo en superficies de trabajo. En SAP los colores
// Blanco Fort y Gris Fort también aparecen como Granito Blanco y Granito Gris.
const WORK_SURFACE_ONLY_COLOR_CODES = new Set(["0900", "0901", "0904", "0950"]);
const WORK_SURFACE_ONLY_COLOR_TERMS = [
    "GRANITO PERLA", "GRANO PERLA", "BLANCO FORT", "GRIS FORT",
    "GRANITO CHAMPANA", "GRANO CHAMPANA",
    "GRANITO BLANCO", "GRANITO GRIS",
];
// Respaldo para nombres futuros que todavía no tengan un código catalogado.
const MATERIAL_COLOR_TERMS = [
    "BLANCO FORT",
    "GRIS NIEBLA",
    "GRANITO",
    "MARMOL SINTETICO",
    "PORCELANA FRIA",
    "ARENA F.V",
    "AZUL CIELO FV",
    "VERDE PRIMAVERA FV",
    "CARIBE SHELL",
];
// Acabados que SAP puede listar, pero que no son fabricables en productos de
// mármol o fibra de vidrio.
const MATERIAL_FORBIDDEN_COLOR_TERMS = ["GRIS SOMBRA"];
const MATERIAL_FORBIDDEN_COLOR_CODES = new Set(["0503"]);
const normalizeCatalogText = (value: unknown) =>
    String(value ?? "")
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

const isInactiveSapItem = (item: any) =>
    item?.isActive === false || normalizeCatalogText(item?.STATUS) === "INACTIVO";


const validateKitItem = async (item: any) => {
    const response = await fetch(`/api/sap/skus?exact=${encodeURIComponent(item.SKU)}&limit=1&validateKit=true`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "No fue posible validar la LDM del artículo.");

    const validatedItem = payload.data?.[0];
    if (!validatedItem?.hasProductTree) {
        throw new Error(`El SKU ${item.SKU} no tiene una LDM válida en SAP y no puede utilizarse para crear kits.`);
    }
    if (validatedItem.isSpa && !validatedItem.isMultipersonal) {
        throw new Error(`El SKU ${item.SKU} es una referencia SPA cuya LDM no contiene un equipo MULTIPERSONAL. No puede utilizarse para crear kits.`);
    }

    return { ...item, ...validatedItem };
};

const MATERIAL_PRODUCT_TERMS = [
    "MARMOL",
    "FIBRA DE VIDRIO",
    "PORCELANA FRIA",
    "GELCOAT",
    "LAVAMANOS",
    "LAVABO",
    "LAVARROPAS",
    "LAVADERO",
    "LAVAPLATOS",
    "MESON",
    "HIDROMASAJE",
    "BANERA",
    "TINA",
    "VANITY",
    "SMC",
];

const MATERIAL_PRODUCT_SKU_PREFIXES = [
    "VBAN01", "VBAN02", "VBAN03", "VBAN04", "VBAN07", "VBAN08",
    "VBAN13", "VBAN14", "VBAN17", "VBAN18", "VBAN20", "VBAN21",
    "VBAN25", "VBAN26", "VBAN28", "VBAN29", "VBAN33",
    "VCOC04", "VCOC05", "VCOC07",
    "VHEM", "VHPT", "VTIN",
    "VROP01", "VROP02", "VROP04", "VROP05", "VROP06", "VROP09",
    "VROP13",
    "CSMC01", "VSMC01", "VQUA",
];
// Familias comerciales cuyo producto principal es un mueble. Las familias de
// kits con lavamanos conservan prioridad como producto de material.
const FURNITURE_PRODUCT_SKU_PREFIXES = [
    "VBAN05", "VBAN06", "VBAN12", "VBAN15", "VBAN16", "VBAN22",
    "VBAN23", "VBAN24", "VBAN27", "VBAN30", "VBAN31", "VBAN32",
    "VCOC01", "VCOC02", "VCOC03", "VCOC08", "VCOC09",
    "VCLO01",
    "VROP03", "VROP07", "VROP10", "VROP11", "VROP12", "VOUT03",
];
const FURNITURE_PRODUCT_TERMS = [
    "MUEBLE",
    "MBLE",
    "ALACENA",
    "GABINETE",
    "ESPEJO",
    "CARB ",
    "HRJ ",
];
const FIBERGLASS_BATH_SKU_PREFIXES = ["VHEM", "VHPT", "VTIN"];
const FIBERGLASS_BATH_PRODUCT_TERMS = [
    "HIDROAERO", "HIDROMASAJE", "TINA", "BANERA",
];
const WORK_SURFACE_PRODUCT_TERMS = [
    "MESON", "MESONES", "BARRA", "BARRAS",
    "MESA DE TRABAJO", "MESAS DE TRABAJO", "LAVAPLATOS",
];

const matchesProductPrefix = (sku: string, prefixes: string[]) => {
    const comparableSku = sku.startsWith("C") ? `V${sku.slice(1)}` : sku;
    return prefixes.some(prefix => comparableSku.startsWith(prefix));
};
const isItemGroupSelection = (item: any) =>
    item?.GROUP_CODE !== undefined || item?.GROUP_NAME !== undefined;

const isMaterialProduct = (item: any) => {
    const sku = normalizeCatalogText(item?.SKU ?? item?.ItemCode);
    const description = normalizeCatalogText(item?.GROUP_NAME ?? item?.DESCRIPCION ?? item?.ItemName);

    // En creación desde cero se selecciona un grupo SAP, no un SKU. En ese caso
    // la clasificación se obtiene directamente del nombre del grupo.
    if (isItemGroupSelection(item)) {
        return MATERIAL_PRODUCT_TERMS.some(term => description.includes(term));
    }

    // La familia SAP es la fuente principal. Esto permite reconocer correctamente
    // kits que incluyen la palabra "mueble" pero cuyo color corresponde a la superficie.
    if (matchesProductPrefix(sku, MATERIAL_PRODUCT_SKU_PREFIXES)) return true;

    if (!sku.startsWith("V")) return false;
    if (FURNITURE_PRODUCT_TERMS.some(term => description.includes(term))) return false;

    return MATERIAL_PRODUCT_TERMS.some(term => description.includes(term));
};

const isFurnitureProduct = (item: any) => {
    if (!item || isMaterialProduct(item)) return false;

    const sku = normalizeCatalogText(item?.SKU ?? item?.ItemCode);
    const description = normalizeCatalogText(item?.GROUP_NAME ?? item?.DESCRIPCION ?? item?.ItemName);

    if (isItemGroupSelection(item)) {
        return FURNITURE_PRODUCT_TERMS.some(term => description.includes(term));
    }

    if (matchesProductPrefix(sku, FURNITURE_PRODUCT_SKU_PREFIXES)) return true;
    if (!sku.startsWith("V")) return false;
    return FURNITURE_PRODUCT_TERMS.some(term => description.includes(term));
};
const isFiberglassBathProduct = (item: any) => {
    if (!item) return false;

    const sku = normalizeCatalogText(item?.SKU ?? item?.ItemCode);
    const description = normalizeCatalogText(item?.GROUP_NAME ?? item?.DESCRIPCION ?? item?.ItemName);
    return matchesProductPrefix(sku, FIBERGLASS_BATH_SKU_PREFIXES) ||
        FIBERGLASS_BATH_PRODUCT_TERMS.some(term =>
            new RegExp(`(^|[^A-Z0-9])${term}([^A-Z0-9]|$)`).test(description)
        );
};
const isWorkSurfaceProduct = (item: any) => {
    if (!item) return false;

    const description = normalizeCatalogText(item?.GROUP_NAME ?? item?.DESCRIPCION ?? item?.ItemName);
    return WORK_SURFACE_PRODUCT_TERMS.some(term =>
        new RegExp(`(^|[^A-Z0-9])${term}([^A-Z0-9]|$)`).test(description)
    );
};
const getNormalizedColor = (item: any) => {
    const code = normalizeCatalogText(item?.CodigoColor ?? item?.Code);
    const text = normalizeCatalogText(`${code} ${item?.Color ?? item?.Name ?? ""}`);
    return { code, text };
};

const isAllowedMaterialColor = (item: any) => {
    const { code, text } = getNormalizedColor(item);
    return MATERIAL_ALLOWED_COLOR_CODES.has(code) || MATERIAL_COLOR_TERMS.some(term => text.includes(term));
};

const isFurnitureForbiddenColor = (item: any) => {
    const { code, text } = getNormalizedColor(item);
    if (SHARED_COLOR_CODES.has(code)) return false;
    return MATERIAL_ONLY_COLOR_CODES.has(code) || MATERIAL_COLOR_TERMS.some(term => text.includes(term));
};

const isMarbleLineColor = (item: any) => {
    const { code, text } = getNormalizedColor(item);
    return MARBLE_LINE_COLOR_CODES.has(code) ||
        MARBLE_LINE_COLOR_TERMS.some(term => text.includes(term));
};

const isWorkSurfaceOnlyColor = (item: any) => {
    const { code, text } = getNormalizedColor(item);
    return WORK_SURFACE_ONLY_COLOR_CODES.has(code) ||
        WORK_SURFACE_ONLY_COLOR_TERMS.some(term => text.includes(term));
};

const getWorkSurfaceOnlyColorRestriction = (sku: any, color: any) => {
    if (!sku || !color || !isWorkSurfaceOnlyColor(color) || isWorkSurfaceProduct(sku)) return null;

    const productName = sku?.GROUP_NAME ?? sku?.DESCRIPCION ?? sku?.SKU ?? sku?.ItemCode ?? "producto seleccionado";
    const colorName = color?.Color ?? color?.Name ?? color?.CodigoColor ?? color?.Code ?? "seleccionado";
    return `El producto ${productName} no puede crearse con el color "${colorName}". Grano Perla, Blanco Fort, Gris Fort y Grano Champaña son acabados exclusivos para mesones, barras, mesas de trabajo y lavaplatos de mármol sintético.`;
};

const getSyntheticMarbleWorkSurfaceColorRestriction = (sku: any, color: any) => {
    if (!sku || !color || !isMaterialProduct(sku) || !isWorkSurfaceProduct(sku)) return null;
    if (isWorkSurfaceOnlyColor(color)) return null;

    const productName = sku?.GROUP_NAME ?? sku?.DESCRIPCION ?? sku?.SKU ?? sku?.ItemCode ?? "producto seleccionado";
    const colorName = color?.Color ?? color?.Name ?? color?.CodigoColor ?? color?.Code ?? "seleccionado";
    return `El producto de mármol sintético ${productName} no puede crearse con el color "${colorName}". Los mesones, barras, mesas de trabajo y lavaplatos de mármol sintético deben usar Blanco Fort, Gris Fort, Grano Perla o Grano Champaña; no se permiten colores planos como blanco o natural.`;
};

const getFiberglassBathMarbleColorRestriction = (sku: any, color: any) => {
    if (!sku || !color || !isFiberglassBathProduct(sku) || !isMarbleLineColor(color)) return null;

    const productName = sku?.GROUP_NAME ?? sku?.DESCRIPCION ?? sku?.SKU ?? sku?.ItemCode ?? "producto seleccionado";
    const colorName = color?.Color ?? color?.Name ?? color?.CodigoColor ?? color?.Code ?? "seleccionado";
    return `El producto ${productName} no puede crearse con el color de línea mármol "${colorName}". Los hidroaeros, hidromasajes, tinas y sus kits solo pueden fabricarse con acabados compatibles de fibra de vidrio.`;
};

const getFurnitureColorRestriction = (sku: any, color: any) => {
    if (!sku || !color) return null;
    if (!isFurnitureProduct(sku) || !isFurnitureForbiddenColor(color)) return null;

    const skuCode = sku?.GROUP_NAME ?? sku?.DESCRIPCION ?? sku?.SKU ?? sku?.ItemCode ?? "mueble seleccionado";
    const colorName = color?.Color ?? color?.Name ?? color?.CodigoColor ?? color?.Code ?? "seleccionado";
    return `El mueble ${skuCode} no puede crearse con el color "${colorName}" porque es un acabado exclusivo de mármol o fibra de vidrio. Selecciona un color disponible para muebles.`;
};

const getMaterialProductColorRestriction = (sku: any, color: any) => {
    if (!sku || !color) return null;
    if (!isMaterialProduct(sku)) return null;

    const skuCode = sku?.GROUP_NAME ?? sku?.DESCRIPCION ?? sku?.SKU ?? sku?.ItemCode ?? "seleccionado";
    const colorName = color?.Color ?? color?.Name ?? color?.CodigoColor ?? color?.Code ?? "seleccionado";
    const { code: normalizedColorCode, text: normalizedColor } = getNormalizedColor(color);
    if (
        MATERIAL_FORBIDDEN_COLOR_CODES.has(normalizedColorCode) ||
        MATERIAL_FORBIDDEN_COLOR_TERMS.some(term => normalizedColor.includes(term))
    ) {
        return `El producto ${skuCode} no puede crearse en el color "${colorName}" porque GRIS SOMBRA no se fabrica en productos de mármol o fibra de vidrio. Selecciona otro acabado.`;
    }
    if (isAllowedMaterialColor(color)) return null;

    return `El producto ${skuCode} no puede crearse con el color de mueble "${colorName}". Para productos de mármol o fibra de vidrio, selecciona un acabado compatible con su material.`;
};
const MATERIAL_ONLY_VERSION_TERMS = ["PERF", "PERFORACION"];

const getFurnitureVersionRestriction = (sku: any, version: any) => {
    if (!sku || !version || !isFurnitureProduct(sku)) return null;

    const versionCode = version?.CodigoVersion ?? version?.Code ?? "seleccionada";
    const versionName = version?.Version ?? version?.Name ?? versionCode;
    const normalizedVersion = normalizeCatalogText(`${versionCode} ${versionName}`);
    if (!MATERIAL_ONLY_VERSION_TERMS.some(term => normalizedVersion.includes(term))) return null;

    const skuCode = sku?.SKU ?? sku?.ItemCode ?? "mueble seleccionado";
    return `El mueble ${skuCode} no puede usar la versión "${versionName}" porque las versiones de perforación son exclusivas de mesones. Selecciona una versión compatible con muebles.`;
};

const getProductConfigurationRestriction = (sku: any, color: any, version?: any) =>
    getSyntheticMarbleWorkSurfaceColorRestriction(sku, color) ||
    getWorkSurfaceOnlyColorRestriction(sku, color) ||
    getFiberglassBathMarbleColorRestriction(sku, color) ||
    getFurnitureColorRestriction(sku, color) ||
    getMaterialProductColorRestriction(sku, color) ||
    getFurnitureVersionRestriction(sku, version);
const getProductColorRestriction = (sku: any, color: any) =>
    getSyntheticMarbleWorkSurfaceColorRestriction(sku, color) ||
    getWorkSurfaceOnlyColorRestriction(sku, color) ||
    getFiberglassBathMarbleColorRestriction(sku, color) ||
    getFurnitureColorRestriction(sku, color) ||
    getMaterialProductColorRestriction(sku, color);
const buildConfiguredSku = (sku: any, color: any, version?: any) => {
    const skuCode = normalizeCatalogText(sku?.SKU ?? sku?.ItemCode);
    const colorCode = normalizeCatalogText(color?.CodigoColor ?? color?.Code);
    const versionCode = normalizeCatalogText(version?.CodigoVersion ?? version?.Code);
    if (!skuCode || !colorCode) return null;

    const segments = skuCode.split("-");
    if (segments.length >= 4) {
        const colorIndex = segments.length - 1;
        const versionIndex = segments.length - 2;
        if (versionCode) segments[versionIndex] = versionCode;
        segments[colorIndex] = colorCode;
        return segments.join("-");
    }

    return `${skuCode}-${colorCode}`;
};

const findExistingConfiguredSku = async (sku: any, color: any, version?: any) => {
    const targetSku = buildConfiguredSku(sku, color, version);
    if (!targetSku) return null;

    const response = await fetch(`/api/sap/skus?exact=${encodeURIComponent(targetSku)}&limit=1`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "No fue posible validar el SKU en SAP.");

    const exists = (payload.data || []).some((item: any) => normalizeCatalogText(item?.SKU) === targetSku);
    return exists ? targetSku : null;
};

const getExistingSkuMessage = (sku: string) => {
    const segments = sku.split("-");
    const versionCode = segments.at(-2) || "seleccionada";
    const colorCode = segments.at(-1) || "seleccionado";
    return `Este ítem ya existe con el color seleccionado. El artículo ${sku} ya está creado en SAP con el color ${colorCode} y la versión ${versionCode}. Selecciona otra combinación.`;
};
export default function CreacionPage() {
    const supabase = createClient();
    const [selectedAction, setSelectedAction] = useState<string | null>(null);
    const [debug, setDebug] = useState(false);

    // Connection & Table States
    const [activeColoresTable, setActiveColoresTable] = useState<string>("BD_ COLORES_GRUPOS");
    const [skuTable, setSkuTable] = useState<string>("SAP_SKU");
    const [connStatus, setConnStatus] = useState<"checking" | "connected" | "error">("checking");
    const [detailedError, setDetailedError] = useState<string | null>(null);

    // Search States (Inputs)
    const [skuInput, setSkuInput] = useState("");
    const [colorInput, setColorInput] = useState("");
    const [versionInput, setVersionInput] = useState("");

    // Independent Result States
    const [skuResults, setSkuResults] = useState<any[]>([]);
    const [colorResults, setColorResults] = useState<any[]>([]);
    const [versionResults, setVersionResults] = useState<any[]>([]);

    // Selected Details States
    const [selectedSku, setSelectedSku] = useState<any>(null);
    const [selectedColor, setSelectedColor] = useState<any>(null);
    const [selectedVersion, setSelectedVersion] = useState<any>(null);

    // Kit States
    const [kitInput, setKitInput] = useState("");
    const [kitResults, setKitResults] = useState<any[]>([]);
    const [kitName, setKitName] = useState("");
    const [kitAdditional, setKitAdditional] = useState("");
    const [kitSelectedItems, setKitSelectedItems] = useState<any[]>([]);

    // Form Inputs (Global for all sub-modules)
    const [comentarios, setComentarios] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);

    // Kit compatibility error toast
    const [kitCompatError, setKitCompatError] = useState<string | null>(null);

    // Pagination States
    const [hasMore, setHasMore] = useState<Record<string, boolean>>({ sku: true, color: true, version: true, kit_sku: true });

    // Control States
    const [activeField, setActiveField] = useState<ActiveField>(null);
    const [loading, setLoading] = useState<Record<string, boolean>>({ sku: false, color: false, version: false, kit_sku: false });
    const [loadingMore, setLoadingMore] = useState<Record<string, boolean>>({ sku: false, color: false, version: false, kit_sku: false });
    const [sortConfig, setSortConfig] = useState<SortConfig>(null);

    // Click outside listener refs
    const skuRef = useRef<HTMLDivElement>(null);
    const colorRef = useRef<HTMLDivElement>(null);
    const versionRef = useRef<HTMLDivElement>(null);
    const kitRef = useRef<HTMLDivElement>(null);

    // Sync Refs for scroll lock and offset tracking (avoids stale closures entirely)
    const fetchingRef = useRef<Record<string, boolean>>({ sku: false, color: false, version: false, kit_sku: false });
    const offsetRef = useRef<Record<string, number>>({ sku: 0, color: 0, version: 0, kit_sku: 0 });
    const abortControllersRef = useRef<Record<string, AbortController | null>>({ sku: null, color: null, version: null, kit_sku: null });

    // Cache cliente: almacena resultados recientes para mostrarlos instantáneamente
    // Clave: "field:query" -> { data, hasMore, ts }
    const searchCacheRef = useRef<Map<string, { data: any[], hasMore: boolean, nextOffset?: number, ts: number }>>(new Map());
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

    // Connection Check & Table Detection
    useEffect(() => {
        const controller = new AbortController();
        let cancelled = false;
        const timeoutId = window.setTimeout(() => controller.abort(), 18000);

        const checkConnection = async () => {
            try {
                const res = await fetch("/api/sap/skus?limit=1", { signal: controller.signal });
                if (!res.ok) throw new Error("SAP Connection failed");
                if (!cancelled) setConnStatus("connected");
            } catch {
                if (!cancelled) setConnStatus("error");
            } finally {
                window.clearTimeout(timeoutId);
            }
        };

        checkConnection();
        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
            controller.abort();
        };
    }, []);

    const performSearch = useCallback(async (field: ActiveField, value: string, isAppending = false) => {
        if (!field) return;

        // Si es una nueva búsqueda, abortamos la petición anterior de ese campo
        if (!isAppending) {
            if (abortControllersRef.current[field]) {
                abortControllersRef.current[field].abort();
            }
            abortControllersRef.current[field] = new AbortController();
        } else {
            if (fetchingRef.current[field]) return;
        }

        const currentController = abortControllersRef.current[field];
        fetchingRef.current[field] = true;

        if (!isAppending && value.trim().length > 0) {
            if (field === "sku" && (selectedSku?.SKU !== value && selectedSku?.DESCRIPCION !== value)) setSelectedSku(null);
            else if (field === "color" && (selectedColor?.Color !== value && selectedColor?.CodigoColor !== value)) setSelectedColor(null);
            else if (field === "version" && (selectedVersion?.Version !== value && selectedVersion?.CodigoVersion !== value)) setSelectedVersion(null);
        }

        // Una primera página más pequeña responde más rápido; el resto continúa
        // cargándose con la paginación al desplazarse por la lista.
        const BATCH_SIZE = field === "sku" || field === "kit_sku" ? 60 : 100;
        if (!isAppending) offsetRef.current[field] = 0;
        const offset = offsetRef.current[field];

        // ─── CACHE CLIENTE: mostrar resultados instantáneos si ya fueron buscados ───
        const activeSortToken = sortConfig?.field === field
            ? `${sortConfig.column}-${sortConfig.direction}`
            : "default";
        const catalogType = field === "sku" && selectedAction === "de_cero"
            ? "item-groups"
            : (field === "sku" && selectedAction === "estructura") || field === "kit_sku"
                ? `${field}-ventas-v4-${activeSortToken}`
                : field;
        const cacheKey = `${catalogType}:${value.trim().toUpperCase()}:${offset}`;
        if (!isAppending) {
            const cached = searchCacheRef.current.get(cacheKey);
            if (cached && (Date.now() - cached.ts < CACHE_TTL_MS)) {
                // Mostrar resultados del caché instantáneamente
                const displayCol = (field === "sku" || field === "kit_sku") ? "SKU" : field === "color" ? "CodigoColor" : "CodigoVersion";
                const updateList = (prev: any[]) => {
                    return Array.from(new Map(cached.data.map((item: any) => [item[displayCol] ?? Math.random(), item])).values());
                };
                if (field === "sku") setSkuResults(updateList);
                else if (field === "color") setColorResults(updateList);
                else if (field === "version") setVersionResults(updateList);
                else if (field === "kit_sku") setKitResults(updateList);
                setHasMore(prev => ({ ...prev, [field]: cached.hasMore }));
                offsetRef.current[field] = cached.nextOffset ?? cached.data.length;
                fetchingRef.current[field] = false;
                return; // No hacer fetch si el caché es reciente
            }
        }
        // ─────────────────────────────────────────────

        if (isAppending) setLoadingMore(prev => ({ ...prev, [field]: true }));
        else setLoading(prev => ({ ...prev, [field]: true }));

        try {
            let endpoint = "";
            let displayCodeCol = "";

            if (field === "sku" && selectedAction === "de_cero") {
                endpoint = "/api/sap/item-groups";
                displayCodeCol = "SKU";
            } else if (field === "sku" || field === "kit_sku") {
                endpoint = "/api/sap/skus";
                displayCodeCol = "SKU";
            } else if (field === "color") {
                endpoint = "/api/sap/colores";
                displayCodeCol = "CodigoColor";
            } else {
                endpoint = "/api/sap/versiones";
                displayCodeCol = "CodigoVersion";
            }

            const skuFilters = field === "kit_sku"
                ? "&salesOnly=true&vOnly=true&kitComponents=true"
                : field === "sku" && selectedAction === "estructura"
                    ? "&vOnly=true"
                    : "";
            const serverSort = ((field === "sku" && selectedAction === "estructura") || field === "kit_sku") && sortConfig?.field === field
                ? `&sort=${sortConfig.column === "code" ? "code" : "description"}&direction=${sortConfig.direction}`
                : "";
            const url = `${endpoint}?search=${encodeURIComponent(value)}&offset=${offset}&limit=${BATCH_SIZE}${skuFilters}${serverSort}`;
            const res = await fetch(url, {
                signal: currentController?.signal
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Error fetching SAP data");
            }

            const resData = await res.json();
            const rawData: any[] = resData.data || [];
            // Defensa adicional en el cliente: en referencias y componentes de kit
            // nunca se muestran códigos C (compras), aunque SAP o un caché antiguo
            // llegaran a devolverlos.
            const onlySalesCodes =
                (field === "sku" && selectedAction === "estructura") || field === "kit_sku";
            const newData = onlySalesCodes
                ? rawData.filter(item => normalizeCatalogText(item?.SKU).startsWith("V"))
                : rawData;

            offsetRef.current[field] += rawData.length;
            setHasMore(prev => ({ ...prev, [field]: resData.hasMore }));

            const displayCol = displayCodeCol;
            const appendData = isAppending;
            const updateList = (prev: any[]) => {
                const arr = appendData ? [...prev, ...newData] : newData;
                return Array.from(new Map(arr.map((item: any) => [item[displayCol] ?? Math.random(), item])).values());
            };

            if (field === "sku") setSkuResults(updateList);
            else if (field === "color") setColorResults(updateList);
            else if (field === "version") setVersionResults(updateList);
            else if (field === "kit_sku") setKitResults(updateList);

            // Guardar en caché (solo búsquedas nuevas, no paginación)
            if (!isAppending) {
                // Limpiar entradas viejas si el caché es grande
                if (searchCacheRef.current.size > 50) {
                    const oldestKey = searchCacheRef.current.keys().next().value;
                    if (oldestKey) searchCacheRef.current.delete(oldestKey);
                }
                searchCacheRef.current.set(cacheKey, { data: newData, hasMore: resData.hasMore, nextOffset: rawData.length, ts: Date.now() });
            }

        } catch (err: any) {
            if (err.name === 'AbortError') {
                console.log(`Fetch aborted for field: ${field}`);
                return;
            }
            console.error("Search Error:", err);
            setDetailedError(err.message);
        } finally {
            fetchingRef.current[field] = false;
            if (isAppending || abortControllersRef.current[field] === currentController) {
                if (isAppending) setLoadingMore(prev => ({ ...prev, [field]: false }));
                else setLoading(prev => ({ ...prev, [field]: false }));
            }
        }
    }, [selectedSku, selectedColor, selectedVersion, selectedAction, sortConfig]);

    // Consolidated typing effect with concurrency protection (debounce)
    useEffect(() => {
        if (activeField) {
            const val = activeField === "sku" ? skuInput : 
                        activeField === "color" ? colorInput : 
                        activeField === "kit_sku" ? kitInput : versionInput;
            // En el selector de grupos, limpiar el texto vuelve a cargar la lista completa.
            const isGroupSelector = activeField === "sku" && selectedAction === "de_cero";
            const clearCurrentSearch = () => {
                abortControllersRef.current[activeField]?.abort();
                abortControllersRef.current[activeField] = null;
                fetchingRef.current[activeField] = false;
                offsetRef.current[activeField] = 0;
                if (activeField === "sku") { setSkuResults([]); setSelectedSku(null); }
                else if (activeField === "color") { setColorResults([]); setSelectedColor(null); }
                else if (activeField === "version") { setVersionResults([]); setSelectedVersion(null); }
                else if (activeField === "kit_sku") setKitResults([]);
                setLoading(prev => ({ ...prev, [activeField]: false }));
                setLoadingMore(prev => ({ ...prev, [activeField]: false }));
                setHasMore(prev => ({ ...prev, [activeField]: true }));
            };
            if (!isGroupSelector && val.trim().length === 0) {
                clearCurrentSearch();
                return;
            }
            // Las búsquedas de una sola letra obligan a SAP a recorrer casi todo
            // el catálogo y normalmente se reemplazan enseguida al seguir escribiendo.
            if (!isGroupSelector && val.trim().length === 1) {
                clearCurrentSearch();
                return;
            }
            const timer = setTimeout(() => {
                performSearch(activeField, val);
            }, 400);
            return () => clearTimeout(timer);
        }
    }, [skuInput, colorInput, kitInput, versionInput, activeField, selectedAction, performSearch]);

    const handleFocus = (field: ActiveField) => {
        if (field !== "sku") setSkuResults([]);
        if (field !== "color") setColorResults([]);
        if (field !== "version") setVersionResults([]);
        if (field !== "kit_sku") setKitResults([]);

        setActiveField(field);
        const isGroupSelector = field === "sku" && selectedAction === "de_cero";
        const val = field === "sku" ? skuInput : field === "color" ? colorInput : field === "kit_sku" ? kitInput : versionInput;
        if (isGroupSelector || val.trim().length > 0) {
            performSearch(field, isGroupSelector ? "" : val);
        }
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>, field: ActiveField) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        const fieldKey = field as string;
        if (scrollHeight - scrollTop <= clientHeight + 100 && !fetchingRef.current[fieldKey] && hasMore[fieldKey]) {
            const val = field === "sku" ? skuInput : field === "color" ? colorInput : field === "kit_sku" ? kitInput : versionInput;
            performSearch(field, val, true);
        }
    };

    // Revalida las restricciones aunque la selección ya existiera o se haya
    // realizado en un orden diferente (SKU antes/después del color).
    useEffect(() => {
        if (selectedAction !== "estructura" && selectedAction !== "de_cero") return;
        if (!selectedSku || !selectedColor) return;

        const restriction = selectedAction === "estructura"
            ? getProductConfigurationRestriction(selectedSku, selectedColor, selectedVersion)
            : getProductColorRestriction(selectedSku, selectedColor);

        if (restriction) setDetailedError(restriction);
    }, [selectedAction, selectedSku, selectedColor, selectedVersion]);
    useEffect(() => {
        setDetailedError(null);
        setKitCompatError(null);
        setSortConfig(null);
    }, [selectedAction]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (skuRef.current && !skuRef.current.contains(event.target as Node)) { setSkuResults([]); setHasMore(p => ({ ...p, sku: true })); }
            if (colorRef.current && !colorRef.current.contains(event.target as Node)) { setColorResults([]); setHasMore(p => ({ ...p, color: true })); }
            if (versionRef.current && !versionRef.current.contains(event.target as Node)) { setVersionResults([]); setHasMore(p => ({ ...p, version: true })); }
            if (kitRef.current && !kitRef.current.contains(event.target as Node)) { setKitResults([]); setHasMore(p => ({ ...p, kit_sku: true })); }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSubmit = async () => {
        if (!selectedAction) return;

        const blockingError = detailedError || kitCompatError;
        if (blockingError) {
            alert(`No puedes finalizar la solicitud mientras exista esta restricción: ${blockingError}`);
            return;
        }

        if (selectedAction === "estructura" && !selectedSku) {
            const error = "Selecciona el SKU de referencia desde la lista desplegable antes de finalizar.";
            setDetailedError(error);
            alert(error);
            return;
        }

        const configurationRestriction = selectedAction === "estructura"
            ? getProductConfigurationRestriction(selectedSku, selectedColor, selectedVersion)
            : selectedAction === "de_cero"
                ? getProductColorRestriction(selectedSku, selectedColor)
                : null;
        if (configurationRestriction) {
            setDetailedError(configurationRestriction);
            alert(configurationRestriction);
            return;
        }

        if (selectedAction === "estructura" && selectedSku && selectedColor) {
            setIsCheckingDuplicate(true);
            try {
                const existingSku = await findExistingConfiguredSku(selectedSku, selectedColor, selectedVersion);
                if (existingSku) {
                    const error = getExistingSkuMessage(existingSku);
                    setDetailedError(error);
                    alert(error);
                    return;
                }
            } catch (error: any) {
                const message = `No fue posible comprobar si la combinación ya existe: ${error.message}`;
                setDetailedError(message);
                alert(message);
                return;
            } finally {
                setIsCheckingDuplicate(false);
            }
        }
        // Validaciones por tipo de módulo (solo aplican a Crear de Cero y Kit)
        if (selectedAction === "de_cero") {
            if (!selectedSku || !selectedColor || !selectedVersion || !comentarios.trim()) {
                alert("Por favor, seleccione Grupo de artículos, Color, Versión y añada Comentarios para finalizar la solicitud desde cero.");
                return;
            }
        }

        if (selectedAction === "kit") {
            const inactiveKitItems = kitSelectedItems.filter(isInactiveSapItem);
            if (inactiveKitItems.length > 0) {
                const inactiveCodes = inactiveKitItems.map(item => item.SKU).filter(Boolean).join(", ");
                const error = `No puedes crear el kit porque contiene artículos inactivos: ${inactiveCodes}. Elimina los artículos inactivos y selecciona referencias activas.`;
                setKitCompatError(error);
                alert(error);
                return;
            }

            if (kitSelectedItems.length > 0) {
                setIsCheckingDuplicate(true);
                try {
                    await Promise.all(kitSelectedItems.map(validateKitItem));
                } catch (error: any) {
                    const message = error.message || "Un artículo del kit no tiene una LDM válida.";
                    setKitCompatError(message);
                    alert(message);
                    return;
                } finally {
                    setIsCheckingDuplicate(false);
                }
            }

            const compositionError = getCompleteKitRestriction(kitSelectedItems);
            const error = !kitName.trim()
                ? "Debes escribir el nombre del kit antes de finalizar."
                : compositionError;
            if (error) {
                setKitCompatError(error);
                alert(error);
                return;
            }
        }
        setIsSubmitting(true);
        try {
            const rowData = {
                tipo: selectedAction,
                sku_referencia: selectedAction === "estructura"
                    ? selectedSku?.SKU
                    : selectedAction === "de_cero"
                        ? selectedSku?.GROUP_NAME || selectedSku?.DESCRIPCION
                        : null,
                color_codigo: selectedColor?.CodigoColor || null,
                version_codigo: selectedVersion?.CodigoVersion || selectedVersion?.Version || null,
                kit_articulos: selectedAction === "kit" ? kitSelectedItems : null,
                kit_nombre: selectedAction === "kit" ? [kitName.trim(), kitAdditional.trim()].filter(Boolean).join(" - ") : null,
                comentarios: comentarios,
            };

            const { error } = await supabase.from("solicitudes").insert(rowData);
            if (error) throw error;

            setSubmitSuccess(true);
            // Deja el formulario completamente vacío apenas la solicitud queda
            // guardada, evitando que una nueva solicitud herede selecciones previas.
            Object.values(abortControllersRef.current).forEach(controller => controller?.abort());
            abortControllersRef.current = { sku: null, color: null, version: null, kit_sku: null };
            fetchingRef.current = { sku: false, color: false, version: false, kit_sku: false };
            offsetRef.current = { sku: 0, color: 0, version: 0, kit_sku: 0 };
            setActiveField(null);
            setSkuInput(""); setSelectedSku(null); setSkuResults([]);
            setColorInput(""); setSelectedColor(null); setColorResults([]);
            setVersionInput(""); setSelectedVersion(null); setVersionResults([]);
            setKitInput(""); setKitResults([]); setKitSelectedItems([]); setKitName(""); setKitAdditional("");
            setComentarios("");
            setDetailedError(null); setKitCompatError(null);
            setHasMore({ sku: true, color: true, version: true, kit_sku: true });
            setLoading({ sku: false, color: false, version: false, kit_sku: false });
            setLoadingMore({ sku: false, color: false, version: false, kit_sku: false });
            setTimeout(() => {
                setSubmitSuccess(false);
                setSelectedAction(null);
            }, 2000);
        } catch (err: any) {
            console.error("Error al crear solicitud:", err);
            alert("Hubo un error al enviar la solicitud: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

        const handleSelect = async (field: ActiveField, item: any) => {
            const requiresSalesCode =
                (field === "sku" && selectedAction === "estructura") || field === "kit_sku";
            if (requiresSalesCode && !normalizeCatalogText(item?.SKU).startsWith("V")) {
                const error = `El código ${item?.SKU || "seleccionado"} es de compra. En este módulo solo se permiten SKU de venta que comiencen por V.`;
                if (field === "kit_sku") setKitCompatError(error);
                else setDetailedError(error);
                if (field === "sku") setSkuResults([]);
                else setKitResults([]);
                return;
            }
            if ((field === "sku" || field === "kit_sku") && isInactiveSapItem(item)) {
                const error = `El SKU ${item.SKU || "seleccionado"} está INACTIVO en SAP y no puede agregarse al kit.`;
                if (field === "kit_sku") {
                    setKitCompatError(error);
                    setTimeout(() => setKitCompatError(null), 7000);
                } else {
                    setDetailedError(error);
                    setTimeout(() => setDetailedError(null), 7000);
                }
                return;
            }

            const candidateSku = field === "sku" ? item : selectedSku;
            const candidateColor = field === "color" ? item : selectedColor;
            const candidateVersion = field === "version" ? item : selectedVersion;
            const configurationRestriction =
                selectedAction === "estructura" && (field === "sku" || field === "color" || field === "version")
                    ? getProductConfigurationRestriction(candidateSku, candidateColor, candidateVersion)
                    : selectedAction === "de_cero" && (field === "sku" || field === "color")
                        ? getProductColorRestriction(candidateSku, candidateColor)
                        : null;

            if (configurationRestriction) {
                setDetailedError(configurationRestriction);
                setTimeout(() => setDetailedError(null), 7000);
                return;
            }
            if (selectedAction === "estructura" && candidateSku && candidateColor && (field === "sku" || field === "color" || field === "version")) {
                setIsCheckingDuplicate(true);
                try {
                    const existingSku = await findExistingConfiguredSku(candidateSku, candidateColor, candidateVersion);
                    if (existingSku) {
                        setDetailedError(getExistingSkuMessage(existingSku));
                        return;
                    }
                } catch (error: any) {
                    setDetailedError(`No fue posible comprobar si la combinación ya existe: ${error.message}`);
                    return;
                } finally {
                    setIsCheckingDuplicate(false);
                }
            }
            // Limpia inmediatamente cualquier aviso anterior cuando la selección sí es válida.
            setDetailedError(null);
            if (field === "sku") {
                setSkuInput(item.SKU);
                setSelectedSku(item);
            } else if (field === "color") {
                setColorInput(item.CodigoColor); // Match screenshot: use code instead of name
                setSelectedColor(item);
            } else if (field === "version") {
                setVersionInput(item.CodigoVersion); // Match screenshot: use code instead of name
                setSelectedVersion(item);
            } else if (field === "kit_sku") {
                if (!item.isVCode || !item.isVentas) {
                    const error = "En los kits solo se permiten códigos V marcados como artículos de ventas en SAP.";
                    setKitCompatError(error);
                    setTimeout(() => setKitCompatError(null), 6000);
                    return;
                }
                let validatedKitItem = item;
                setIsCheckingDuplicate(true);
                try {
                    validatedKitItem = await validateKitItem(item);
                } catch (error: any) {
                    const message = error.message || "El artículo no tiene una LDM válida para crear kits.";
                    setKitCompatError(message);
                    setTimeout(() => setKitCompatError(null), 8000);
                    return;
                } finally {
                    setIsCheckingDuplicate(false);
                }

                // Prevent duplicates
                if (kitSelectedItems.some(i => i.SKU === validatedKitItem.SKU)) {
                    setKitInput("");
                    setKitResults([]);
                    setActiveField(null);
                    return;
                }

                // Check compatibility rules based on Firplak Catalog
                const compatibilityError = validateKitCandidate(validatedKitItem, kitSelectedItems);
                if (compatibilityError) {
                    setKitCompatError(compatibilityError);
                    setTimeout(() => setKitCompatError(null), 6000);
                    return; // Stop adding if incompatible
                }

                const nextKitItems = [...kitSelectedItems, validatedKitItem];
                if (nextKitItems.length === 2) {
                    const pairError = getCompleteKitRestriction(nextKitItems);
                    if (pairError) {
                        setKitCompatError(pairError);
                        setTimeout(() => setKitCompatError(null), 8000);
                        return;
                    }
                }

                setKitSelectedItems(nextKitItems);
                const suggestedName = suggestKitName(nextKitItems);
                if (suggestedName) setKitName(suggestedName);
                setKitInput("");
                setKitResults([]);
            }

            if (field === "sku") setSkuResults([]);
            else if (field === "color") setColorResults([]);
            else if (field === "version") setVersionResults([]);
            else if (field === "kit_sku") setKitResults([]);
            // En kits mantenemos la búsqueda activa para escribir el segundo componente sin desenfocar.
            setActiveField(field === "kit_sku" ? "kit_sku" : null);
        };

        const renderSearchDropdown = ({ field, results, isLoading, isMoreLoading }: { field: ActiveField, results: any[], isLoading: boolean, isMoreLoading: boolean }) => {
            const isGroupSearch = field === "sku" && selectedAction === "de_cero";
            const isArticleSearch = (field === "sku" && !isGroupSearch) || field === "kit_sku";
            const requiresSalesCode =
                (field === "sku" && selectedAction === "estructura") || field === "kit_sku";
            const visibleResults = requiresSalesCode
                ? results.filter(item => normalizeCatalogText(item?.SKU).startsWith("V"))
                : results;
            if (visibleResults.length === 0 && !isLoading) return null;

            const toggleSort = (column: SortColumn, firstDirection: "asc" | "desc" = "asc") => {
                if (!field) return;
                setSortConfig(current => ({
                    field,
                    column,
                    direction: current?.field === field && current.column === column
                        ? (current.direction === "asc" ? "desc" : "asc")
                        : firstDirection,
                }));
            };
            const activeSort = field && sortConfig?.field === field ? sortConfig : null;
            const sortedVisibleResults = activeSort
                ? [...visibleResults].sort((left, right) => {
                    const getValue = (item: any) => activeSort.column === "code"
                        ? (field === "sku" || field === "kit_sku" ? item.SKU : field === "color" ? item.CodigoColor : item.CodigoVersion)
                        : (field === "sku" || field === "kit_sku" ? item.DESCRIPCION : field === "color" ? item.Color : item.Version);
                    const comparison = normalizeCatalogText(getValue(left)).localeCompare(
                        normalizeCatalogText(getValue(right)),
                        "es",
                        { numeric: true, sensitivity: "base" },
                    );
                    return activeSort.direction === "asc" ? comparison : -comparison;
                })
                : visibleResults;

            const h1 = isGroupSearch ? "CÓDIGO" : (field === "sku" || field === "kit_sku") ? "NRO. ARTÍCULO" : field === "color" ? "CÓDIGO COLOR" : "CÓDIGO VERSIÓN";
            const h2 = isGroupSearch ? "GRUPO DE ARTÍCULOS" : (field === "sku" || field === "kit_sku") ? "DESCRIPCIÓN SAP" : field === "color" ? "DESCRIPCIÓN COLOR" : "DESCRIPCIÓN VERSIÓN";

            // Helper para resaltar el término buscado en el texto
            const currentInput = field === "sku" ? skuInput : field === "color" ? colorInput : field === "kit_sku" ? kitInput : versionInput;
            const highlightText = (text: string) => {
                if (!currentInput.trim() || !text) return <span>{text}</span>;
                const query = currentInput.trim().toUpperCase();
                const upper = text.toUpperCase();
                const idx = upper.indexOf(query);
                if (idx === -1) return <span>{text}</span>;
                return (
                    <span>
                        {text.slice(0, idx)}
                        <mark className="bg-yellow-200 text-[#0F172A] rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
                        {text.slice(idx + query.length)}
                    </span>
                );
            };

            return (
                <div className={`absolute top-[calc(100%-1.5rem)] left-1/2 -translate-x-1/2 ${field === 'version' ? 'w-auto min-w-[100%]' : field === 'kit_sku' ? 'w-[130%]' : 'w-[150%]'} bg-white rounded-[1.2rem] shadow-[0_25px_60px_rgba(15,23,42,0.18)] border border-slate-200 overflow-hidden z-[200] animate-in fade-in slide-in-from-top-2 duration-300`}>
                    {/* Header Match ScreenShot */}
                    <div className="flex bg-[#eff2f5] border-b border-slate-200 font-black text-[0.65rem] tracking-[0.2em] text-[#324f5f]/60 uppercase italic">
                        <button type="button" onDoubleClick={() => toggleSort("code", "desc")} title={isArticleSearch ? "Doble clic para mostrar primero el último SKU creado" : "Doble clic para ordenar de mayor a menor o en orden inverso"} className="flex w-[25%] cursor-pointer items-center justify-between border-r border-[#dee2e6] px-6 py-3.5 text-left hover:bg-[#e3e9ee]">
                            <span>{h1}</span>
                            {activeSort?.column === "code" && <span className="ml-2 whitespace-nowrap text-[#3499CD]">{isArticleSearch ? (activeSort.direction === "desc" ? "ÚLTIMO SKU" : "PRIMER SKU") : (activeSort.direction === "asc" ? "MENOR–MAYOR" : "MAYOR–MENOR")}</span>}
                        </button>
                        <button type="button" onClick={() => toggleSort("description")} title="Clic para ordenar A–Z o Z–A" className="flex w-[75%] cursor-pointer items-center justify-between px-6 py-3.5 text-left hover:bg-[#e3e9ee]">
                            <span>{h2}</span>
                            {activeSort?.column === "description" && <span className="ml-2 whitespace-nowrap text-[#3499CD]">{activeSort.direction === "asc" ? "A–Z" : "Z–A"}</span>}
                        </button>
                    </div>

                    {/* Scrollable Body Container */}
                    <div
                        className="max-h-[450px] overflow-y-auto custom-scrollbar bg-white"
                        onScroll={(e) => handleScroll(e, field)}
                    >
                        {isLoading ? (
                            <div className="py-24 text-center">
                                <div className="flex flex-col items-center gap-6">
                                    <Loader2 className="w-12 h-12 text-[#3499CD] animate-spin" />
                                    <span className="text-[0.7rem] font-bold uppercase tracking-[0.6em] text-[#3499CD]/40">Sincronizando Catálogo...</span>
                                </div>
                            </div>
                        ) : visibleResults.length === 0 ? (
                            <div className="py-16 text-center">
                                <span className="text-[0.75rem] font-bold uppercase tracking-widest text-slate-300">Sin resultados para tu búsqueda</span>
                            </div>
                        ) : (
                            <>
                                {sortedVisibleResults.map((item, idx) => {
                                    const stableKey =
                                        field === 'sku' || field === 'kit_sku' ? item.SKU :
                                        field === 'color' ? item.CodigoColor :
                                        item.CodigoVersion;

                                    return (
                                        <div
                                            key={stableKey || `${field}-${idx}`}
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                console.log(`Selecting ${field}:`, item);
                                                handleSelect(field, item);
                                            }}
                                            className="flex w-full group cursor-pointer hover:bg-[#FFFBEB] border-b border-slate-100 last:border-0 transition-colors duration-200"
                                        >
                                            <div className="w-[25%] px-6 py-4 font-mono font-black text-[#0F172A] text-base tracking-tighter border-r border-slate-100 group-hover:text-[#3499CD] transition-colors">
                                                <div className="flex items-center gap-2">
                                                    {(field === "sku" || field === "kit_sku") ? highlightText(item.SKU || "S/C") :
                                                        field === "color" ? highlightText(item.CodigoColor || "S/C") : highlightText(item.CodigoVersion || "S/C")}
                                                    {(field === 'sku' || field === 'kit_sku') && item.STATUS && (
                                                        <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-black uppercase ${item.STATUS === 'ACTIVO' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                            {item.STATUS}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="w-[75%] px-6 py-4 font-black text-[#64748B] text-[0.85rem] uppercase group-hover:text-[#0F172A] transition-colors leading-relaxed">
                                                {(field === "sku" || field === "kit_sku") ? highlightText(item.DESCRIPCION || "SIN NOMBRE") :
                                                    field === "color" ? highlightText(item.Color || "SIN COLOR") : highlightText(item.Version || "SIN VERSIÓN")}
                                            </div>
                                        </div>
                                    );
                                })}

                                {isMoreLoading && (
                                    <div className="py-10 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-4 text-[#3499CD]">
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                        <span className="text-[0.6rem] font-black uppercase tracking-[0.5em] italic">Ampliando registros...</span>
                                    </div>
                                )}

                                {!isMoreLoading && hasMore[field as string] && visibleResults.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const value = field === "sku" ? skuInput : field === "color" ? colorInput : field === "kit_sku" ? kitInput : versionInput;
                                            performSearch(field, value, true);
                                        }}
                                        className="w-full py-5 bg-slate-50 border-t border-slate-100 text-[#3499CD] text-[0.65rem] font-black uppercase tracking-[0.3em] hover:bg-[#EFF8FC] transition-colors"
                                    >
                                        Cargar más resultados
                                    </button>
                                )}
                                {!hasMore[field as string] && results.length > 0 && (
                                    <div className="py-10 bg-slate-50/50 text-center border-t border-slate-50">
                                        <span className="text-[0.55rem] font-black uppercase tracking-widest text-slate-300">Catálogo Completo Cargado</span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            );
        };

        return (
            <div className="flex-1 w-full flex flex-col items-center justify-start min-h-screen bg-[#F8FAFC] p-8 pt-12 font-sans overflow-x-hidden">
                {/* Navigation & Header */}
                <div className="w-full max-w-6xl mb-12 flex justify-between items-center animate-in fade-in slide-in-from-top-4 duration-1000">
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={() => selectedAction ? setSelectedAction(null) : window.location.href = "/protected"}
                            className="flex items-center gap-5 text-[#0F172A] font-black text-4xl tracking-tighter hover:opacity-80 transition-all group"
                        >
                            <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100 group-hover:bg-[#F1F5F9] transition-all">
                                <ChevronLeft className="w-8 h-8 stroke-[4px]" />
                            </div>
                            <span className="uppercase italic relative">
                                {selectedAction ? "Creación de Solicitud de Código" : "Creación de Solicitud de Código"}
                                <div className={`absolute -bottom-2 left-0 w-48 h-1.5 bg-[#3499CD] rounded-full transition-all`} />
                            </span>
                        </button>
                    </div>

                    <div className="flex items-center gap-6">
                        {connStatus === "connected" && (
                            <div className="px-6 py-3 bg-white text-green-600 rounded-full border border-green-100 font-black text-[0.7rem] uppercase tracking-widest flex items-center gap-3 shadow-sm scale-90 md:scale-100 transition-all">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                                SAP Business One OK
                            </div>
                        )}
                        <button onClick={() => setDebug(!debug)} className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all">
                            <Bug className={`w-6 h-6 ${debug ? 'text-[#3499CD]' : 'text-slate-300'}`} />
                        </button>
                    </div>
                </div>

                {debug && (
                    <div className="w-full max-w-5xl mb-10 p-10 bg-[#0F172A] text-blue-300 font-mono text-[0.8rem] rounded-[2.5rem] border border-white/10 shadow-3xl animate-in zoom-in duration-500 overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                            <Database className="w-48 h-48 text-white" />
                        </div>
                        <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-10">
                            <div className="space-y-2">
                                <div className="text-white/20 text-[0.6rem] font-bold tracking-[0.3em] uppercase">Table SKU</div>
                                <div className="text-white font-bold text-lg tracking-tight">{skuTable}</div>
                            </div>
                            <div className="space-y-2">
                                <div className="text-white/20 text-[0.6rem] font-bold tracking-[0.3em] uppercase">Table Master</div>
                                <div className="text-white font-bold text-lg tracking-tight">{activeColoresTable}</div>
                            </div>
                            <div className="space-y-2">
                                <div className="text-white/20 text-[0.6rem] font-bold tracking-[0.3em] uppercase">Registros</div>
                                <div className="text-green-400 font-bold text-lg">{skuResults.length + colorResults.length + versionResults.length} total</div>
                            </div>
                            <div className="space-y-2">
                                <div className="text-white/20 text-[0.6rem] font-bold tracking-[0.3em] uppercase">Errores</div>
                                <div className="text-red-400 font-bold">{detailedError ? "SI" : "NO"}</div>
                            </div>
                        </div>
                    </div>
                )}

                {!selectedAction ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-12 w-full max-w-6xl mt-6">
                        {[
                            { id: "estructura", title: "Estructura referencia", icon: Copy, desc: "Usar base de SAP" },
                            { id: "de_cero", title: "Crear de cero", icon: PlusCircle, desc: "Nuevo artículo" },
                            { id: "kit", title: "Crear kit", icon: Package, desc: "Agrupar piezas" },
                        ].map((action) => (
                            <button
                                key={action.id}
                                onClick={() => setSelectedAction(action.id)}
                                className="group p-10 rounded-[3rem] bg-white hover:bg-[#324f5f] transition-all duration-700 border border-slate-50 flex flex-col items-center gap-6 shadow-[0_20px_40px_rgba(0,0,0,0.02)] hover:shadow-[0_40px_80px_rgba(50,79,95,0.2)] hover:-translate-y-2"
                            >
                                <div className="p-12 bg-[#F8FAFC] group-hover:bg-white/10 rounded-[3rem] transition-all duration-500 shadow-inner group-hover:scale-110 border border-slate-50">
                                    <action.icon className="w-16 h-16 text-[#324f5f] group-hover:text-white stroke-[1.2px]" />
                                </div>
                                <div className="flex flex-col items-center gap-2">
                                    <span className="font-black uppercase italic text-2xl text-[#324f5f] group-hover:text-white tracking-tight">{action.title}</span>
                                    <span className="text-slate-300 group-hover:text-white/50 text-[0.6rem] font-black uppercase tracking-[0.5em] italic">{action.desc}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="w-full max-w-4xl bg-white rounded-[2rem] p-16 shadow-[0_40px_80px_rgba(0,0,0,0.06)] border border-slate-100 space-y-12 relative animate-in zoom-in duration-700 overflow-visible">

                        {detailedError && (
                            <div className="animate-in slide-in-from-top-4 fade-in duration-300 flex items-start gap-4 p-5 bg-red-50 border-2 border-red-300 rounded-2xl shadow-md" role="alert">
                                <div className="shrink-0 w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                                    <AlertTriangle className="w-6 h-6 text-red-500" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-red-700 font-black text-sm uppercase tracking-wide">{detailedError.includes("ya existe en SAP") ? "Ítem ya existente" : detailedError.startsWith("SAP error") ? "Error al consultar SAP" : "Combinación no permitida"}</p>
                                    <p className="text-red-600 font-medium text-sm mt-1">{detailedError}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setDetailedError(null)}
                                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-100 rounded-xl transition-all"
                                    aria-label="Cerrar mensaje"
                                >
                                    <XCircle className="w-5 h-5" />
                                </button>
                            </div>
                        )}

                        {selectedAction === "estructura" ? (
                            <div className="space-y-10 animate-in slide-in-from-bottom-8 duration-500">
                                {/* Row 1: SKU (Full Width) */}
                                <div className="relative space-y-4" ref={skuRef}>
                                    <FieldHelp label="Buscar Código de Referencia" help="Escribe un SKU de venta que comience por V, por ejemplo VBAN05-0001-000-0100, o busca una palabra de la descripción, como MUEBLE." />
                                    <div className={`relative transition-all duration-700 ${activeField === 'sku' ? 'scale-[1.02] z-[201]' : 'z-10'}`}>
                                        <input
                                            type="text"
                                            value={skuInput}
                                            onFocus={() => handleFocus("sku")}
                                            onChange={(e) => setSkuInput(e.target.value)}
                                            placeholder="Ingrese SKU base..."
                                            className="w-full h-20 pl-10 pr-16 rounded-3xl border-2 border-[#E2E8F0] bg-white focus:border-[#3499CD] transition-all text-xl text-[#0F172A] font-medium placeholder:text-slate-300 shadow-sm text-center"
                                        />
                                        <Search className={`absolute right-8 top-1/2 -translate-y-1/2 w-7 h-7 ${activeField === 'sku' ? 'text-[#3499CD]' : 'text-[#334155]'}`} />
                                    </div>

                                    {/* SKU Selected Detail */}
                                    {selectedSku && !activeField && (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                                            <div className="w-full h-20 border-2 border-[#3499CD] rounded-2xl flex items-center justify-between gap-4 bg-white px-6">
                                                <span className="text-[#3499CD] font-black text-2xl tracking-tighter uppercase">
                                                    SKU Base: {selectedSku.SKU}
                                                </span>
                                                {selectedSku.STATUS && (
                                                    <span className={`rounded-full px-3 py-1 text-[0.7rem] font-black uppercase ${selectedSku.STATUS === 'ACTIVO' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                        {selectedSku.STATUS}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="space-y-1 pl-4">
                                                <div className="text-[#64748B] text-[0.8rem] font-bold uppercase tracking-wider">Descripción Base</div>
                                                <div className="text-[#0F364B] text-xl font-black uppercase leading-tight">
                                                    {selectedSku.DESCRIPCION}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {renderSearchDropdown({ field: "sku", results: skuResults, isLoading: loading.sku, isMoreLoading: loadingMore.sku })}
                                </div>

                                {/* Row 2: Color & Version */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative items-start">
                                    <div className="relative space-y-4" ref={colorRef}>
                                        <FieldHelp label="Buscar Color" help="Busca por código o nombre, por ejemplo 0100 o BLANCO. La aplicación validará si el acabado corresponde al producto." />
                                        <div className={`relative transition-all duration-700 ${activeField === 'color' ? 'scale-[1.02] z-[201]' : 'z-10'}`}>
                                            <input
                                                type="text"
                                                value={colorInput}
                                                onFocus={() => handleFocus("color")}
                                                onChange={(e) => setColorInput(e.target.value)}
                                                placeholder="Código o nombre..."
                                                className="w-full h-20 pl-10 pr-16 rounded-3xl border-2 border-[#E2E8F0] bg-white focus:border-[#3499CD] transition-all text-xl text-[#0F172A] font-medium placeholder:text-slate-300 shadow-sm text-center"
                                            />
                                            <Search className={`absolute right-8 top-1/2 -translate-y-1/2 w-7 h-7 ${activeField === 'color' ? 'text-[#3499CD]' : 'text-[#334155]'}`} />
                                        </div>

                                        {selectedColor && !activeField && (
                                            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                                                <div className="w-full h-16 border-2 border-[#3499CD] rounded-2xl flex items-center justify-center bg-white">
                                                    <span className="text-[#3499CD] font-black text-lg tracking-tighter uppercase">
                                                        Color: {selectedColor.CodigoColor}
                                                    </span>
                                                </div>
                                                <div className="pl-4">
                                                    <div className="text-[#64748B] text-[0.7rem] font-bold uppercase">Color Seleccionado</div>
                                                    <div className="text-[#0F364B] text-lg font-black uppercase italic">{selectedColor.Color}</div>
                                                </div>
                                            </div>
                                        )}

                                        {renderSearchDropdown({ field: "color", results: colorResults, isLoading: loading.color, isMoreLoading: loadingMore.color })}
                                    </div>

                                    <div className="relative space-y-4" ref={versionRef}>
                                        <FieldHelp label="Buscar Versión" help="La versión identifica una variación del mismo producto, como un mesón sin perforación o con perforación. Búscala por código o nombre." />
                                        <div className={`relative transition-all duration-700 ${activeField === 'version' ? 'scale-[1.02] z-[201]' : 'z-10'}`}>
                                            <input
                                                type="text"
                                                value={versionInput}
                                                onFocus={() => handleFocus("version")}
                                                onChange={(e) => setVersionInput(e.target.value)}
                                                placeholder="Versión..."
                                                className="w-full h-20 pl-10 pr-16 rounded-3xl border-2 border-[#E2E8F0] bg-white focus:border-[#3499CD] transition-all text-xl text-[#0F172A] font-medium placeholder:text-slate-300 shadow-sm text-center"
                                            />
                                            <Search className={`absolute right-8 top-1/2 -translate-y-1/2 w-7 h-7 ${activeField === 'version' ? 'text-[#3499CD]' : 'text-[#334155]'}`} />
                                        </div>

                                        {selectedVersion && !activeField && (
                                            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                                                <div className="w-full h-16 border-2 border-[#3499CD] rounded-2xl flex items-center justify-center bg-white">
                                                    <span className="text-[#3499CD] font-black text-lg tracking-tighter uppercase">
                                                        Versión: {selectedVersion.CodigoVersion || selectedVersion.Version}
                                                    </span>
                                                </div>
                                                <div className="pl-4">
                                                    <div className="text-[#64748B] text-[0.7rem] font-bold uppercase">Categoría</div>
                                                    <div className="text-[#0F364B] text-lg font-black uppercase italic">{selectedVersion.Version || selectedVersion.GroupName}</div>
                                                </div>
                                            </div>
                                        )}

                                        {renderSearchDropdown({ field: "version", results: versionResults, isLoading: loading.version, isMoreLoading: loadingMore.version })}
                                    </div>
                                </div>
                            </div>
                        ) : selectedAction === "kit" ? (
                            <div className="space-y-12 animate-in slide-in-from-bottom-8 duration-500">
                                {/* Kit Article Search */}
                                <div className="relative space-y-4" ref={kitRef}>
                                    {/* ── Compatibility Error Toast ── */}
                                    {kitCompatError && (
                                        <div className="animate-in slide-in-from-top-4 fade-in duration-500 mb-4 flex items-start gap-4 p-6 bg-red-50 border-2 border-red-300 rounded-2xl shadow-lg relative">
                                            <div className="shrink-0 w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                                                <AlertTriangle className="w-7 h-7 text-red-500" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-red-700 font-black text-[0.85rem] uppercase tracking-wide mb-1">🚨 Artículo Incompatible</p>
                                                <p className="text-red-600 font-medium text-[0.82rem] leading-relaxed whitespace-pre-line">{kitCompatError}</p>
                                            </div>
                                            <button
                                                onClick={() => setKitCompatError(null)}
                                                className="shrink-0 p-2 text-red-400 hover:text-red-600 hover:bg-red-100 rounded-xl transition-all"
                                            >
                                                <XCircle className="w-5 h-5" />
                                            </button>
                                            {/* Progress bar auto-close */}
                                            <div className="absolute bottom-0 left-0 h-1 bg-red-300 rounded-b-2xl animate-[shrink_6s_linear_forwards]" style={{ width: '100%' }} />
                                        </div>
                                    )}

                                    <FieldHelp large label="Añadir Artículo al Kit" help="Busca un SKU V o una palabra de su descripción. Solo se aceptan artículos activos, de ventas, con LDM válida y compatibles entre sí." />
                                    <div className={`relative transition-all duration-700 ${activeField === 'kit_sku' ? 'scale-[1.02] z-[201]' : 'z-10'}`}>
                                        <input
                                            type="text"
                                            value={kitInput}
                                            onFocus={() => handleFocus("kit_sku")}
                                            onChange={(e) => setKitInput(e.target.value.toUpperCase())}
                                            placeholder="CACC01-0004-000-0000"
                                            className="w-full h-16 pl-10 pr-16 rounded-2xl border-2 border-[#E2E8F0] bg-white focus:border-[#3499CD] transition-all text-xl text-[#0F172A] font-medium placeholder:text-slate-200 shadow-md text-center uppercase"
                                        />
                                        <Search className={`absolute right-10 top-1/2 -translate-y-1/2 w-8 h-8 ${activeField === 'kit_sku' ? 'text-[#3499CD]' : 'text-slate-400'}`} />
                                    </div>

                                    {/* Kit Selected Items List */}
                                    <div className="mt-8 space-y-3 max-h-[350px] overflow-y-auto custom-scrollbar p-2">
                                        {kitSelectedItems.map((item, i) => (
                                            <div key={i} className="flex items-center justify-between p-6 bg-[#F8FAFC] rounded-2xl border-l-[6px] border-l-[#0F364B] border-y border-r border-slate-100 group hover:shadow-md transition-all animate-in zoom-in slide-in-from-right-4 duration-300">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <span className="text-[#0F364B] font-black text-lg tracking-tight leading-none">{item.SKU}</span>
                                                        <span className={`rounded-full px-2.5 py-1 text-[0.6rem] font-black uppercase ${isInactiveSapItem(item) ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                            {isInactiveSapItem(item) ? "INACTIVO" : "ACTIVO"}
                                                        </span>
                                                        {item.isSpa && item.isMultipersonal && (
                                                            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[0.6rem] font-black uppercase text-sky-700">
                                                                SPA MULTIPERSONAL
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-slate-500 font-bold uppercase text-[0.75rem] leading-tight">{item.DESCRIPCION}</span>
                                                </div>
                                                <button
                                                    onClick={() => setKitSelectedItems(prev => prev.filter((_, idx) => idx !== i))}
                                                    className="p-2 text-[#FF5A5F] hover:bg-red-50 rounded-xl transition-all"
                                                >
                                                    <Trash2 className="w-6 h-6" />
                                                </button>
                                            </div>
                                        ))}
                                        {kitSelectedItems.length === 0 && (
                                            <div className="py-12 border-2 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center justify-center gap-4">
                                                <div className="p-4 bg-slate-50 rounded-full">
                                                    <Package className="w-10 h-10 text-slate-200" />
                                                </div>
                                                <span className="text-slate-300 font-bold uppercase text-[0.7rem] tracking-widest">Ningún artículo añadido</span>
                                            </div>
                                        )}
                                    </div>

                                    {renderSearchDropdown({ field: "kit_sku", results: kitResults, isLoading: loading.kit_sku, isMoreLoading: loadingMore.kit_sku })}
                                </div>

                                {/* Kit Name Field */}
                                <div className="space-y-4">
                                    <FieldHelp large label="Nombre del Kit" help="Describe los productos principales del kit, por ejemplo KIT LVM OSLO 79X48 - MUEBLE VITELI 79X48." />
                                    <textarea
                                        value={kitName}
                                        onChange={(e) => setKitName(e.target.value.toUpperCase())}
                                        placeholder="Ej: KIT LVM OSLO 79X48 MARFIL-MUEBLE VITELI 79X48"
                                        rows={3}
                                        className="w-full min-h-32 px-8 py-6 rounded-2xl border-2 border-[#E2E8F0] bg-white focus:border-[#3499CD] transition-all text-lg text-[#0F172A] font-black placeholder:text-slate-200 shadow-md text-left uppercase resize-y leading-relaxed"
                                    />
                                </div>

                                {/* Additional text appended to the kit name */}
                                <div className="space-y-4">
                                    <label className="text-[#64748B] font-bold text-[1rem] ml-2">Adicional u observación para el nombre</label>
                                    <input
                                        type="text"
                                        value={kitAdditional}
                                        onChange={(e) => setKitAdditional(e.target.value.toUpperCase())}
                                        placeholder="Ej: VERSIÓN ESPECIAL O NOMBRE DEL CLIENTE"
                                        className="w-full h-16 px-8 rounded-2xl border-2 border-[#E2E8F0] bg-white focus:border-[#3499CD] transition-all text-lg text-[#0F172A] font-bold placeholder:text-slate-200 shadow-md uppercase"
                                    />
                                    <p className="px-2 text-sm font-medium text-slate-400">
                                        Se agregará al final del nombre separado por un guion.
                                    </p>
                                    {kitName.trim() && kitAdditional.trim() && (
                                        <div className="rounded-2xl border border-sky-100 bg-sky-50 px-6 py-4">
                                            <span className="block text-[0.7rem] font-black uppercase tracking-wider text-[#3499CD] mb-1">Nombre final</span>
                                            <p className="text-sm font-bold text-[#0F364B] break-words">{kitName.trim()} - {kitAdditional.trim()}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-10 animate-in slide-in-from-bottom-8 duration-500">
                                {/* Row 1: Color & Version (grid-cols-2) */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative items-start">
                                    {/* Color */}
                                    <div className="relative space-y-4" ref={colorRef}>
                                        <FieldHelp label="Buscar Color" help="Busca por código o nombre, por ejemplo 0100 o BLANCO. El color debe ser compatible con el grupo de artículos elegido." />
                                        <div className={`relative transition-all duration-700 ${activeField === 'color' ? 'scale-[1.02] z-[201]' : 'z-10'}`}>
                                            <input
                                                type="text"
                                                value={colorInput}
                                                onFocus={() => handleFocus("color")}
                                                onChange={(e) => setColorInput(e.target.value)}
                                                placeholder="Código o nombre..."
                                                className="w-full h-20 pl-10 pr-16 rounded-3xl border-2 border-[#E2E8F0] bg-white focus:border-[#3499CD] transition-all text-xl text-[#0F172A] font-medium placeholder:text-slate-300 shadow-sm text-center"
                                            />
                                            <Search className={`absolute right-8 top-1/2 -translate-y-1/2 w-7 h-7 ${activeField === 'color' ? 'text-[#3499CD]' : 'text-[#334155]'}`} />
                                        </div>

                                        {selectedColor && !activeField && (
                                            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                                                <div className="w-full h-16 border-2 border-[#3499CD] rounded-2xl flex items-center justify-center bg-white">
                                                    <span className="text-[#3499CD] font-black text-lg tracking-tighter uppercase">
                                                        Color: {selectedColor.CodigoColor}
                                                    </span>
                                                </div>
                                                <div className="pl-4">
                                                    <div className="text-[#64748B] text-[0.7rem] font-bold uppercase">Color Seleccionado</div>
                                                    <div className="text-[#0F364B] text-lg font-black uppercase italic">{selectedColor.Color}</div>
                                                </div>
                                            </div>
                                        )}

                                        {renderSearchDropdown({ field: "color", results: colorResults, isLoading: loading.color, isMoreLoading: loadingMore.color })}
                                    </div>

                                    {/* Version */}
                                    <div className="relative space-y-4" ref={versionRef}>
                                        <FieldHelp label="Buscar Versión" help="La versión identifica una variación del producto, como sin perforación o con perforación. Búscala por código o nombre." />
                                        <div className={`relative transition-all duration-700 ${activeField === 'version' ? 'scale-[1.02] z-[201]' : 'z-10'}`}>
                                            <input
                                                type="text"
                                                value={versionInput}
                                                onFocus={() => handleFocus("version")}
                                                onChange={(e) => setVersionInput(e.target.value)}
                                                placeholder="Versión..."
                                                className="w-full h-20 pl-10 pr-16 rounded-3xl border-2 border-[#E2E8F0] bg-white focus:border-[#3499CD] transition-all text-xl text-[#0F172A] font-medium placeholder:text-slate-300 shadow-sm text-center"
                                            />
                                            <Search className={`absolute right-8 top-1/2 -translate-y-1/2 w-7 h-7 ${activeField === 'version' ? 'text-[#3499CD]' : 'text-[#334155]'}`} />
                                        </div>

                                        {selectedVersion && !activeField && (
                                            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                                                <div className="w-full h-16 border-2 border-[#3499CD] rounded-2xl flex items-center justify-center bg-white">
                                                    <span className="text-[#3499CD] font-black text-lg tracking-tighter uppercase">
                                                        Versión: {selectedVersion.CodigoVersion || selectedVersion.Version}
                                                    </span>
                                                </div>
                                                <div className="pl-4">
                                                    <div className="text-[#64748B] text-[0.7rem] font-bold uppercase">Categoría</div>
                                                    <div className="text-[#0F364B] text-lg font-black uppercase italic">{selectedVersion.Version || selectedVersion.GroupName}</div>
                                                </div>
                                            </div>
                                        )}

                                        {renderSearchDropdown({ field: "version", results: versionResults, isLoading: loading.version, isMoreLoading: loadingMore.version })}
                                    </div>
                                </div>

                                {/* Row 2: Grupo de artículos SAP (full width) */}
                                <div className="relative space-y-4" ref={skuRef}>
                                    <FieldHelp label="Grupo de artículos" help="Selecciona la familia SAP del nuevo producto, por ejemplo MUEBLES, MÁRMOL SINTÉTICO o FIBRA DE VIDRIO." />
                                    <div className={`relative transition-all duration-700 ${activeField === 'sku' ? 'scale-[1.02] z-[201]' : 'z-10'}`}>
                                        <input
                                            type="text"
                                            value={skuInput}
                                            onFocus={() => handleFocus("sku")}
                                            onChange={(e) => setSkuInput(e.target.value)}
                                            placeholder="Buscar por código o palabra..."
                                            className="w-full h-20 pl-10 pr-16 rounded-3xl border-2 border-[#E2E8F0] bg-white focus:border-[#3499CD] transition-all text-xl text-[#0F172A] font-medium placeholder:text-slate-300 shadow-sm text-center"
                                        />
                                        <Search className={`absolute right-8 top-1/2 -translate-y-1/2 w-7 h-7 ${activeField === 'sku' ? 'text-[#3499CD]' : 'text-[#334155]'}`} />
                                    </div>

                                    {selectedSku && !activeField && (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                                            <div className="w-full h-20 border-2 border-[#3499CD] rounded-2xl flex items-center justify-between gap-4 bg-white px-6">
                                                <span className="text-[#3499CD] font-black text-2xl tracking-tighter uppercase">
                                                    Grupo: {selectedSku.GROUP_NAME || selectedSku.DESCRIPCION}
                                                </span>
                                                {selectedSku.STATUS && (
                                                    <span className={`rounded-full px-3 py-1 text-[0.7rem] font-black uppercase ${selectedSku.STATUS === 'ACTIVO' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                        {selectedSku.STATUS}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="space-y-1 pl-4">
                                                <div className="text-[#64748B] text-[0.8rem] font-bold uppercase tracking-wider">Código interno del grupo</div>
                                                <div className="text-[#0F364B] text-xl font-black uppercase leading-tight">{selectedSku.GROUP_CODE || selectedSku.SKU}</div>
                                            </div>
                                        </div>
                                    )}

                                    {renderSearchDropdown({ field: "sku", results: skuResults, isLoading: loading.sku, isMoreLoading: loadingMore.sku })}
                                </div>

                                {/* Row 3: Comentarios */}
                                <div className="space-y-4">
                                    <FieldHelp label="Insertar comentarios" help="Explica el producto solicitado y cualquier detalle que no esté representado por el color o la versión." />
                                    <textarea
                                        rows={4}
                                        value={comentarios}
                                        onChange={(e) => setComentarios(e.target.value)}
                                        placeholder="Ingrese cualquier observación o detalle adicional..."
                                        className="w-full px-10 py-6 rounded-2xl border-2 border-[#E2E8F0] bg-white focus:border-[#3499CD] transition-all text-lg text-[#0F172A] font-medium placeholder:text-slate-300 shadow-sm resize-none outline-none"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Action Buttons common to all modules */}
                        <div className="pt-8 flex flex-col gap-4 relative z-0">
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting || isCheckingDuplicate || submitSuccess || Boolean(detailedError) || Boolean(kitCompatError)}
                                className={`w-full h-16 text-white font-black text-xl tracking-[0.2em] rounded-2xl shadow-xl transition-all uppercase flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#0F364B] disabled:active:scale-100
                                ${submitSuccess ? 'bg-green-500 scale-[1.02]' : 'bg-[#0F364B] hover:bg-[#0A2432] active:scale-[0.98]'}`}
                            >
                                {detailedError || kitCompatError ? (
                                    <span>CORRIJA LA RESTRICCIÓN</span>
                                ) : isSubmitting || isCheckingDuplicate ? (
                                    <Loader2 className="w-8 h-8 animate-spin" />
                                ) : submitSuccess ? (
                                    <>
                                        <CheckCircle2 className="w-8 h-8" />
                                        ¡SOLICITUD ENVIADA!
                                    </>
                                ) : (
                                    "FINALIZAR SOLICITUD"
                                )}
                            </button>

                            <button
                                onClick={() => setSelectedAction(null)}
                                disabled={isSubmitting || isCheckingDuplicate}
                                className="w-full h-16 border-2 border-[#0F364B] text-[#0F364B] font-black text-xl tracking-[0.2em] rounded-2xl hover:bg-slate-50 transition-all uppercase disabled:opacity-50"
                            >
                                VOLVER ATRÁS
                            </button>
                        </div>
                    </div>
                )}



            </div>
        );
    }
