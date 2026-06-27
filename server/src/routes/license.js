'use strict';
/**
 * routes/license.js — public license retrieval page. ADR-0001 Step 11.
 * Mounted at /license/:invoiceId in index.js (NOT under requireAuth).
 */
const express = require('express');
const router  = express.Router();
const { supabase } = require('../lib/licensing');

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function shell(title, body) {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — OpenFirehouse</title>
<meta name="robots" content="noindex, nofollow">
<style>
  :root{--ink:#0F172A;--red:#EF4444;--muted:#6B7280;--border:#E5E7EB;--mist:#F9FAFB}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--mist);line-height:1.5}
  .c{max-width:720px;margin:0 auto;padding:32px 20px 64px}
  .b{font-weight:700;color:var(--red);letter-spacing:.04em;text-transform:uppercase;font-size:13px}
  h1{margin:12px 0 8px;font-size:28px}
  .m{color:var(--muted);margin:0 0 24px}
  .card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin:20px 0}
  .tok{font-family:ui-monospace,"SF Mono",Consolas,monospace;font-size:11px;word-break:break-all;background:#0F172A;color:#E5E7EB;padding:16px;border-radius:8px;user-select:all}
  .cp{display:inline-block;margin-top:12px;padding:8px 16px;background:var(--red);color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:14px}
  ol{padding-left:24px}li{margin:6px 0}
  .alert{padding:14px 18px;border-radius:8px;border-left:4px solid;margin:12px 0}
  .alert.w{background:#FFFBEB;border-color:#F59E0B;color:#78350F}
  .alert.e{background:#FEF2F2;border-color:var(--red);color:#7F1D1D}
  footer{color:var(--muted);font-size:13px;margin-top:32px;text-align:center}
  a{color:#2563EB}
</style></head><body><div class="c">
<div class="b">OpenFirehouse — Open Scaffold Labs</div>${body}
<footer>Questions? <a href="mailto:support@openscaffoldlabs.com">support@openscaffoldlabs.com</a></footer>
</div></body></html>`;
}

router.get('/:invoiceId', async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html');

  const invoiceId = req.params.invoiceId;
  if (!invoiceId) return res.status(400).send(shell('Bad request', '<h1>Missing invoice id</h1>'));

  try {
    const sb = supabase();
    const { data, error } = await sb
      .from('licenses')
      .select('license_id, jwt, dept_name, tier, status, expires_at, issued_at, revoked_reason')
      .eq('stripe_invoice_id', invoiceId)
      .eq('product_family', 'openfirehouse')
      .maybeSingle();

    if (error) return res.status(500).send(shell('Error', `<h1>Couldn't load license</h1><div class="alert e">Database error. Try again or email support.</div>`));

    if (!data) {
      return res.status(404).send(shell('Not found', `
        <h1>License not found</h1>
        <p class="m">No license is on file for invoice <code>${escapeHtml(invoiceId)}</code>.</p>
        <div class="alert w">If you just paid, the license may still be processing — try again in a few minutes.
        Our daily reconciler also back-issues anything missed (max 24h delay).
        Otherwise email <a href="mailto:support@openscaffoldlabs.com">support@openscaffoldlabs.com</a>.</div>`));
    }

    if (data.status === 'revoked' || data.status === 'refunded') {
      return res.status(200).send(shell('License revoked', `
        <h1>This license has been ${escapeHtml(data.status)}</h1>
        <p class="m">${escapeHtml(data.dept_name)} — ${escapeHtml((data.tier || '').replace('_', ' '))}</p>
        <div class="alert e">Status: <strong>${escapeHtml(data.status)}</strong>${data.revoked_reason ? ` (${escapeHtml(data.revoked_reason)})` : ''}.
        The activation token is no longer usable for cloud features.</div>
        <p>If you believe this is an error, email <a href="mailto:support@openscaffoldlabs.com">support@openscaffoldlabs.com</a> with invoice <code>${escapeHtml(invoiceId)}</code>.</p>`));
    }

    const expiresAt = data.expires_at ? new Date(data.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'unknown';
    res.status(200).send(shell('Your license', `
      <h1>Your OpenFirehouse license is active</h1>
      <p class="m"><strong>${escapeHtml(data.dept_name)}</strong> — ${escapeHtml((data.tier || '').replace('_', ' '))} · expires ${escapeHtml(expiresAt)}</p>
      <div class="card"><h3 style="margin-top:0">Activation token</h3>
        <div class="tok" id="t">${escapeHtml(data.jwt || '')}</div>
        <button class="cp" onclick="(async()=>{try{await navigator.clipboard.writeText(document.getElementById('t').textContent);this.textContent='Copied';}catch(e){this.textContent='Copy failed';}})()">Copy to clipboard</button></div>
      <div class="card"><h3 style="margin-top:0">How to activate</h3>
        <ol><li>Open <strong>OpenFirehouse</strong> in your browser or the desktop PWA.</li>
        <li>Go to <strong>Settings → Activate License</strong>.</li>
        <li>Paste the token above into the activation field.</li>
        <li>Tap <strong>Activate</strong>.</li></ol></div>
      <p class="m">Issued ${escapeHtml(new Date(data.issued_at).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }))} · License id <code>${escapeHtml(data.license_id)}</code></p>`));
  } catch (err) {
    res.status(500).send(shell('Error', `<h1>Something went wrong</h1><div class="alert e">${escapeHtml(err.message)}</div>`));
  }
});

module.exports = router;
