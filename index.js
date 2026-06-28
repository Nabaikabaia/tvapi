// worker.js — Nabees Movie API + Static Frontend
// Single Cloudflare Worker that serves both API routes and the built React SPA.
//
// Static assets (JS/CSS/images) are served automatically by the ASSETS binding.
// Cloudflare handles SPA fallback (unknown paths → index.html) via wrangler.toml:
//   [assets]
//   not_found_handling = "single-page-application"

// ── FM Radio API config ──────────────────────────────────────────────────────
const FM_BASE = 'https://api.fmonline.app';
const FM_CLIENT_INFO = {
  package_name: 'com.funbase.xradio',
  version_name: '5.0.9.0313.03',
  version_code: 50000022,
  os: 'android',
  os_version: '10',
  install_ch: 'google-play',
  device_id: '2071be9157d6e59469183a83601a85e8',
  install_store: 'gp',
  gaid: '496d7fa2-12bc-4271-b72f-c256a7a5e5ce',
  brand: 'samsung',
  model: 'SM-G960U1',
  system_language: 'en',
  net: 'NETWORK_WIFI',
  region: 'US',
  timezone: 'Africa/Lagos',
  sp_code: '62120',
};
const FM_USER_AGENT = 'com.funbase.xradio/50000022 (Linux; U; Android 10; en_US; SM-G960U1)';

function fmSignature() {
  const ts = Date.now().toString();
  const sig = btoa(ts).replace(/=/g, '').substring(0, 22);
  return `${ts}|2|${sig}=`;
}

function buildFmHeaders(token) {
  return {
    'host': 'api.fmonline.app',
    'authorization': token,
    'x-client-info': JSON.stringify(FM_CLIENT_INFO),
    'x-client-status': '1',
    'x-tr-signature': fmSignature(),
    'user-agent': FM_USER_AGENT,
    'accept-encoding': 'identity',
    'connection': 'Keep-Alive',
  };
}

function getFmToken(env) {
  if (env?.FM_AUTH_TOKEN) {
    const v = env.FM_AUTH_TOKEN;
    return v.startsWith('Bearer ') ? v : `Bearer ${v}`;
  }
  throw new Error('FM_AUTH_TOKEN secret is not configured. Set it via: wrangler secret put FM_AUTH_TOKEN');
}

// Movie API paths
const API_ROUTES = new Set([
  '/sources', '/subtitles', '/stream', '/download',
  '/details', '/search', '/categories', '/popular-searches',
  '/search-suggest', '/subtitle/download', '/health',
]);

// ── Movies API Config ──────────────────────────────────────────────────────
const MOVIES_HOST = 'h5-api.aoneroom.com';
const MOVIES_ORIGIN = 'https://netnaija.film';
const MOVIES_CLIENT_TOKEN = '1782669587,8e1d0d7e7f49451b0d5df14699a7e317';

// ── Sports API Config ──────────────────────────────────────────────────────
const SPORTS_HOST = 'h5-sport-api.aoneroom.com';
const SPORTS_BASE = `https://${SPORTS_HOST}`;
const SPORTS_ORIGIN = 'https://www.thesports.today';

// ── Token cache ───────────────────────────────────────────────────────────
let tokenCache = { value: null, expiry: 0 };

async function getMoviesToken() {
  const now = Date.now();
  if (tokenCache.value && now < tokenCache.expiry) return tokenCache.value;

  const res = await fetch(`https://${MOVIES_HOST}/wefeed-h5api-bff/home`, {
    method: 'GET',
    headers: {
      'Host': MOVIES_HOST,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
      'Origin': MOVIES_ORIGIN,
      'Referer': `${MOVIES_ORIGIN}/`,
      'x-client-info': '{"timezone":"Africa/Lagos"}',
      'x-client-token': MOVIES_CLIENT_TOKEN,
      'x-request-lang': 'en',
      'save-data': 'on',
    },
  });

  const xUser = res.headers.get('x-user');
  if (xUser) {
    try {
      const data = JSON.parse(xUser);
      if (data.token) {
        tokenCache = { value: data.token, expiry: now + 77 * 24 * 60 * 60 * 1000 };
        return data.token;
      }
    } catch {}
  }

  const setCookie = res.headers.get('set-cookie') || '';
  const cookieMatch = setCookie.match(/token=([^;]+)/);
  if (cookieMatch) {
    tokenCache = { value: cookieMatch[1], expiry: now + 77 * 24 * 60 * 60 * 1000 };
    return cookieMatch[1];
  }

  throw new Error('Failed to obtain movies token');
}

async function moviesApiHeaders(_request) {
  const token = await getMoviesToken();
  return {
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': _randomUA(),
    'Referer': `${MOVIES_ORIGIN}/`,
    'Origin': MOVIES_ORIGIN,
    'x-client-info': '{"timezone":"Africa/Lagos"}',
    'x-request-lang': 'en',
    'save-data': 'on',
    'X-Forwarded-For': _randomIP(),
    'X-Real-IP': _randomIP(),
  };
}

// ── League Slugs & IDs ─────────────────────────────────────────────────────
const LEAGUE_SLUGS = {
  'premier-league': '4663840386660596064', laliga: '8879209637879380320',
  'serie-a': '4807955574736451936', bundesliga: '2628213355089131872',
  'ligue-1': '2249910986390010208', nba: '1247297119346653536',
  ipl: '3790705008904141152', 'champions-league': '1391412307422509408',
  'europa-league': '6121317816068372832', 'conference-league': '5109133799816853856',
  'copa-del-rey': '29073420142934368',
};

const LEAGUE_IDS = {
  all: '0', champions_league: '1391412307422509408',
  premier_league: '4663840386660596064', laliga: '8879209637879380320',
  serie_a: '4807955574736451936', bundesliga: '2628213355089131872',
  ligue_1: '2249910986390010208', nba: '1247297119346653536',
  ipl: '3790705008904141152', europa_league: '6121317816068372832',
  conference_league: '5109133799816853856', copa_del_rey: '29073420142934368',
};

function sportsHeaders() {
  return {
    'Host': SPORTS_HOST,
    'x-device-info': '{}',
    'sec-ch-ua-platform': '"Android"',
    'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
    'sec-ch-ua-mobile': '?1',
    'x-client-info': '{"timezone":"Africa/Lagos","system_language":"en"}',
    'save-data': 'on',
    'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
    'accept': 'application/json',
    'content-type': 'application/json',
    'origin': SPORTS_ORIGIN,
    'referer': `${SPORTS_ORIGIN}/`,
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
  };
}

async function sportsFetch(path, params = {}, ttl = 30) {
  const u = new URL(path, SPORTS_BASE);
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') u.searchParams.set(k, String(v)); });
  const cacheKey = new Request(u.toString(), { method: 'GET' });

  try {
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const res = await fetch(u.toString(), { method: 'GET', headers: sportsHeaders() });
    if (res.ok) {
      const toStore = new Response(res.clone().body, {
        status: res.status,
        headers: {
          ...Object.fromEntries(res.headers.entries()),
          'Cache-Control': `public, max-age=${ttl}`,
          'Content-Type': 'application/json',
        },
      });
      await cache.put(cacheKey, toStore);
    }
    return res;
  } catch {
    return fetch(u.toString(), { method: 'GET', headers: sportsHeaders() });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const baseUrl = `${url.protocol}//${url.host}`;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    if (API_ROUTES.has(pathname)) return routeApi(request, baseUrl);
    if (pathname.startsWith('/movies/')) return handleMoviesByCategory(request);
    if (pathname.startsWith('/genre/'))  return handleGenreFilter(request);
    if (pathname.startsWith('/api/')) return routeSportsApi(request);
    if (pathname.startsWith('/fm/')) return routeFmApi(request, env);
    if (pathname.startsWith('/globetv/')) return routeGlobeTv(request);
    if (pathname.startsWith('/cartoon/')) return routeCartoonApi(request, baseUrl);
    if (pathname.startsWith('/webtoon/')) return routeWebtoonApi(request);
    if (pathname.startsWith('/anichin/')) return routeAnichinApi(request);
    if (pathname.startsWith('/oploverz/')) return routeOploverzApi(request);
    if (pathname.startsWith('/hentai/')) return routeHentaiApi(request);

    return handleAssets(request, env, url);
  }
};

function routeApi(request, baseUrl) {
  const pathname = new URL(request.url).pathname;
  switch (pathname) {
    case '/sources': return handleVideoSources(request, baseUrl);
    case '/subtitles': return handleSubtitles(request);
    case '/stream': return handleStreamProxy(request);
    case '/download': return handleDownloadProxy(request);
    case '/details': return handleDetails(request);
    case '/search': return handleSearch(request);
    case '/categories': return handleCategories();
    case '/popular-searches': return handlePopularSearches(request);
    case '/subtitle/download': return handleSubtitleDownload(request);
    case '/search-suggest':
      if (request.method !== 'POST') return errorResponse(405, 'Method Not Allowed');
      return handleSearchSuggest(request);
    case '/health':
      return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    default: return errorResponse(404, 'Not Found');
  }
}

// ============ SOURCES ============
async function handleVideoSources(request, baseUrl) {
  const url = new URL(request.url);
  const subjectId = url.searchParams.get('subjectId');
  const se = url.searchParams.get('se');
  const ep = url.searchParams.get('ep');
  const detailPath = url.searchParams.get('detailPath');
  if (!subjectId || se === null || ep === null || !detailPath) {
    return errorResponse(400, 'Missing required parameters: subjectId, se, ep, detailPath');
  }

  const token = await getMoviesToken();
  const headers = {
    'Host': 'netnaija.film',
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': _randomUA(),
    'Referer': `https://netnaija.film/videoPlayPage/${detailPath}`,
    'Origin': MOVIES_ORIGIN,
    'x-client-info': '{"timezone":"Africa/Lagos"}',
    'x-request-lang': 'en',
    'save-data': 'on',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
  };

  const upstreamUrl = `https://netnaija.film/wefeed-h5api-bff/subject/play?subjectId=${subjectId}&se=${se}&ep=${ep}&detailPath=${detailPath}`;

  try {
    const response = await movieFetch(upstreamUrl, { headers }, 300);
    const data = await upstreamJson(response);

    let movieInfo = null;
    try {
      const hdrs = await moviesApiHeaders(request);
      const infoRes = await movieFetch(
        `https://${MOVIES_HOST}/wefeed-h5api-bff/detail?detailPath=${detailPath}`,
        { headers: hdrs }, 86400
      );
      const infoData = infoRes.ok ? await infoRes.json() : null;
      if (infoData.code === 0 && infoData.data?.subject) {
        const s = infoData.data.subject;
        movieInfo = {
          title: s.title, description: s.description, cover: s.cover,
          genre: s.genre, releaseDate: s.releaseDate, imdbRating: s.imdbRatingValue,
          country: s.countryName, runtime: s.duration,
          type: s.subjectType === 2 ? 'series' : 'movie',
          ...(se !== '0' && ep !== '0' ? { current_season: se, current_episode: ep } : {})
        };
      }
    } catch {}

    if (data.code === 0 && data.data?.streams) {
      const newData = {};
      if (movieInfo) newData.info = movieInfo;
      newData.streams = data.data.streams.map(stream => {
        const p = new URLSearchParams({ url: stream.url, type: 'video/mp4', filename: `${detailPath}_${stream.resolutions}p.mp4` });
        return { ...stream, original_url: stream.url, stream_url: `${baseUrl}/stream?${p}`, download_url: `${baseUrl}/download?${p}` };
      });
      Object.assign(newData, {
        freeNum: data.data.freeNum, limited: data.data.limited,
        limitedCode: data.data.limitedCode, dash: data.data.dash,
        hls: data.data.hls, hasResource: data.data.hasResource
      });
      const firstStreamId = newData.streams[0]?.id;
      if (firstStreamId) {
        const subs = await fetchSubtitlesForStream(firstStreamId, subjectId, detailPath, request);
        if (subs?.length) newData.subtitles = subs;
      }
      data.data = newData;
    }
    return jsonResponse(data, { 'Cache-Control': 'public, max-age=300' });
  } catch (err) {
    return errorResponse(500, `Failed to fetch video sources: ${err.message}`);
  }
}

