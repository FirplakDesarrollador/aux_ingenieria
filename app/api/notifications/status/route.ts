import { NextResponse } from "next/server";

export const runtime = "nodejs";

type StatusNotification = {
    responsable: string;
    titulo: string;
    contenido: string;
};

export async function POST(request: Request) {
    try {
        const webhookUrl = process.env.POWER_AUTOMATE_STATUS_WEBHOOK_URL;
        if (!webhookUrl) {
            return NextResponse.json(
                { error: "La URL de Power Automate no está configurada." },
                { status: 500 }
            );
        }

        const body = (await request.json()) as Partial<StatusNotification>;
        const responsable = body.responsable?.trim();
        const titulo = body.titulo?.trim();
        const contenido = body.contenido?.trim();

        if (!responsable || !titulo || !contenido) {
            return NextResponse.json(
                { error: "responsable, titulo y contenido son obligatorios." },
                { status: 400 }
            );
        }

        const flowResponse = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ responsable, titulo, contenido }),
            cache: "no-store",
        });

        if (!flowResponse.ok) {
            const details = await flowResponse.text().catch(() => "");
            console.error("[Power Automate status notification]", flowResponse.status, details);
            return NextResponse.json(
                { error: `Power Automate respondió con estado ${flowResponse.status}.` },
                { status: 502 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("[Power Automate status notification]", error);
        return NextResponse.json(
            { error: error?.message || "No fue posible enviar la notificación." },
            { status: 500 }
        );
    }
}