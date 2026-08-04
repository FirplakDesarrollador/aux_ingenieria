// Configuración de credenciales de SAP
const SAP_COMPANY_DB = process.env.SAP_COMPANY_DB;
const SAP_USERNAME = process.env.SAP_USERNAME;
const SAP_PASSWORD = process.env.SAP_PASSWORD;
const SAP_API_URL = process.env.SAP_API_URL; // e.g. https://200.7.96.194:50000/b1s/v1/Login
const SAP_LOGIN_TIMEOUT_MS = Number(process.env.SAP_LOGIN_TIMEOUT_MS || 15000);
const SAP_REQUEST_TIMEOUT_MS = Number(process.env.SAP_REQUEST_TIMEOUT_MS || 30000);

type SAPSession = {
    success: true;
    sessionId: string;
    version?: string;
    sessionTimeout?: number;
    cookies: string | null;
    data?: Record<string, unknown>;
};

// Variables globales para la caché de sesión en memoria
let cachedSessionId: string | null = null;
let cachedCookies: string | null = null;
let sessionExpiryTime: number = 0; // Timestamp en ms
let loginInFlight: Promise<SAPSession> | null = null;

const fetchWithTimeout = async (
    url: string,
    init: RequestInit,
    timeoutMs: number,
    operationName: string,
) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
        if (controller.signal.aborted) {
            throw new Error(`${operationName} superó el tiempo máximo de espera (${Math.round(timeoutMs / 1000)} s).`);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};

export async function loginSAP(forceRefresh = false): Promise<SAPSession> {
    if (!SAP_API_URL || !SAP_COMPANY_DB || !SAP_USERNAME || !SAP_PASSWORD) {
        throw new Error("Faltan credenciales de SAP en las variables de entorno.");
    }

    const now = Date.now();
    // Reutilizar la sesión si no está forzado el refresco y si aún es válida (con un margen de 2 minutos)
    if (!forceRefresh && cachedSessionId && now < sessionExpiryTime - 120000) {
        return {
            success: true,
            sessionId: cachedSessionId,
            cookies: cachedCookies,
        };
    }

    // Si varias rutas consultan SAP al mismo tiempo, comparten el mismo login.
    if (!forceRefresh && loginInFlight) {
        return loginInFlight;
    }

    const payload = {
        CompanyDB: SAP_COMPANY_DB,
        UserName: SAP_USERNAME,
        Password: SAP_PASSWORD,
    };

    const loginTask = (async (): Promise<SAPSession> => {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

        console.log("[SAP API] Iniciando sesión en SAP Service Layer...");
        const response = await fetchWithTimeout(SAP_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        }, SAP_LOGIN_TIMEOUT_MS, "El inicio de sesión en SAP");

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error en el login de SAP: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        const setCookieHeader = response.headers.get("set-cookie");

        // Almacenar en caché global
        cachedSessionId = data.SessionId;
        cachedCookies = setCookieHeader;

        // SessionTimeout viene en minutos de SAP (ej: 30). Lo convertimos a ms.
        const timeoutMinutes = data.SessionTimeout || 30;
        sessionExpiryTime = Date.now() + (timeoutMinutes * 60 * 1000);
        console.log(`[SAP API] Sesión iniciada con éxito. Vence en: ${new Date(sessionExpiryTime).toISOString()}`);

        return {
            success: true,
            sessionId: data.SessionId,
            version: data.Version,
            sessionTimeout: data.SessionTimeout,
            cookies: setCookieHeader,
            data,
        };
    })();

    if (!forceRefresh) {
        loginInFlight = loginTask;
    }

    try {
        return await loginTask;
    } catch (error) {
        console.error("Error conectando a SAP:", error);
        throw error;
    } finally {
        if (loginInFlight === loginTask) {
            loginInFlight = null;
        }
    }
}

/**
 * Realiza una petición GET a SAP Service Layer usando la sesión activa (o iniciando sesión si es necesario).
 * Si la petición responde con 401 (No autorizado/Sesión expirada), invalida la caché y lo reintenta una vez.
 */
export async function fetchSAP(endpointPath: string): Promise<Response> {
    const baseUrl = process.env.SAP_API_URL?.replace("/Login", "") || "";

    const makeRequest = async (sessId: string) => {
        const url = `${baseUrl}${endpointPath}`;
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        return await fetchWithTimeout(url, {
            method: "GET",
            headers: {
                "Cookie": `B1SESSION=${sessId}; ROUTEID=.node0`,
            },
        }, SAP_REQUEST_TIMEOUT_MS, "La consulta a SAP");
    };

    let { sessionId } = await loginSAP();
    let res = await makeRequest(sessionId);

    // Si la sesión expiró (401), reintentamos iniciando sesión de nuevo con forceRefresh
    if (res.status === 401) {
        console.log("[SAP API] Petición respondió con 401 (No autorizado). Reintentando con login forzado...");
        const loginRes = await loginSAP(true);
        res = await makeRequest(loginRes.sessionId);
    }

    return res;
}