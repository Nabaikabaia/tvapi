// worker.js — Complete Unified API (Movies + Sports + FM Radio + GlobeTV + Hentaimama)
// Single Cloudflare Worker that serves all APIs + static frontend

const BASE_HENTAI = 'https://hentaimama.io';
const UA = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36';

// Custom branding header (applies to all responses)
const CUSTOM_HEADER = {
  creator: "NABEES",
  provider: "NABEES TECH NAIJA DEVOPS",
  country: "Nigeria",
  website: "https://nabees.online",
  whatsapp_channel: "https://whatsapp.com/channel/0029VawtjOXJpe8X3j3NCZ3j"
};

// GlobeTV endpoints mapping (keep original patterns)
const GLOBE_ENDPOINTS = {
  '/channels': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/channels.json.gz',
  '/countries': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/countries.json.gz',
  '/categories': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/categories.json.gz',
  '/blocklist': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/blocklist.json.gz',
  '/streams': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/streams.json.gz'
};

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
  throw new Error('FM_AUTH_TOKEN secret is not configured');
}

// Movie API paths (keep original)
const API_ROUTES = new Set([
  '/sources', '/subtitles', '/stream', '/download',
  '/details', '/search', '/categories', '/popular-searches',
  '/search-suggest', '/subtitle/download', '/health',
]);

// Sports API headers
const SPORTS_HEADERS = {
  'Host': 'h5-api.aoneroom.com',
  'x-device-info': '{}',
  'sec-ch-ua-platform': '"Android"',
  'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
  'sec-ch-ua-mobile': '?1',
  'x-client-info': '{"timezone":"Africa/Lagos","system_language":"en"}',
  'save-data': 'on',
  'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36',
  'accept': 'application/json',
  'content-type': 'application/json',
  'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
};

const SPORTS_BASE = 'https://h5-api.aoneroom.com';

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const baseUrl = `${url.protocol}//${url.host}`;

    // OPTIONS preflight
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

    // ========== GLOBE TV ENDPOINTS (keep original patterns) ==========
    if (GLOBE_ENDPOINTS[pathname]) {
      try {
        const response = await fetch(GLOBE_ENDPOINTS[pathname]);
        const compressed = await response.arrayBuffer();
        const decompressed = await new Response(compressed).body
          .pipeThrough(new DecompressionStream('gzip'));
        const data = await new Response(decompressed).json();
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, data }, null, 2), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, error: 'Failed to fetch' }, null, 2), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // ========== HENTAI ENDPOINTS (original patterns) ==========
    // /t?url=xxx - TV Show (keep original query param pattern)
    if (pathname === '/t' && url.searchParams.get('url')) {
      try {
        const result = await scrapeTVShow(url.searchParams.get('url'));
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, success: true, data: result }, null, 2), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, success: false, error: e.message }, null, 2), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }
    
    // /e?url=xxx - Episode
    if (pathname === '/e' && url.searchParams.get('url')) {
      try {
        const result = await scrapeEpisode(url.searchParams.get('url'));
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, success: true, data: result }, null, 2), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, success: false, error: e.message }, null, 2), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }
    
    // /g?url=xxx&page=1 - Genre
    if (pathname === '/g' && url.searchParams.get('url')) {
      try {
        let page = parseInt(url.searchParams.get('page')) || 1;
        let genreUrl = page > 1 ? url.searchParams.get('url').replace(/\/$/, '') + `/page/${page}/` : url.searchParams.get('url');
        const result = await scrapeGenre(genreUrl);
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, success: true, data: result }, null, 2), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, success: false, error: e.message }, null, 2), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }
    
    // /s?q=query&page=1 - Search
    if (pathname === '/s' && url.searchParams.get('q')) {
      try {
        let page = parseInt(url.searchParams.get('page')) || 1;
        const result = await scrapeSearch(url.searchParams.get('q'), page);
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, success: true, data: result }, null, 2), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, success: false, error: e.message }, null, 2), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }
    
    // /hl?page=1 - Hentai List
    if (pathname === '/hl') {
      try {
        let page = parseInt(url.searchParams.get('page')) || 1;
        const result = await scrapeHentaiList(page);
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, success: true, data: result }, null, 2), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, success: false, error: e.message }, null, 2), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }
    
    // /tr?page=1 - Trending
    if (pathname === '/tr') {
      try {
        let page = parseInt(url.searchParams.get('page')) || 1;
        const result = await scrapeTrending(page);
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, success: true, data: result }, null, 2), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, success: false, error: e.message }, null, 2), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }
    
    // /ls?url=xxx - List
    if (pathname === '/ls' && url.searchParams.get('url')) {
      try {
        const result = await scrapeList(url.searchParams.get('url'));
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, success: true, data: result }, null, 2), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, success: false, error: e.message }, null, 2), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }
    
    // /as?year=2024 - Advance Search
    if (pathname === '/as') {
      try {
        const params = Object.fromEntries(url.searchParams);
        const result = await scrapeAdvanceSearch(params);
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, success: true, data: result }, null, 2), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, success: false, error: e.message }, null, 2), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // ========== MOVIE API ROUTES (keep original) ==========
    if (API_ROUTES.has(pathname)) {
      return routeApi(request, baseUrl);
    }
    if (pathname.startsWith('/movies/')) return handleMoviesByCategory(request);
    if (pathname.startsWith('/genre/')) return handleGenreFilter(request);

    // ========== SPORTS API ROUTES (keep original /api/*) ==========
    if (pathname.startsWith('/api/')) return routeSportsApi(request);

    // ========== FM RADIO API ROUTES (keep original /fm/*) ==========
    if (pathname.startsWith('/fm/')) return routeFmApi(request, env);

    // ========== STATIC ASSETS / SPA FRONTEND ==========
    return handleAssets(request, env, url);
  }
};

