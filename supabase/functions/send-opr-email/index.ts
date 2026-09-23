import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const esc = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("OPR_FROM_EMAIL") || "Alarvix <onboarding@resend.dev>";

    if (!supabaseUrl || !supabaseAnonKey || !resendApiKey) {
      return json({ error: "La función de correo no está configurada. Falta RESEND_API_KEY o configuración de Supabase." }, 503);
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Sesión no autorizada." }, 401);

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) return json({ error: "La sesión de Alarvix no es válida o expiró." }, 401);

    const body = await req.json();
    const to = String(body?.to || "").trim();
    const opr = body?.opr || {};

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return json({ error: "El correo del cliente no es válido." }, 400);
    }
    if (!opr.consecutivo) return json({ error: "Falta el consecutivo del OPR." }, 400);

    const subject = `Alarvix | OPR ${opr.consecutivo} | Servicio técnico finalizado`;
    const html = `<!doctype html>
<html lang="es"><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a">
<div style="max-width:700px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
  <div style="background:#0b0f19;color:#fff;padding:22px 26px">
    <div style="font-size:20px;font-weight:800;letter-spacing:1px">ALARVIX ENTERPRISE</div>
    <div style="font-size:12px;color:#cbd5e1;margin-top:5px">Orden de Prestación de Servicio Técnico (OPR)</div>
  </div>
  <div style="padding:24px 26px">
    <p style="margin-top:0">Estimado cliente,</p>
    <p>Se ha generado la constancia del servicio técnico realizado. El registro permanece almacenado en Alarvix para consulta y trazabilidad.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700">OPR</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${esc(opr.consecutivo)}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700">Cliente</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${esc(opr.cliente)}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700">Dirección</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${esc(opr.direccion)}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700">Ciudad</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${esc(opr.ciudad)}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700">Servicio</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${esc(opr.tipo)}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700">Atención</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${esc(opr.tipoAtencion)}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700">Técnico</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${esc(opr.tecnico)}</td></tr>
      <tr><td style="padding:8px;font-weight:700;vertical-align:top">Trabajo realizado</td><td style="padding:8px;white-space:pre-wrap">${esc(opr.trabajoRealizado)}</td></tr>
    </table>
    <div style="margin-top:22px;padding:14px;background:#f8fafc;border-radius:10px;font-size:12px;color:#475569">
      Este correo fue solicitado desde Alarvix Enterprise. El OPR original continúa guardado en el sistema.
    </div>
  </div>
</div></body></html>`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
      }),
    });

    const resendBody = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok) {
      return json({ error: resendBody?.message || "El proveedor de correo rechazó el envío." }, 502);
    }

    return json({ ok: true, emailId: resendBody?.id || null, sentTo: to, requestedBy: authData.user.id });
  } catch (error) {
    console.error("send-opr-email:", error);
    return json({ error: error instanceof Error ? error.message : "Error interno al enviar el OPR." }, 500);
  }
});
