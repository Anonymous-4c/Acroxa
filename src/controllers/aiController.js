// src/controllers/aiController.js
// Customizer AI suggestions.
// Routes call these with a section context and current values;
// controller calls the configured AI provider and returns structured suggestions.

const { getConnection } = require("../core/connect-db");

// ── Get AI settings ────────────────────────────────────────────────────────────

async function getAISettings() {
  try {
    const conn   = getConnection();
    const models = conn.models || conn;
    const Settings = models.Settings;
    if (!Settings) return null;
    const s = await Settings.getSettings();
    return s?.ai || null;
  } catch {
    return null;
  }
}

// ── Call AI provider ───────────────────────────────────────────────────────────

async function callAI(systemPrompt, userPrompt, ai) {
  const provider = ai?.defaultProvider || "openai";

  if (provider === "openai") {
    const apiKey = ai?.providers?.openai?.apiKey;
    if (!apiKey) throw new Error("OpenAI API key not configured");

    const model = ai?.providers?.openai?.model || "gpt-4o-mini";
    const res   = await fetch("https://api.openai.com/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt   },
        ],
        temperature: 0.7,
        max_tokens:  600,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `OpenAI error ${res.status}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }

  if (provider === "gemini") {
    const apiKey = ai?.providers?.gemini?.apiKey;
    if (!apiKey) throw new Error("Gemini API key not configured");

    const model = ai?.providers?.gemini?.model || "gemini-1.5-flash";
    const res   = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
        }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Gemini error ${res.status}`);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  throw new Error(`Provider "${provider}" not supported`);
}

// ── Parse JSON from AI response ────────────────────────────────────────────────

function parseJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// Shared with aiContentController so the editor's content AI reuses exactly the
// same provider configuration and transport as the customizer AI.
exports.getAISettings = getAISettings;
exports.callAI = callAI;
exports.parseJSON = parseJSON;

// ─────────────────────────────────────────────────────────────────────────────
// SUGGESTION ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// POST /acr/api/ai/suggest/identity
// Suggests site name and tagline based on description/keywords.
exports.suggestIdentity = async (req, res) => {
  try {
    const ai = await getAISettings();
    if (!ai?.enabled) return res.status(403).json({ error: "AI is disabled" });

    const { description, keywords, currentName, currentTagline } = req.body;

    const systemPrompt = `You are a professional website naming and branding expert.
Return ONLY a valid JSON object with no extra text, no markdown, no explanation.
The JSON must have exactly this shape:
{
  "names": ["Name 1", "Name 2", "Name 3"],
  "taglines": ["Tagline 1", "Tagline 2", "Tagline 3"]
}`;

    const userPrompt = `Generate 3 site name suggestions and 3 tagline suggestions.
Context: ${description || "a general website"}
Keywords: ${(keywords || []).join(", ") || "none provided"}
Current name: ${currentName || "not set"}
Current tagline: ${currentTagline || "not set"}

Return only the JSON object.`;

    const raw  = await callAI(systemPrompt, userPrompt, ai);
    const data = parseJSON(raw);
    res.json({ success: true, suggestions: data });
  } catch (err) {
    console.error("[AIController] suggestIdentity:", err);
    res.status(500).json({ error: err.message });
  }
};

// POST /acr/api/ai/suggest/colors
// Suggests a color palette for the given layout config colors section.
exports.suggestColors = async (req, res) => {
  try {
    const ai = await getAISettings();
    if (!ai?.enabled) return res.status(403).json({ error: "AI is disabled" });

    const { mood, industry, currentColors, siteName } = req.body;

    const systemPrompt = `You are a professional UI/UX color palette designer.
Return ONLY a valid JSON object with no extra text, no markdown, no explanation.
The JSON must have exactly this shape:
{
  "palettes": [
    {
      "name": "Palette name",
      "description": "Short description",
      "colors": {
        "primary": "#hexcode",
        "secondary": "#hexcode",
        "accent": "#hexcode",
        "background": "#hexcode"
      }
    }
  ]
}
All color values must be valid hex codes starting with #.`;

    const userPrompt = `Generate 3 color palette suggestions.
Site name: ${siteName || "not set"}
Mood/style: ${mood || "modern, professional"}
Industry: ${industry || "general"}
Current colors: ${JSON.stringify(currentColors || {})}

Return only the JSON object.`;

    const raw  = await callAI(systemPrompt, userPrompt, ai);
    const data = parseJSON(raw);
    res.json({ success: true, suggestions: data });
  } catch (err) {
    console.error("[AIController] suggestColors:", err);
    res.status(500).json({ error: err.message });
  }
};

// POST /acr/api/ai/suggest/typography
// Suggests font pairings based on layout style.
exports.suggestTypography = async (req, res) => {
  try {
    const ai = await getAISettings();
    if (!ai?.enabled) return res.status(403).json({ error: "AI is disabled" });

    const { style, industry, currentHeading, currentBody } = req.body;

    const systemPrompt = `You are a professional typography and font pairing expert.
Return ONLY a valid JSON object with no extra text, no markdown, no explanation.
The JSON must have exactly this shape:
{
  "pairings": [
    {
      "name": "Pairing name",
      "description": "Why this pairing works",
      "headingFont": "Font Name",
      "bodyFont": "Font Name",
      "baseFontSize": 16
    }
  ]
}
Use only Google Fonts available names.`;

    const userPrompt = `Suggest 3 font pairings for a website.
Visual style: ${style || "modern"}
Industry: ${industry || "general"}
Current heading font: ${currentHeading || "not set"}
Current body font: ${currentBody || "not set"}

Return only the JSON object.`;

    const raw  = await callAI(systemPrompt, userPrompt, ai);
    const data = parseJSON(raw);
    res.json({ success: true, suggestions: data });
  } catch (err) {
    console.error("[AIController] suggestTypography:", err);
    res.status(500).json({ error: err.message });
  }
};

// POST /acr/api/ai/suggest/layout-config
// Generic: suggest values for any layout config section using the schema.
exports.suggestLayoutConfig = async (req, res) => {
  try {
    const ai = await getAISettings();
    if (!ai?.enabled) return res.status(403).json({ error: "AI is disabled" });

    const { section, currentValues, schema, siteName, siteDescription } = req.body;

    const systemPrompt = `You are an expert CMS layout configuration assistant.
Return ONLY a valid JSON object with no extra text, no markdown, no explanation.
The JSON must have exactly this shape:
{ "suggestions": [ { "label": "Option name", "values": { ...fieldKey: value pairs... } } ] }`;

    const userPrompt = `Suggest 3 configuration options for the "${section}" section.
Site: ${siteName || "not set"} — ${siteDescription || ""}
Current values: ${JSON.stringify(currentValues || {})}
Schema fields available: ${JSON.stringify(schema || {})}

Return only the JSON object.`;

    const raw  = await callAI(systemPrompt, userPrompt, ai);
    const data = parseJSON(raw);
    res.json({ success: true, suggestions: data });
  } catch (err) {
    console.error("[AIController] suggestLayoutConfig:", err);
    res.status(500).json({ error: err.message });
  }
};