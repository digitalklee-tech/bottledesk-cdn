/**
 * PATCH — server.js
 * Add these two widget API routes alongside your existing HTTP routes.
 *
 * These are public endpoints — no auth required.
 * CORS is open so any store's website can call them.
 *
 * POST /widget/chat        — receives message, returns Claude reply
 * GET  /widget/store/:id   — returns store info for the widget header
 *
 * The chat endpoint calls Claude Haiku directly using the store's
 * system prompt context (hours, address, capabilities by tier).
 * It is stateless — full message history is sent by the widget each turn.
 */

// ── CORS for widget requests (add near top of server.js, before routes) ──
app.use('/widget', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── GET /widget/store/:storeId — store info for widget header ────────────────
app.get('/widget/store/:storeId', (req, res) => {
  const store = Object.values(STORE_REGISTRY).find(s => s.id === req.params.storeId);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  res.json({
    name:    store.name,
    hours:   store.hours.split('.')[0],  // first sentence only — keeps it short
    address: store.address,
    phone:   store.storePhone,
    website: store.website,
  });
});

// ── POST /widget/chat — main chat endpoint ───────────────────────────────────
// Body: { storeId, tier, messages: [{ role, content }] }
// Returns: { reply, quickReplies? }
app.post('/widget/chat', express.json(), async (req, res) => {
  const { storeId, messages: history } = req.body;
  if (!storeId || !Array.isArray(history)) {
    return res.status(400).json({ error: 'Missing storeId or messages' });
  }

  const store = Object.values(STORE_REGISTRY).find(s => s.id === storeId);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  // Rate limit: max 30 messages per session (widget context window guard)
  const trimmed = history.slice(-30);

  try {
    // Build a lightweight system prompt for the widget context
    // Uses the same buildSystemPrompt() so behaviour is consistent with voice
    const { open, nextOpen, period, currentTimeStr } = isStoreOpen(store);
    const systemPrompt = await buildSystemPrompt(store, {
      storeClosed: !open,
      nextOpen,
      period,
      currentTime: currentTimeStr,
    });

    const widgetPrompt = systemPrompt + `\n\nWEBSITE CHAT MODE:
- You are responding via a text chat widget on the store's website.
- Responses can be slightly longer than phone responses — up to 3 sentences.
- Use plain text only. No markdown, no bullet points, no asterisks.
- Do NOT output [TRANSFER], [VOICEMAIL], [ASK_CONSENT], or [ORDER_READY] — these are voice-only signals.
- If the caller wants to place an order, direct them to call the store.
- If they want to speak to staff, provide the store phone number.
- Keep the tone warm, helpful, and concise.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system:     widgetPrompt,
        messages:   trimmed,
      }),
    });

    const data  = await response.json();
    if (data.error) throw new Error(data.error.message);

    const reply = data.content?.map(b => b.text || '').join('') || "Sorry, I couldn't process that. Please try again!";

    // Strip any voice signals that may have slipped through
    const clean = reply
      .replace(/\[TRANSFER\]/g, '')
      .replace(/\[VOICEMAIL\]/g, '')
      .replace(/\[ASK_CONSENT\]/g, '')
      .replace(/\[ORDER_READY\]/g, '')
      .replace(/\[ORDER_PLACED\]/g, '')
      .trim();

    res.json({ reply: clean });

  } catch (err) {
    console.error('[widget/chat] Error:', err.message);
    res.status(500).json({ reply: "Sorry, I'm having trouble right now. Please call us directly!" });
  }
});
