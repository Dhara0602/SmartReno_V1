/**
 * ClaudeService — calls the Supabase edge function to get AI analysis.
 * NEVER makes direct calls to the Anthropic API from this file.
 */
const ClaudeService = (() => {
  // Set this to your actual Supabase project URL after deploying
  const functionUrl = 'https://wpgixmxrmjrhttvepwxx.supabase.co/functions/v1/analyse-room';

  // ── Fallback designs (used when the edge function is unavailable) ──────────
  const FALLBACKS = {
    bohemian: {
      colors: ['#C17817', '#8B4513', '#2D5A27', '#7B3F6E'],
      lighting: [
        'Layer warm amber Edison bulbs (2700K) in mismatched fixtures for eclectic glow',
        'Add Moroccan lanterns with perforated metalwork to cast patterned shadows',
        'Use fairy lights draped over canopy or macramé wall hangings as accent lighting',
      ],
      flooring: [
        'Layered jute rugs — stack a geometric print over a natural weave for depth and texture',
        'Reclaimed wood parquet in warm honey tones adds organic, well-travelled character',
      ],
      furniture: [
        { name: 'Low-Slung Velvet Sofa', description: 'Deep jewel-toned velvet in emerald or sapphire, tufted cushions', estimatedCost: 680 },
        { name: 'Rattan Hanging Chair', description: 'Suspended boho statement piece with macramé cushion', estimatedCost: 220 },
        { name: 'Brass Moroccan Side Table', description: 'Hand-hammered brass with intricate engraved detail', estimatedCost: 145 },
        { name: 'Kilim-Print Pouffe Ottoman', description: 'Handwoven geometric pattern, doubles as footrest or coffee table', estimatedCost: 95 },
        { name: 'Macramé Wall Hanging', description: 'Large-format knotted wall art in natural cotton rope', estimatedCost: 75 },
      ],
      totalEstimate: 1215,
      styleNotes: 'Bohemian interiors celebrate collected eclecticism — mix patterns fearlessly, layer textiles, and embrace handmade, artisanal objects. The goal is a space that feels lived-in, well-travelled, and deeply personal.',
    },
    industrial: {
      colors: ['#2C2C2C', '#8B7355', '#C0C0C0', '#B22222'],
      lighting: [
        'Exposed filament Edison bulbs (2200K) in cage or pipe pendant fixtures above key zones',
        'Track lighting on black metal rails provides flexible directional illumination',
        'Vintage factory-style wall sconces in brushed steel for ambient fill light',
      ],
      flooring: [
        'Polished concrete — sealed and buffed for a reflective, raw urban aesthetic',
        'Weathered wide-plank oak in charcoal stain, with visible grain and knots preserved',
      ],
      furniture: [
        { name: 'Steel & Reclaimed Wood Dining Table', description: 'Black powder-coated frame with rough-sawn timber top', estimatedCost: 580 },
        { name: 'Leather Chesterfield Sofa', description: 'Vintage distressed tan leather, aged brass nail-head trim', estimatedCost: 890 },
        { name: 'Industrial Pipe Shelving Unit', description: 'Black iron pipe brackets with reclaimed pine shelves', estimatedCost: 195 },
        { name: 'Factory Cart Coffee Table', description: 'Antique industrial trolley repurposed with glass top', estimatedCost: 285 },
      ],
      totalEstimate: 1950,
      styleNotes: 'Industrial design celebrates raw materiality — exposed steel, aged wood, and concrete surfaces work together to create a utilitarian yet sophisticated atmosphere. Keep the palette restrained and let the texture speak.',
    },
    minimal: {
      colors: ['#F5F5F0', '#E8E8E3', '#2C2C2C', '#A8B5A0'],
      lighting: [
        'Recessed LED downlights (3000K) on dimmer — clean ceiling lines, adjustable ambience',
        'Single sculptural floor lamp as an art object and primary reading light',
        'Under-cabinet or cove lighting to create depth without visible fixtures',
      ],
      flooring: [
        'Large-format porcelain tiles (900×900mm) in warm off-white with minimal grout lines',
        'White-washed oak engineered flooring in wide planks — light, airy, and warm underfoot',
      ],
      furniture: [
        { name: 'Low-Profile Platform Sofa', description: 'Stone-grey performance linen, clean geometric profile, no visible legs', estimatedCost: 1100 },
        { name: 'Sculptural Coffee Table', description: 'Single monolithic white marble slab on minimal steel base', estimatedCost: 620 },
        { name: 'Floating Media Console', description: 'Wall-mounted walnut veneer, push-to-open doors, no hardware', estimatedCost: 445 },
        { name: 'Wishbone Dining Chairs x4', description: 'Hans Wegner-inspired bentwood in natural oak', estimatedCost: 480 },
      ],
      totalEstimate: 2645,
      styleNotes: 'Minimalism is not about emptiness but intentionality — every object earns its place through function and beauty. Prioritise quality over quantity, allow negative space to breathe, and maintain a strict monochromatic palette punctuated only by natural texture.',
    },
    contemporary: {
      colors: ['#1A1A2E', '#16213E', '#00D4FF', '#E94560'],
      lighting: [
        'Architectural LED strip lighting in coves and behind features for a floating effect',
        'Oversized statement pendant in brushed brass or smoked glass as central focal point',
        'Smart bulbs (tunable white 2700–6500K) for adaptive scene control throughout the day',
      ],
      flooring: [
        'Herringbone engineered oak in mid-tone walnut — dynamic pattern with contemporary warmth',
        'Polished micro-cement in warm greige for a seamless, gallery-like surface',
      ],
      furniture: [
        { name: 'Curved Boucle Sectional Sofa', description: 'Organic curved form in cream boucle fabric, solid brass legs', estimatedCost: 1450 },
        { name: 'Fluted Glass Console Table', description: 'Smoked fluted glass top with brushed gold metal frame', estimatedCost: 385 },
        { name: 'Sculptural Accent Chair', description: 'Egg-form chair in cognac leather with swivel base', estimatedCost: 640 },
        { name: 'Abstract Art Print (Framed)', description: 'Large-scale gallery-quality abstract on 120×90cm canvas', estimatedCost: 220 },
      ],
      totalEstimate: 2695,
      styleNotes: 'Contemporary design embraces current trends while maintaining longevity — curved forms, rich textures like boucle and fluted glass, and a sophisticated interplay of warm and cool tones create a space that feels both of-the-moment and enduring.',
    },
    scandinavian: {
      colors: ['#F8F6F2', '#E8E0D5', '#4A6741', '#8B7355'],
      lighting: [
        'White Poul Henningsen-style layered pendant over dining table for glare-free diffusion',
        'Candlelight — essential to hygge, use pillar candles and tealights liberally',
        'Natural daylight maximised with sheer linen curtains and light-reflective white walls',
      ],
      flooring: [
        'Pale Nordic pine or ash in wide planks, lightly oiled — light-reflective and natural',
        'Wool flatweave rugs in muted geometric patterns to define zones and add warmth',
      ],
      furniture: [
        { name: 'STRESSLESS Recliner Chair', description: 'Ergonomic Norwegian recliner in oatmeal fabric, beech wood base', estimatedCost: 820 },
        { name: 'Solid Ash Dining Table', description: 'Simple rectangular form, tapered legs, oil-finished surface', estimatedCost: 540 },
        { name: 'Bookcase with Ladder', description: 'Tall open shelving in natural pine with brass fittings', estimatedCost: 320 },
        { name: 'Sheepskin Throw x2', description: 'Genuine Icelandic sheepskin in natural ivory, for seating and beds', estimatedCost: 110 },
      ],
      totalEstimate: 1790,
      styleNotes: 'Scandinavian design embodies hygge — warmth, cosiness, and togetherness. Natural materials, functional simplicity, and a palette drawn from Nordic landscapes (pine, stone, lichen) create spaces that feel both beautiful and deeply liveable throughout the long winter months.',
    },
  };

  // ── Main Analysis Call ─────────────────────────────────────────────────────
  async function analyseRoom({ imageBase64, mimeType, theme, budget }) {
    let response;
    try {
      response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType, theme, budget }),
      });
    } catch (networkErr) {
      console.warn('[ClaudeService] Network error, using fallback:', networkErr.message);
      return { data: getFallback(theme), isFallback: true };
    }

    if (response.status === 503) {
      const retryAfter = response.headers.get('Retry-After') || '60';
      throw new Error(`Service is busy. Please try again in ${retryAfter} seconds.`);
    }

    if (!response.ok) {
      console.warn('[ClaudeService] Edge function error, using fallback. Status:', response.status);
      return { data: getFallback(theme), isFallback: true };
    }

    let data;
    try {
      data = await response.json();
    } catch {
      console.warn('[ClaudeService] Invalid JSON response, using fallback');
      return { data: getFallback(theme), isFallback: true };
    }

    // Validate the response shape
    if (!isValidAnalysis(data)) {
      console.warn('[ClaudeService] Unexpected response shape, using fallback');
      return { data: getFallback(theme), isFallback: true };
    }

    return { data, isFallback: false };
  }

  function getFallback(theme) {
    const key = (theme || '').toLowerCase();
    return FALLBACKS[key] || FALLBACKS.contemporary;
  }

  function isValidAnalysis(d) {
    return (
      d &&
      Array.isArray(d.colors) && d.colors.length > 0 &&
      Array.isArray(d.lighting) &&
      Array.isArray(d.flooring) &&
      Array.isArray(d.furniture) && d.furniture.length > 0 &&
      typeof d.totalEstimate === 'number' &&
      typeof d.styleNotes === 'string'
    );
  }

  return { analyseRoom, getFallback };
})();

window.ClaudeService = ClaudeService;
