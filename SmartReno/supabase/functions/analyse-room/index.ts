import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ── CORS whitelist — no wildcard ───────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "https://smartreno.netlify.app",
  "http://localhost:8000",
  "http://localhost:3000",
];

const ALLOWED_THEMES  = ["bohemian", "industrial", "minimal", "contemporary", "scandinavian"];
const ALLOWED_BUDGETS = ["economy", "moderate", "premium"];

// ── Helpers ────────────────────────────────────────────────────────────────────
function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age":       "86400",
  };
}

function isValidBase64(str: string): boolean {
  if (!str || str.length === 0) return false;
  // Strip data URL prefix (e.g. "data:image/jpeg;base64,") if present
  const raw = str.includes(",") ? str.split(",")[1] : str;
  if (!raw || raw.length === 0) return false;
  return /^[A-Za-z0-9+/]*={0,2}$/.test(raw) && raw.length % 4 === 0;
}

function json(body: unknown, status: number, extra: Record<string, string> = {}, cors: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, ...extra, "Content-Type": "application/json" },
  });
}

// ── Main handler ───────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const cors   = corsHeaders(origin);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, {}, cors);
  }

  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: { imageBase64?: string; mimeType?: string; theme?: string; budget?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, {}, cors);
  }

  const { imageBase64, mimeType, theme, budget } = body;

  // ── Input validation ─────────────────────────────────────────────────────────
  if (!imageBase64 || !isValidBase64(imageBase64)) {
    return json({ error: "Invalid or missing imageBase64" }, 400, {}, cors);
  }

  const normalizedTheme = (theme ?? "").toLowerCase().trim();
  if (!ALLOWED_THEMES.includes(normalizedTheme)) {
    return json({ error: "Invalid theme" }, 400, {}, cors);
  }

  const normalizedBudget = (budget ?? "").toLowerCase().trim();
  if (!ALLOWED_BUDGETS.includes(normalizedBudget)) {
    return json({ error: "Invalid budget" }, 400, {}, cors);
  }

  const VALID_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
  type ValidMime = typeof VALID_MIME[number];
  const safeMimeType: ValidMime = VALID_MIME.includes(mimeType as ValidMime)
    ? (mimeType as ValidMime)
    : "image/jpeg";

  // Strip data URL prefix before sending to Anthropic
  const cleanBase64 = imageBase64.includes(",")
    ? imageBase64.split(",")[1]
    : imageBase64;

  // ── API key guard ─────────────────────────────────────────────────────────────
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ error: "Service configuration error" }, 500, {}, cors);
  }

  // ── Build prompt ──────────────────────────────────────────────────────────────
  const budgetRanges: Record<string, string> = {
    economy:  "under £1,500",
    moderate: "£1,500–£3,000",
    premium:  "above £3,000",
  };

  const prompt =
    `You are an expert interior designer. Analyze this room photo and provide renovation recommendations for a ${normalizedTheme} style with a ${budgetRanges[normalizedBudget]} budget.

Respond ONLY with a valid JSON object in this exact format (no markdown, no extra text):
{
  "colors": ["#hexcode1", "#hexcode2", "#hexcode3", "#hexcode4"],
  "lighting": ["recommendation 1", "recommendation 2", "recommendation 3"],
  "flooring": ["option 1 with brief description", "option 2 with brief description"],
  "furniture": [
    { "name": "Item Name", "description": "Brief description", "estimatedCost": 299 },
    { "name": "Item Name", "description": "Brief description", "estimatedCost": 149 },
    { "name": "Item Name", "description": "Brief description", "estimatedCost": 89 },
    { "name": "Item Name", "description": "Brief description", "estimatedCost": 199 }
  ],
  "totalEstimate": 736,
  "styleNotes": "2-3 sentences describing the overall design approach for this ${normalizedTheme} renovation."
}

Rules:
- All costs must be realistic GBP amounts for the ${budgetRanges[normalizedBudget]} budget tier.
- totalEstimate must equal the exact sum of all furniture estimatedCost values.
- Return exactly 4 hex color codes, exactly 3 lighting recommendations, exactly 2 flooring options, and 4–6 furniture items.
- Do not include any text outside the JSON object.`;

  // ── Call Anthropic API ────────────────────────────────────────────────────────
  let anthropicResponse: Response;
  try {
    anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type:       "base64",
                  media_type: safeMimeType,
                  data:       cleanBase64,
                },
              },
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
      }),
    });
  } catch {
    return json({ error: "Failed to reach AI service" }, 502, {}, cors);
  }

  // ── Rate limit handling ───────────────────────────────────────────────────────
  if (anthropicResponse.status === 429) {
    const retryAfter = anthropicResponse.headers.get("retry-after") ?? "60";
    return json(
      { error: "Service temporarily unavailable, please try again shortly" },
      503,
      { "Retry-After": retryAfter },
      cors,
    );
  }

  if (!anthropicResponse.ok) {
    return json({ error: "AI analysis failed, please try again" }, 500, {}, cors);
  }

  // ── Parse Anthropic response ──────────────────────────────────────────────────
  let anthropicData: { content?: Array<{ type: string; text?: string }> };
  try {
    anthropicData = await anthropicResponse.json();
  } catch {
    return json({ error: "Invalid response from AI service" }, 500, {}, cors);
  }

  const textContent =
    anthropicData.content?.find((c) => c.type === "text")?.text ?? "";

  // Extract JSON — handles cases where Claude wraps output in markdown fences
  let analysis: unknown;
  try {
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON object found in response");
    analysis = JSON.parse(jsonMatch[0]);
  } catch {
    return json({ error: "Could not parse AI response" }, 500, {}, cors);
  }

  return json(analysis, 200, {}, cors);
});
