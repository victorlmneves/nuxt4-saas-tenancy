import { defineEventHandler, setHeader, createError } from 'h3';

// No backticks inside the HTML so this template literal is safe.
const PANEL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tenancy DevTools</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { color-scheme: dark; }
body {
  font-family: ui-monospace, 'JetBrains Mono', Menlo, monospace;
  font-size: 12.5px;
  background: #0f0f0f;
  color: #c9d1d9;
  padding: 14px 16px;
  line-height: 1.6;
}
h2 {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: #555;
  margin-bottom: 8px;
}
.card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 12px;
}
.cfg-row { display: flex; align-items: flex-start; gap: 10px; padding: 4px 0; }
.cfg-row + .cfg-row { border-top: 1px solid #21262d; }
.cfg-key { color: #8b949e; width: 170px; flex-shrink: 0; }
.pill {
  display: inline-block;
  background: #3fb95020;
  color: #3fb950;
  border: 1px solid #3fb95030;
  border-radius: 4px;
  padding: 0 6px;
  font-size: 11px;
  line-height: 1.8;
}
.pill.gray { background: #ffffff08; color: #8b949e; border-color: #30363d; }
.entry { display: flex; align-items: center; gap: 8px; padding: 5px 0; }
.entry + .entry { border-top: 1px solid #21262d; }
.entry-key { flex: 1; color: #c9d1d9; font-weight: 500; }
.ttl { color: #8b949e; font-size: 11px; min-width: 52px; text-align: right; }
.ttl.warn { color: #e3b341; }
.btn-inv {
  background: none;
  border: 1px solid transparent;
  color: #6e7681;
  cursor: pointer;
  border-radius: 4px;
  font-size: 11px;
  padding: 1px 6px;
  line-height: 1.6;
  font-family: inherit;
}
.btn-inv:hover { border-color: #f8514950; color: #f85149; background: #f8514910; }
.empty { color: #484f58; font-style: italic; padding: 6px 0; }
.bar { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
.btn {
  background: #21262d;
  border: 1px solid #30363d;
  color: #c9d1d9;
  border-radius: 6px;
  padding: 4px 12px;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  line-height: 1.6;
}
.btn:hover { background: #30363d; }
.btn.danger { color: #f85149; border-color: #f8514940; }
.btn.danger:hover { background: #f8514915; }
.spacer { flex: 1; }
.ts { font-size: 10.5px; color: #484f58; text-align: right; margin-top: 4px; }
.status { font-size: 11.5px; border-radius: 6px; padding: 6px 10px; margin-bottom: 10px; display: none; }
.status.ok { display: block; background: #3fb95018; color: #3fb950; border: 1px solid #3fb95030; }
.status.err { display: block; background: #f8514918; color: #f85149; border: 1px solid #f8514930; }
</style>
</head>
<body>

<div class="bar">
  <button class="btn" onclick="load()">&#8635; Refresh</button>
  <button class="btn danger" onclick="invalidateAll()">&#10005; Clear all</button>
  <span class="spacer"></span>
  <span id="driver-badge"></span>
</div>
<div id="status" class="status"></div>

<div class="card">
  <h2>Config</h2>
  <div id="cfg"></div>
</div>

<div class="card">
  <h2>Cache &nbsp;<span id="cache-label" style="font-weight:400;color:#484f58"></span></h2>
  <div id="cache"></div>
</div>

<div class="ts" id="ts"></div>

<script>
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pill(s, gray) {
  return '<span class="pill' + (gray ? ' gray' : '') + '">' + esc(s) + '</span>';
}

function fmtVal(v) {
  if (v === null || v === undefined || v === '') {
    return '<span style="color:#484f58">&#8212;</span>';
  }
  if (Array.isArray(v)) {
    return v.length
      ? v.map(function(x) { return pill(x, true); }).join(' ')
      : '<span style="color:#484f58">[]</span>';
  }
  if (typeof v === 'boolean') {
    return pill(String(v), !v);
  }
  return '<span>' + esc(String(v)) + '</span>';
}

function load() {
  fetch('/_tenancy/devtools/data')
    .then(function(r) {
      if (!r.ok) throw new Error(r.statusText);
      return r.json();
    })
    .then(function(d) {
      render(d);
      setStatus('');
    })
    .catch(function(e) {
      setStatus('Failed to load: ' + e.message, true);
    });
}

function render(d) {
  var cfg = d.config || {};
  var cacheOpts = cfg.cache || {};
  var fields = [
    ['resolver', cfg.resolver],
    ['headerName', cfg.headerName],
    ['onNotFound', cfg.onNotFound],
    ['onError', cfg.onError],
    ['skipPaths', cfg.skipPaths],
    ['baseDomain', cfg.baseDomain || null],
    ['reservedSubdomains', cfg.reservedSubdomains],
    ['cache.driver', cacheOpts.driver],
    ['cache.ttl', cacheOpts.ttl !== undefined ? cacheOpts.ttl + 's' : undefined],
    ['cache.maxMemoryEntries', cacheOpts.maxMemoryEntries],
  ];

  document.getElementById('cfg').innerHTML = fields
    .filter(function(f) { return f[1] !== undefined; })
    .map(function(f) {
      return '<div class="cfg-row"><span class="cfg-key">' + esc(f[0]) + '</span>' + fmtVal(f[1]) + '</div>';
    })
    .join('');

  var cache = d.cache || {};
  var entries = cache.entries || [];
  var drv = cache.driver || 'memory';

  document.getElementById('driver-badge').innerHTML = pill(drv, true);

  if (cache.entryCount >= 0) {
    document.getElementById('cache-label').textContent =
      '(' + cache.entryCount + ' ' + (cache.entryCount === 1 ? 'entry' : 'entries') + ')';
  }

  if (drv !== 'memory') {
    document.getElementById('cache').innerHTML =
      '<div class="empty">Live entry inspection is only available for the memory driver.</div>';
  } else if (!entries.length) {
    document.getElementById('cache').innerHTML = '<div class="empty">Cache is empty.</div>';
  } else {
    document.getElementById('cache').innerHTML = entries
      .map(function(e) {
        return (
          '<div class="entry">' +
          '<span class="entry-key">' + esc(e.key) + '</span>' +
          '<span class="ttl' + (e.expiresIn < 10 ? ' warn' : '') + '">' + e.expiresIn + 's</span>' +
          '<button class="btn-inv" data-key="' + esc(e.key) + '" onclick="invKey(this)" title="Invalidate">&#10005;</button>' +
          '</div>'
        );
      })
      .join('');
  }

  document.getElementById('ts').textContent =
    'Last refreshed: ' + new Date(d.timestamp).toLocaleTimeString();
}

function invKey(btn) {
  invalidateKey(btn.getAttribute('data-key'));
}

function invalidateAll() {
  post('/_tenancy/devtools/invalidate', {})
    .then(function() { setStatus('All cache entries cleared.'); load(); })
    .catch(function(e) { setStatus('Error: ' + e.message, true); });
}

function invalidateKey(key) {
  post('/_tenancy/devtools/invalidate', { key: key })
    .then(function() { setStatus('Invalidated: ' + key); load(); })
    .catch(function(e) { setStatus('Error: ' + e.message, true); });
}

function post(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(function(r) {
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  });
}

function setStatus(msg, isErr) {
  var el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status' + (msg ? (isErr ? ' err' : ' ok') : '');
}

load();
setInterval(load, 5000);
</script>

</body>
</html>`;

/**
 * Dev-only endpoint: serves the self-contained HTML DevTools panel (iframe target).
 * Registered at GET /_tenancy/devtools by nuxt-saas-tenancy when devtools = true.
 */
export default defineEventHandler((event) => {
    if (!import.meta.dev) {
        throw createError({ statusCode: 404 });
    }

    setHeader(event, 'Content-Type', 'text/html; charset=utf-8');
    setHeader(event, 'X-Frame-Options', 'SAMEORIGIN');

    return PANEL_HTML;
});
