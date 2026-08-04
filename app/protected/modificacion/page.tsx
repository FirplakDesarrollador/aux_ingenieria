"use client";

import { ChevronLeft, Pencil, Search, Loader2, Bug, Database, XCircle, CheckCircle2 } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type ActiveField = "sku" | null;

export default function ModificacionPage() {
    const supabase = createClient();
    const [skuTable, setSkuTable] = useState<string>("SAP_SKU");
    const [connStatus, setConnStatus] = useState<"checking" | "connected" | "error">("checking");
    const [detailedError, setDetailedError] = useState<string | null>(null);
    const [debug, setDebug] = useState(false);

    // Search States
    const [skuInput, setSkuInput] = useState("");
    const [skuResults, setSkuResults] = useState<any[]>([]);
    const [selectedSku, setSelectedSku] = useState<any>(null);
    const [activeField, setActiveField] = useState<ActiveField>(null);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    // Form States
    const [nuevaDescripcion, setNuevaDescripcion] = useState("");
    const [comentarios, setComentarios] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);

    const skuRef = useRef<HTMLDivElement>(null);
    const fetchingRef = useRef(false);
    const offsetRef = useRef(0);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Connection Check
    useEffect(() => {
        const checkConnection = async () => {
            try {
                const res = await fetch("/api/sap/skus?limit=1");
                if (!res.ok) throw new Error("SAP Connection failed");
                setConnStatus("connected");
            } catch {
                setConnStatus("error");
            }
        };
        checkConnection();
    }, []);

    const performSearch = useCallback(async (value: string, isAppending = false) => {
        // Si es una nueva búsqueda, abortamos la petición anterior
        if (!isAppending) {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            abortControllerRef.current = new AbortController();
        } else {
            // Si estamos paginando y ya hay una petición de búsqueda o paginación activa, no hacemos nada
            if (fetchingRef.current || loadingMore) return;
        }

        const currentController = abortControllerRef.current;
        fetchingRef.current = true;

        const BATCH_SIZE = 200;

        if (!isAppending && value.trim().length > 0) {
            if (selectedSku?.SKU !== value && selectedSku?.DESCRIPCION !== value) setSelectedSku(null);
        }

        // Reset or keep offset synchronously via ref
        if (!isAppending) offsetRef.current = 0;
        const offset = offsetRef.current;

        if (isAppending) setLoadingMore(true);
        else setLoading(true);

        try {
            const url = `/api/sap/skus?search=${encodeURIComponent(value)}&offset=${offset}&limit=${BATCH_SIZE}`;
            const res = await fetch(url, {
                signal: isAppending ? undefined : currentController?.signal
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Error fetching SAP data");
            }

            const resData = await res.json();
            const newData: any[] = resData.data || [];

            // Advance offset
            offsetRef.current += newData.length;

            setHasMore(resData.hasMore);

            const appendData = isAppending;
            setSkuResults((prev: any[]) => {
                const arr = appendData ? [...prev, ...newData] : newData;
                return Array.from(new Map(arr.map((item: any) => [item.SKU ?? Math.random(), item])).values());
            });

        } catch (err: any) {
            if (err.name === 'AbortError') {
                console.log("Fetch aborted for SKU search");
                return;
            }
            setDetailedError(err.message);
        } finally {
            fetchingRef.current = false;
            // Solo apagar los estados de loading si esta petición es la última activa
            if (isAppending || abortControllerRef.current === currentController) {
                if (isAppending) setLoadingMore(false);
                else setLoading(false);
            }
        }
    }, [selectedSku, loadingMore]);

    useEffect(() => {
        if (activeField === "sku") {
            // Solo buscar si hay al menos 1 carácter
            if (skuInput.trim().length === 0) return;
            const timer = setTimeout(() => performSearch(skuInput), 200);
            return () => clearTimeout(timer);
        }
    }, [skuInput, activeField, performSearch]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (skuRef.current && !skuRef.current.contains(event.target as Node)) {
                setSkuResults([]);
                setHasMore(true);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleFocus = () => {
        setActiveField("sku");
        // Solo buscamos si ya hay texto (evita cargar el catálogo completo al hacer click)
        if (skuInput.trim().length > 0) {
            performSearch(skuInput);
        }
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight + 100 && !fetchingRef.current && hasMore) {
            performSearch(skuInput, true);
        }
    };

    const handleSelect = (item: any) => {
        if (item.STATUS === 'INACTIVO') {
            setDetailedError('Este SKU está inactivo y no puede seleccionarse.');
            setTimeout(() => setDetailedError(null), 5000);
            return;
        }

        setDetailedError(null);
        setSkuInput(item.SKU);
        setSelectedSku(item);
        setSkuResults([]);
        setActiveField(null);
    };

    const handleSubmit = async () => {
        if (detailedError) {
            alert(`No puedes finalizar la solicitud mientras exista esta restricción: ${detailedError}`);
            return;
        }
        if (!selectedSku || !nuevaDescripcion.trim() || !comentarios.trim()) {
            alert("Por favor, seleccione un artículo, ingrese la nueva descripción y añada comentarios para finalizar la solicitud.");
            return;
        }

        setIsSubmitting(true);
        try {
            const rowData = {
                tipo: "modificacion",
                sku_referencia: selectedSku.SKU,
                nueva_descripcion: nuevaDescripcion,
                comentarios: comentarios,
                // usuario_email: "(correo del auth)"
            };

            const { error } = await supabase.from("solicitudes").insert(rowData);
            if (error) throw error;

            setSubmitSuccess(true);
            setTimeout(() => {
                setSubmitSuccess(false);
                // Reset all states
                setSkuInput("");
                setSelectedSku(null);
                setNuevaDescripcion("");
                setComentarios("");
            }, 2000);
        } catch (err: any) {
            console.error("Error al crear solicitud de modificación:", err);
            alert("Hubo un error al enviar la solicitud: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex-1 w-full flex flex-col items-center justify-start min-h-screen bg-[#F8FAFC] p-8 pt-12 font-sans overflow-x-hidden">

            {/* Header */}
            <div className="w-full max-w-6xl mb-12 flex justify-between items-center animate-in fade-in slide-in-from-top-4 duration-1000">
                <button
                    onClick={() => window.location.href = "/protected"}
                    className="flex items-center gap-5 text-[#0F172A] font-black text-4xl tracking-tighter hover:opacity-80 transition-all group"
                >
                    <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100 group-hover:bg-[#F1F5F9] transition-all">
                        <ChevronLeft className="w-8 h-8 stroke-[4px]" />
                    </div>
                    <span className="uppercase italic relative">
                        Modificación de Código
                        <div className="absolute -bottom-2 left-0 w-48 h-1.5 bg-[#3499CD] rounded-full transition-all" />
                    </span>
                </button>

                <div className="flex items-center gap-6">
                    {connStatus === "connected" && (
                        <div className="px-6 py-3 bg-white text-green-600 rounded-full border border-green-100 font-black text-[0.7rem] uppercase tracking-widest flex items-center gap-3 shadow-sm">
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
                    <div className="relative z-10 grid grid-cols-2 gap-10">
                        <div className="space-y-2">
                            <div className="text-white/20 text-[0.6rem] font-bold tracking-[0.3em] uppercase">Table SKU</div>
                            <div className="text-white font-bold text-lg tracking-tight">{skuTable}</div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-white/20 text-[0.6rem] font-bold tracking-[0.3em] uppercase">Errores</div>
                            <div className="text-red-400 font-bold">{detailedError ? "SI" : "NO"}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Form Card */}
            <div className="w-full max-w-4xl bg-white rounded-[2rem] p-16 shadow-[0_40px_80px_rgba(0,0,0,0.06)] border border-slate-100 space-y-12 relative animate-in zoom-in duration-700 overflow-visible">
                {detailedError && (
                    <div className="flex items-start gap-4 p-5 bg-red-50 border-2 border-red-300 rounded-2xl shadow-md" role="alert">
                        <XCircle className="w-7 h-7 text-red-500 shrink-0" />
                        <div className="flex-1">
                            <p className="text-red-700 font-black text-sm uppercase tracking-wide">Restricción activa</p>
                            <p className="text-red-600 font-medium text-sm mt-1">{detailedError}</p>
                        </div>
                        <button type="button" onClick={() => setDetailedError(null)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-100 rounded-xl" aria-label="Cerrar mensaje">
                            <XCircle className="w-5 h-5" />
                        </button>
                    </div>
                )}

                <div className="space-y-10 animate-in slide-in-from-bottom-8 duration-500">

                    {/* Buscar Artículo a Modificar */}
                    <div className="relative space-y-4" ref={skuRef}>
                        <label className="text-[#64748B] font-bold text-[0.9rem] ml-2">Buscar Artículo a Modificar</label>
                        <div className={`relative transition-all duration-700 ${activeField === 'sku' ? 'scale-[1.02] z-[201]' : 'z-10'}`}>
                            <input
                                type="text"
                                value={skuInput}
                                onFocus={handleFocus}
                                onChange={(e) => setSkuInput(e.target.value)}
                                placeholder="Ingrese SKU o descripción..."
                                className="w-full h-20 pl-10 pr-16 rounded-3xl border-2 border-[#E2E8F0] bg-white focus:border-[#3499CD] transition-all text-xl text-[#0F172A] font-medium placeholder:text-slate-300 shadow-sm text-center"
                            />
                            <Search className={`absolute right-8 top-1/2 -translate-y-1/2 w-7 h-7 ${activeField === 'sku' ? 'text-[#3499CD]' : 'text-[#334155]'}`} />
                        </div>

                        {selectedSku && !activeField && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                                <div className="w-full h-20 border-2 border-[#3499CD] rounded-2xl flex items-center justify-between gap-4 bg-white px-6">
                                    <span className="text-[#3499CD] font-black text-2xl tracking-tighter uppercase">
                                        SKU: {selectedSku.SKU}
                                    </span>
                                    {selectedSku.STATUS && (
                                        <span className={`rounded-full px-3 py-1 text-[0.7rem] font-black uppercase ${selectedSku.STATUS === 'ACTIVO' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                            {selectedSku.STATUS}
                                        </span>
                                    )}
                                </div>
                                <div className="space-y-1 pl-4">
                                    <div className="text-[#64748B] text-[0.8rem] font-bold uppercase tracking-wider">Descripción Actual</div>
                                    <div className="text-[#0F364B] text-xl font-black uppercase leading-tight">{selectedSku.DESCRIPCION}</div>
                                </div>
                            </div>
                        )}

                        {/* Dropdown */}
                        {(skuResults.length > 0 || loading) && (
                            <div className="absolute top-[calc(100%+0.5rem)] left-0 w-full bg-white rounded-[1.2rem] shadow-[0_60px_120px_rgba(15,23,42,0.25)] border border-slate-200 overflow-hidden z-[200] animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="flex bg-[#eff2f5] border-b border-slate-200 font-black text-[0.65rem] tracking-[0.2em] text-[#324f5f]/60 uppercase italic">
                                    <div className="w-[25%] px-8 py-5 border-r border-[#dee2e6]">NRO. ARTÍCULO</div>
                                    <div className="w-[75%] px-8 py-5">DESCRIPCIÓN SAP</div>
                                </div>
                                <div className="max-h-[480px] overflow-y-auto custom-scrollbar bg-white" onScroll={handleScroll}>
                                    {loading ? (
                                        <div className="py-24 text-center">
                                            <div className="flex flex-col items-center gap-6">
                                                <Loader2 className="w-12 h-12 text-[#3499CD] animate-spin" />
                                                <span className="text-[0.7rem] font-bold uppercase tracking-[0.6em] text-[#3499CD]/40">Sincronizando Catálogo...</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {skuResults.map((item, idx) => (
                                                <div
                                                    key={item.SKU || idx}
                                                    onClick={(event) => { event.preventDefault(); event.stopPropagation(); handleSelect(item); }}
                                                    className="flex w-full group cursor-pointer hover:bg-[#FFFBEB] border-b border-slate-100 last:border-0 transition-colors duration-200"
                                                >
                                                    <div className="w-[25%] px-8 py-5 font-mono font-black text-[#0F172A] text-lg tracking-tighter border-r border-slate-100 group-hover:text-[#3499CD] transition-colors">
                                                        <div className="flex items-center gap-2">
                                                            {item.SKU || "S/C"}
                                                            {item.STATUS && (
                                                                <span className={`rounded-full px-2 py-1 text-[0.65rem] font-black uppercase ${item.STATUS === 'ACTIVO' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                                    {item.STATUS}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="w-[75%] px-8 py-5 font-black text-[#64748B] text-[0.95rem] uppercase group-hover:text-[#0F172A] transition-colors leading-relaxed">
                                                        {item.DESCRIPCION || "SIN NOMBRE"}
                                                    </div>
                                                </div>
                                            ))}
                                            {loadingMore && (
                                                <div className="py-12 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-4 text-[#3499CD]">
                                                    <Loader2 className="w-6 h-6 animate-spin" />
                                                    <span className="text-[0.6rem] font-black uppercase tracking-[0.5em] italic">Ampliando registros...</span>
                                                </div>
                                            )}
                                            {!hasMore && skuResults.length > 0 && (
                                                <div className="py-10 bg-slate-50/50 text-center border-t border-slate-50">
                                                    <span className="text-[0.55rem] font-black uppercase tracking-widest text-slate-300">Catálogo Completo Cargado</span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Descripción Nueva */}
                    <div className="space-y-4">
                        <label className="text-[#64748B] font-bold text-[0.9rem] ml-2">Nueva Descripción</label>
                        <input
                            type="text"
                            value={nuevaDescripcion}
                            onChange={(e) => setNuevaDescripcion(e.target.value.toUpperCase())}
                            placeholder="Ingrese la nueva descripción del artículo..."
                            className="w-full h-20 px-10 rounded-3xl border-2 border-[#E2E8F0] bg-white focus:border-[#3499CD] transition-all text-xl text-[#0F172A] font-medium placeholder:text-slate-300 shadow-sm text-center outline-none uppercase"
                        />
                    </div>

                    {/* Comentarios */}
                    <div className="space-y-4">
                        <label className="text-[#64748B] font-bold text-[0.9rem] ml-2">Motivo de Modificación</label>
                        <textarea
                            rows={4}
                            value={comentarios}
                            onChange={(e) => setComentarios(e.target.value)}
                            placeholder="Describa el motivo o justificación del cambio..."
                            className="w-full px-10 py-6 rounded-2xl border-2 border-[#E2E8F0] bg-white focus:border-[#3499CD] transition-all text-lg text-[#0F172A] font-medium placeholder:text-slate-300 shadow-sm resize-none outline-none"
                        />
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-8 flex flex-col gap-4 relative z-0">
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || submitSuccess || Boolean(detailedError)}
                        className={`w-full h-16 text-white font-black text-xl tracking-[0.2em] rounded-2xl shadow-xl transition-all uppercase flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#0F364B] disabled:active:scale-100
                            ${submitSuccess ? 'bg-green-500 scale-[1.02]' : 'bg-[#0F364B] hover:bg-[#0A2432] active:scale-[0.98]'}`}
                    >
                        {detailedError ? (
                            <span>CORRIJA LA RESTRICCIÓN</span>
                        ) : isSubmitting ? (
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
                        onClick={() => window.location.href = "/protected"}
                        disabled={isSubmitting}
                        className="w-full h-16 border-2 border-[#0F364B] text-[#0F364B] font-black text-xl tracking-[0.2em] rounded-2xl hover:bg-slate-50 transition-all uppercase disabled:opacity-50"
                    >
                        VOLVER ATRÁS
                    </button>
                </div>
            </div>
        </div>
    );
}