// ============ SUBTITLES ============
async function handleSubtitles(request) {
  const url = new URL(request.url);
  const format = url.searchParams.get('format');
  const id = url.searchParams.get('id');
  const subjectId = url.searchParams.get('subjectId');
  const detailPath = url.searchParams.get('detailPath');
  if (!format || !id || !subjectId || !detailPath) {
    return errorResponse(400, 'Missing required parameters');
  }

  const token = await getMoviesToken();
  const headers = {
    'Host': MOVIES_HOST,
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': _randomUA(),
    'Origin': MOVIES_ORIGIN,
    'Referer': `${MOVIES_ORIGIN}/`,
    'x-client-info': '{"timezone":"Africa/Lagos"}',
    'x-request-lang': 'en',
    'save-data': 'on',
    'sec-fetch-site': 'cross-site',
  };

  try {
    const res = await fetch(
      `https://${MOVIES_HOST}/wefeed-h5api-bff/subject/caption?format=${format}&id=${id}&subjectId=${subjectId}&detailPath=${detailPath}`,
      { headers }
    );
    const data = await upstreamJson(res);
    if (data.code === 0 && data.data?.captions) {
      data.data.captions = data.data.captions.map(cap => ({
        language: cap.lan, language_name: cap.lanName, url: cap.url,
        format: cap.url.endsWith('.vtt') ? 'vtt' : 'srt',
        size_kb: Math.round(parseInt(cap.size || '0') / 1024),
        ...(cap.lan === 'en' ? { default: true } : {})
      }));
    }
    return jsonResponse(data, { 'Cache-Control': 'public, max-age=3600' });
  } catch (err) {
    return errorResponse(500, `Failed to fetch subtitles: ${err.message}`);
  }
}

// ============ STREAM PROXY ============
async function handleStreamProxy(request) {
  const url = new URL(request.url);
  const videoUrl = url.searchParams.get('url');
  const type = url.searchParams.get('type') || 'video/mp4';
  if (!videoUrl) return errorResponse(400, 'Missing url parameter');

  try {
    const res = await fetch(videoUrl, { headers: buildVideoHeaders(request) });
    if (!res.ok) return errorResponse(res.status, `Upstream error: ${res.statusText}`);
    const range = request.headers.get('range');
    const contentLength = res.headers.get('content-length');
    const resHeaders = {
      'Content-Type': type, 'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
      'Cache-Control': 'public, max-age=31536000',
      ...(contentLength ? { 'Content-Length': contentLength } : {}),
      ...(range ? { 'Content-Range': `bytes ${range.split('=')[1]}/${contentLength || '*'}` } : {}),
    };
    return new Response(res.body, { status: range ? 206 : 200, headers: resHeaders });
  } catch (err) {
    return errorResponse(500, `Streaming failed: ${err.message}`);
  }
}

// ============ DOWNLOAD PROXY ============
async function handleDownloadProxy(request) {
  const url = new URL(request.url);
  const videoUrl = url.searchParams.get('url');
  const filename = url.searchParams.get('filename') || 'video.mp4';
  const type = url.searchParams.get('type') || 'video/mp4';
  if (!videoUrl) return errorResponse(400, 'Missing url parameter');

  try {
    const res = await fetch(videoUrl, { headers: buildVideoHeaders(request) });
    if (!res.ok) return errorResponse(res.status, `Upstream error: ${res.statusText}`);
    const contentLength = res.headers.get('content-length');
    return new Response(res.body, {
      headers: {
        'Content-Type': type,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Cache-Control': 'public, max-age=31536000',
        'Access-Control-Allow-Origin': '*',
        ...(contentLength ? { 'Content-Length': contentLength } : {}),
      }
    });
  } catch (err) {
    return errorResponse(500, `Download failed: ${err.message}`);
  }
}

// ============ SUBTITLE DOWNLOAD ============
async function handleSubtitleDownload(request) {
  const subtitleUrl = new URL(request.url).searchParams.get('url');
  if (!subtitleUrl) return errorResponse(400, 'Missing url parameter');
  const filename = subtitleUrl.split('/').pop()?.split('?')[0] || 'subtitle.srt';
  try {
    const res = await fetch(subtitleUrl, {
      headers: { 'User-Agent': _randomUA(), 'Referer': `${MOVIES_ORIGIN}/` }
    });
    return new Response(res.body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      }
    });
  } catch (err) {
    return errorResponse(500, `Failed to download subtitle: ${err.message}`);
  }
}

// ============ DETAILS ============
async function handleDetails(request) {
  const detailPath = new URL(request.url).searchParams.get('detailPath');
  if (!detailPath) return errorResponse(400, 'Missing detailPath parameter');

  try {
    const hdrs = await moviesApiHeaders(request);
    const [detailRes, recRes] = await Promise.all([
      movieFetch(`https://${MOVIES_HOST}/wefeed-h5api-bff/detail?detailPath=${detailPath}`, { headers: hdrs }, 86400),
      movieFetch(`https://${MOVIES_HOST}/wefeed-h5api-bff/subject/detail-rec?page=0&perPage=20`, { headers: hdrs }, 3600).catch(() => null)
    ]);

    const data = await upstreamJson(detailRes);
    const subjectId = data.data?.subject?.subjectId;

    if (subjectId) {
      try {
        const recRes2 = await movieFetch(
          `https://${MOVIES_HOST}/wefeed-h5api-bff/subject/detail-rec?subjectId=${subjectId}&page=0&perPage=20`,
          { headers: hdrs }, 3600
        );
        const recData = recRes2.ok ? await recRes2.json() : null;
        if (recData.code === 0 && recData.data?.items) {
          data.data.you_may_also_like = recData.data.items
            .filter(i => i.subjectId !== subjectId)
            .slice(0, 20)
            .map(i => ({
              subjectId: i.subjectId, title: i.title, cover: i.cover,
              detailPath: i.detailPath, genre: i.genre,
              releaseYear: i.releaseDate?.split('-')[0] || null,
              imdbRating: i.imdbRatingValue, type: i.subjectType === 2 ? 'series' : 'movie'
            }));
        }
      } catch {}
    }
    return jsonResponse(data, { 'Cache-Control': 'public, max-age=3600' });
  } catch (err) {
    return errorResponse(500, `Failed to fetch details: ${err.message}`);
  }
}

// ============ SEARCH ============
async function handleSearch(request) {
  const url = new URL(request.url);
  let keyword, page, perPage, subjectType;

  if (request.method === 'POST') {
    const body = await request.json();
    ({ keyword, page = 1, perPage = 24, subjectType = 0 } = body);
  } else {
    keyword = url.searchParams.get('q');
    page = parseInt(url.searchParams.get('page') || '1');
    perPage = parseInt(url.searchParams.get('perPage') || '24');
    subjectType = parseInt(url.searchParams.get('subjectType') || '0');
  }

  if (!keyword) return errorResponse(400, 'Missing keyword/q parameter');

  try {
    const hdrs = await moviesApiHeaders(request);
    const res = await movieFetch(`https://${MOVIES_HOST}/wefeed-h5api-bff/subject/search`, {
      method: 'POST',
      headers: { ...hdrs, 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, page, perPage, subjectType })
    }, 600);
    return jsonResponse(await upstreamJson(res), { 'Cache-Control': 'public, max-age=600' });
  } catch (err) {
    return errorResponse(500, `Search failed: ${err.message}`);
  }
}

// ============ CATEGORIES ============
function handleCategories() {
  const cats = {
    anime: "62133389738001440", nollywood: "8216283712045280",
    "black-drama": "8505361996374835640", "k-drama": "4380734070238626200",
    "sa-drama": "4307848214843217008", animation: "7132534597631837112",
    bollywood: "414907768299210008", "c-drama": "173752404280836544",
    "thai-drama": "1164329479448281992", "returning-tv": "8109661952110199232",
    "top-list": "1232643093049001320", "new-tv": "2529702013798074864",
    popular: "997144265920760504", showmax: "2076266324048625696",
    turkish: "9193088611682599936", indian: "3859721901924910512",
    hot: "997144265920760504"
  };
  const categories = Object.entries(cats).map(([key, id]) => ({
    key, name: key.replace(/-/g, ' ').toUpperCase(), id, endpoint: `/movies/${key}`
  }));
  return jsonResponse(
    { code: 0, message: 'ok', data: { count: categories.length, categories } },
    { 'Cache-Control': 'public, max-age=86400' }
  );
}

// ============ MOVIES BY CATEGORY ============
async function handleMoviesByCategory(request) {
  const url = new URL(request.url);
  const category = url.pathname.split('/')[2];
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = parseInt(url.searchParams.get('perPage') || '12');

  const cats = {
    anime: "62133389738001440", nollywood: "8216283712045280",
    "black-drama": "8505361996374835640", "k-drama": "4380734070238626200",
    "sa-drama": "4307848214843217008", animation: "7132534597631837112",
    bollywood: "414907768299210008", "c-drama": "173752404280836544",
    "thai-drama": "1164329479448281992", "returning-tv": "8109661952110199232",
    "top-list": "1232643093049001320", "new-tv": "2529702013798074864",
    popular: "997144265920760504", showmax: "2076266324048625696",
    turkish: "9193088611682599936", indian: "3859721901924910512",
    hot: "997144265920760504"
  };

  const id = cats[category];
  if (!id) return errorResponse(404, `Category "${category}" not found`);

  try {
    const hdrs = await moviesApiHeaders(request);
    const res = await movieFetch(
      `https://${MOVIES_HOST}/wefeed-h5api-bff/ranking-list/content?id=${id}&page=${page}&perPage=${perPage}`,
      { headers: hdrs }, 3600
    );
    return jsonResponse(await upstreamJson(res), { 'Cache-Control': 'public, max-age=3600' });
  } catch (err) {
    return errorResponse(500, `Failed to fetch category: ${err.message}`);
  }
}