// ========== MOVIE API FUNCTIONS (keep original completely) ==========
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
      if (request.method !== 'POST') return errorResponse(405, 'Method Not Allowed — use POST');
      return handleSearchSuggest(request);
    case '/health':
      return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    default:
      return errorResponse(404, 'Not Found');
  }
}

async function handleVideoSources(request, baseUrl) {
  const url = new URL(request.url);
  const subjectId = url.searchParams.get('subjectId');
  const se = url.searchParams.get('se');
  const ep = url.searchParams.get('ep');
  const detailPath = url.searchParams.get('detailPath');

  if (!subjectId || se === null || ep === null || !detailPath) {
    return errorResponse(400, 'Missing required parameters: subjectId, se, ep, detailPath');
  }

  const headers = buildHeaders(request, {
    'host': 'netnaija.film',
    'referer': `https://netnaija.film/videoPlayPage/${detailPath}`,
    'sec-fetch-site': 'same-origin',
  });

  const upstreamUrl = `https://netnaija.film/wefeed-h5api-bff/subject/play?subjectId=${subjectId}&se=${se}&ep=${ep}&detailPath=${detailPath}`;

  try {
    const response = await fetch(upstreamUrl, { headers });
    const data = await response.json();

    let movieInfo = null;
    try {
      const infoRes = await fetch(
        `https://h5-api.aoneroom.com/wefeed-h5api-bff/detail?detailPath=${detailPath}`,
        { headers: apiHeaders(request) }
      );
      const infoData = await infoRes.json();
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

async function handleSubtitles(request) {
  const url = new URL(request.url);
  const format = url.searchParams.get('format');
  const id = url.searchParams.get('id');
  const subjectId = url.searchParams.get('subjectId');
  const detailPath = url.searchParams.get('detailPath');

  if (!format || !id || !subjectId || !detailPath) {
    return errorResponse(400, 'Missing required parameters: format, id, subjectId, detailPath');
  }

  const headers = buildHeaders(request, {
    'host': 'h5-api.aoneroom.com',
    'origin': 'https://netnaija.film',
    'referer': request.headers.get('referer') || 'https://netnaija.film/',
    'sec-fetch-site': 'cross-site',
  });

  try {
    const res = await fetch(
      `https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/caption?format=${format}&id=${id}&subjectId=${subjectId}&detailPath=${detailPath}`,
      { headers }
    );
    const data = await res.json();

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

async function handleSubtitleDownload(request) {
  const subtitleUrl = new URL(request.url).searchParams.get('url');
  if (!subtitleUrl) return errorResponse(400, 'Missing url parameter');

  const filename = subtitleUrl.split('/').pop()?.split('?')[0] || 'subtitle.srt';
  try {
    const res = await fetch(subtitleUrl, {
      headers: { 'User-Agent': request.headers.get('user-agent') || 'Mozilla/5.0', 'Referer': 'https://netnaija.film/' }
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

async function handleDetails(request) {
  const detailPath = new URL(request.url).searchParams.get('detailPath');
  if (!detailPath) return errorResponse(400, 'Missing detailPath parameter');

  try {
    const [detailRes, recRes] = await Promise.all([
      fetch(`https://h5-api.aoneroom.com/wefeed-h5api-bff/detail?detailPath=${detailPath}`, { headers: apiHeaders(request) }),
      fetch(`https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/detail-rec?page=0&perPage=20`, { headers: apiHeaders(request) })
        .catch(() => null)
    ]);

    const data = await detailRes.json();
    const subjectId = data.data?.subject?.subjectId;

    if (subjectId) {
      try {
        const recData = await (await fetch(
          `https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/detail-rec?subjectId=${subjectId}&page=0&perPage=20`,
          { headers: apiHeaders(request) }
        )).json();

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
    const res = await fetch('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search', {
      method: 'POST',
      headers: { ...apiHeaders(request), 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, page, perPage, subjectType })
    });
    return jsonResponse(await res.json(), { 'Cache-Control': 'public, max-age=300' });
  } catch (err) {
    return errorResponse(500, `Search failed: ${err.message}`);
  }
}

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
    const res = await fetch(
      `https://h5-api.aoneroom.com/wefeed-h5api-bff/ranking-list/content?id=${id}&page=${page}&perPage=${perPage}`,
      { headers: apiHeaders(request) }
    );
    return jsonResponse(await res.json(), { 'Cache-Control': 'public, max-age=300' });
  } catch (err) {
    return errorResponse(500, `Failed to fetch category: ${err.message}`);
  }
}

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
  if (!genre) return errorResponse(404, `Genre "${genreKey}" not found. Valid genres: ${Object.keys(genreMap).join(', ')}`);

  try {
    const res = await fetch('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/filter', {
      method: 'POST',
      headers: { ...apiHeaders(request), 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, perPage, channelId: 2, genre })
    });
    return jsonResponse(await res.json(), { 'Cache-Control': 'public, max-age=300' });
  } catch (err) {
    return errorResponse(500, `Failed to fetch genre: ${err.message}`);
  }
}

async function handlePopularSearches(request) {
  try {
    const res = await fetch(
      'https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/everyone-search',
      { headers: apiHeaders(request) }
    );
    return jsonResponse(await res.json(), { 'Cache-Control': 'public, max-age=3600' });
  } catch (err) {
    return errorResponse(500, `Failed to fetch popular searches: ${err.message}`);
  }
}

async function handleSearchSuggest(request) {
  const body = await request.json();
  if (!body.keyword) return errorResponse(400, 'Missing keyword in request body');

  try {
    const res = await fetch('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search-suggest', {
      method: 'POST',
      headers: { ...apiHeaders(request), 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: body.keyword, perPage: body.perPage || 10 })
    });
    return jsonResponse(await res.json(), { 'Cache-Control': 'public, max-age=300' });
  } catch (err) {
    return errorResponse(500, `Failed to fetch suggestions: ${err.message}`);
  }
}

async function fetchSubtitlesForStream(streamId, subjectId, detailPath, request) {
  try {
    const res = await fetch(
      `https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/caption?format=MP4&id=${streamId}&subjectId=${subjectId}&detailPath=${detailPath}`,
      { headers: { ...apiHeaders(request), 'origin': 'https://netnaija.film', 'referer': 'https://netnaija.film/' } }
    );
    const data = await res.json();
    if (data.code === 0 && data.data?.captions) {
      return data.data.captions.map(cap => ({
        language: cap.lan, name: cap.lanName, url: cap.url,
        download_url: `/subtitle/download?url=${encodeURIComponent(cap.url)}`
      }));
    }
  } catch {}
  return null;
}

function apiHeaders(request) {
  return {
    'Accept': 'application/json',
    'User-Agent': request.headers.get('user-agent') || 'Mozilla/5.0',
    'Referer': 'https://netnaija.film/',
    'Origin': 'https://netnaija.film',
  };
}

function buildHeaders(request, extra = {}) {
  const h = {
    'accept': request.headers.get('accept') || 'application/json',
    'user-agent': request.headers.get('user-agent') || 'Mozilla/5.0',
    'x-client-info': request.headers.get('x-client-info') || '{"timezone":"Africa/Lagos"}',
    'cookie': request.headers.get('cookie') || '',
    'sec-fetch-mode': request.headers.get('sec-fetch-mode') || 'cors',
    'sec-fetch-dest': request.headers.get('sec-fetch-dest') || 'empty',
    'accept-language': request.headers.get('accept-language') || 'en-GB,en-US;q=0.9,en;q=0.8',
    ...extra,
  };
  Object.keys(h).forEach(k => { if (!h[k]) delete h[k]; });
  return h;
}

function buildVideoHeaders(request) {
  const h = {
    'User-Agent': request.headers.get('user-agent') || 'Mozilla/5.0',
    'Accept': request.headers.get('accept') || 'video/mp4,*/*;q=0.8',
    'Accept-Language': request.headers.get('accept-language') || 'en-GB,en-US;q=0.9',
    'Referer': request.headers.get('referer') || 'https://netnaija.film/',
    'Origin': request.headers.get('origin') || 'https://netnaija.film',
    'Cookie': request.headers.get('cookie') || '',
  };
  Object.keys(h).forEach(k => { if (!h[k]) delete h[k]; });
  return h;
}

// ========== HENTAI SCRAPER FUNCTIONS ==========
async function fetchWithSession(url, cookie = '') {
  const response = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Cookie': cookie,
      'Referer': BASE_HENTAI
    }
  });
  const setCookie = response.headers.get('set-cookie');
  const text = await response.text();
  return { text, cookie: setCookie || cookie };
}

function extractArticles(html) {
  const items = [];
  const articleRegex = /<article[^>]*>[\s\S]*?<\/article>/gi;
  const linkRegex = /href="([^"]*\/tvshows\/[^"]*|[^"]*\/episodes\/[^"]*)"/i;
  const titleRegex = /<h3[^>]*>([^<]*)<\/h3>|<img[^>]*alt="([^"]*)"/i;
  const imgRegex = /<img[^>]*(?:data-src|src)="([^"]+)"/i;
  
  let articleMatch;
  while ((articleMatch = articleRegex.exec(html)) !== null) {
    const article = articleMatch[0];
    const linkMatch = article.match(linkRegex);
    const titleMatch = article.match(titleRegex);
    const imgMatch = article.match(imgRegex);
    
    if (linkMatch) {
      items.push({
        url: linkMatch[1].startsWith('http') ? linkMatch[1] : BASE_HENTAI + linkMatch[1],
        title: titleMatch ? (titleMatch[1] || titleMatch[2] || '').trim() : '',
        poster: imgMatch ? imgMatch[1] : ''
      });
    }
  }
  return items;
}

