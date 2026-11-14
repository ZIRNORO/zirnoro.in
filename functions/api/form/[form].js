const FORMS = {
  contact: {
    zf: 'Contact',
    map: d => ({
      Name: splitName(d.name),
      Email: d.email || '',
      MultiLine: joinLines([d.msg, kv('Company', d.company), kv('Topic', d.topic)])
    })
  },
  partner: {
    zf: 'EarlyAccess',
    map: d => ({
      Name: splitName(d.name),
      Email: d.email || '',
      SingleLine: d.firm || '',
      MultiLine: joinLines([d.msg, kv('Type', d.type)])
    })
  }
};

function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return { Name_First: parts.shift() || '-', Name_Last: parts.join(' ') || '-' };
}
function kv(k, v) { return v ? `${k}: ${v}` : ''; }
function joinLines(a) { return a.filter(Boolean).join('\n\n') || '-'; }

export async function onRequestPost({ request, params }) {
  const cfg = FORMS[params.form];
  if (!cfg) return Response.json({ error: 'unknown form' }, { status: 404 });
  let data;
  try { data = await request.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
  if (data.consent === false) return Response.json({ error: 'consent required' }, { status: 400 });
  try {
    const pageUrl = `https://forms.zoho.in/founderzir1/form/${cfg.zf}`;
    const page = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Zirnoro site relay)' } });
    const raw = [];
    if (page.headers.getSetCookie) raw.push(...page.headers.getSetCookie());
    const single = page.headers.get('set-cookie');
    if (single && !raw.length) raw.push(...single.split(/,(?=[^;]*=)/));
    let tok = '';
    for (const c of raw) { const m = c.match(/zfccn=([^;]+)/); if (m) tok = m[1]; }
    if (!tok) {
      let dbg = { err: 'token unavailable', pageStatus: page.status, rawLen: raw.length, raw0: (raw[0] || '').slice(0, 160), singleStr: (single || '').slice(0, 300) };
      if (!raw.length) { const h = await page.text(); dbg.htmlLen = h.length; dbg.hasZfccn = h.includes('zfccn'); }
      return Response.json(dbg, { status: 502 });
    }
    const r = await fetch(`https://forms.zoho.in/founderzir1/form/${cfg.zf}/records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/zoho.forms-v1+json',
        'X-ZCSRF-TOKEN': `zfcpn=${tok}`,
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': `zfcpn=${tok}`,
        'User-Agent': 'Mozilla/5.0 (Zirnoro site relay)',
        'Referer': pageUrl
      },
      body: JSON.stringify(cfg.map(data))
    });
    if (!r.ok) return Response.json({ error: 'zoho rejected', status: r.status }, { status: 502 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: 'relay failed' }, { status: 502 });
  }
}