// ============ GENRE FILTER ============
async function handleGenreFilter(request) {
  const url = new URL(request.url);
  const genreKey = url.pathname.split('/')[2];
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = parseInt(url.searchParams.get('perPage') || '28');

  const genreMap = {
    horror: 'Horror', war: 'War', thriller: 'Thriller',
    comedy: 'Comedy', scifi: 'Sci-Fi', romance: 'Romance', family: 'Family'
  };
  const genre = genreMap[genreKey];
  if (!genre) return errorResponse(404, `Genre "${genreKey}" not found.`);

  try {
    const hdrs = await moviesApiHeaders(request);
    const res = await movieFetch(`https://${MOVIES_HOST}/wefeed-h5api-bff/subject/filter`, {
      method: 'POST',
      headers: { ...hdrs, 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, perPage, channelId: 2, genre })
    }, 3600);
    return jsonResponse(await upstreamJson(res), { 'Cache-Control': 'public, max-age=3600' });
  } catch (err) {
    return errorResponse(500, `Failed to fetch genre: ${err.message}`);
  }
}

// ============ POPULAR SEARCHES ============
async function handlePopularSearches(request) {
  try {
    const hdrs = await moviesApiHeaders(request);
    const res = await movieFetch(
      `https://${MOVIES_HOST}/wefeed-h5api-bff/subject/everyone-search`,
      { headers: hdrs }, 7200
    );
    return jsonResponse(await upstreamJson(res), { 'Cache-Control': 'public, max-age=7200' });
  } catch (err) {
    return errorResponse(500, `Failed to fetch popular searches: ${err.message}`);
  }
}

// ============ SEARCH SUGGEST ============
async function handleSearchSuggest(request) {
  const body = await request.json();
  if (!body.keyword) return errorResponse(400, 'Missing keyword in request body');

  try {
    const hdrs = await moviesApiHeaders(request);
    const res = await movieFetch(`https://${MOVIES_HOST}/wefeed-h5api-bff/subject/search-suggest`, {
      method: 'POST',
      headers: { ...hdrs, 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: body.keyword, perPage: body.perPage || 10 })
    }, 300);
    return jsonResponse(await upstreamJson(res), { 'Cache-Control': 'public, max-age=300' });
  } catch (err) {
    return errorResponse(500, `Failed to fetch suggestions: ${err.message}`);
  }
}

// ============ HELPERS ============
async function fetchSubtitlesForStream(streamId, subjectId, detailPath, request) {
  try {
    const hdrs = await moviesApiHeaders(request);
    const res = await movieFetch(
      `https://${MOVIES_HOST}/wefeed-h5api-bff/subject/caption?format=MP4&id=${streamId}&subjectId=${subjectId}&detailPath=${detailPath}`,
      { headers: { ...hdrs, 'Origin': MOVIES_ORIGIN, 'Referer': `${MOVIES_ORIGIN}/` } }, 3600
    );
    const data = await upstreamJson(res);
    if (data.code === 0 && data.data?.captions) {
      return data.data.captions.map(cap => ({
        language: cap.lan, name: cap.lanName, url: cap.url,
        download_url: `/subtitle/download?url=${encodeURIComponent(cap.url)}`
      }));
    }
  } catch {}
  return null;
}

function buildVideoHeaders(request) {
  const h = {
    'User-Agent': _randomUA(),
    'Accept': request.headers.get('accept') || 'video/mp4,*/*;q=0.8',
    'Accept-Language': 'en-GB,en-US;q=0.9',
    'Referer': `${MOVIES_ORIGIN}/`,
    'Origin': MOVIES_ORIGIN,
    'Cookie': request.headers.get('cookie') || '',
  };
  Object.keys(h).forEach(k => { if (!h[k]) delete h[k]; });
  return h;
}

async function fmJson(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch {
    const preview = text.slice(0, 200).replace(/\s+/g, ' ');
    throw new Error(`FM API returned non-JSON (HTTP ${res.status}): ${preview}`);
  }
}

const NABEES_META = {
  provider: 'NABEES TECH NAIJA DEVOPS',
  creator: 'NABEES',
  country: 'Nigeria',
};

function jsonResponse(data, extra = {}) {
  const body = Array.isArray(data) ? data : { ...NABEES_META, ...data };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...extra }
  });
}

