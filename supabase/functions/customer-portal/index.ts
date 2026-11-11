import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const normalize = (value: unknown) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach((b) => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Portal service is not configured." }, 503);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");

  try {
    if (action === "view") {
      const token = String(body?.token || "");
      if (token.length < 40 || token.length > 100) return json({ error: "This customer link is invalid or expired." }, 404);
      const tokenHash = await hashToken(token);
      const { data: grant, error: grantError } = await admin
        .from("crm_customer_portal_links")
        .select("id,company_id,customer_id,expires_at,revoked_at")
        .eq("token_hash", tokenHash)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (grantError || !grant) return json({ error: "This customer link is invalid, expired, or revoked." }, 404);

      const { data: workspace, error: workspaceError } = await admin
        .from("crm_workspaces").select("data").eq("company_id", grant.company_id).maybeSingle();
      if (workspaceError || !workspace?.data) return json({ error: "Customer information is temporarily unavailable." }, 503);
      const data = workspace.data as Record<string, any>;
      const customer = Array.isArray(data.customers)
        ? data.customers.find((c: any) => String(c?.id || "") === grant.customer_id)
        : null;
      if (!customer) return json({ error: "This customer record is no longer available." }, 404);

      const customerName = normalize(customer.name);
      const customerAddress = normalize(customer.address);
      const jobs = (Array.isArray(data.jobs) ? data.jobs : []).filter((job: any) => {
        const explicitId = String(job?.customerId || job?.customer_id || "");
        if (explicitId) return explicitId === grant.customer_id;
        return !!customerName && !!customerAddress &&
          normalize(job?.name) === customerName &&
          normalize(job?.address) === customerAddress;
      }).map((job: any) => ({
        date: String(job.date || ""),
        time: String(job.time || ""),
        status: String(job.status || "Scheduled"),
        price: Number.isFinite(Number(job.price)) ? Number(job.price) : null,
      })).sort((a: any, b: any) => (a.date + a.time).localeCompare(b.date + b.time));

      const { data: companyContracts } = await admin
        .from("crm_contracts")
        .select("id,customer_id,customer_email,title,term_years,price,start_date,frequency,interval_months,custom_dates,terms,status,signed_at")
        .eq("company_id", grant.company_id);
      const customerEmail = normalize(customer.email);
      const contracts = (companyContracts || []).filter((c: any) =>
        (c.status === "sent" || c.status === "signed") && (
          (c.customer_id && String(c.customer_id) === grant.customer_id) ||
          (customerEmail && normalize(c.customer_email) === customerEmail)
        )
      ).map((c: any) => ({
        title: c.title,
        termYears: c.term_years,
        price: Number(c.price) || 0,
        startDate: c.start_date,
        frequency: c.frequency,
        intervalMonths: c.interval_months,
        customDates: c.custom_dates || [],
        terms: c.terms || "",
        status: c.status,
        signedAt: c.signed_at,
      }));

      return json({
        customer: { name: String(customer.name || ""), address: String(customer.address || "") },
        appointments: jobs,
        contracts,
        expiresAt: grant.expires_at,
      });
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "Owner sign-in is required." }, 401);
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Your sign-in session could not be verified." }, 401);

    const { data: profile, error: profileError } = await admin
      .from("profiles").select("company_id,role").eq("user_id", authData.user.id).maybeSingle();
    if (profileError || !profile?.company_id) return json({ error: "Company access could not be verified." }, 403);
    if (String(profile.role || "").toLowerCase() !== "owner") return json({ error: "Only the company owner can create or revoke customer portal links." }, 403);

    if (action === "create") {
      const customerId = String(body?.customerId || "");
      if (!customerId) return json({ error: "Choose a customer first." }, 400);
      const { data: workspace, error: workspaceError } = await admin
        .from("crm_workspaces").select("data").eq("company_id", profile.company_id).maybeSingle();
      if (workspaceError || !workspace?.data) return json({ error: "Company workspace could not be loaded." }, 503);
      const data = workspace.data as Record<string, any>;
      const customer = Array.isArray(data.customers)
        ? data.customers.find((c: any) => String(c?.id || "") === customerId)
        : null;
      if (!customer) return json({ error: "That customer was not found in your workspace." }, 404);

      const token = newToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: grant, error: insertError } = await admin
        .from("crm_customer_portal_links")
        .insert({
          company_id: profile.company_id,
          customer_id: customerId,
          token_hash: await hashToken(token),
          created_by: authData.user.id,
          expires_at: expiresAt,
        })
        .select("id,expires_at")
        .single();
      if (insertError || !grant) {
        console.error("Portal link creation failed:", insertError?.message || "unknown");
        return json({ error: "Could not create the customer link." }, 500);
      }
      return json({
        id: grant.id,
        customerId,
        customerName: String(customer.name || "Customer"),
        url: "https://g4z8zv6fm2-bot.github.io/mysite/#portal=" + token,
        expiresAt: grant.expires_at,
      });
    }

    if (action === "revoke") {
      const linkId = String(body?.linkId || "");
      if (!linkId) return json({ error: "Choose a link to revoke." }, 400);
      const { error: revokeError } = await admin
        .from("crm_customer_portal_links")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", linkId)
        .eq("company_id", profile.company_id)
        .is("revoked_at", null);
      if (revokeError) return json({ error: "Could not revoke the customer link." }, 500);
      return json({ revoked: true, id: linkId });
    }

    return json({ error: "Unsupported portal action." }, 400);
  } catch (error) {
    console.error("Customer portal request failed:", error?.message || error);
    return json({ error: "The customer portal request could not be completed." }, 500);
  }
});
