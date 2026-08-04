type DrainRule = "both" | "left";

type IntegratedRule = {
    sinks: readonly string[];
    leftOnly?: readonly string[];
    sinkDimensions?: Readonly<Record<string, string>>;
};

type KitCatalogItem = {
    SKU?: string;
    ItemCode?: string;
    DESCRIPCION?: string;
    ItemName?: string;
    [key: string]: unknown;
};

const normalizeCatalogText = (value: unknown) => String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

const hasCatalogTerm = (text: string, term: string) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s/-]+");
    return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`).test(text);
};

const sinkRule = (
    sinks: readonly string[],
    leftOnly: readonly string[] = [],
    sinkDimensions?: Readonly<Record<string, string>>,
): IntegratedRule => ({ sinks, leftOnly, sinkDimensions });

const FULL_63 = ["OSLO", "SIENA", "GENOVA", "BARI", "QUADRATTO", "PARMA", "TRENTINO"] as const;
const FULL_79 = ["OSLO", "SIENA", "GENOVA", "BARI", "QUADRATTO", "PARMA"] as const;
const CLASSIC_48 = ["OSLO", "SIENA", "QUADRATTO", "RIO"] as const;

// Catálogo oficial Firplak de baños, guía Mix & Match, páginas 62 a 66 (06-05-2026).
// Fuente: "Renders LVM y MBL Mix and Match (Compatibilidad completa).csv"
// La matriz se expresa por modelo y por medida para impedir cruces basados solo en dimensiones.
const INTEGRATED_MIX_MATCH: Record<string, Record<string, IntegratedRule>> = {
    GODAI: {
        "48X43": sinkRule(["RIO", "QUADRATTO", "SIENA", "OSLO"]),
        "63X48": sinkRule(["TRENTINO", "PARMA", "BARI", "QUADRATTO", "GENOVA", "SIENA", "OSLO", "MECA"], ["DOHA"]),
        "79X48": sinkRule(["PARMA", "BARI", "QUADRATTO", "GENOVA", "SIENA", "OSLO"]),
    },
    VITELLI: {
        "63X48": sinkRule(["TRENTINO", "PARMA", "BARI", "QUADRATTO", "GENOVA", "SIENA", "OSLO", "MECA"], ["DOHA"]),
        "79X48": sinkRule(["PARMA", "BARI", "QUADRATTO", "GENOVA", "SIENA", "OSLO"]),
        "94X48": sinkRule(["BARI", "QUADRATTO", "GENOVA", "SIENA", "OSLO"]),
        "124X48": sinkRule(["GENOVA", "SIENA", "OSLO"]),
    },
    GRECO: {
        "63X48": sinkRule(["TRENTINO", "PARMA", "BARI", "GENOVA", "SIENA", "OSLO", "MECA"], ["DOHA"]),
        "79X48": sinkRule(["PARMA", "BARI", "GENOVA", "SIENA", "OSLO"]),
        "94X48": sinkRule(["BARI", "GENOVA", "SIENA", "OSLO"]),
        "124X48": sinkRule(["GENOVA", "SIENA", "OSLO"]),
    },
    MACAO: {
        "48X38": sinkRule(["OSLO"]),
        "48X43": sinkRule(["RIO", "QUADRATTO", "SIENA", "OSLO"]),
        "63X48": sinkRule(["BARI", "GENOVA", "SIENA", "OSLO", "MECA"], ["DOHA"]),
        "79X48": sinkRule(["BARI", "GENOVA", "SIENA", "OSLO"]),
        "94X48": sinkRule(["GENOVA", "SIENA", "OSLO"]),
        "124X48": sinkRule(["GENOVA", "SIENA", "OSLO"]),
    },
    MISUS: {
        "63X48": sinkRule(["TRENTINO", "PARMA", "BARI", "GENOVA", "SIENA", "OSLO", "MECA"], ["DOHA"]),
        "79X48": sinkRule(["PARMA", "BARI", "GENOVA", "SIENA", "OSLO"]),
        "94X48": sinkRule(["BARI", "GENOVA", "SIENA", "OSLO"]),
    },
    THALOS: {
        "79X48": sinkRule(["PARMA", "BARI", "GENOVA", "SIENA", "OSLO"]),
    },
    OTUS: {
        "63X48": sinkRule(["PARMA", "GENOVA", "SIENA", "OSLO", "MECA"], ["DOHA"]),
    },
    TIZIANO: {
        "63X48": sinkRule(["TRENTINO", "PARMA", "BARI", "GENOVA", "SIENA", "OSLO", "MECA"], ["DOHA"]),
        "79X48": sinkRule(["PARMA", "BARI", "QUADRATTO", "GENOVA", "SIENA", "OSLO"]),
        "94X48": sinkRule(["BARI", "QUADRATTO", "GENOVA", "SIENA", "OSLO"]),
        "124X48": sinkRule(["GENOVA", "SIENA", "OSLO"]),
    },
    MONET: {
        "63X48": sinkRule(["TRENTINO", "PARMA", "BARI", "GENOVA", "SIENA", "OSLO", "MECA"], ["DOHA"]),
    },
    VALDEZ: {
        "48X43": sinkRule(["RIO", "QUADRATTO", "SIENA", "OSLO"]),
        "63X48": sinkRule(["TRENTINO", "BARI", "QUADRATTO", "GENOVA", "SIENA", "OSLO", "MECA"], ["DOHA"]),
    },
    DA_VINCI: {
        "48X43": sinkRule(["RIO", "QUADRATTO", "SIENA", "OSLO"]),
    },
    POLLOCK: {
        "48X38": sinkRule(["ECO", "OSLO"]),
        "48X43": sinkRule(["RIO", "QUADRATTO", "SIENA", "OSLO"]),
    },
    PICASSO: {
        "63X48": sinkRule(["TRENTINO", "PARMA", "GENOVA", "SIENA", "OSLO", "MECA"], ["DOHA"]),
    },
    VEGA: {
        "63X48": sinkRule(["TRENTINO", "PARMA", "BARI", "GENOVA", "SIENA", "OSLO", "MECA"], ["DOHA"]),
    },
    BASICO_PISO: {
        "40X30": sinkRule(["ECO"]),
        "48X38": sinkRule(["ECO", "OSLO"]),
        "48X43": sinkRule(["RIO", "QUADRATTO", "SIENA", "OSLO"]),
        "63X48": sinkRule(["TRENTINO", "PARMA", "BARI", "QUADRATTO", "GENOVA", "SIENA", "OSLO", "MECA"], ["DOHA"]),
        "79X48": sinkRule(["PARMA", "BARI", "QUADRATTO", "GENOVA", "SIENA", "OSLO"]),
        "94X48": sinkRule(["BARI", "QUADRATTO", "GENOVA", "SIENA", "OSLO"]),
    },
    BASICO_ELEVADO: {
        "48X38": sinkRule(["ECO", "OSLO"]),
        "48X43": sinkRule(["RIO", "QUADRATTO", "SIENA", "OSLO"]),
        "63X48": sinkRule(["TRENTINO", "PARMA", "BARI", "QUADRATTO", "GENOVA", "SIENA", "OSLO", "MECA"], ["DOHA"]),
        "79X48": sinkRule(["PARMA"]),
    },
    RAYO: {
        "40X30": sinkRule(["ECO"]),
        "48X38": sinkRule(["ECO", "OSLO"]),
        "48X43": sinkRule(["RIO", "QUADRATTO", "SIENA", "OSLO"]),
        "63X48": sinkRule(["TRENTINO", "PARMA", "BARI", "QUADRATTO", "GENOVA", "SIENA", "OSLO", "MECA"], ["DOHA"]),
    },
    VAN_GOGH: {
        "48X38": sinkRule(["ECO", "OSLO"]),
    },
    CALDER: {
        "48X43": sinkRule(["RIO", "QUADRATTO", "SIENA", "OSLO"]),
    },
    ZACURA: {
        "63X48": sinkRule(["TRENTINO", "PARMA", "BARI", "GENOVA", "SIENA", "OSLO"]),
    },
    TUCANO: {
        "63X48": sinkRule(["TRENTINO", "BARI", "GENOVA", "SIENA", "OSLO"]),
        "79X48": sinkRule(["BARI", "GENOVA", "SIENA", "OSLO"]),
    },
    BASICO_SM: {
        "48X38": sinkRule(["OSLO"]),
        "48X43": sinkRule(["RIO", "QUADRATTO", "SIENA", "OSLO"]),
        "63X48": sinkRule(["TRENTINO", "PARMA", "BARI", "QUADRATTO", "GENOVA", "SIENA", "OSLO", "MECA"], ["DOHA"]),
        "79X48": sinkRule(["PARMA", "BARI", "QUADRATTO", "GENOVA", "SIENA", "OSLO"]),
    },
};

const VESSEL_FURNITURE = new Set([
    "GODAI",
    "VITELLI",
    "GRECO",
    "MACAO",
    "MISUS",
    "OTUS",
    "TIZIANO",
    "MONET",
    "VALDEZ",
    "PICASSO",
    "BASICO_PISO",
    "BASICO_ELEVADO",
    "BASICO_SM",
    "RAYO",
    "VEGA",
    "TUCANO",
]);

const DOHA_LEFT_ONLY = new Set(["VITELLI", "MACAO", "OTUS", "TIZIANO", "MONET", "VEGA"]);
const VESSEL_MODELS = new Set(["QUARTZSTONE", "OASIS", "DOHA", "MECA"]);

const FURNITURE_ALIASES: Array<[string, readonly string[]]> = [
    ["DA_VINCI", ["DA VINCI"]],
    ["VAN_GOGH", ["VAN GOGH"]],
    ["TIZIANO", ["TIZIANO"]],
    ["VITELLI", ["VITELLI"]],
    ["POLLOCK", ["POLLOCK", "POLOCK"]],
    ["PICASSO", ["PICASSO"]],
    ["GODAI", ["GODAI"]],
    ["GRECO", ["GRECO"]],
    ["MACAO", ["MACAO"]],
    ["MISUS", ["MISUS"]],
    ["THALOS", ["THALOS"]],
    ["OTUS", ["OTUS"]],
    ["ZACURA", ["ZACURA"]],
    ["MONET", ["MONET"]],
    ["VALDEZ", ["VALDEZ"]],
    ["RAYO", ["RAYO"]],
    ["VEGA", ["VEGA"]],
    ["CALDER", ["CALDER"]],
    ["TUCANO", ["TUCANO"]],
];

const SINK_ALIASES: Array<[string, readonly string[]]> = [
    ["QUARTZSTONE", ["QUARTZSTONE", "QUARZSTONE", "QUARTSZTONE", "QUARTZTONE"]],
    ["QUADRATTO", ["QUADRATTO"]],
    ["TRENTINO", ["TRENTINO"]],
    ["GENOVA", ["GENOVA"]],
    ["SIENA", ["SIENA"]],
    ["BARI", ["BARI"]],
    ["PARMA", ["PARMA"]],
    ["OSLO", ["OSLO"]],
    ["OASIS", ["OASIS"]],
    ["DOHA", ["DOHA"]],
    ["MECA", ["MECA"]],
    ["ECO", ["ECO"]],
    ["RIO", ["RIO"]],
];

const getFurnitureModel = (raw: string) => {
    if ((hasCatalogTerm(raw, "BASICO") || hasCatalogTerm(raw, "BASIC"))) {
        if (hasCatalogTerm(raw, "PISO") || raw.includes("A PISO")) return "BASICO_PISO";
        if (raw.includes("ELEV")) return "BASICO_ELEVADO";
        if (hasCatalogTerm(raw, "SM")) return "BASICO_SM";
    }

    for (const [model, aliases] of FURNITURE_ALIASES) {
        if (aliases.some(alias => hasCatalogTerm(raw, alias))) return model;
    }
    return null;
};

const getSinkModel = (raw: string) => {
    for (const [model, aliases] of SINK_ALIASES) {
        if (aliases.some(alias => hasCatalogTerm(raw, alias))) return model;
    }
    return null;
};

const getDimension = (raw: string) => {
    const match = raw.match(/(\d{2,3}(?:[.,]\d+)?)\s*[X*]\s*(\d{2,3}(?:[.,]\d+)?)/);
    if (!match) return null;
    return `${match[1].replace(",", ".")}X${match[2].replace(",", ".")}`;
};

const getDrainSide = (raw: string, sku: string): "left" | "right" | null => {
    const version = sku.split("-").at(-2) ?? "";
    if (version === "DER" || hasCatalogTerm(raw, "PERF DER") || hasCatalogTerm(raw, "DERECHA")) return "right";
    if (version === "IZQ" || hasCatalogTerm(raw, "PERF IZQ") || hasCatalogTerm(raw, "IZQUIERDA")) return "left";
    return null;
};

export const getKitItemDetails = (item: KitCatalogItem) => {
    const raw = normalizeCatalogText(item?.DESCRIPCION ?? item?.ItemName);
    const sku = normalizeCatalogText(item?.SKU ?? item?.ItemCode);
    const furnitureModel = getFurnitureModel(raw);
    const sinkModel = getSinkModel(raw);
    const hasFurnitureWord = ["MUEBLE", "MUEB", "MBLE", "MBL", "VANITY"].some(term => hasCatalogTerm(raw, term));
    const saysWithoutSink = raw.includes("SIN LVM") || raw.includes("SIN LAVAMANOS");
    const hasSinkWord = !saysWithoutSink && (
        ["LAVAMANOS", "LAVAM", "LVM", "LAVAB", "BASIN", "SINK"].some(term => hasCatalogTerm(raw, term))
        || (hasCatalogTerm(raw, "MESON") && raw.includes("VESSEL"))
    );
    const isPrebuiltKit = hasCatalogTerm(raw, "KIT") && hasFurnitureWord && hasSinkWord;
    const isCatalogFamily = sku.startsWith("VBAN") || sku.startsWith("VQUA");
    const isMueble = !isPrebuiltKit && (hasFurnitureWord || furnitureModel !== null);
    const isLavamanos = !isPrebuiltKit && !isMueble && (hasSinkWord || sinkModel !== null);
    const dimension = getDimension(raw);
    const drainSide = getDrainSide(raw, sku);

    return {
        isMueble,
        isLavamanos,
        isPrebuiltKit,
        isCatalogFamily,
        isVessel: sinkModel !== null && VESSEL_MODELS.has(sinkModel),
        dimension,
        raw,
        sku,
        furnitureModel,
        sinkModel,
        drainSide,
    };
};

const formatModel = (model: string | null) => (model ?? "modelo no identificado").replaceAll("_", " ");

export const validateKitPair = (firstItem: KitCatalogItem, secondItem: KitCatalogItem): string | null => {
    const first = getKitItemDetails(firstItem);
    const second = getKitItemDetails(secondItem);

    if (first.isPrebuiltKit || second.isPrebuiltKit) {
        const item = first.isPrebuiltKit ? first : second;
        return `El artículo ${item.sku} ya es un kit compuesto. Selecciona por separado el mueble individual y el lavamanos individual.`;
    }
    if (!first.isCatalogFamily || !second.isCatalogFamily) {
        const item = !first.isCatalogFamily ? first : second;
        return `El artículo ${item.sku} no pertenece a las familias de productos de baño VBAN/VQUA publicadas en el catálogo Mix & Match.`;
    }

    const furniture = first.isMueble && !first.isLavamanos ? first : second.isMueble && !second.isLavamanos ? second : null;
    const sink = first.isLavamanos && !first.isMueble ? first : second.isLavamanos && !second.isMueble ? second : null;
    if (!furniture || !sink) {
        return "La composición del kit no es válida. Debe incluir exactamente un mueble y un lavamanos individuales.";
    }

    if (!furniture.furnitureModel) {
        return `No se pudo identificar el modelo del mueble ${furniture.sku}. Selecciona un mueble incluido en la guía oficial Mix & Match.`;
    }
    if (!furniture.dimension) {
        return `No se pudo validar la medida del mueble ${furniture.sku}. Su descripción SAP debe incluir la medida del producto.`;
    }
    if (!sink.sinkModel) {
        return `El lavamanos ${sink.sku} no aparece en la guía oficial Mix & Match. Selecciona una referencia publicada en el catálogo vigente.`;
    }

    if (VESSEL_MODELS.has(sink.sinkModel)) {
        if (!VESSEL_FURNITURE.has(furniture.furnitureModel) || furniture.dimension !== "63X48") {
            return `El ${formatModel(sink.sinkModel)} solo puede combinarse con los muebles de 63X48 publicados en la guía Vessel. El mueble ${formatModel(furniture.furnitureModel)} ${furniture.dimension} no está habilitado.`;
        }
        if ((sink.sinkModel === "QUARTZSTONE" || sink.sinkModel === "OASIS") && sink.dimension && sink.dimension !== "63X48") {
            return `El mesón ${formatModel(sink.sinkModel)} debe ser de 63X48 para combinarse con este mueble. La referencia ${sink.sku} es ${sink.dimension}.`;
        }
        if (sink.sinkModel === "DOHA" && sink.drainSide === "right" && DOHA_LEFT_ONLY.has(furniture.furnitureModel)) {
            return `El lavamanos Doha solo es compatible por el lado izquierdo con el mueble ${formatModel(furniture.furnitureModel)}. Selecciona la configuración izquierda.`;
        }
        return null;
    }

    const furnitureRules = INTEGRATED_MIX_MATCH[furniture.furnitureModel];
    const rule = furnitureRules?.[furniture.dimension];
    if (!rule) {
        return `El mueble ${formatModel(furniture.furnitureModel)} ${furniture.dimension} no tiene una combinación publicada en la guía oficial Mix & Match.`;
    }
    if (!sink.dimension) {
        return `No se pudo validar la medida del lavamanos ${sink.sku}. Su descripción SAP debe incluir la medida del producto.`;
    }
    const expectedSinkDimension = rule.sinkDimensions?.[sink.sinkModel] ?? furniture.dimension;
    if (sink.dimension !== expectedSinkDimension) {
        return `Las medidas no coinciden: el mueble ${formatModel(furniture.furnitureModel)} ${furniture.dimension} requiere el lavamanos ${formatModel(sink.sinkModel)} en medida ${expectedSinkDimension}, pero la referencia seleccionada es ${sink.dimension}.`;
    }
    if (!rule.sinks.includes(sink.sinkModel)) {
        return `El lavamanos ${formatModel(sink.sinkModel)} ${sink.dimension} no es compatible con el mueble ${formatModel(furniture.furnitureModel)} ${furniture.dimension} según la guía oficial Mix & Match. Opciones permitidas: ${rule.sinks.join(", ")}.`;
    }

    const drainRule: DrainRule = rule.leftOnly?.includes(sink.sinkModel) ? "left" : "both";
    if (drainRule === "left" && sink.drainSide === "right") {
        return `El lavamanos ${formatModel(sink.sinkModel)} solo es compatible con perforación izquierda para el mueble ${formatModel(furniture.furnitureModel)} ${furniture.dimension}.`;
    }

    return null;
};

export const getCompleteKitRestriction = (items: KitCatalogItem[]): string | null => {
    if (items.length !== 2) {
        return "Un kit debe contener exactamente dos artículos: un mueble y un lavamanos.";
    }

    const details = items.map(getKitItemDetails);
    if (details.some(item => item.isPrebuiltKit)) {
        const item = details.find(detail => detail.isPrebuiltKit)!;
        return `El artículo ${item.sku} ya es un kit compuesto. Selecciona los dos componentes individuales.`;
    }

    const furnitureCount = details.filter(item => item.isMueble && !item.isLavamanos).length;
    const sinkCount = details.filter(item => item.isLavamanos && !item.isMueble).length;
    if (furnitureCount !== 1 || sinkCount !== 1) {
        return "La composición del kit no es válida. Debe incluir exactamente un mueble y un lavamanos individuales; no se permiten dos muebles, dos lavamanos ni otros tipos de artículo.";
    }

    return validateKitPair(items[0], items[1]);
};

const getItemDescription = (item: KitCatalogItem) =>
    String(item?.DESCRIPCION ?? item?.ItemName ?? "")
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim();

/**
 * Builds the editable kit-name suggestion used by SAP requests.
 * The lavamanos is always shown first, regardless of selection order.
 */
export const suggestKitName = (items: KitCatalogItem[]): string => {
    if (getCompleteKitRestriction(items)) return "";

    const furniture = items.find(item => getKitItemDetails(item).isMueble);
    const sink = items.find(item => getKitItemDetails(item).isLavamanos);
    if (!furniture || !sink) return "";

    const sinkDescription = getItemDescription(sink)
        .replace(/^(LAVAMANOS|LAVAM|LVM)\s+/, "")
        .replace(/\bBRILLANTE\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const furnitureDescription = getItemDescription(furniture)
        .replace(/^MUEB(?:LE)?\s+/, "")
        .replace(/\s+/g, " ")
        .trim();

    if (!sinkDescription || !furnitureDescription) return "";
    return `KIT LVM ${sinkDescription}-MUEBLE ${furnitureDescription}`;
};
export const validateKitCandidate = (newItem: KitCatalogItem, currentItems: KitCatalogItem[]): string | null => {
    const newDetails = getKitItemDetails(newItem);

    if (newDetails.isPrebuiltKit) {
        return `El artículo ${newDetails.sku} ya es un kit compuesto. Selecciona un mueble o un lavamanos individual.`;
    }
    if (!newDetails.isCatalogFamily) {
        return `El artículo ${newDetails.sku} no pertenece a las familias de productos de baño VBAN/VQUA publicadas en el catálogo Mix & Match.`;
    }
    if ((!newDetails.isMueble && !newDetails.isLavamanos) || (newDetails.isMueble && newDetails.isLavamanos)) {
        return `El artículo ${newDetails.sku} no se puede agregar. Un kit solo admite componentes identificados como mueble o lavamanos individual.`;
    }
    if (newDetails.isMueble && !newDetails.furnitureModel) {
        return `No se pudo identificar el modelo del mueble ${newDetails.sku}. Selecciona un mueble incluido en la guía oficial Mix & Match.`;
    }
    if (newDetails.isLavamanos && !newDetails.sinkModel) {
        return `El lavamanos ${newDetails.sku} no aparece en la guía oficial Mix & Match. Selecciona una referencia publicada en el catálogo vigente.`;
    }
    if (currentItems.length >= 2) {
        return "El kit ya tiene sus dos componentes: un mueble y un lavamanos.";
    }

    return null;
};