function errorResponse(code, message) {
  return new Response(JSON.stringify({ ...NABEES_META, code, message }), {
    status: code,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

async function upstreamJson(res) {
  if (res.ok) return res.json();
  let detail = '';
  try { detail = (await res.text()).slice(0, 300); } catch {}
  const code = res.status;
  const hint = code === 429 ? ' (upstream rate-limited)' : '';
  throw new Error(`Upstream returned HTTP ${code}${hint}${detail ? ': ' + detail : ''}`);
}

// ── UA & IP rotation ───────────────────────────────────────────────────────
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
];
const _IP_PREFIXES = [41, 102, 105, 129, 154, 156, 165, 169, 196, 197, 72, 98, 185, 188];
function _rnd(lo, hi) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }
function _randomUA()  { return UA_POOL[_rnd(0, UA_POOL.length - 1)]; }
function _randomIP()  {
  const p = _IP_PREFIXES[_rnd(0, _IP_PREFIXES.length - 1)];
  return `${p}.${_rnd(1, 254)}.${_rnd(1, 254)}.${_rnd(1, 254)}`;
}

async function movieFetch(url, init = {}, ttl = 600) {
  const method = (init.method || 'GET').toUpperCase();
  let cacheKeyUrl = url;
  if (method === 'POST' && init.body) {
    const b64 = btoa(unescape(encodeURIComponent(
      typeof init.body === 'string' ? init.body : JSON.stringify(init.body)
    )));
    cacheKeyUrl = `${url}?_ck=${encodeURIComponent(b64)}`;
  }
  const cacheKey = new Request(cacheKeyUrl, { method: 'GET' });

  try {
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    let res = await fetch(url, { ...init, headers: { ...init.headers, 'User-Agent': _randomUA() } });
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 1000));
      res = await fetch(url, { ...init, headers: { ...init.headers, 'User-Agent': _randomUA() } });
    }
    if (res.ok) {
      const text = await res.clone().text();
      const stored = new Response(text, {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` },
      });
      cache.put(cacheKey, stored).catch(() => {});
    }
    return res;
  } catch {
    return fetch(url, { ...init, headers: { ...init.headers, 'User-Agent': _randomUA() } });
  }
}

// ══════════════════════════════════════════════════════════════
// STATIC ASSETS / SPA
// ══════════════════════════════════════════════════════════════
async function handleAssets(request, env, url) {
  if (!env?.ASSETS) {
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Nabees API</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0d0d0d;color:#e5e7eb;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:1rem;text-align:center;padding:2rem}a{color:#34d399}</style></head><body><div>Nabees API</div><p>Static assets not deployed.</p><a href="/">Home</a></body></html>`;
    return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html;charset=utf-8' } });
  }
  try {
    return await env.ASSETS.fetch(request);
  } catch (e) {
    try {
      const idx = await env.ASSETS.fetch(new Request(new URL('/', url).toString()));
      return new Response(idx.body, { status: 200, headers: { 'Content-Type': 'text/html;charset=utf-8', 'X-SPA-Fallback': '1' } });
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Failed to serve page', message: e.message }), {
        status: 503, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
}

// ══════════════════════════════════════════════════════════════
// SPORTS API ROUTER
// ══════════════════════════════════════════════════════════════
async function routeSportsApi(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const params = Object.fromEntries(url.searchParams);

  try {
    if (pathname === '/api/leagues') {
      const res = await sportsFetch('/wefeed-h5api-bff/live/league-tab', {}, 60);
      return jsonResponse(await upstreamJson(res), { 'Cache-Control': 'public, max-age=60' });
    }
    if (pathname === '/api/league-ids') {
      return jsonResponse({ leagues: LEAGUE_IDS, friendly_urls: LEAGUE_SLUGS });
    }
    if (pathname === '/api/stream-config') {
      return jsonResponse({
        headers: { Origin: SPORTS_ORIGIN, Referer: `${SPORTS_ORIGIN}/`, 'User-Agent': sportsHeaders()['user-agent'] },
        player_setup: {
          hls_js: `const hls=new Hls({xhrSetup:xhr=>{xhr.setRequestHeader('Origin','${SPORTS_ORIGIN}');xhr.setRequestHeader('Referer','${SPORTS_ORIGIN}/');}});`,
          video_js: `videojs.Hls.xhr.beforeRequest=o=>{o.headers=o.headers||{};o.headers['Origin']='${SPORTS_ORIGIN}';return o;};`,
        },
      });
    }
    if (pathname === '/api/matches/live') {
      const res = await sportsFetch('/wefeed-h5api-bff/live/match-list-v5', { leagueId: '0' }, 20);
      const data = await upstreamJson(res);
      const live = (data.data?.list || []).filter(m => m.status === 'MatchIng');
      return jsonResponse({ total: live.length, matches: live });
    }
    if (pathname === '/api/matches/football' || pathname === '/api/matches/basketball' || pathname === '/api/matches/cricket') {
      const mt = pathname.split('/').pop();
      const res = await sportsFetch('/wefeed-h5api-bff/live/match-list-v3', { status: '0', matchType: mt }, 30);
      return jsonResponse(await upstreamJson(res), { 'Cache-Control': 'public, max-age=30' });
    }
    if (pathname === '/api/matches') {
      const { id: leagueId, sport = '' } = params;
      if (!leagueId && !sport) return jsonResponse({ message: 'Provide ?id= or ?sport=football|basketball|cricket', leagues: LEAGUE_IDS });
      if (['football','basketball','cricket'].includes(sport.toLowerCase())) {
        const res = await sportsFetch('/wefeed-h5api-bff/live/match-list-v3', { status: '0', matchType: sport.toLowerCase() }, 30);
        return jsonResponse(await upstreamJson(res), { 'Cache-Control': 'public, max-age=30' });
      }
      const res = await sportsFetch('/wefeed-h5api-bff/sport/aggregate-v1', { leagueId }, 30);
      return jsonResponse(await upstreamJson(res), { 'Cache-Control': 'public, max-age=30' });
    }
    if (pathname === '/api/news') {
      const res = await sportsFetch('/wefeed-h5api-bff/sport/aggregate-v1', { leagueId: params.leagueId || '0' }, 60);
      const data = await upstreamJson(res);
      return jsonResponse({ total: (data.data?.newsList || []).length, news: data.data?.newsList || [] }, { 'Cache-Control': 'public, max-age=60' });
    }
    if (pathname === '/api/highlights') {
      const res = await sportsFetch('/wefeed-h5api-bff/sport/aggregate-v1', { leagueId: params.leagueId || '0' }, 60);
      const data = await upstreamJson(res);
      return jsonResponse({ total: (data.data?.highlights || []).length, highlights: data.data?.highlights || [] }, { 'Cache-Control': 'public, max-age=60' });
    }
    const lgM = pathname.match(/^\/api\/league\/([a-z0-9-]+)$/);
    if (lgM) {
      const id = LEAGUE_SLUGS[lgM[1]];
      if (!id) return errorResponse(404, `Unknown league "${lgM[1]}". Available: ${Object.keys(LEAGUE_SLUGS).join(', ')}`);
      const res = await sportsFetch('/wefeed-h5api-bff/sport/aggregate-v1', { leagueId: id }, 30);
      return jsonResponse(await upstreamJson(res), { 'Cache-Control': 'public, max-age=30' });
    }
    const flowM = pathname.match(/^\/api\/match\/([0-9]+)\/flow$/);
    if (flowM) {
      const res = await sportsFetch('/wefeed-h5api-bff/live/match-flow', {
        id: flowM[1], pageSize: params.pageSize || '30', lastSort: params.cursor || '0'
      }, 10);
      const data = await upstreamJson(res);
      if (data.data?.hasMore) data._pagination = { next_cursor: data.data.lastSort, next_url: `/api/match/${flowM[1]}/flow?cursor=${data.data.lastSort}` };
      return jsonResponse(data, { 'Cache-Control': 'public, max-age=10' });
    }
    const matchM = pathname.match(/^\/api\/match\/([0-9]+)$/);
    if (matchM) {
      const res = await sportsFetch('/wefeed-h5api-bff/sport/detail-v1', { matchId: matchM[1] }, 30);
      const data = await upstreamJson(res);
      if (data.data?.match) {
        data.data.match._stream = {
          headers: { Origin: SPORTS_ORIGIN, Referer: `${SPORTS_ORIGIN}/`, 'User-Agent': sportsHeaders()['user-agent'] },
          player_code: `const hls=new Hls({xhrSetup:xhr=>{xhr.setRequestHeader('Origin','${SPORTS_ORIGIN}');xhr.setRequestHeader('Referer','${SPORTS_ORIGIN}/');}});hls.loadSource('${data.data.match.playSource?.[0]?.path||''}');`.trim(),
        };
      }
      return jsonResponse(data, { 'Cache-Control': 'public, max-age=30' });
    }
    return errorResponse(404, 'Sports endpoint not found.');
  } catch (err) {
    return errorResponse(500, `Sports API error: ${err.message}`);
  }
}

// ══════════════════════════════════════════════════════════════
// FM RADIO API ROUTER
// ══════════════════════════════════════════════════════════════
async function routeFmApi(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const params = url.searchParams;

  const fmPath = pathname.replace(/^\/fm/, '');

  let FM_HEADERS;
  try {
    FM_HEADERS = buildFmHeaders(await getFmToken(env));
  } catch (err) {
    return errorResponse(503, `Could not obtain FM auth token: ${err.message}`);
  }

  const FM_PLAYLISTS = {
    spotify_top: { id: '5129642262212790056', desc: 'Spotify TOP Songs' },
    youtube_hottest: { id: '5366996036324053368', desc: 'YouTube Hottest' },
    music_and_singer: { id: '3614449904094956056', desc: 'Music and Singer' },
  };
  const FM_SCENES = {
    trending: '{"content_type":3,"scene":7}', hot: '{"content_type":3,"scene":2}',
    global: '{"content_type":3,"scene":3}', news: '{"content_type":3,"scene":4}',
    music: '{"content_type":3,"scene":5}', sports: '{"content_type":3,"scene":6}',
  };
  const FM_CAT_SCENES = {
    popular: 'RECOMMEND_SCENE_CATEGORY_POPULAR',
    for_you: 'RECOMMEND_SCENE_CATEGORY_FOR_YOU',
    latest: 'RECOMMEND_SCENE_CATEGORY_LATEST',
  };

  try {
    if (fmPath === '/health') {
      return jsonResponse({ status: 'online', service: 'FM Radio API' });
    }
    if (fmPath === '/countries') {
      const res = await fetch(`${FM_BASE}/wefeed-fm-bff/content/radio-regions`, { headers: FM_HEADERS });
      const data = await fmJson(res);
      if (data.code === 0) {
        const regions = data.data.regions.filter(r => r.countryCode !== 'ALL');
        return jsonResponse({ success: true, total: regions.length, countries: regions.map(r => ({ code: r.countryCode, name: r.countryName })) }, { 'Cache-Control': 'public, max-age=3600' });
      }
      return errorResponse(503, 'FM countries API failed');
    }
    if (fmPath === '/tabs') {
      const res = await fetch(`${FM_BASE}/wefeed-fm-bff/tab/get-bottom-tab-list`, { headers: FM_HEADERS });
      const data = await fmJson(res);
      if (data.code === 0) return jsonResponse({ success: true, data: data.data }, { 'Cache-Control': 'public, max-age=3600' });
      return errorResponse(503, 'FM tabs API failed');
    }
    if (fmPath === '/reference') {
      return jsonResponse({ success: true, playlists: FM_PLAYLISTS, scenes: FM_SCENES, cat_scenes: FM_CAT_SCENES }, { 'Cache-Control': 'public, max-age=86400' });
    }
    if (fmPath === '/playlists') {
      return jsonResponse({ success: true, playlists: FM_PLAYLISTS }, { 'Cache-Control': 'public, max-age=3600' });
    }
    const radioM = fmPath.match(/^\/radio\/([A-Za-z]{2})$/);
    if (radioM) {
      const country = radioM[1].toUpperCase();
      const upUrl = new URL(`${FM_BASE}/wefeed-fm-bff/tab-operating`);
      upUrl.searchParams.set('tabId', '2');
      upUrl.searchParams.set('radioListCountryCode', country);
      upUrl.searchParams.set('version', 'c2b26b6dcc931437b5b54d6cdc79554f');
      const res = await fetch(upUrl.toString(), { headers: FM_HEADERS });
      const data = await fmJson(res);
      if (data.code === 0) {
        const sections = [];
        for (const item of (data.data.items || [])) {
          const stations = [];
          for (const c of (item.contentItems || [])) {
            if (c.sound) {
              const s = c.sound;
              stations.push({ id: s.soundId, name: s.title, plays: s.playCnt || '0', stream_url: s.resources?.radioList?.[0]?.url || null });
            }
          }
          if (stations.length) sections.push({ type: item.type, title: item.title || '', stations });
        }
        return jsonResponse({ success: true, country, sections }, { 'Cache-Control': 'public, max-age=300' });
      }
      return errorResponse(503, 'FM radio API failed');
    }
    const trendM = fmPath.match(/^\/trending\/([A-Za-z]{2})$/);
    if (trendM) {
      const country = trendM[1].toUpperCase();
      const scene = params.get('scene') || 'trending';
      const page = params.get('page') || '1';
      const perPage = parseInt(params.get('per_page') || '10');
      const payload = { countryCode: country, deepLink: '', page, perPage, recommendConfig: FM_SCENES[scene] || FM_SCENES.trending, sessionId: crypto.randomUUID(), tabId: 2, userPrefer: '' };
      const res = await fetch(`${FM_BASE}/wefeed-fm-bff/trending-api/fm/trending`, { method: 'POST', headers: { ...FM_HEADERS, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(payload) });
      const data = await fmJson(res);
      if (data.code === 0) {
        const stations = (data.data.items || []).filter(i => i.sound).map(i => ({ id: i.sound.soundId, name: i.sound.title, plays: i.sound.playCnt || '0', stream_url: i.sound.resources?.radioList?.[0]?.url || null }));
        return jsonResponse({ success: true, country, scene, page: parseInt(page), has_more: data.data.pager?.hasMore || false, stations }, { 'Cache-Control': 'public, max-age=300' });
      }
      return errorResponse(503, 'FM trending API failed');
    }
    const catM = fmPath.match(/^\/category\/([^/]+)$/);
    if (catM) {
      const categoryId = catM[1];
      const country = params.get('country') || 'ALL';
      const scene = params.get('scene') || 'popular';
      const page = parseInt(params.get('page') || '1');
      const perPage = parseInt(params.get('per_page') || '10');
      const payload = { categoryPageId: categoryId, page, perPage, options: [{ type: 'SELECTOR_TYPE_COUNTRY', value: country }, { type: 'SELECTOR_TYPE_SCENE', value: FM_CAT_SCENES[scene] || FM_CAT_SCENES.popular }] };
      const res = await fetch(`${FM_BASE}/wefeed-fm-bff/trending-api/category/trending`, { method: 'POST', headers: { ...FM_HEADERS, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(payload) });
      const data = await fmJson(res);
      if (data.code === 0) {
        const stations = (data.data.items || []).filter(i => i.sound).map(i => ({ id: i.sound.soundId, name: i.sound.title, plays: i.sound.playCnt || '0', stream_url: i.sound.resources?.radioList?.[0]?.url || null }));
        return jsonResponse({ success: true, country, scene, stations }, { 'Cache-Control': 'public, max-age=300' });
      }
      return errorResponse(503, 'FM category API failed');
    }
    const stStreamM = fmPath.match(/^\/station\/([^/]+)\/stream$/);
    if (stStreamM) {
      const upUrl = new URL(`${FM_BASE}/wefeed-fm-bff/content/radio`);
      upUrl.searchParams.set('soundId', stStreamM[1]);
      const res = await fetch(upUrl.toString(), { headers: FM_HEADERS });
      const data = await fmJson(res);
      if (data.code === 0) return jsonResponse({ success: true, name: data.data.title, stream_url: data.data.url }, { 'Cache-Control': 'public, max-age=60' });
      return errorResponse(404, 'Stream not found');
    }
    const stM = fmPath.match(/^\/station\/([^/]+)$/);
    if (stM) {
      const upUrl = new URL(`${FM_BASE}/wefeed-fm-bff/content/next-recommend`);
      upUrl.searchParams.set('contentId', stM[1]);
      upUrl.searchParams.set('contentType', '2');
      const res = await fetch(upUrl.toString(), { headers: FM_HEADERS });
      const data = await fmJson(res);
      if (data.code === 0 && data.data.items?.[0]) {
        const s = data.data.items[0].sound;
        return jsonResponse({ success: true, id: s.soundId, name: s.title, description: (s.description || '').substring(0, 200), cover: s.cover?.url, plays: s.playCnt || '0', stream_url: s.resources?.radioList?.[0]?.url || null, tags: s.tags || [] }, { 'Cache-Control': 'public, max-age=300' });
      }
      return errorResponse(404, 'Station not found');
    }
    const schedM = fmPath.match(/^\/schedule\/([^/]+)$/);
    if (schedM) {
      const upUrl = new URL(`${FM_BASE}/wefeed-fm-bff/content/radio/recentest-timetable`);
      upUrl.searchParams.set('soundId', schedM[1]);
      const res = await fetch(upUrl.toString(), { headers: FM_HEADERS });
      const data = await fmJson(res);
      if (data.code === 0) return jsonResponse({ success: true, data: data.data }, { 'Cache-Control': 'public, max-age=300' });
      return errorResponse(404, 'No schedule available');
    }
    const relM = fmPath.match(/^\/related\/([^/]+)$/);
    if (relM) {
      const upUrl = new URL(`${FM_BASE}/wefeed-fm-bff/trending-api/radio/relate`);
      upUrl.searchParams.set('soundId', relM[1]);
      upUrl.searchParams.set('page', params.get('page') || '1');
      upUrl.searchParams.set('perPage', params.get('perPage') || '10');
      const res = await fetch(upUrl.toString(), { headers: FM_HEADERS });
      const data = await fmJson(res);
      if (data.code === 0) {
        const items = (data.data.items || []).map(i => i.sound ? { type: 'radio', id: i.sound.soundId, name: i.sound.title } : { type: 'album', id: i.album?.albumId, name: i.album?.title });
        return jsonResponse({ success: true, related: items }, { 'Cache-Control': 'public, max-age=300' });
      }
      return errorResponse(404, 'No related content');
    }
    const discM = fmPath.match(/^\/discover\/([^/]+)$/);
    if (discM) {
      const upUrl = new URL(`${FM_BASE}/wefeed-fm-bff/tab-operating`);
      upUrl.searchParams.set('tabId', discM[1]);
      const res = await fetch(upUrl.toString(), { headers: FM_HEADERS });
      const data = await fmJson(res);
      if (data.code === 0) {
        const sections = [];
        for (const item of (data.data.items || [])) {
          const content = (item.contentItems || []).map(c => c.sound ? { type: 'episode', id: c.sound.soundId, title: c.sound.title } : { type: 'album', id: c.album?.albumId, title: c.album?.title });
          if (content.length) sections.push({ type: item.type, title: item.title || '', items: content });
        }
        return jsonResponse({ success: true, sections }, { 'Cache-Control': 'public, max-age=300' });
      }
      return errorResponse(503, 'FM discover API failed');
    }
    const musicM = fmPath.match(/^\/music\/([^/]+)$/);
    if (musicM) {
      const playlistId = FM_PLAYLISTS[musicM[1]]?.id || musicM[1];
      const page = parseInt(params.get('page') || '1');
      const perPage = parseInt(params.get('per_page') || '10');
      const payload = { id: playlistId, page, perPage };
      const res = await fetch(`${FM_BASE}/wefeed-fm-bff/genre-top`, { method: 'POST', headers: { ...FM_HEADERS, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(payload) });
      const data = await fmJson(res);
      if (data.code === 0) {
        const songs = (data.data.list || []).filter(i => i.sound).map(i => ({ id: i.sound.soundId, title: i.sound.title, artist: i.sound.author?.nickname || 'Unknown', duration_sec: i.sound.duration || 0, plays: i.sound.playCnt || '0', audio_url: i.sound.resources?.audioList?.[0]?.url || null }));
        return jsonResponse({ success: true, playlist: data.data.desc, page, has_more: data.data.pager?.hasMore || false, songs }, { 'Cache-Control': 'public, max-age=300' });
      }
      return errorResponse(503, 'FM music API failed');
    }
    const soundM = fmPath.match(/^\/sound\/([^/]+)$/);
    if (soundM) {
      const upUrl = new URL(`${FM_BASE}/wefeed-fm-bff/content/sound`);
      upUrl.searchParams.set('soundId', soundM[1]);
      const res = await fetch(upUrl.toString(), { headers: FM_HEADERS });
      const data = await fmJson(res);
      if (data.code === 0) {
        const s = data.data;
        return jsonResponse({ success: true, id: s.soundId, title: s.title, description: (s.description || '').substring(0, 500), duration_sec: s.duration || 0, plays: s.playCnt || '0', audio_url: s.resources?.audioList?.[0]?.url || null, album: s.belongToAlbum?.title }, { 'Cache-Control': 'public, max-age=300' });
      }
      return errorResponse(404, 'Sound not found');
    }
    const albumM = fmPath.match(/^\/album\/([^/]+)$/);
    if (albumM) {
      const upUrl = new URL(`${FM_BASE}/wefeed-fm-bff/content/album-playlist`);
      upUrl.searchParams.set('album_id', albumM[1]);
      upUrl.searchParams.set('sort', '0');
      upUrl.searchParams.set('pagerMode', '2');
      upUrl.searchParams.set('perPage', params.get('perPage') || '20');
      upUrl.searchParams.set('epFrom', '1');
      upUrl.searchParams.set('epTo', params.get('perPage') || '20');
      upUrl.searchParams.set('favInfo', 'true');
      const res = await fetch(upUrl.toString(), { headers: FM_HEADERS });
      const data = await fmJson(res);
      if (data.code === 0) {
        const episodes = (data.data.soundList || []).map(ep => ({ id: ep.soundId, title: ep.title, episode: ep.belongToAlbum?.ep || 0, duration_sec: ep.duration || 0, plays: ep.playCnt || '0', audio_url: ep.resources?.audioList?.[0]?.url || null }));
        return jsonResponse({ success: true, total: data.data.pager?.totalCount || episodes.length, episodes }, { 'Cache-Control': 'public, max-age=300' });
      }
      return errorResponse(404, 'Album not found');
    }
    return errorResponse(404, 'FM Radio endpoint not found.');
  } catch (err) {
    return errorResponse(500, `FM Radio API error: ${err.message}`);
  }
}

// ══════════════════════════════════════════════════════════════
// SHARED HELPERS — Extended APIs
// ══════════════════════════════════════════════════════════════
function cleanText(text) {
  if (!text) return '';
  return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#8217;/g, "'").replace(/\s+/g, ' ').trim();
}

function extJsonResponse(data, status = 200, cacheSeconds = 0) {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (cacheSeconds > 0) headers['Cache-Control'] = `public, max-age=${cacheSeconds}`;
  return new Response(JSON.stringify({ ...NABEES_META, ...data }), { status, headers });
}

function extJsonError(message, status = 500) {
  return extJsonResponse({ error: { code: status, message } }, status);
}

// ══════════════════════════════════════════════════════════════
// GLOBETV API — /globetv/*
// ══════════════════════════════════════════════════════════════
const GLOBE_MAP = {
  '/globetv/ch': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/channels.json.gz',
  '/globetv/co': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/countries.json.gz',
  '/globetv/ca': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/categories.json.gz',
  '/globetv/bl': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/blocklist.json.gz',
  '/globetv/st': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/streams.json.gz',
};

async function routeGlobeTv(request) {
  const pathname = new URL(request.url).pathname;
  const globeUrl = GLOBE_MAP[pathname];
  if (!globeUrl) return extJsonError(`Unknown GlobeTV endpoint. Available: ${Object.keys(GLOBE_MAP).join(', ')}`, 404);
  try {
    const res = await fetch(globeUrl);
    const compressed = await res.arrayBuffer();
    const decompressed = new Response(compressed).body.pipeThrough(new DecompressionStream('gzip'));
    const data = await new Response(decompressed).json();
    return extJsonResponse({ data }, 200, 3600);
  } catch (e) {
    return extJsonError(`GlobeTV fetch failed: ${e.message}`);
  }
}

// ══════════════════════════════════════════════════════════════
// CARTOONS API — /cartoon/*
// ══════════════════════════════════════════════════════════════
const CARTOONS_BASE = 'https://cartoons.lk';
const CARTOON_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
let cartoonNonceCache = { value: null, expiry: 0 };

async function getCartoonNonce() {
  if (cartoonNonceCache.value && Date.now() < cartoonNonceCache.expiry) return cartoonNonceCache.value;
  const res = await fetch(`${CARTOONS_BASE}/`, { headers: { 'User-Agent': CARTOON_UA } });
  const html = await res.text();
  let match = html.match(/"nonce"\s*:\s*"([a-f0-9]+)"/i) || html.match(/var\s+nonce\s*=\s*['"]([^'"]+)['"]/i) || html.match(/data-nonce=["']([^"']+)["']/i);
  if (!match) throw new Error('Cartoon nonce not found');
  cartoonNonceCache = { value: match[1], expiry: Date.now() + 10 * 60 * 1000 };
  return match[1];
}

async function routeCartoonApi(request, baseUrl) {
  const url = new URL(request.url);
  const path = url.pathname;
  const q = url.searchParams;
  try {
    if (path === '/cartoon/search') {
      const query = q.get('q');
      if (!query) return extJsonError('Missing q parameter', 400);
      const res = await fetch(`${CARTOONS_BASE}/?s=${encodeURIComponent(query)}`, { headers: { 'User-Agent': CARTOON_UA } });
      const html = await res.text();
      const results = [];
      const re = /<article[^>]*class="[^"]*item-list[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
      let m;
      while ((m = re.exec(html)) !== null) {
        const tm = m[1].match(/<h2[^>]*class="[^"]*post-box-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
        if (tm) {
          const slug = tm[1].replace(`${CARTOONS_BASE}/`, '').replace(/\/$/, '');
          results.push({ title: cleanText(tm[2]), details_url: `${baseUrl}/cartoon/details?slug=${slug}`, slug });
        }
      }
      return extJsonResponse({ query, total: results.length, results }, 200, 300);
    }
    if (path === '/cartoon/details') {
      const slug = q.get('slug');
      if (!slug) return extJsonError('Missing slug parameter', 400);
      const res = await fetch(`${CARTOONS_BASE}/${slug}/`, { headers: { 'User-Agent': CARTOON_UA } });
      const html = await res.text();
      const postIdMatch = html.match(/postid-([0-9]+)/);
      const postId = postIdMatch ? parseInt(postIdMatch[1]) : null;
      const titleMatch = html.match(/<h1[^>]*class="[^"]*post-title[^"]*"[^>]*>([^<]+)</i);
      const title = titleMatch ? cleanText(titleMatch[1]) : '';
      const isTvSeries = html.includes('episodes-popup') || html.includes('episodes-data-');
      let episodes = [];
      if (isTvSeries && postId) {
        const scriptMatch = html.match(new RegExp(`id="episodes-data-${postId}"[^>]*>([\\s\\S]*?)<\\/script>`, 'i'));
        if (scriptMatch) {
          try {
            const epData = JSON.parse(scriptMatch[1]);
            episodes = epData.map((ep, idx) => ({
              number: parseInt(ep.number) || idx + 1,
              title: ep.title || `Episode ${idx + 1}`,
              quality: ep.download_links?.[0]?.label || ep.resolution,
              size: ep.download_links?.[0]?.file_size || ep.file_size,
              download_url: `${baseUrl}/cartoon/fetch/download?post_id=${postId}&episode=${idx}`,
              watch_url: `${baseUrl}/cartoon/fetch/watch?post_id=${postId}&episode=${idx}`,
            }));
          } catch {}
        }
      }
      return extJsonResponse({ id: postId, title, type: isTvSeries ? 'tv_series' : 'movie', episodes, total_episodes: episodes.length }, 200, 600);
    }
    if (path === '/cartoon/fetch/download') {
      const postId = q.get('post_id'), episode = q.get('episode');
      if (!postId || !episode) return extJsonError('Missing post_id or episode', 400);
      const nonce = await getCartoonNonce();
      const pageRes = await fetch(`${CARTOONS_BASE}/?p=${postId}`, { headers: { 'User-Agent': CARTOON_UA } });
      const cookies = pageRes.headers.get('set-cookie') || '';
      const form = new FormData();
      form.append('action', 'get_movie_link'); form.append('nonce', nonce);
      form.append('post_id', postId); form.append('type', 'episode');
      form.append('action_type', 'download'); form.append('episode_index', episode);
      form.append('link_index', '0');
      const ajax = await fetch(`${CARTOONS_BASE}/wp-admin/admin-ajax.php`, { method: 'POST', headers: { Cookie: cookies, 'User-Agent': CARTOON_UA }, body: form });
      const data = await ajax.json();
      if (data.success && data.data?.direct) return extJsonResponse({ success: true, download_url: data.data.direct });
      return extJsonError('Download not available', 404);
    }
    if (path === '/cartoon/fetch/watch') {
      const postId = q.get('post_id'), episode = q.get('episode');
      if (!postId || !episode) return extJsonError('Missing post_id or episode', 400);
      const nonce = await getCartoonNonce();
      const pageRes = await fetch(`${CARTOONS_BASE}/?p=${postId}`, { headers: { 'User-Agent': CARTOON_UA } });
      const cookies = pageRes.headers.get('set-cookie') || '';
      const form = new FormData();
      form.append('action', 'get_movie_link'); form.append('nonce', nonce);
      form.append('post_id', postId); form.append('type', 'episode');
      form.append('action_type', 'watch'); form.append('episode_index', episode);
      form.append('server_index', '0');
      const ajax = await fetch(`${CARTOONS_BASE}/wp-admin/admin-ajax.php`, { method: 'POST', headers: { Cookie: cookies, 'User-Agent': CARTOON_UA }, body: form });
      const data = await ajax.json();
      if (data.success && data.data?.url) return extJsonResponse({ success: true, watch_url: data.data.url });
      return extJsonError('Watch not available', 404);
    }
    if (path === '/cartoon/genres') {
      const res = await fetch(CARTOONS_BASE, { headers: { 'User-Agent': CARTOON_UA } });
      const html = await res.text();
      const genres = [];
      const re = /<a[^>]*href="https?:\/\/cartoons\.lk\/category\/([^"/]+)\/?[^"]*"[^>]*>([^<]+)<\/a>/gi;
      const seen = new Set();
      let m;
      while ((m = re.exec(html)) !== null) {
        if (!seen.has(m[1])) { seen.add(m[1]); genres.push({ name: cleanText(m[2]), slug: m[1] }); }
      }
      return extJsonResponse({ total: genres.length, genres }, 200, 3600);
    }
    if (path === '/cartoon/listing') {
      const category = q.get('category'), page = parseInt(q.get('page')) || 1;
      if (!category) return extJsonError('Missing category parameter', 400);
      const pageUrl = page === 1 ? `${CARTOONS_BASE}/category/${category}/` : `${CARTOONS_BASE}/category/${category}/page/${page}/`;
      const res = await fetch(pageUrl, { headers: { 'User-Agent': CARTOON_UA } });
      const html = await res.text();
      const items = [];
      const re = /<article[^>]*class="[^"]*item-list[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
      let m;
      while ((m = re.exec(html)) !== null) {
        const tm = m[1].match(/<h2[^>]*class="[^"]*post-box-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
        if (tm) {
          const slug = tm[1].replace(`${CARTOONS_BASE}/`, '').replace(/\/$/, '');
          items.push({ title: cleanText(tm[2]), details_url: `${baseUrl}/cartoon/details?slug=${slug}`, slug });
        }
      }
      return extJsonResponse({ category, page, total: items.length, next_page: html.includes('rel="next"') ? page + 1 : null, items }, 200, 300);
    }
    if (path === '/cartoon/trending') {
      const res = await fetch(CARTOONS_BASE, { headers: { 'User-Agent': CARTOON_UA } });
      const html = await res.text();
      const items = [];
      const re = /<article[^>]*class="[^"]*item-list[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
      let m;
      while ((m = re.exec(html)) !== null && items.length < 20) {
        const tm = m[1].match(/<h2[^>]*class="[^"]*post-box-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
        if (tm) {
          const slug = tm[1].replace(`${CARTOONS_BASE}/`, '').replace(/\/$/, '');
          items.push({ title: cleanText(tm[2]), details_url: `${baseUrl}/cartoon/details?slug=${slug}`, slug });
        }
      }
      return extJsonResponse({ total: items.length, items }, 200, 300);
    }
    return extJsonError('Unknown /cartoon/* endpoint', 404);
  } catch (e) {
    return extJsonError(`Cartoon API error: ${e.message}`);
  }
}

// ══════════════════════════════════════════════════════════════
// WEBTOON API — /webtoon/*
// ══════════════════════════════════════════════════════════════
const WEBTOON_BASE = 'https://m.webtoons.com';

function getWebtoonHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cookie': 'locale=id; needGDPR=false; needCCPA=false; needCOPPA=false; countryCode=ID',
  };
}

async function routeWebtoonApi(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const q = url.searchParams;

  try {
    if (path === '/webtoon/home') {
      const res = await fetch(`${WEBTOON_BASE}/id`, { headers: getWebtoonHeaders() });
      if (!res.ok) return extJsonResponse({ trending: [], popular: [], error: `HTTP ${res.status}` }, 200);
      const html = await res.text();
      const trending = [], popular = [];
      const anchorRe = /<a[^>]*class="[^"]*_titleItem[^"]*"[^>]*>/gi;
      let m, count = 0;
      while ((m = anchorRe.exec(html)) !== null && count < 20) {
        const tag = m[0];
        const hrefM = tag.match(/href="([^"]+)"/);
        const titleNoM = tag.match(/data-title-no="(\d+)"/);
        if (!hrefM || !titleNoM) continue;
        const href = hrefM[1];
        const slugM = href.match(/\/([^\/]+)\/list\?/);
        const title = slugM ? slugM[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
        const urlPath = href.replace(/^https?:\/\/m\.webtoons\.com/, '');
        const item = { titleNo: titleNoM[1], title, url: urlPath };
        count < 10 ? trending.push(item) : popular.push(item);
        count++;
      }
      return extJsonResponse({ trending, popular, total_trending: trending.length, total_popular: popular.length }, 200, 300);
    }
    if (path === '/webtoon/search') {
      const keyword = q.get('keyword'), page = parseInt(q.get('page')) || 1;
      if (!keyword) return extJsonError('Missing keyword parameter', 400);
      const start = (page - 1) * 10 + 1;
      const res = await fetch(`${WEBTOON_BASE}/id/search/result?keyword=${encodeURIComponent(keyword)}&searchType=ALL&start=${start}`, { headers: getWebtoonHeaders() });
      if (!res.ok) return extJsonError(`Webtoon search HTTP ${res.status}`, 502);
      const data = await res.json();
      const webtoon = data?.result?.webtoonResult?.titleList || [];
      const canvas = data?.result?.challengeResult?.titleList || [];
      const results = [
        ...webtoon.map(i => ({ titleNo: String(i.titleNo), title: i.title, genre: i.representGenre || null, type: 'WEBTOON', thumbnail: i.thumbnailMobile ? `https://webtoon-phinf.pstatic.net${i.thumbnailMobile}` : '', readCount: i.readCount })),
        ...canvas.map(i => ({ titleNo: String(i.titleNo), title: i.title, genre: i.representGenre || null, type: 'CHALLENGE', thumbnail: i.thumbnailMobile ? `https://webtoon-phinf.pstatic.net${i.thumbnailMobile}` : '', readCount: i.readCount })),
      ];
      return extJsonResponse({ keyword, page, total_results: results.length, results }, 200, 300);
    }
    if (path === '/webtoon/detail') {
      const titleNo = q.get('titleNo');
      if (!titleNo) return extJsonError('Missing titleNo parameter', 400);
      const res = await fetch(`${WEBTOON_BASE}/api/v1/webtoon/${titleNo}/episodes?pageSize=30`, { headers: { ...getWebtoonHeaders(), 'x-requested-with': 'XMLHttpRequest' } });
      if (!res.ok) return extJsonError(`Webtoon detail HTTP ${res.status}`, 502);
      const data = await res.json();
      const episodes = (data?.result?.episodeList || []).map(ep => ({
        episodeNo: ep.episodeNo, title: ep.episodeTitle,
        date: ep.exposureDateMillis ? new Date(ep.exposureDateMillis).toISOString() : null,
        thumbnail: ep.thumbnail ? `https://webtoon-phinf.pstatic.net${ep.thumbnail}` : '',
        url: ep.viewerLink,
      }));
      return extJsonResponse({ titleNo, episodes, total_episodes: episodes.length }, 200, 600);
    }
    if (path === '/webtoon/read') {
      const episodeUrl = q.get('url');
      if (!episodeUrl) return extJsonError('Missing url parameter', 400);
      const fullUrl = episodeUrl.startsWith('http') ? episodeUrl : `${WEBTOON_BASE}${episodeUrl}`;
      const res = await fetch(fullUrl, { headers: getWebtoonHeaders() });
      if (!res.ok) return extJsonError(`Webtoon read HTTP ${res.status}`, 502);
      const html = await res.text();
      const images = [];
      const imgMatch = html.match(/var\s+imageList\s*=\s*(\[[\s\S]*?\]);/);
      if (imgMatch) {
        const imageRe = /url:\s*"([^"]+)"[\s\S]*?sortOrder:\s*(\d+)/g;
        let m;
        while ((m = imageRe.exec(imgMatch[1])) !== null) images.push({ url: m[1], sortOrder: Number(m[2]) });
        images.sort((a, b) => a.sortOrder - b.sortOrder);
      }
      const nextMatch = html.match(/nextEpisodeUrl:\s*"([^"]*)"/);
      const prevMatch = html.match(/prevEpisodeUrl:\s*"([^"]*)"/);
      return extJsonResponse({ images, total_images: images.length, next_episode_url: nextMatch?.[1] || null, prev_episode_url: prevMatch?.[1] || null });
    }
    if (path === '/webtoon/image') {
      const imageUrl = q.get('url');
      if (!imageUrl) return extJsonError('Missing url parameter', 400);
      const res = await fetch(imageUrl, { headers: { Referer: 'https://www.webtoons.com/', 'User-Agent': 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36' } });
      if (!res.ok) return extJsonError(`Image fetch failed: ${res.status}`, 404);
      const imageData = await res.arrayBuffer();
      return new Response(imageData, { headers: { 'Content-Type': res.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' } });
    }
    return extJsonError('Unknown /webtoon/* endpoint', 404);
  } catch (e) {
    return extJsonError(`Webtoon API error: ${e.message}`);
  }
}

// ══════════════════════════════════════════════════════════════
// ANICHIN API — /anichin/*
// ══════════════════════════════════════════════════════════════
const ANICHIN_BASE = 'https://anichin.moe';

function getAnichinHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'upgrade-insecure-requests': '1',
  };
}

function fullAnichinUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (path.startsWith('//')) return `https:${path}`;
  if (path.startsWith('/')) return `${ANICHIN_BASE}${path}`;
  return `${ANICHIN_BASE}/${path}`;
}

function extractAnichinCards(html) {
  const cards = [];
  const articleRe = /<article[^>]*class="[^"]*bs[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = articleRe.exec(html)) !== null) {
    const a = m[1];
    const urlMatch = a.match(/<a[^>]*href="([^"]+)"[^>]*>/i);
    const titleMatch = a.match(/<h2[^>]*itemprop="headline"[^>]*>([^<]+)<\/h2>/i) || a.match(/<div[^>]*class="[^"]*tt[^"]*"[^>]*>([^<]+)/i);
    const epMatch = a.match(/<span[^>]*class="[^"]*epx[^"]*"[^>]*>Ep\s*(\d+)/i);
    const typeMatch = a.match(/<div[^>]*class="[^"]*typez[^"]*"[^>]*>([^<]+)<\/div>/i);
    const imgMatch = a.match(/<img[^>]*src="([^"]+)"[^>]*class="[^"]*ts-post-image[^"]*"[^>]*>/i);
    const statusMatch = a.match(/<div[^>]*class="[^"]*status[^"]*"[^>]*>([^<]+)<\/div>/i);
    if (titleMatch) {
      cards.push({
        title: cleanText(titleMatch[1]),
        url: urlMatch ? fullAnichinUrl(urlMatch[1]) : null,
        episode: epMatch ? parseInt(epMatch[1]) : null,
        type: typeMatch ? cleanText(typeMatch[1]) : 'Donghua',
        thumbnail: imgMatch ? imgMatch[1] : null,
        status: statusMatch ? cleanText(statusMatch[1]) : null,
      });
    }
  }
  return cards;
}