function extractMeta(html) {
  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  const posterMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
  const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  
  return {
    title: titleMatch ? titleMatch[1] : (h1Match ? h1Match[1] : ''),
    poster: posterMatch ? posterMatch[1] : '',
    description: descMatch ? descMatch[1] : ''
  };
}

async function getDownloadLinks(sessionCookie, url, videoId) {
  const links = [];
  try {
    const { text: html } = await fetchWithSession(url, sessionCookie);
    const nonceMatch = html.match(/"nonce":"([^"]+)"/);
    if (!nonceMatch) return links;
    
    const nonce = nonceMatch[1];
    const formData = new URLSearchParams();
    formData.append('action', 'get_player_contents');
    formData.append('a', videoId);
    formData.append('_wpnonce', nonce);
    
    const ajaxRes = await fetch(`${BASE_HENTAI}/wp-admin/admin-ajax.php`, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': url,
        'Cookie': sessionCookie
      },
      body: formData.toString()
    });
    
    const ajaxText = await ajaxRes.text();
    const cleaned = ajaxText.replace(/\\\//g, '/');
    const iframes = JSON.parse(cleaned);
    
    for (const iframe of iframes) {
      const srcMatch = iframe.match(/src="([^"]+)"/);
      if (!srcMatch) continue;
      const src = srcMatch[1];
      const paramMatch = src.match(/p=([^&]+)/);
      if (!paramMatch) continue;
      
      if (src.includes('new2.php')) {
        const new2Res = await fetch(`${BASE_HENTAI}/new2.php?p=${paramMatch[1]}`, {
          headers: { 'User-Agent': UA, 'Referer': url, 'Cookie': sessionCookie }
        });
        const new2Text = await new2Res.text();
        const gdUrl = new2Text.match(/https?:\/\/gdvid\.info[^"'\s]+\.mp4[^"'\s]*/);
        if (gdUrl) links.push({ server: 'gdvid', url: gdUrl[0] });
      }
      if (src.includes('newjav.php')) {
        const newjavRes = await fetch(`${BASE_HENTAI}/newjav.php?p=${paramMatch[1]}`, {
          headers: { 'User-Agent': UA, 'Referer': url, 'Cookie': sessionCookie }
        });
        const newjavText = await newjavRes.text();
        const javUrl = newjavText.match(/https?:\/\/na-\d+\.javprovider\.com[^"'\s]+\.mp4[^"'\s]*/);
        if (javUrl) links.push({ server: 'javprovider', url: javUrl[0] });
      }
    }
  } catch(e) {}
  return links;
}

async function scrapeEpisode(url) {
  const { text: html, cookie } = await fetchWithSession(url);
  if (!html) return null;
  
  const meta = extractMeta(html);
  
  const data = {
    url,
    title: meta.title.replace(/&#8217;/g, "'").replace(/&amp;/g, '&').trim(),
    poster: meta.poster,
    duration: '',
    genres: [],
    series: '',
    series_url: '',
    episode_number: '',
    download_links: []
  };
  
  const durationMatch = html.match(/Duration[^>]*>[\s]*<[^>]*>([^<]*(?:min|minutes)[^<]*)/i);
  if (durationMatch) data.duration = durationMatch[1].trim();
  
  const genreRegex = /<a[^>]*href="[^"]*\/genre\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
  let genreMatch;
  while ((genreMatch = genreRegex.exec(html)) !== null) {
    const genre = genreMatch[1].replace(/&amp;/g, '&').trim();
    if (genre && !data.genres.includes(genre)) data.genres.push(genre);
  }
  
  const seriesMatch = html.match(/<a[^>]*href="([^"]*\/tvshows\/[^"]*)"[^>]*>([^<]+)<\/a>/i);
  if (seriesMatch) {
    data.series = seriesMatch[2].trim();
    data.series_url = seriesMatch[1];
  }
  
  const epMatch = html.match(/Episode\s*(\d+)/i);
  if (epMatch) data.episode_number = epMatch[1];
  
  const videoIdMatch = html.match(/a:'(\d+)'/) || html.match(/data-id="(\d+)"/) || html.match(/post-(\d+)/);
  if (videoIdMatch) {
    data.download_links = await getDownloadLinks(cookie, url, videoIdMatch[1]);
  }
  
  return data;
}

async function scrapeTVShow(url) {
  const { text: html } = await fetchWithSession(url);
  const meta = extractMeta(html);
  
  const data = {
    url,
    title: meta.title.replace(/&#8217;/g, "'").replace(/&amp;/g, '&').trim(),
    poster: meta.poster,
    description: meta.description,
    episodes: []
  };
  
  const episodeLinkRegex = /<a[^>]*href="([^"]*(?:\/episodes\/|\/episode\/)[^"]+)"[^>]*>/gi;
  const seen = new Set();
  let match;
  
  while ((match = episodeLinkRegex.exec(html)) !== null) {
    let href = match[1];
    if (href && !href.startsWith('http')) {
      href = href.startsWith('/') ? BASE_HENTAI + href : BASE_HENTAI + '/' + href;
    }
    if (href && !seen.has(href)) {
      seen.add(href);
      const slug = href.split('/').filter(Boolean).pop();
      data.episodes.push({
        url: href,
        title: slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Episode'
      });
    }
  }
  
  return data;
}

async function scrapeGenre(url) {
  const { text: html } = await fetchWithSession(url);
  return extractArticles(html);
}

async function scrapeSearch(query, page) {
  const searchUrl = page > 1 
    ? `${BASE_HENTAI}/page/${page}/?s=${encodeURIComponent(query)}`
    : `${BASE_HENTAI}/?s=${encodeURIComponent(query)}`;
  const { text: html } = await fetchWithSession(searchUrl);
  return extractArticles(html);
}

async function scrapeHentaiList(page) {
  const url = page > 1 ? `${BASE_HENTAI}/hentai-list/page/${page}/` : `${BASE_HENTAI}/hentai-list/`;
  const { text: html } = await fetchWithSession(url);
  return extractArticles(html);
}

async function scrapeList(url) {
  const { text: html } = await fetchWithSession(url);
  return extractArticles(html);
}

async function scrapeTrending(page) {
  const url = page > 1 ? `${BASE_HENTAI}/trending/page/${page}/` : `${BASE_HENTAI}/trending/`;
  const { text: html } = await fetchWithSession(url);
  return extractArticles(html);
}

async function scrapeAdvanceSearch(params) {
  const searchParams = new URLSearchParams(params);
  searchParams.set('submit', 'Submit');
  const url = `${BASE_HENTAI}/advance-search/?${searchParams.toString()}`;
  const { text: html } = await fetchWithSession(url);
  return extractArticles(html);
}

// ========== HELPER FUNCTIONS ==========
async function fmJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.slice(0, 200).replace(/\s+/g, ' ');
    throw new Error(`FM API returned non-JSON (HTTP ${res.status}): ${preview}`);
  }
}

function jsonResponse(data, extra = {}) {
  const body = Array.isArray(data) ? data : { ...CUSTOM_HEADER, ...data };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...extra }
  });
}

