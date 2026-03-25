// api/fondo.js — Vercel Serverless Function
// Recibe: GET /api/fondo?isin=ES0108232002&days=180
// Devuelve: { name, isin, nav, navDate, series: [{t, c}] }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { isin, days = 180 } = req.query;
  if (!isin || isin.length !== 12) {
    return res.status(400).json({ error: 'ISIN inválido' });
  }

  // Intentamos las fuentes en orden
  const result =
    await tryMorningstarES(isin, Number(days)) ||
    await tryMorningstarGlobal(isin, Number(days)) ||
    await tryQuefondos(isin, Number(days));

  if (!result) {
    return res.status(404).json({ error: `No se encontraron datos para ${isin}` });
  }

  res.status(200).json(result);
}

// ── Fuente 1: Morningstar España (tools.morningstar.es) ───────────────────────
async function tryMorningstarES(isin, days) {
  try {
    // Paso 1: obtener token dinámico de la página principal
    const homeRes = await fetch('https://www.morningstar.es/es/', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const homeHtml = await homeRes.text();
    const tokenMatch = homeHtml.match(/rest\.svc\/([a-z0-9]{10})\//i);
    const token = tokenMatch ? tokenMatch[1] : '2nhcdckzon';

    // Paso 2: buscar el SecurityToken para este ISIN
    const searchUrl = `https://www.morningstar.es/es/util/SecuritySearch.ashx?q=${isin}&limit=5&langId=es-ES&source=nav&moduleId=9&instrumentTypes=FO,FE,FI`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.morningstar.es/' }
    });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    if (!searchData?.length) return null;

    const item = searchData.find(x => x.isin === isin) || searchData[0];
    const secToken = item?.securityToken || item?.SecurityToken;
    const name = item?.name || item?.Name || isin;
    if (!secToken) return null;

    // Paso 3: obtener histórico con el SecurityToken
    const startDate = daysAgo(days);
    const histUrl = `https://tools.morningstar.es/api/rest.svc/${token}/timeseries_price/${token}?currencyId=EUR&idtype=Morningstar&frequency=daily&startDate=${startDate}&outputType=JSON&id=${encodeURIComponent(secToken)}`;
    const histRes = await fetch(histUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.morningstar.es/' }
    });
    if (!histRes.ok) return null;
    const histData = await histRes.json();
    const hist = histData?.TimeSeries?.Security?.[0]?.HistoryDetail;
    if (!hist?.length) return null;

    const series = parseSeries(hist);
    const last = series[series.length - 1];
    return { name, isin, nav: last.c, navDate: new Date(last.t).toISOString().split('T')[0], series };

  } catch (e) {
    console.error('tryMorningstarES error:', e.message);
    return null;
  }
}

// ── Fuente 2: Morningstar Global (global.morningstar.com) ─────────────────────
async function tryMorningstarGlobal(isin, days) {
  try {
    // Buscar el performanceId via API de búsqueda global
    const searchUrl = `https://www.morningstar.com/api/v2/search/securities/5/usquote-v2/?q=${isin}&limit=5&language=es&responseViewFormat=json`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'X-Api-Realtime-E': 'eyJlbmMiOiJBMTI4R0NNIiwiYWxnIjoiUlNBLU9BRVAifQ'
      }
    });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const results = searchData?.results || searchData?.hits || [];
    if (!results.length) return null;

    const item = results.find(x => x.isin === isin || x.Isin === isin) || results[0];
    const perfId = item?.performanceId || item?.PerformanceId || item?.id;
    const name = item?.name || item?.Name || isin;
    if (!perfId) return null;

    // Obtener NAV histórico
    const startDate = daysAgo(days);
    const navUrl = `https://api.morningstar.com/sal-service/v1/fund/nav/v3/${perfId}/data?startDate=${startDate}&endDate=${today()}&currencyId=EUR`;
    const navRes = await fetch(navUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'apikey': 'lstzFDEOhfFNMLikKa0am9mgEKLBl49T'
      }
    });
    if (!navRes.ok) return null;
    const navData = await navRes.json();
    const navList = navData?.nav || navData?.series || navData?.data;
    if (!navList?.length) return null;

    const series = navList
      .map(x => ({ t: new Date(x.date || x.Date || x[0]).getTime(), c: parseFloat(x.nav || x.Nav || x.value || x[1]) }))
      .filter(x => !isNaN(x.c) && x.t > 0)
      .sort((a, b) => a.t - b.t);

    if (!series.length) return null;
    const last = series[series.length - 1];
    return { name, isin, nav: last.c, navDate: new Date(last.t).toISOString().split('T')[0], series };

  } catch (e) {
    console.error('tryMorningstarGlobal error:', e.message);
    return null;
  }
}

// ── Fuente 3: quefondos.com (scraping ligero) ─────────────────────────────────
async function tryQuefondos(isin, days) {
  try {
    // quefondos tiene una API interna que devuelve el histórico en JSON
    const url = `https://www.quefondos.com/es/fondos/ficha/graphdata.html?isin=${isin}&anios=3`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': `https://www.quefondos.com/es/fondos/ficha/index.html?isin=${isin}`,
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    if (!res.ok) return null;
    const text = await res.text();

    // Los datos vienen como array JavaScript [[timestamp, value], ...]
    const match = text.match(/\[\s*\[\s*\d{13}/);
    if (!match) return null;

    const arrMatch = text.match(/(\[\s*\[\s*\d{13}[\s\S]*?\]\s*\])/);
    if (!arrMatch) return null;

    const rawSeries = JSON.parse(arrMatch[1]);
    const cutoff = Date.now() - days * 86400000;
    const series = rawSeries
      .map(([t, c]) => ({ t, c: parseFloat(c) }))
      .filter(x => !isNaN(x.c) && x.t >= cutoff)
      .sort((a, b) => a.t - b.t);

    if (!series.length) return null;

    // Obtener nombre de la página principal
    const pageRes = await fetch(`https://www.quefondos.com/es/fondos/ficha/index.html?isin=${isin}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    let name = isin;
    if (pageRes.ok) {
      const html = await pageRes.text();
      const nameMatch = html.match(/<h2[^>]*>(.*?)<\/h2>/i);
      if (nameMatch) name = nameMatch[1].replace(/\s+/g, ' ').trim();
    }

    const last = series[series.length - 1];
    return { name, isin, nav: last.c, navDate: new Date(last.t).toISOString().split('T')[0], series };

  } catch (e) {
    console.error('tryQuefondos error:', e.message);
    return null;
  }
}

// ── Utilidades ────────────────────────────────────────────────────────────────
function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().split('T')[0];
}
function today() {
  return new Date().toISOString().split('T')[0];
}
function parseSeries(hist) {
  return hist
    .map(h => ({ t: new Date(h.EndDate).getTime(), c: parseFloat(h.Value) }))
    .filter(x => !isNaN(x.c) && x.t > 0)
    .sort((a, b) => a.t - b.t);
}