function extractAnichinGenreList(html) {
  const genres = [];
  const re = /<input[^>]*name="genre\[\]"[^>]*value="([^"]+)"[^>]*>\s*<label[^>]*for="[^"]*"[^>]*>([^<]+)<\/label>/gi;
  let m;
  while ((m = re.exec(html)) !== null) genres.push({ slug: m[1], name: cleanText(m[2]) });
  return genres;
}

function extractAnichinPagination(html, page) {
  const next = html.match(/<a[^>]*href="\/page\/(\d+)\/[^>]*>Selanjutnya/i);
  return { currentPage: page, nextPage: next ? parseInt(next[1]) : null, hasNext: !!next };
}

async function routeAnichinApi(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const q = url.searchParams;

  try {
    if (path === '/anichin/home') {
      const page = parseInt(q.get('page')) || 1;
      const res = await fetch(`${ANICHIN_BASE}${page > 1 ? `/page/${page}/` : ''}`, { headers: getAnichinHeaders() });
      if (!res.ok) return extJsonError(`Anichin HTTP ${res.status}`, 502);
      const html = await res.text();
      const allCards = extractAnichinCards(html);
      return extJsonResponse({ page, popular: allCards.slice(0, 10), latest: allCards.slice(10, 30), pagination: extractAnichinPagination(html, page), total: allCards.length }, 200, 300);
    }
    if (path === '/anichin/search') {
      const query = q.get('q');
      if (!query) return extJsonError('Missing q parameter', 400);
      const res = await fetch(`${ANICHIN_BASE}/?s=${encodeURIComponent(query)}`, { headers: getAnichinHeaders() });
      if (!res.ok) return extJsonError(`Anichin search HTTP ${res.status}`, 502);
      const html = await res.text();
      const results = extractAnichinCards(html);
      return extJsonResponse({ query, results, total: results.length }, 200, 300);
    }
    if (path === '/anichin/info') {
      const slug = q.get('slug');
      if (!slug) return extJsonError('Missing slug parameter', 400);
      const res = await fetch(`${ANICHIN_BASE}/${slug}`, { headers: getAnichinHeaders() });
      if (!res.ok) return extJsonError(`Anichin info HTTP ${res.status}`, 502);
      const html = await res.text();
      const nameMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]+)</i);
      const thumbMatch = html.match(/<div[^>]*class="thumb"[^>]*>\s*<img[^>]*src="([^"]+)"/i);
      const genres = [];
      const genreRe = /<div[^>]*class="genxed"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/gi;
      let gm;
      while ((gm = genreRe.exec(html)) !== null) genres.push(cleanText(gm[1]));
      const episodes = [];
      const epRe = /<div[^>]*class="eplister"[^>]*>[\s\S]*?<li>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<div[^>]*class="epl-title"[^>]*>([^<]+)<\/div>[\s\S]*?<div[^>]*class="epl-date"[^>]*>([^<]+)<\/div>/gi;
      let em;
      while ((em = epRe.exec(html)) !== null) {
        episodes.push({ slug: em[1].split('/').filter(Boolean).pop(), title: cleanText(em[2]), date: cleanText(em[3]), url: fullAnichinUrl(em[1]) });
      }
      return extJsonResponse({ name: nameMatch ? cleanText(nameMatch[1]) : '', thumbnail: thumbMatch?.[1] || null, genres, total_episodes: episodes.length, episodes: episodes.slice(0, 20) }, 200, 600);
    }
    if (path === '/anichin/episode') {
      const slug = q.get('slug');
      if (!slug) return extJsonError('Missing slug parameter', 400);
      const res = await fetch(`${ANICHIN_BASE}/${slug}`, { headers: getAnichinHeaders() });
      if (!res.ok) return extJsonError(`Anichin episode HTTP ${res.status}`, 502);
      const html = await res.text();
      const servers = [];
      const serverRe = /<select[^>]*class="mirror"[^>]*>[\s\S]*?<option[^>]*value="([^"]+)"[^>]*>([^<]+)<\/option>[\s\S]*?<\/select>/gi;
      let sm;
      while ((sm = serverRe.exec(html)) !== null) {
        let embedUrl = null;
        try { const dec = atob(sm[1]); const im = dec.match(/<iframe[^>]*src="([^"]+)"/); if (im) embedUrl = im[1]; } catch {}
        servers.push({ label: cleanText(sm[2]), embedUrl });
      }
      const downloads = [];
      const dlRe = /<div[^>]*class="soraurlx"[^>]*>[\s\S]*?<strong>([^<]+)<\/strong>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
      let dm;
      while ((dm = dlRe.exec(html)) !== null) downloads.push({ quality: cleanText(dm[1]), url: fullAnichinUrl(dm[2]), host: cleanText(dm[3]) });
      return extJsonResponse({ servers, downloads });
    }
    if (path === '/anichin/anime-list') {
      const res = await fetch(`${ANICHIN_BASE}/anime`, { headers: getAnichinHeaders() });
      if (!res.ok) return extJsonError(`Anichin anime-list HTTP ${res.status}`, 502);
      const html = await res.text();
      const results = extractAnichinCards(html);
      return extJsonResponse({ results, total: results.length }, 200, 3600);
    }
    if (path === '/anichin/genres') {
      const res = await fetch(`${ANICHIN_BASE}/anime`, { headers: getAnichinHeaders() });
      if (!res.ok) return extJsonError(`Anichin genres HTTP ${res.status}`, 502);
      const genres = extractAnichinGenreList(await res.text());
      return extJsonResponse({ genres, total: genres.length }, 200, 3600);
    }
    if (path === '/anichin/genre') {
      const slug = q.get('slug'), page = parseInt(q.get('page')) || 1;
      if (!slug) return extJsonError('Missing slug parameter', 400);
      let genreUrl = `/anime?genre[]=${slug}`;
      if (page > 1) genreUrl += `&page=${page}`;
      const res = await fetch(`${ANICHIN_BASE}${genreUrl}`, { headers: getAnichinHeaders() });
      if (!res.ok) return extJsonError(`Anichin genre HTTP ${res.status}`, 502);
      const html = await res.text();
      const results = extractAnichinCards(html);
      return extJsonResponse({ results, slug, page, pagination: extractAnichinPagination(html, page), total: results.length }, 200, 300);
    }
    return extJsonError('Unknown /anichin/* endpoint', 404);
  } catch (e) {
    return extJsonError(`Anichin API error: ${e.message}`);
  }
}

