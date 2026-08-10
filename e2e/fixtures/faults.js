/**
 * Fault-injection kit — the tests OpenFirehouse never had.
 *
 * The worst bugs in the report were the app claiming success on failure:
 *   "All changes saved" when storage was dead; "hand it over" when the browser
 *   blocked the document; a "recovered — clear it" button that DELETED work.
 * You only catch those by making the failure happen on purpose and asserting the
 * UI does NOT lie. These helpers make the failure happen.
 */

/** Kill the network the way a basement or a rural dead zone does. */
export async function goOffline(context) {
  await context.setOffline(true);
}
export async function goOnline(context) {
  await context.setOffline(false);
}

/**
 * Try to get the PWA service worker CONTROLLING the page (a freshly-registered SW
 * activates but doesn't control the load that registered it — it takes control on
 * the next navigation). Offline behavior depends on the SW controlling the page.
 *
 * Bounded on purpose: never blocks on navigator.serviceWorker.ready, which hangs
 * forever if the SW fails to install (e.g. its install-time network work can't
 * complete in a headless/remote context). Returns whether the page ended up
 * controlled, within `timeout` — so callers can skip offline assertions gracefully
 * rather than hang or hard-fail where the PWA isn't active.
 */
export async function warmServiceWorker(page, { timeout = 8000 } = {}) {
  const controlled = () => page.waitForFunction(
    () => !!navigator.serviceWorker && !!navigator.serviceWorker.controller,
    null, { timeout },
  ).then(() => true).catch(() => false);

  if (await controlled()) return true;
  await page.reload().catch(() => {});   // a registered-but-not-controlling SW takes control on next nav
  return controlled();
}

/**
 * Make specific API calls FAIL while the app is otherwise up — a partial outage.
 * pattern is a glob/regex for the URL; mode 'abort' (network error) or 'status'.
 */
export async function failApi(page, pattern, { mode = 'abort', status = 500 } = {}) {
  await page.route(pattern, async (route) => {
    if (mode === 'abort') return route.abort('failed');
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: 'injected failure' }) });
  });
}

/** Make an API return an empty payload — the "silent empty result looks like no data" trap (#5, tenancy bug). */
export async function emptyApi(page, pattern) {
  await page.route(pattern, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
}

/**
 * Make device storage unavailable BEFORE the app boots, so writes throw.
 * This is how "All changes saved" got caught lying. Blocks localStorage and
 * IndexedDB writes.
 */
export async function blockStorage(page) {
  await page.addInitScript(() => {
    const boom = () => { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); };
    try { Storage.prototype.setItem = boom; } catch {}
    try { indexedDB.open = () => { throw new DOMException('blocked', 'InvalidStateError'); }; } catch {}
  });
}

/** Block the clipboard so "Copied." can be caught claiming a copy that didn't happen. */
export async function blockClipboard(page) {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('clipboard blocked')) },
        configurable: true,
      });
    } catch {}
  });
}

/**
 * Block the print/open path so "hand it over" can be caught claiming a served
 * notice the owner never received. Neutralizes window.print and blob-open.
 */
export async function blockPrint(page) {
  await page.addInitScript(() => {
    try { window.print = () => { throw new Error('print blocked'); }; } catch {}
    const openReal = window.open;
    try { window.open = () => null; } catch {}
    void openReal;
  });
}

/**
 * Count how many times a URL is fetched during an action — catches the
 * "re-downloading the same data five times per page load" defect.
 * Returns a live counter object; read counter.count after the action.
 */
export async function countRequests(page, pattern) {
  const counter = { count: 0, urls: [] };
  await page.route(pattern, (route) => {
    counter.count += 1;
    counter.urls.push(route.request().url());
    return route.continue();
  });
  return counter;
}