function errorResponse(code, message) {
  return new Response(JSON.stringify({ ...CUSTOM_HEADER, code, message }), {
    status: code,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

async function handleAssets(request, env, url) {
  if (!env?.ASSETS) {
    const dest = url.pathname + url.search;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nabees API</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0d0d0d;color:#e5e7eb;font-family:system-ui,sans-serif;
         display:flex;align-items:center;justify-content:center;min-height:100vh;
         flex-direction:column;gap:1rem;text-align:center;padding:2rem}
    p{color:#6b7280;font-size:.875rem}
    a{color:#34d399;text-decoration:none}
    a:hover{text-decoration:underline}
  </style>
</head>
<body>
  <div>Nabees API</div>
  <p>The app is not fully deployed yet — static assets are missing.<br/>
     Run <code>wrangler deploy</code> from the repo root to build and deploy.</p>
  <a href="/">Go to homepage</a>
</body>
</html>`;
    return new Response(html, {
      status: 503,
      headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  try {
    return await env.ASSETS.fetch(request);
  } catch (assetErr) {
    try {
      const indexReq = new Request(new URL('/', url).toString(), { method: 'GET', headers: { 'Accept': 'text/html' } });
      const indexResp = await env.ASSETS.fetch(indexReq);
      return new Response(indexResp.body, {
        status: 200,
        headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store', 'X-SPA-Fallback': '1' },
      });
    } catch (_) {
      const msg = assetErr instanceof Error ? assetErr.message : String(assetErr);
      return new Response(JSON.stringify({ error: 'Failed to serve page', message: msg }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
}

// ========== SPORTS API ROUTER ==========
async function sportsFetch(path, params = {}) {
  const u = new URL(path, SPORTS_BASE);
  Object.entries(params).forEach(([k, v]) => { if (v) u.searchParams.set(k, v); });
  return fetch(u.toString(), { method: 'GET', headers: SPORTS_HEADERS });
}

async function routeSportsApi(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const params = Object.fromEntries(url.searchParams);

  try {
    if (pathname === '/api/leagues') {
      const res = await sportsFetch('/wefeed-h5api-bff/live/league-tab');
      return jsonResponse(await res.json(), { 'Cache-Control': 'public, max-age=60' });
    }

    if (pathname === '/api/league-ids') {
      return jsonResponse({ leagues: LEAGUE_IDS, friendly_urls: LEAGUE_SLUGS });
    }

    if (pathname === '/api/stream-config') {
      return jsonResponse({
        headers: { Origin: 'https://sportslivenow.top', Referer: 'https://sportslivenow.top/', 'User-Agent': SPORTS_HEADERS['user-agent'] },
        player_setup: { hls_js: `const hls = new Hls({ xhrSetup: xhr => { xhr.setRequestHeader('Origin','https://sportslivenow.top'); xhr.setRequestHeader('Referer','https://sportslivenow.top/'); } });` }
      });
    }

    if (pathname === '/api/matches/live') {
      const res = await sportsFetch('/wefeed-h5api-bff/live/match-list-v5', { leagueId: '0' });
      const data = await res.json();
      const live = (data.data?.list || []).filter(m => m.status === 'MatchIng');
      return jsonResponse({ total: live.length, matches: live });
    }

    if (pathname === '/api/matches/football' || pathname === '/api/matches/basketball' || pathname === '/api/matches/cricket') {
      const matchType = pathname.split('/').pop();
      const res = await sportsFetch('/wefeed-h5api-bff/live/match-list-v3', { status: '0', matchType });
      return jsonResponse(await res.json(), { 'Cache-Control': 'public, max-age=30' });
    }

    if (pathname === '/api/matches') {
      const { id: leagueId, sport = '' } = params;
      if (!leagueId && !sport) {
        return jsonResponse({ message: 'Provide ?id= or ?sport=football|basketball|cricket', leagues: LEAGUE_IDS });
      }
      if (['football','basketball','cricket'].includes(sport.toLowerCase())) {
        const res = await sportsFetch('/wefeed-h5api-bff/live/match-list-v3', { status: '0', matchType: sport.toLowerCase() });
        return jsonResponse(await res.json(), { 'Cache-Control': 'public, max-age=30' });
      }
      const res = await sportsFetch('/wefeed-h5api-bff/sport/aggregate-v1', { leagueId });
      return jsonResponse(await res.json(), { 'Cache-Control': 'public, max-age=30' });
    }

    if (pathname === '/api/news') {
      const res = await sportsFetch('/wefeed-h5api-bff/sport/aggregate-v1', { leagueId: params.leagueId || '0' });
      const data = await res.json();
      return jsonResponse({ total: data.data?.newsList?.length || 0, news: data.data?.newsList || [] });
    }

    if (pathname === '/api/highlights') {
      const res = await sportsFetch('/wefeed-h5api-bff/sport/aggregate-v1', { leagueId: params.leagueId || '0' });
      const data = await res.json();
      return jsonResponse({ total: data.data?.highlights?.length || 0, highlights: data.data?.highlights || [] });
    }

    const leagueSlugM = pathname.match(/^\/api\/league\/([a-z0-9-]+)$/);
    if (leagueSlugM) {
      const leagueId = LEAGUE_SLUGS[leagueSlugM[1]];
      if (!leagueId) return errorResponse(404, `Unknown league slug "${leagueSlugM[1]}"`);
      const res = await sportsFetch('/wefeed-h5api-bff/sport/aggregate-v1', { leagueId });
      return jsonResponse(await res.json(), { 'Cache-Control': 'public, max-age=30' });
    }

    const flowM = pathname.match(/^\/api\/match\/([0-9]+)\/flow$/);
    if (flowM) {
      const res = await sportsFetch('/wefeed-h5api-bff/live/match-flow', { id: flowM[1], pageSize: params.pageSize || '30', lastSort: params.cursor || '0' });
      const data = await res.json();
      if (data.data?.hasMore) {
        data._pagination = { next_cursor: data.data.lastSort, next_url: `/api/match/${flowM[1]}/flow?cursor=${data.data.lastSort}` };
      }
      return jsonResponse(data);
    }

    const matchM = pathname.match(/^\/api\/match\/([0-9]+)$/);
    if (matchM) {
      const res = await sportsFetch('/wefeed-h5api-bff/sport/detail-v1', { matchId: matchM[1] });
      const data = await res.json();
      return jsonResponse(data);
    }

    return errorResponse(404, 'Sports endpoint not found');
  } catch (err) {
    return errorResponse(500, `Sports API error: ${err.message}`);
  }
}

// ========== FM RADIO API ROUTER ==========
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

  try {
    if (fmPath === '/health') {
      return jsonResponse({ status: 'online', service: 'FM Radio API' });
    }

    if (fmPath === '/countries') {
      const res = await fetch(`${FM_BASE}/wefeed-fm-bff/content/radio-regions`, { headers: FM_HEADERS });
      const data = await fmJson(res);
      if (data.code === 0) {
        const regions = data.data.regions.filter(r => r.countryCode !== 'ALL');
        return jsonResponse({ success: true, total: regions.length, countries: regions.map(r => ({ code: r.countryCode, name: r.countryName })) });
      }
      return errorResponse(503, 'FM countries API failed');
    }

    if (fmPath === '/reference') {
      return jsonResponse({ success: true, playlists: FM_PLAYLISTS, scenes: FM_SCENES, cat_scenes: FM_CAT_SCENES });
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
        return jsonResponse({ success: true, country, sections });
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
        return jsonResponse({ success: true, country, scene, page: parseInt(page), has_more: data.data.pager?.hasMore || false, stations });
      }
      return errorResponse(503, 'FM trending API failed');
    }

    const stStreamM = fmPath.match(/^\/station\/([^/]+)\/stream$/);
    if (stStreamM) {
      const upUrl = new URL(`${FM_BASE}/wefeed-fm-bff/content/radio`);
      upUrl.searchParams.set('soundId', stStreamM[1]);
      const res = await fetch(upUrl.toString(), { headers: FM_HEADERS });
      const data = await fmJson(res);
      if (data.code === 0) return jsonResponse({ success: true, name: data.data.title, stream_url: data.data.url });
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
        return jsonResponse({ success: true, id: s.soundId, name: s.title, description: (s.description || '').substring(0, 200), cover: s.cover?.url, plays: s.playCnt || '0', stream_url: s.resources?.radioList?.[0]?.url || null, tags: s.tags || [] });
      }
      return errorResponse(404, 'Station not found');
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
        return jsonResponse({ success: true, playlist: data.data.desc, page, has_more: data.data.pager?.hasMore || false, songs });
      }
      return errorResponse(503, 'FM music API failed');
    }

    return errorResponse(404, 'FM Radio endpoint not found');
  } catch (err) {
    return errorResponse(500, `FM Radio API error: ${err.message}`);
  }
}