// ══════════════════════════════════════════════════════════════
// OPLOVERZ API — /oploverz/*
// ══════════════════════════════════════════════════════════════
const OPLOVERZ_BASE = 'https://vip.oploverz.ltd';
const OPLOVERZ_BACKAPI = 'https://backapi.oploverz.ac/uploads/';

function getOploverzHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': `${OPLOVERZ_BASE}/`,
  };
}

function decodeSvelteFlat(raw) {
  if (!raw || !Array.isArray(raw.nodes)) return null;
  const dataNode = raw.nodes.find(n => n?.type === 'data' && Array.isArray(n.data));
  if (!dataNode) return null;
  const arr = dataNode.data;
  function resolve(idx) {
    if (idx === null || idx === undefined) return null;
    const val = arr[idx];
    if (val === null || val === undefined) return val;
    if (typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map(i => resolve(i));
    const result = {};
    for (const [k, v] of Object.entries(val)) result[k] = resolve(v);
    return result;
  }
  return resolve(0);
}

async function fetchOploverzData(path, referer) {
  const endpoint = (path === '/' ? '' : path) + '/__data.json?x-sveltekit-invalidated=001';
  const res = await fetch(`${OPLOVERZ_BASE}${endpoint}`, { headers: { ...getOploverzHeaders(), Referer: referer || `${OPLOVERZ_BASE}/` } });
  if (!res.ok) throw new Error(`Oploverz fetch ${endpoint}: ${res.status}`);
  return decodeSvelteFlat(await res.json());
}

function oploverzFullUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return OPLOVERZ_BACKAPI + path;
}

