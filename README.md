# SmartReno

AI-powered home renovation planner. Upload a photo of any room and get instant
design recommendations, a 3D furniture visualization, and a downloadable budget
report — in minutes, with no signup.

Live demo: https://smartreno.netlify.app

## How it works

A five-stage workflow, from photo to plan:

1. **Capture** — take or upload a room photo (mobile camera or file upload).
2. **Style** — pick a design theme and budget tier.
3. **Analyze** — Claude Vision analyzes the room and returns a design brief
   (colour palette, lighting, flooring, and an itemized furniture list).
4. **Visualize** — place the suggested furniture in a real-time Three.js 3D room;
   on mobile the live camera feed becomes the scene background for a pseudo-AR
   preview.
5. **Budget** — review materials + 20% labour + 10% contingency, see an on/over
   budget status, and export a branded multi-page PDF report.

Design themes: bohemian, industrial, minimal, contemporary, scandinavian.
Budget tiers: economy (under £1,500), moderate (£1,500–£3,000), premium (above £3,000).

## Architecture

| Layer | Tech |
| --- | --- |
| Frontend | Static HTML/CSS + vanilla JS (no framework, no build step) |
| 3D / AR | Three.js (r128, via CDN) |
| PDF | jsPDF + html2canvas (via CDN) |
| AI backend | Supabase Edge Function (`analyse-room`, Deno/TypeScript) proxying the Anthropic API |
| Hosting | Netlify (frontend), Supabase (edge function) |

The browser never talks to the Anthropic API directly. `SmartReno/js/claude_service.js`
calls the `analyse-room` edge function, which holds the API key server-side and
returns validated JSON. If the function is unavailable, the client falls back to
built-in per-theme design presets so the app still works end to end.

## Project structure

```
SmartReno/
  index.html              Landing page
  app.html                The 5-stage app
  css/                    global / landing / app styles
  js/
    app.js                Workflow orchestrator + state machine
    camera.js             Image capture, resize, base64 encode
    claude_service.js     Edge-function client + fallback designs
    ar_visualizer.js      Three.js 3D scene + pseudo-AR camera overlay
    budget_service.js     Cost calculation and formatting
    pdf_export.js         Branded PDF report generation
  supabase/functions/analyse-room/index.ts   Edge function (Anthropic proxy)
  netlify.toml            Redirects, security headers, cache policy
supabase/
  config.toml             Supabase project config
```

## Local development

Serve the `SmartReno/` folder with any static file server:

```bash
cd SmartReno
python3 -m http.server 8000
# open http://localhost:8000
```

`localhost:8000` / `:3000` are already in the edge function's CORS allow-list.

### Edge function

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli) and a Deno runtime.

```bash
# from the repo root
supabase functions serve analyse-room --env-file supabase/.env
```

Set `ANTHROPIC_API_KEY` in that env file (never commit it). Deploy with:

```bash
supabase functions deploy analyse-room
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

## Deployment

- **Frontend** — Netlify, publish directory `SmartReno/` (see `netlify.toml` for
  redirects, security headers, and cache rules).
- **Edge function** — `supabase functions deploy analyse-room`.

## Privacy

Room photos are sent to the edge function for analysis and are not stored.
