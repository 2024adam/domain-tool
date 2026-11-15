const ALL_TLDS = ['com', 'io', 'ai', 'co', 'dev', 'app'];
const DEFAULT_TLDS = ['com', 'io', 'ai'];
let AFFILIATE_ID = '';

// ---------- Build TLD pills ----------
const tldPicker = document.getElementById('tldPicker');
ALL_TLDS.forEach(tld => {
  const label = document.createElement('label');
  const checked = DEFAULT_TLDS.includes(tld) ? 'checked' : '';
  label.innerHTML = `
    <input type="checkbox" value="${tld}" ${checked} />
    <span>.${tld}</span>`;
  tldPicker.appendChild(label);
});

// ---------- Load affiliate ID ----------
fetch('/api/config')
  .then(r => r.json())
  .then(c => { AFFILIATE_ID = c.affiliateId || ''; })
  .catch(() => {});

// ---------- DOM refs ----------
const form = document.getElementById('form');
const kw = document.getElementById('kw');
const styleSel = document.getElementById('style');
const goBtn = document.getElementById('go');
const status = document.getElementById('status');
const resultsUl = document.getElementById('results');
const resultsWrap = document.getElementById('resultsWrap');
const resultCount = document.getElementById('resultCount');
const empty = document.getElementById('empty');

// ---------- Submit handler ----------
form.onsubmit = async (e) => {
  e.preventDefault();
  const keyword = kw.value.trim();
  if (!keyword) return;

  const tlds = [...tldPicker.querySelectorAll('input:checked')].map(i => i.value);
  if (tlds.length === 0) {
    setStatus('Select at least one extension.', true);
    return;
  }

  // Reset UI
  goBtn.disabled = true;
  goBtn.classList.add('loading');
  goBtn.querySelector('.cta-text').textContent = 'Generating…';
  resultsUl.innerHTML = '';
  resultsWrap.hidden = true;
  empty.style.display = 'none';
  setStatus('🤖 Asking the AI for name ideas…');

  let data;
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword,
        style: styleSel.value,
        tlds,
        count: 20
      })
    });
    data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Generation failed');
  } catch (err) {
    setStatus('❌ ' + err.message, true);
    resetButton();
    empty.style.display = '';
    return;
  }

  setStatus(data.usedAI
    ? `✨ ${data.domains.length} ideas generated — checking availability…`
    : `⚠️ AI unavailable — fallback used — checking availability…`);

  // Render rows in "checking" state
  const rows = data.domains.map((d, i) => {
    const li = document.createElement('li');
    li.style.animationDelay = `${Math.min(i * 40, 800)}ms`;
    li.innerHTML = `
      <div class="left">
        <span class="name">
          ${escapeHtml(d.domain)}
          <span class="badge checking">checking…</span>
        </span>
        <span class="why">${escapeHtml(d.why || '')}</span>
      </div>
      <a href="#" class="buy hidden" target="_blank" rel="noopener">Buy →</a>`;
    resultsUl.appendChild(li);
    return { li, domain: d.domain };
  });

  resultsWrap.hidden = false;
  resultCount.textContent = `${rows.length} names`;

  // Check availability
  try {
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domains: rows.map(r => r.domain) })
    });
    const { results } = await res.json();
    const byDomain = Object.fromEntries(results.map(r => [r.domain, r]));

    let availableCount = 0;
    for (const { li, domain } of rows) {
      const r = byDomain[domain] || { status: 'unknown' };
      const badge = li.querySelector('.badge');

      if (r.status === 'available') {
        badge.className = 'badge avail';
        badge.textContent = '✓ available';
        availableCount++;
      } else if (r.status === 'taken') {
        badge.className = 'badge taken';
        badge.textContent = '✗ taken';
      } else {
        badge.className = 'badge unknown';
        badge.textContent = '? unknown';
      }

      if (r.status === 'available') {
        const a = li.querySelector('.buy');
        a.href = buyUrl(domain);
        a.classList.remove('hidden');
      }
    }

    setStatus(
      availableCount > 0
        ? `🎉 ${availableCount} available name${availableCount === 1 ? '' : 's'} — click Buy to register.`
        : '😔 All names are taken — try a different keyword or style.'
    );
  } catch (err) {
    setStatus('Check failed: ' + err.message, true);
  }

  resetButton();
};

// ---------- Helpers ----------
function setStatus(msg, isError = false) {
  status.textContent = msg;
  status.classList.toggle('error', isError);
}

function resetButton() {
  goBtn.disabled = false;
  goBtn.classList.remove('loading');
  goBtn.querySelector('.cta-text').textContent = 'Generate names';
}

function buyUrl(domain) {
  const base = `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(domain)}`;
  return AFFILIATE_ID ? `${base}&aff=${encodeURIComponent(AFFILIATE_ID)}` : base;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}