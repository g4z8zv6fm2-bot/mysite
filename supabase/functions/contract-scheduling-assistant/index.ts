Deno.serve((_req) => {
  return Response.json(
    { error: "AI features have been removed from Legendary Cleaners CRM." },
    {
      status: 410,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    },
  );
});