function oploverzCleanUrl(url) {
  if (!url) return false;
  return !['blogger.com','blogspot.com','slot','casino','mpo','judol'].some(d => url.toLowerCase().includes(d));
}

function fmtOploverzSeries(s) {
  if (!s?.slug) return null;
  return {
    id: s.id || null, title: s.title || null, japaneseTitle: s.japaneseTitle || null, slug: s.slug,
    status: s.status || null, poster: oploverzFullUrl(s.poster), score: s.score || null,
    genres: (s.genres || []).map(g => g?.name || g).filter(Boolean), studio: s.studio?.name || null,
    season: s.season?.name || null, totalEpisodes: s.totalEpisodes || null,
    releaseDate: s.releaseDate || null, releaseType: s.releaseType || null,
    url: `${OPLOVERZ_BASE}/series/${s.slug}`,
  };
}

function fmtOploverzStreamUrls(streamUrl = []) {
  return (streamUrl || []).filter(s => s?.url && oploverzCleanUrl(s.url)).map(s => ({ label: s.source, url: s.url }));
}

function fmtOploverzDownloads(downloadUrl = []) {
  return (downloadUrl || []).flatMap(fmt =>
    (fmt?.resolutions || []).flatMap(res =>
      (res?.download_links || []).filter(l => l?.url && oploverzCleanUrl(l.url))
        .map(l => ({ format: fmt.format || null, quality: res.quality || null, host: l.host || null, url: l.url }))
    )
  );
}

