/**
 * BottleDesk AI — Embeddable Chat Widget
 * cdn.bottledesk.ai/widget.js
 *
 * Usage:
 *   <script
 *     src="https://cdn.bottledesk.ai/widget.js"
 *     data-store-id="gastowntable"
 *     data-tier="hospitality"
 *     data-store-name="Gastown Table"
 *     data-accent="#c9a84c"
 *     data-position="right">
 *   </script>
 *
 * SaaS-safe: all config comes from data- attributes.
 * No dependencies. Vanilla JS + CSS injected into shadow DOM.
 * Communicates with BottleDesk API at api.bottledesk.ai
 *
 * Tabs:
 *   - Chat (all tiers)
 *   - Book a Table (hospitality tier only)
 */

(function () {
  'use strict';

  // ── Config from script tag ───────────────────────────────────────────────
  const script    = document.currentScript;
  const storeId   = script.getAttribute('data-store-id')   || 'demo';
  const tier      = script.getAttribute('data-tier')        || 'growth';
  const storeName = script.getAttribute('data-store-name')  || 'Our Store';
  const accent    = script.getAttribute('data-accent')      || '#c9a84c';
  const position  = script.getAttribute('data-position')    || 'right';
  const apiBase   = script.getAttribute('data-api')         || 'https://api.bottledesk.ai';

  const isHospitality = tier === 'hospitality';

  // ── Suggested quick replies per tier ─────────────────────────────────────
  const QUICK_REPLIES = [
    "What are your hours?",
    "Where are you located?",
    "What's on special?",
    "Do you deliver?",
    "Can I place a pickup order?",
  ];

  // ── Conversation history (sent with each message for context) ────────────
  let messages  = [];
  let isOpen    = false;
  let isTyping  = false;
  let activeTab = 'chat'; // 'chat' | 'reserve'

  // ── Inject styles ─────────────────────────────────────────────────────────
  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap');

    :host {
      --accent:      ${accent};
      --accent-dark: color-mix(in srgb, ${accent} 70%, #000);
      --bg:          #0d0f0e;
      --surface:     #161918;
      --surface2:    #1e2120;
      --border:      rgba(255,255,255,0.07);
      --text:        #e8e4df;
      --text-muted:  #8a8680;
      --radius:      16px;
      --shadow:      0 24px 64px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4);
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Launcher button ── */
    #bd-launcher {
      position: fixed;
      ${position === 'left' ? 'left: 24px' : 'right: 24px'};
      bottom: 24px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--accent);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 0 0 color-mix(in srgb, var(--accent) 40%, transparent);
      transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s;
      z-index: 2147483646;
      animation: bd-pulse 3s ease-in-out infinite;
    }

    #bd-launcher:hover {
      transform: scale(1.08);
      box-shadow: 0 8px 28px rgba(0,0,0,0.5), 0 0 0 8px color-mix(in srgb, var(--accent) 15%, transparent);
      animation: none;
    }

    #bd-launcher svg { transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1); }
    #bd-launcher.open svg.chat-icon { transform: scale(0) rotate(90deg); position: absolute; }
    #bd-launcher.open svg.close-icon { transform: scale(1) rotate(0deg); }
    #bd-launcher svg.close-icon { transform: scale(0) rotate(-90deg); position: absolute; }

    @keyframes bd-pulse {
      0%, 100% { box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 0 0 color-mix(in srgb, var(--accent) 30%, transparent); }
      50%       { box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 0 10px transparent; }
    }

    /* ── Unread badge ── */
    #bd-badge {
      position: absolute;
      top: -2px;
      right: -2px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #ef4444;
      color: #fff;
      font-size: 10px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid var(--bg);
      opacity: 0;
      transform: scale(0);
      transition: opacity 0.2s, transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
    }

    #bd-badge.show { opacity: 1; transform: scale(1); }

    /* ── Panel ── */
    #bd-panel {
      position: fixed;
      ${position === 'left' ? 'left: 24px' : 'right: 24px'};
      bottom: 92px;
      width: 380px;
      max-height: 620px;
      background: var(--bg);
      border-radius: var(--radius);
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 2147483645;
      opacity: 0;
      transform: translateY(16px) scale(0.97);
      pointer-events: none;
      transition: opacity 0.25s cubic-bezier(0.4,0,0.2,1), transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
      transform-origin: ${position === 'left' ? 'bottom left' : 'bottom right'};
    }

    #bd-panel.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: all;
    }

    @media (max-width: 440px) {
      #bd-panel {
        width: calc(100vw - 24px);
        ${position === 'left' ? 'left: 12px' : 'right: 12px'};
        bottom: 84px;
        max-height: calc(100vh - 100px);
      }
    }

    /* ── Store info header ── */
    #bd-header {
      padding: 20px 20px 16px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      flex-shrink: 0;
    }

    #bd-store-name {
      font-family: 'DM Serif Display', serif;
      font-size: 18px;
      color: var(--text);
      margin-bottom: 12px;
      letter-spacing: -0.01em;
    }

    #bd-store-name span {
      color: var(--accent);
    }

    .bd-info-row {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-muted);
      font-size: 12px;
      margin-bottom: 6px;
      font-weight: 300;
    }

    .bd-info-row:last-child { margin-bottom: 0; }

    .bd-info-icon {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      opacity: 0.7;
    }

    .bd-info-row a {
      color: var(--accent);
      text-decoration: none;
    }

    .bd-info-row a:hover { text-decoration: underline; }

    /* ── Tab bar ── */
    #bd-tabs {
      display: flex;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      flex-shrink: 0;
    }

    .bd-tab {
      flex: 1;
      padding: 10px 0;
      background: none;
      border: none;
      color: var(--text-muted);
      font-family: 'DM Sans', sans-serif;
      font-size: 13px;
      font-weight: 400;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: color 0.15s, border-color 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .bd-tab:hover { color: var(--text); }

    .bd-tab.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }

    /* ── Tab content panels ── */
    .bd-tab-content {
      display: none;
      flex: 1;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }

    .bd-tab-content.active {
      display: flex;
    }

    /* ── Messages ── */
    #bd-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      scroll-behavior: smooth;
    }

    #bd-messages::-webkit-scrollbar { width: 4px; }
    #bd-messages::-webkit-scrollbar-track { background: transparent; }
    #bd-messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

    .bd-msg {
      display: flex;
      flex-direction: column;
      max-width: 85%;
      animation: bd-msg-in 0.2s ease;
    }

    @keyframes bd-msg-in {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .bd-msg.user { align-self: flex-end; align-items: flex-end; }
    .bd-msg.bot  { align-self: flex-start; align-items: flex-start; }

    .bd-bubble {
      padding: 10px 14px;
      border-radius: 12px;
      line-height: 1.5;
      font-size: 13.5px;
      font-weight: 300;
    }

    .bd-msg.user .bd-bubble {
      background: var(--accent);
      color: #0d0f0e;
      font-weight: 400;
      border-bottom-right-radius: 4px;
    }

    .bd-msg.bot .bd-bubble {
      background: var(--surface2);
      color: var(--text);
      border-bottom-left-radius: 4px;
      border: 1px solid var(--border);
    }

    /* ── Typing indicator ── */
    .bd-typing {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 12px 14px;
    }

    .bd-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--text-muted);
      animation: bd-bounce 1.2s infinite;
    }

    .bd-dot:nth-child(2) { animation-delay: 0.15s; }
    .bd-dot:nth-child(3) { animation-delay: 0.3s; }

    @keyframes bd-bounce {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
      30%            { transform: translateY(-5px); opacity: 1; }
    }

    /* ── Quick replies ── */
    #bd-quick-replies {
      padding: 8px 16px 4px;
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .bd-qr {
      padding: 6px 12px;
      border-radius: 20px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text-muted);
      font-size: 12px;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s, background 0.15s;
      font-family: 'DM Sans', sans-serif;
      font-weight: 400;
      white-space: nowrap;
    }

    .bd-qr:hover {
      border-color: var(--accent);
      color: var(--accent);
      background: color-mix(in srgb, var(--accent) 8%, transparent);
    }

    /* ── Input area ── */
    #bd-input-area {
      padding: 12px 16px 16px;
      display: flex;
      gap: 8px;
      align-items: flex-end;
      border-top: 1px solid var(--border);
      flex-shrink: 0;
    }

    #bd-input {
      flex: 1;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 14px;
      color: var(--text);
      font-family: 'DM Sans', sans-serif;
      font-size: 13.5px;
      font-weight: 300;
      outline: none;
      resize: none;
      max-height: 100px;
      line-height: 1.4;
      transition: border-color 0.15s;
    }

    #bd-input::placeholder { color: var(--text-muted); }
    #bd-input:focus { border-color: color-mix(in srgb, var(--accent) 50%, transparent); }

    #bd-send {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: var(--accent);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s, transform 0.15s;
    }

    #bd-send:hover  { background: var(--accent-dark); transform: scale(1.05); }
    #bd-send:active { transform: scale(0.97); }
    #bd-send:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

    /* ── Reservation form ── */
    #bd-reserve-panel {
      flex: 1;
      overflow-y: auto;
      padding: 20px 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    #bd-reserve-panel::-webkit-scrollbar { width: 4px; }
    #bd-reserve-panel::-webkit-scrollbar-track { background: transparent; }
    #bd-reserve-panel::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

    .bd-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .bd-label {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .bd-input, .bd-select {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 14px;
      color: var(--text);
      font-family: 'DM Sans', sans-serif;
      font-size: 13.5px;
      font-weight: 300;
      outline: none;
      width: 100%;
      transition: border-color 0.15s;
      appearance: none;
      -webkit-appearance: none;
    }

    .bd-input::placeholder { color: var(--text-muted); }
    .bd-input:focus, .bd-select:focus { border-color: color-mix(in srgb, var(--accent) 50%, transparent); }

    .bd-select {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' stroke='%238a8680' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      padding-right: 32px;
      cursor: pointer;
    }

    .bd-select option {
      background: #1e2120;
      color: #e8e4df;
    }

    .bd-select:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .bd-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .bd-submit {
      width: 100%;
      padding: 12px;
      background: var(--accent);
      color: #0d0f0e;
      border: none;
      border-radius: 10px;
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s, transform 0.15s, opacity 0.15s;
      margin-top: 4px;
    }

    .bd-submit:hover  { background: var(--accent-dark); transform: scale(1.01); }
    .bd-submit:active { transform: scale(0.98); }
    .bd-submit:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

    /* Slot loading spinner */
    .bd-slots-loading {
      font-size: 12px;
      color: var(--text-muted);
      padding: 8px 0 0;
      display: none;
      align-items: center;
      gap: 6px;
    }

    .bd-slots-loading.show { display: flex; }

    .bd-spinner {
      width: 12px;
      height: 12px;
      border: 1.5px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: bd-spin 0.7s linear infinite;
      flex-shrink: 0;
    }

    @keyframes bd-spin { to { transform: rotate(360deg); } }

    /* ── Confirmation screen ── */
    #bd-confirm-screen {
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      padding: 32px 20px;
      text-align: center;
      gap: 12px;
      animation: bd-msg-in 0.3s ease;
    }

    #bd-confirm-screen.show { display: flex; }

    .bd-confirm-icon {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--accent) 15%, transparent);
      border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 4px;
    }

    .bd-confirm-title {
      font-family: 'DM Serif Display', serif;
      font-size: 20px;
      color: var(--text);
    }

    .bd-confirm-detail {
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.6;
      font-weight: 300;
    }

    .bd-confirm-sms {
      font-size: 12px;
      color: var(--text-muted);
      opacity: 0.7;
      margin-top: 4px;
    }

    .bd-confirm-new {
      margin-top: 8px;
      padding: 8px 20px;
      background: none;
      border: 1px solid var(--border);
      border-radius: 20px;
      color: var(--text-muted);
      font-family: 'DM Sans', sans-serif;
      font-size: 12px;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
    }

    .bd-confirm-new:hover { border-color: var(--accent); color: var(--accent); }

    /* Inline error */
    .bd-field-error {
      font-size: 11px;
      color: #f87171;
      display: none;
      margin-top: 2px;
    }

    .bd-field-error.show { display: block; }

    /* ── Footer ── */
    #bd-footer {
      text-align: center;
      padding: 6px 0 10px;
      font-size: 10px;
      color: var(--text-muted);
      opacity: 0.5;
      flex-shrink: 0;
    }

    #bd-footer a {
      color: var(--text-muted);
      text-decoration: none;
    }
  `;

  // ── SVGs ──────────────────────────────────────────────────────────────────
  const ICON_CHAT = `<svg class="chat-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.526 3.66 1.438 5.168L2 22l4.832-1.438A9.96 9.96 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" fill="#0d0f0e" fill-opacity="0.9"/>
    <circle cx="8.5" cy="12" r="1.25" fill="${accent}"/>
    <circle cx="12" cy="12" r="1.25" fill="${accent}"/>
    <circle cx="15.5" cy="12" r="1.25" fill="${accent}"/>
  </svg>`;

  const ICON_CLOSE = `<svg class="close-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 5L5 15M5 5l10 10" stroke="#0d0f0e" stroke-width="2" stroke-linecap="round"/>
  </svg>`;

  const ICON_SEND = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 8L2 2l3 6-3 6 12-6z" fill="#0d0f0e"/>
  </svg>`;

  const ICON_CLOCK = `<svg class="bd-info-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/>
    <path d="M8 5v3.5l2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  </svg>`;

  const ICON_PIN = `<svg class="bd-info-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 1.5C5.79 1.5 4 3.29 4 5.5c0 3 4 9 4 9s4-6 4-9c0-2.21-1.79-4-4-4z" stroke="currentColor" stroke-width="1.2"/>
    <circle cx="8" cy="5.5" r="1.5" stroke="currentColor" stroke-width="1.2"/>
  </svg>`;

  const ICON_PHONE = `<svg class="bd-info-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 2h3l1.5 3.5-1.75 1.25C6.5 8.5 7.5 9.5 9.25 10.25L10.5 8.5 14 10v3c0 .55-.45 1-1 1C6.27 14 2 9.73 2 3c0-.55.45-1 1-1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
  </svg>`;

  const ICON_CALENDAR = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="2.5" width="12" height="10.5" rx="2" stroke="currentColor" stroke-width="1.1"/>
    <path d="M1 5.5h12" stroke="currentColor" stroke-width="1.1"/>
    <path d="M4.5 1v3M9.5 1v3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
  </svg>`;

  const ICON_CHECK = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 12l5 5L20 7" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  // ── Store info (fetched from BottleDesk API or from data attributes) ──────
  async function fetchStoreInfo() {
    try {
      const res = await fetch(`${apiBase}/widget/store/${storeId}`);
      if (!res.ok) throw new Error('not found');
      return await res.json();
    } catch {
      return {
        hours:   script.getAttribute('data-hours')   || 'Open daily 10am – 11pm',
        address: script.getAttribute('data-address')  || '',
        phone:   script.getAttribute('data-phone')    || '',
      };
    }
  }

  // ── Date helpers ──────────────────────────────────────────────────────────
  function todayISO() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function maxDateISO() {
    const d = new Date();
    d.setDate(d.getDate() + 60);
    return d.toISOString().slice(0, 10);
  }

  function formatDateDisplay(isoDate) {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  // ── Slot fetch ────────────────────────────────────────────────────────────
  // GET /widget/slots/:storeId?date=YYYY-MM-DD&party=N
  // Returns { slots: [ { time: "17:00", label: "5:00 PM", available: true, coversRemaining: 12 } ] }
  async function fetchSlots(date, partySize) {
    const res = await fetch(
      `${apiBase}/widget/slots/${storeId}?date=${date}&party=${partySize}`
    );
    if (!res.ok) throw new Error(`slots ${res.status}`);
    return res.json();
  }

  // ── Phone formatter ───────────────────────────────────────────────────────
  function normalizePhone(raw) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
    return `+${digits}`;
  }

  // ── Build widget DOM inside Shadow DOM ────────────────────────────────────
  async function init() {
    const storeInfo = await fetchStoreInfo();

    const host = document.createElement('div');
    host.id    = 'bottledesk-widget';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    // Style
    const style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    // Launcher button
    const launcher = document.createElement('button');
    launcher.id    = 'bd-launcher';
    launcher.setAttribute('aria-label', 'Open chat');
    launcher.innerHTML = ICON_CHAT + ICON_CLOSE;

    const badge   = document.createElement('span');
    badge.id      = 'bd-badge';
    badge.textContent = '1';
    launcher.appendChild(badge);
    shadow.appendChild(launcher);

    // Panel
    const panel = document.createElement('div');
    panel.id    = 'bd-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', `Chat with ${storeName}`);

    // Header — store info
    const addressLine = storeInfo.address
      ? `<div class="bd-info-row">${ICON_PIN}<span>${storeInfo.address}</span></div>`
      : '';
    const phoneLine = storeInfo.phone
      ? `<div class="bd-info-row">${ICON_PHONE}<a href="tel:${storeInfo.phone}">${storeInfo.phone}</a></div>`
      : '';

    // Tab bar — only shown for hospitality tier
    const tabBar = isHospitality ? `
      <div id="bd-tabs">
        <button class="bd-tab active" data-tab="chat">
          ${ICON_CHAT.replace('class="chat-icon"', 'width="13" height="13"').replace('class="close-icon"', '')}
          Chat
        </button>
        <button class="bd-tab" data-tab="reserve">
          ${ICON_CALENDAR}
          Book a Table
        </button>
      </div>
    ` : '';

    panel.innerHTML = `
      <div id="bd-header">
        <div id="bd-store-name"><span>●</span> ${storeName}</div>
        <div class="bd-info-row">${ICON_CLOCK}<span>${storeInfo.hours}</span></div>
        ${addressLine}
        ${phoneLine}
      </div>
      ${tabBar}

      <!-- Chat tab -->
      <div class="bd-tab-content active" id="bd-tab-chat">
        <div id="bd-messages"></div>
        <div id="bd-quick-replies"></div>
        <div id="bd-input-area">
          <textarea id="bd-input" placeholder="Ask anything..." rows="1" aria-label="Message"></textarea>
          <button id="bd-send" aria-label="Send">${ICON_SEND}</button>
        </div>
      </div>

      <!-- Reservation tab (hospitality only — hidden for other tiers) -->
      ${isHospitality ? `
      <div class="bd-tab-content" id="bd-tab-reserve">

        <!-- Booking form -->
        <div id="bd-reserve-panel">
          <div class="bd-row">
            <div class="bd-field">
              <label class="bd-label">First Name</label>
              <input class="bd-input" id="bd-res-fname" type="text" placeholder="Jane" autocomplete="given-name"/>
              <span class="bd-field-error" id="bd-err-fname">Required</span>
            </div>
            <div class="bd-field">
              <label class="bd-label">Last Name</label>
              <input class="bd-input" id="bd-res-lname" type="text" placeholder="Smith" autocomplete="family-name"/>
              <span class="bd-field-error" id="bd-err-lname">Required</span>
            </div>
          </div>

          <div class="bd-field">
            <label class="bd-label">Mobile Number (for confirmation SMS)</label>
            <input class="bd-input" id="bd-res-phone" type="tel" placeholder="+1 604 555 0100" autocomplete="tel"/>
            <span class="bd-field-error" id="bd-err-phone">Enter a valid phone number</span>
          </div>

          <div class="bd-row">
            <div class="bd-field">
              <label class="bd-label">Date</label>
              <input class="bd-input" id="bd-res-date" type="date"
                min="${todayISO()}" max="${maxDateISO()}"/>
              <span class="bd-field-error" id="bd-err-date">Select a date</span>
            </div>
            <div class="bd-field">
              <label class="bd-label">Party Size</label>
              <select class="bd-select" id="bd-res-party">
                ${[1,2,3,4,5,6,7,8,9,10,11,12].map(n =>
                  `<option value="${n}"${n===2?' selected':''}>${n} ${n===1?'guest':'guests'}</option>`
                ).join('')}
              </select>
            </div>
          </div>

          <div class="bd-field">
            <label class="bd-label">Time</label>
            <select class="bd-select" id="bd-res-time" disabled>
              <option value="">— pick a date first —</option>
            </select>
            <div class="bd-slots-loading" id="bd-slots-loading">
              <div class="bd-spinner"></div>
              <span>Checking availability…</span>
            </div>
            <span class="bd-field-error" id="bd-err-time">Select a time</span>
          </div>

          <div class="bd-field">
            <label class="bd-label">Notes (optional)</label>
            <input class="bd-input" id="bd-res-notes" type="text" placeholder="Birthday, allergies, high chair…"/>
          </div>

          <button class="bd-submit" id="bd-res-submit" disabled>Request Reservation</button>
        </div>

        <!-- Confirmation screen (shown after successful booking) -->
        <div id="bd-confirm-screen">
          <div class="bd-confirm-icon">${ICON_CHECK}</div>
          <div class="bd-confirm-title">You're on the list!</div>
          <div class="bd-confirm-detail" id="bd-confirm-detail"></div>
          <div class="bd-confirm-sms">A confirmation SMS has been sent to your phone.</div>
          <button class="bd-confirm-new" id="bd-confirm-new">Make another reservation</button>
        </div>

      </div>
      ` : ''}

      <div id="bd-footer"><a href="https://bottledesk.ai" target="_blank" rel="noopener">Powered by BottleDesk AI</a></div>
    `;

    shadow.appendChild(panel);

    // ── Refs ──
    const messagesEl     = shadow.getElementById('bd-messages');
    const inputEl        = shadow.getElementById('bd-input');
    const sendBtn        = shadow.getElementById('bd-send');
    const quickRepliesEl = shadow.getElementById('bd-quick-replies');

    // ── Quick replies ──
    function renderQuickReplies(replies) {
      quickRepliesEl.innerHTML = '';
      replies.forEach(text => {
        const btn = document.createElement('button');
        btn.className   = 'bd-qr';
        btn.textContent = text;
        btn.addEventListener('click', () => {
          quickRepliesEl.innerHTML = '';
          sendMessage(text);
        });
        quickRepliesEl.appendChild(btn);
      });
    }

    renderQuickReplies(QUICK_REPLIES);

    // ── Chat messages ──
    function addMessage(role, text) {
      const wrap   = document.createElement('div');
      wrap.className = `bd-msg ${role}`;
      const bubble = document.createElement('div');
      bubble.className = 'bd-bubble';
      bubble.textContent = text;
      wrap.appendChild(bubble);
      messagesEl.appendChild(wrap);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return bubble;
    }

    function showTyping() {
      const wrap   = document.createElement('div');
      wrap.className = 'bd-msg bot';
      wrap.id      = 'bd-typing-indicator';
      const bubble = document.createElement('div');
      bubble.className = 'bd-bubble bd-typing';
      bubble.innerHTML = '<div class="bd-dot"></div><div class="bd-dot"></div><div class="bd-dot"></div>';
      wrap.appendChild(bubble);
      messagesEl.appendChild(wrap);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function removeTyping() {
      const indicator = messagesEl.querySelector('#bd-typing-indicator');
      if (indicator) indicator.remove();
    }

    // ── Send chat message ──
    async function sendMessage(text) {
      if (!text.trim() || isTyping) return;

      isTyping = true;
      sendBtn.disabled = true;
      inputEl.value    = '';
      autoResize();

      addMessage('user', text);
      messages.push({ role: 'user', content: text });
      quickRepliesEl.innerHTML = '';

      showTyping();

      try {
        const res = await fetch(`${apiBase}/widget/chat`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId, tier, messages }),
        });

        removeTyping();

        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();
        const reply = data.reply || "Sorry, I didn't catch that. Try again?";

        addMessage('bot', reply);
        messages.push({ role: 'assistant', content: reply });

        if (data.quickReplies?.length) {
          renderQuickReplies(data.quickReplies);
        }

      } catch (err) {
        removeTyping();
        console.warn('[BottleDesk widget] API error:', err.message);
        addMessage('bot', "Sorry, I'm having trouble connecting. Please call us directly!");
      }

      isTyping         = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }

    // ── Input auto-resize ──
    function autoResize() {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
    }

    inputEl.addEventListener('input', autoResize);

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(inputEl.value);
      }
    });

    sendBtn.addEventListener('click', () => sendMessage(inputEl.value));

    // ── Tab switching ──
    if (isHospitality) {
      const tabs    = shadow.querySelectorAll('.bd-tab');
      const tabChat = shadow.getElementById('bd-tab-chat');
      const tabRes  = shadow.getElementById('bd-tab-reserve');

      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const target = tab.getAttribute('data-tab');
          tabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === target));
          tabChat.classList.toggle('active', target === 'chat');
          tabRes.classList.toggle('active',  target === 'reserve');
          activeTab = target;
          if (target === 'chat') inputEl.focus();
        });
      });

      // ── Reservation form logic ──
      const dateEl    = shadow.getElementById('bd-res-date');
      const partyEl   = shadow.getElementById('bd-res-party');
      const timeEl    = shadow.getElementById('bd-res-time');
      const submitBtn = shadow.getElementById('bd-res-submit');
      const loadingEl = shadow.getElementById('bd-slots-loading');
      const reservePanel  = shadow.getElementById('bd-reserve-panel');
      const confirmScreen = shadow.getElementById('bd-confirm-screen');
      const confirmDetail = shadow.getElementById('bd-confirm-detail');
      const confirmNew    = shadow.getElementById('bd-confirm-new');

      let slotFetchTimer = null;

      // Fetch slots when date or party size changes
      async function refreshSlots() {
        const date  = dateEl.value;
        const party = partyEl.value;
        if (!date) return;

        timeEl.disabled = true;
        timeEl.innerHTML = '<option value="">Loading…</option>';
        submitBtn.disabled = true;
        loadingEl.classList.add('show');

        try {
          const data = await fetchSlots(date, party);
          loadingEl.classList.remove('show');

          const available = (data.slots || []).filter(s => s.available);

          if (available.length === 0) {
            timeEl.innerHTML = '<option value="">No availability — try another date</option>';
            timeEl.disabled  = true;
            submitBtn.disabled = true;
            return;
          }

          timeEl.innerHTML = '<option value="">— select a time —</option>' +
            available.map(s =>
              `<option value="${s.time}">${s.label} (${s.coversRemaining} spots left)</option>`
            ).join('');
          timeEl.disabled = false;

        } catch (err) {
          loadingEl.classList.remove('show');
          console.warn('[BottleDesk widget] Slot fetch error:', err.message);
          timeEl.innerHTML = '<option value="">Could not load times — call us directly</option>';
          timeEl.disabled  = true;
          submitBtn.disabled = true;
        }
      }

      function onDateOrPartyChange() {
        clearTimeout(slotFetchTimer);
        slotFetchTimer = setTimeout(refreshSlots, 300);
      }

      dateEl.addEventListener('change', onDateOrPartyChange);
      partyEl.addEventListener('change', onDateOrPartyChange);

      // Enable submit once a time is selected
      timeEl.addEventListener('change', () => {
        submitBtn.disabled = !timeEl.value;
      });

      // ── Field validation helpers ──
      function showError(id, msg) {
        const el = shadow.getElementById(id);
        if (el) { el.textContent = msg || el.textContent; el.classList.add('show'); }
      }
      function clearError(id) {
        const el = shadow.getElementById(id);
        if (el) el.classList.remove('show');
      }

      function validateForm() {
        let valid = true;
        const fname = shadow.getElementById('bd-res-fname').value.trim();
        const lname = shadow.getElementById('bd-res-lname').value.trim();
        const phone = shadow.getElementById('bd-res-phone').value.trim();
        const date  = dateEl.value;
        const time  = timeEl.value;

        clearError('bd-err-fname');
        clearError('bd-err-lname');
        clearError('bd-err-phone');
        clearError('bd-err-date');
        clearError('bd-err-time');

        if (!fname) { showError('bd-err-fname', 'First name is required'); valid = false; }
        if (!lname) { showError('bd-err-lname', 'Last name is required'); valid = false; }

        const digits = phone.replace(/\D/g, '');
        if (digits.length < 10) { showError('bd-err-phone', 'Enter a valid phone number'); valid = false; }

        if (!date) { showError('bd-err-date', 'Select a date'); valid = false; }
        if (!time) { showError('bd-err-time', 'Select a time'); valid = false; }

        return valid;
      }

      // ── Submit reservation ──
      submitBtn.addEventListener('click', async () => {
        if (!validateForm()) return;

        const fname   = shadow.getElementById('bd-res-fname').value.trim();
        const lname   = shadow.getElementById('bd-res-lname').value.trim();
        const phone   = normalizePhone(shadow.getElementById('bd-res-phone').value.trim());
        const date    = dateEl.value;
        const time    = timeEl.value;
        const party   = partyEl.value;
        const notes   = shadow.getElementById('bd-res-notes').value.trim();

        submitBtn.disabled   = true;
        submitBtn.textContent = 'Booking…';

        try {
          const res = await fetch(`${apiBase}/widget/reserve`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storeId, name: `${fname} ${lname}`, phone, date, time, party, notes }),
          });

          const data = await res.json();

          if (!res.ok) {
            // Slot taken — refresh slots and show error
            submitBtn.textContent = 'Request Reservation';
            submitBtn.disabled    = false;
            showError('bd-err-time', data.error || 'That slot is no longer available — please pick another time');
            timeEl.value = '';
            submitBtn.disabled = true;
            refreshSlots();
            return;
          }

          // Success — show confirmation screen
          const timeLabel = timeEl.options[timeEl.selectedIndex]?.text.split('(')[0].trim() || time;
          confirmDetail.textContent =
            `${fname} ${lname} · Party of ${party} · ${formatDateDisplay(date)} · ${timeLabel}`;

          reservePanel.style.display  = 'none';
          confirmScreen.classList.add('show');

        } catch (err) {
          console.warn('[BottleDesk widget] Reserve error:', err.message);
          submitBtn.textContent = 'Request Reservation';
          submitBtn.disabled    = false;
          showError('bd-err-time', 'Connection error — please call us to book');
        }
      });

      // ── Make another reservation ──
      confirmNew.addEventListener('click', () => {
        // Reset form
        shadow.getElementById('bd-res-fname').value = '';
        shadow.getElementById('bd-res-lname').value = '';
        shadow.getElementById('bd-res-phone').value = '';
        dateEl.value  = '';
        partyEl.value = '2';
        timeEl.innerHTML = '<option value="">— pick a date first —</option>';
        timeEl.disabled  = true;
        shadow.getElementById('bd-res-notes').value = '';
        submitBtn.disabled    = true;
        submitBtn.textContent = 'Request Reservation';

        confirmScreen.classList.remove('show');
        reservePanel.style.display = '';
      });
    }

    // ── Open / close ──
    function open() {
      isOpen = true;
      panel.classList.add('open');
      launcher.classList.add('open');
      launcher.setAttribute('aria-label', 'Close chat');
      badge.classList.remove('show');

      if (activeTab === 'chat') {
        inputEl.focus();
        if (messages.length === 0) {
          setTimeout(() => {
            const welcome = `Hi! I'm the BottleDesk AI assistant for ${storeName}. How can I help you today?`;
            addMessage('bot', welcome);
            messages.push({ role: 'assistant', content: welcome });
          }, 300);
        }
      }
    }

    function close() {
      isOpen = false;
      panel.classList.remove('open');
      launcher.classList.remove('open');
      launcher.setAttribute('aria-label', 'Open chat');
    }

    launcher.addEventListener('click', () => isOpen ? close() : open());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) close();
    });

    setTimeout(() => {
      if (!isOpen) badge.classList.add('show');
    }, 4000);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
