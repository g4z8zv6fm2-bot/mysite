import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Sign-in is required." }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!supabaseUrl || !anonKey) return json({ error: "Supabase function configuration is incomplete." }, 500);
  if (!openAiKey) return json({ error: "AI is not configured yet. Set the OPENAI_API_KEY secret in Supabase." }, 503);

  try {
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return json({ error: "Your sign-in session could not be verified." }, 401);

    const { data: profile, error: profileError } = await supabase
      .from("profiles").select("company_id, role").eq("user_id", authData.user.id).maybeSingle();
    if (profileError || !profile?.company_id) return json({ error: "Your company profile could not be verified." }, 403);

    const { data: workspace, error: workspaceError } = await supabase
      .from("crm_workspaces").select("data").eq("company_id", profile.company_id).maybeSingle();
    if (workspaceError || !workspace?.data) return json({ error: "Company workspace data could not be loaded." }, 500);

    const body = await req.json().catch(() => ({}));
    const question = String(body?.question || "").trim().slice(0, 1000);
    if (!question) return json({ error: "Enter a question for the assistant." }, 400);

    const raw = workspace.data as Record<string, unknown>;
    const jobs = Array.isArray(raw.jobs) ? raw.jobs : [];
    const customers = Array.isArray(raw.customers) ? raw.customers : [];
    const team = Array.isArray(raw.team) ? raw.team : [];
    const context = {
      today: new Date().toISOString().slice(0, 10),
      jobs: jobs.slice(0, 500),
      customers: customers.slice(0, 500),
      team: team.slice(0, 100),
    };

    const instructions = `You are the business assistant for a window-cleaning company. Analyze only the supplied CRM data; do not invent facts, customer contact details, or job IDs. Be concise and practical. Never claim an email, SMS, notification, or document was sent. You may recommend changes, but MUST NOT perform any action. Return JSON only with keys: summary (string), action (string), items (array of {title:string,detail:string}), suggestions (array of {title:string,detail:string,jobId:string|null,newDate:string|null,newTime:string|null}). Only include a rescheduling suggestion when a real supplied job ID is known and you can justify a proposed date/time; otherwise set jobId/newDate/newTime to null. Never suggest changing a completed job. Use ISO dates YYYY-MM-DD and 24-hour times HH:MM. Any suggestion must be clearly a proposal requiring owner/authorized-user approval. Keep personal data to the minimum needed for the question.`;
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-5-mini";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": "Bearer " + openAiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions,
        input: JSON.stringify({ question, crm: context }),
        text: { format: { type: "json_object" } },
        max_output_tokens: 1800,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("AI provider request failed", response.status, result?.error?.message || "");
      return json({ error: "The AI provider could not answer right now. Check the OPENAI_API_KEY and model configuration." }, 502);
    }
    const output = String(result.output_text || "").trim();
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(output); } catch { return json({ error: "The AI response was not in the expected format. Please try again." }, 502); }

    const validJobIds = new Set(jobs.map((j: any) => String(j?.id || "")));
    const safeItems = Array.isArray(parsed.items) ? parsed.items.slice(0, 50).map((x: any) => ({
      title: String(x?.title || "CRM item").slice(0, 180),
      detail: String(x?.detail || "").slice(0, 600),
    })) : [];
    const safeSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 15).map((x: any) => {
      const jobId = x?.jobId && validJobIds.has(String(x.jobId)) ? String(x.jobId) : null;
      const job = jobId ? jobs.find((j: any) => String(j?.id) === jobId) as any : null;
      const newDate = /^\d{4}-\d{2}-\d{2}$/.test(String(x?.newDate || "")) ? String(x.newDate) : null;
      const newTime = /^\d{2}:\d{2}$/.test(String(x?.newTime || "")) ? String(x.newTime) : null;
      const canReschedule = Boolean(job && job.status !== "Completed" && newDate && newTime);
      return {
        title: String(x?.title || "Business suggestion").slice(0, 180),
        detail: String(x?.detail || "").slice(0, 600),
        change: canReschedule ? { type: "reschedule", jobId, date: newDate, time: newTime } : null,
      };
    }) : [];
    return json({
      summary: String(parsed.summary || "The assistant reviewed the available CRM data.").slice(0, 1500),
      action: String(parsed.action || "Review all details before making changes.").slice(0, 800),
      items: safeItems,
      suggestions: safeSuggestions,
      model,
    });
  } catch (error) {
    console.error("Business assistant error", error);
    return json({ error: "The business assistant encountered an unexpected error." }, 500);
  }
});