async function routeOploverzApi(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const q = url.searchParams;

  try {
    if (path === '/oploverz/home') {
      const decoded = await fetchOploverzData('/', `${OPLOVERZ_BASE}/`);
      if (!decoded) throw new Error('Failed to decode home data');
      return extJsonResponse({
        page: 'home',
        trending: (decoded.trending?.data || []).map(fmtOploverzSeries).filter(Boolean),
        recently: (decoded.recently?.data || []).map(fmtOploverzSeries).filter(Boolean),
        latestEpisodes: (decoded.latestEpisodes?.data || []).filter(Boolean),
      }, 200, 120);
    }
    if (path === '/oploverz/series') {
      const page = parseInt(q.get('page')) || 1;
      const sortBy = q.get('sort_by') || 'recently';
      const genre = q.get('genre') || '';
      const qp = new URLSearchParams({ page: String(page), sort_by: sortBy });
      if (genre) qp.append('genre', genre);
      const endpoint = `/series/__data.json?x-sveltekit-invalidated=001&${qp}`;
      const res = await fetch(`${OPLOVERZ_BASE}${endpoint}`, { headers: getOploverzHeaders() });
      const decoded = decodeSvelteFlat(await res.json());
      const items = (decoded?.allSeries?.data || []).map(fmtOploverzSeries).filter(Boolean);
      const meta = decoded?.allSeries?.meta || {};
      return extJsonResponse({ page: 'series', total: meta.total || items.length, pagination: { currentPage: meta.currentPage || page, lastPage: meta.lastPage || 1, perPage: meta.perPage || items.length }, items }, 200, 300);
    }
    if (path === '/oploverz/detail') {
      const slug = q.get('slug');
      if (!slug) return extJsonError('Missing slug parameter', 400);
      const decoded = await fetchOploverzData(`/series/${slug}`, `${OPLOVERZ_BASE}/`);
      if (!decoded) throw new Error(`Failed to decode detail: ${slug}`);
      const s = decoded.series || {};
      const epList = decoded.episodes?.data || decoded.episodes || [];
      return extJsonResponse({
        page: 'detail', id: s.id || null, title: s.title || null, japaneseTitle: s.japaneseTitle || null, slug,
        description: s.description || null, status: s.status || null, poster: oploverzFullUrl(s.poster),
        score: s.score || null, genres: (s.genres || []).map(g => g?.name || g).filter(Boolean),
        studio: s.studio?.name || null, season: s.season?.name || null,
        totalEpisodes: s.totalEpisodes || epList.length, releaseDate: s.releaseDate || null, releaseType: s.releaseType || null,
        episodes: (epList || []).map(ep => ({ episodeNumber: ep.episodeNumber || null, title: ep.title || null, releasedAt: ep.releasedAt || null, url: `${OPLOVERZ_BASE}/series/${slug}/episode/${ep.episodeNumber}` })).filter(e => e.episodeNumber).sort((a, b) => a.episodeNumber - b.episodeNumber),
      }, 200, 600);
    }
    if (path === '/oploverz/watch') {
      const slug = q.get('slug'), episode = q.get('episode');
      if (!slug || !episode) return extJsonError('Missing slug or episode', 400);
      const decoded = await fetchOploverzData(`/series/${slug}/episode/${episode}`, `${OPLOVERZ_BASE}/series/${slug}`);
      if (!decoded) throw new Error(`Failed to decode watch: ${slug} ep ${episode}`);
      const ep = decoded.episode || {};
      const allList = decoded.allEpisodes?.data || decoded.allEpisodes || decoded.episodes || [];
      return extJsonResponse({
        page: 'watch', id: ep.id || null, seriesTitle: ep.series?.title || decoded.series?.title || null,
        seriesSlug: ep.series?.slug || slug, episodeNumber: ep.episodeNumber || parseInt(episode),
        subbed: ep.subbed || null, poster: oploverzFullUrl(ep.series?.poster) || oploverzFullUrl(decoded.series?.poster) || null,
        releasedAt: ep.releasedAt || null, streamUrls: fmtOploverzStreamUrls(ep.streamUrl),
        downloadUrls: fmtOploverzDownloads(ep.downloadUrl),
        allEpisodes: (allList || []).map(e => ({ episodeNumber: e.episodeNumber || null, releasedAt: e.releasedAt || null, url: `${OPLOVERZ_BASE}/series/${slug}/episode/${e.episodeNumber}` })).filter(e => e.episodeNumber).sort((a, b) => a.episodeNumber - b.episodeNumber),
      });
    }
    if (path === '/oploverz/search') {
      const query = q.get('q');
      if (!query) return extJsonError('Missing q parameter', 400);
      const endpoint = `/series/__data.json?x-sveltekit-invalidated=001&q=${encodeURIComponent(query)}`;
      const res = await fetch(`${OPLOVERZ_BASE}${endpoint}`, { headers: getOploverzHeaders() });
      const decoded = decodeSvelteFlat(await res.json());
      const items = (decoded?.allSeries?.data || []).map(fmtOploverzSeries).filter(Boolean);
      const meta = decoded?.allSeries?.meta || {};
      return extJsonResponse({ page: 'search', query, total: meta.total || items.length, pagination: { currentPage: meta.currentPage || 1, lastPage: meta.lastPage || 1 }, items }, 200, 300);
    }
    return extJsonError('Unknown /oploverz/* endpoint', 404);
  } catch (e) {
    return extJsonError(`Oploverz API error: ${e.message}`);
  }
}

// ══════════════════════════════════════════════════════════════
// HENTAI API — /hentai/*
// ══════════════════════════════════════════════════════════════
const HENTAI_BASE = 'https://hentaimama.io';
const HENTAI_UA = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36';

async function hentaiFetchWithSession(url, cookie = '') {
  const res = await fetch(url, { headers: { 'User-Agent': HENTAI_UA, Cookie: cookie, Referer: HENTAI_BASE } });
  const setCookie = res.headers.get('set-cookie');
  const text = await res.text();
  return { text, cookie: setCookie || cookie };
}

function hentaiExtractArticles(html) {
  const items = [];
  const articleRe = /<article[^>]*>[\s\S]*?<\/article>/gi;
  const linkRe = /href="([^"]*\/tvshows\/[^"]*|[^"]*\/episodes\/[^"]*)"/i;
  const titleRe = /<h3[^>]*>([^<]*)<\/h3>|<img[^>]*alt="([^"]*)"/i;
  let m;
  while ((m = articleRe.exec(html)) !== null) {
    const a = m[0];
    const lm = a.match(linkRe), tm = a.match(titleRe);
    const dataSrcM = a.match(/data-src="(https?:[^"]+)"/);
    const srcM = a.match(/src="(https?:[^"]+)"/);
    const poster = dataSrcM ? dataSrcM[1] : (srcM ? srcM[1] : '');
    if (lm) items.push({ url: lm[1].startsWith('http') ? lm[1] : HENTAI_BASE + lm[1], title: tm ? (tm[1] || tm[2] || '').trim() : '', poster });
  }
  return items;
}

function hentaiExtractListLinks(html) {
  const items = [];
  const seen = new Set();
  const re = /href="(https?:\/\/hentaimama\.io\/tvshows\/[^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    const slug = m[1].replace(/\/$/, '').split('/').pop() || '';
    const title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    items.push({ url: m[1], title });
  }
  return items;
}

async function routeHentaiApi(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const q = url.searchParams;
  const action = path.replace('/hentai/', '');

  try {
    if (action === 'episode' && q.get('url')) {
      const epUrl = q.get('url');
      const { text: html, cookie } = await hentaiFetchWithSession(epUrl);
      const meta = {
        title: (html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || '',
        poster: (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || '',
        description: (html.match(/<meta property="og:description" content="([^"]+)"/) || [])[1] || '',
      };
      const genres = [];
      const genreRe = /<a[^>]*href="[^"]*\/genre\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
      let gm;
      while ((gm = genreRe.exec(html)) !== null) { const g = gm[1].replace(/&amp;/g, '&').trim(); if (g && !genres.includes(g)) genres.push(g); }
      const seriesMatch = html.match(/<a[^>]*href="([^"]*\/tvshows\/[^"]*)"[^>]*>([^<]+)<\/a>/i);
      const epNum = (html.match(/Episode\s*(\d+)/i) || [])[1] || '';
      return extJsonResponse({ url: epUrl, title: meta.title.replace(/&#8217;/g, "'").replace(/&amp;/g, '&').trim(), poster: meta.poster, genres, series: seriesMatch?.[2]?.trim() || '', series_url: seriesMatch?.[1] || '', episode_number: epNum });
    }
    if (action === 'show' && q.get('url')) {
      const showUrl = q.get('url');
      const { text: html } = await hentaiFetchWithSession(showUrl);
      const meta = { title: (html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || '', poster: (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || '' };
      const episodes = [];
      const seen = new Set();
      const epRe = /<a[^>]*href="([^"]*(?:\/episodes\/|\/episode\/)[^"]+)"[^>]*>/gi;
      let m;
      while ((m = epRe.exec(html)) !== null) {
        let href = m[1];
        if (href && !href.startsWith('http')) href = href.startsWith('/') ? HENTAI_BASE + href : HENTAI_BASE + '/' + href;
        if (href && !seen.has(href)) { seen.add(href); const slug = href.split('/').filter(Boolean).pop(); episodes.push({ url: href, title: slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Episode' }); }
      }
      return extJsonResponse({ url: showUrl, title: meta.title.replace(/&#8217;/g, "'").trim(), poster: meta.poster, episodes });
    }
    if (action === 'genre' && q.get('url')) {
      const page = parseInt(q.get('page')) || 1;
      let genreUrl = page > 1 ? q.get('url').replace(/\/$/, '') + `/page/${page}/` : q.get('url');
      const { text: html } = await hentaiFetchWithSession(genreUrl);
      return extJsonResponse({ page, results: hentaiExtractArticles(html) }, 200, 300);
    }
    if (action === 'search' && q.get('q')) {
      const page = parseInt(q.get('page')) || 1;
      const searchUrl = page > 1 ? `${HENTAI_BASE}/page/${page}/?s=${encodeURIComponent(q.get('q'))}` : `${HENTAI_BASE}/?s=${encodeURIComponent(q.get('q'))}`;
      const { text: html } = await hentaiFetchWithSession(searchUrl);
      return extJsonResponse({ query: q.get('q'), page, results: hentaiExtractArticles(html) }, 200, 300);
    }
    if (action === 'list') {
      const page = parseInt(q.get('page')) || 1;
      const listUrl = page > 1 ? `${HENTAI_BASE}/hentai-list/page/${page}/` : `${HENTAI_BASE}/hentai-list/`;
      const { text: html } = await hentaiFetchWithSession(listUrl);
      return extJsonResponse({ page, results: hentaiExtractListLinks(html) }, 200, 120);
    }
    if (action === 'trending') {
      const page = parseInt(q.get('page')) || 1;
      const trendUrl = page > 1 ? `${HENTAI_BASE}/trending/page/${page}/` : `${HENTAI_BASE}/trending/`;
      const { text: html } = await hentaiFetchWithSession(trendUrl);
      return extJsonResponse({ page, results: hentaiExtractArticles(html) }, 200, 120);
    }
    if (action === 'scrape' && q.get('url')) {
      const { text: html } = await hentaiFetchWithSession(q.get('url'));
      return extJsonResponse({ url: q.get('url'), results: hentaiExtractArticles(html) });
    }
    if (action === 'advance-search') {
      const params = Object.fromEntries(url.searchParams);
      const sp = new URLSearchParams(params);
      sp.set('submit', 'Submit');
      const { text: html } = await hentaiFetchWithSession(`${HENTAI_BASE}/advance-search/?${sp.toString()}`);
      return extJsonResponse({ results: hentaiExtractArticles(html) }, 200, 300);
    }
    return extJsonError('Unknown /hentai/* endpoint', 404);
  } catch (e) {
    return extJsonError(`Hentai API error: ${e.message}`);
  }
}
