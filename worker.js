/* worker.js — GlobeTV API + Hentaimama Scraper API + Cartoons/Webtoon/Anichin/Oploverz API
 * Deployed on Cloudflare Workers
 * Powered by Nabees Tech
 * WhatsApp: https://whatsapp.com/channel/0029VawtjOXJpe8X3j3NCZ3j
 **/

const BASE_HENTAI = 'https://hentaimama.io';
const UA = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36';

// Custom branding header
const CUSTOM_HEADER = {
  creator: "NABEES",
  provider: "NABEES TECH NAIJA DEVOPS",
  country: "Nigeria",
  website: "https://nabees.online",
  whatsapp_channel: "https://whatsapp.com/channel/0029VawtjOXJpe8X3j3NCZ3j"
};

// GlobeTV endpoints 
const GLOBE_ENDPOINTS = {
  '/ch': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/channels.json.gz',
  '/co': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/countries.json.gz',
  '/ca': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/categories.json.gz',
  '/bl': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/blocklist.json.gz',
  '/st': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/streams.json.gz'
};

// ==================== CONFIGURATIONS ====================
const CARTOONS_BASE = 'https://cartoons.lk';
const WEBTOON_BASE = 'https://m.webtoons.com';
const ANICHIN_BASE = 'https://anichin.moe';
const OPLOVERZ_BASE = 'https://vip.oploverz.ltd';
const OPLOVERZ_BACKAPI = 'https://backapi.oploverz.ac/uploads/';

// Nonce cache for cartoons.lk
let nonceCache = { value: null, expiry: 0 };

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const query = url.searchParams;
    const baseUrl = `${url.protocol}//${url.host}`;
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Content-Type': 'application/json'
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // ========== GLOBE TV ENDPOINTS ==========
    if (GLOBE_ENDPOINTS[path]) {
      try {
        const response = await fetch(GLOBE_ENDPOINTS[path]);
        const compressed = await response.arrayBuffer();
        const decompressed = await new Response(compressed).body
          .pipeThrough(new DecompressionStream('gzip'));
        const data = await new Response(decompressed).json();
        
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, data }, null, 2), {
          headers: corsHeaders
        });
      } catch (e) {
        return new Response(JSON.stringify({ ...CUSTOM_HEADER, error: 'Failed to fetch' }, null, 2), {
          status: 500,
          headers: corsHeaders
        });
      }
    }
    
    // ========== CARTOONS.LK ENDPOINTS ==========
    if (path === '/s') return await handleCartoonSearch(url, baseUrl, corsHeaders);
    if (path === '/details') return await handleCartoonDetails(url, baseUrl, corsHeaders);
    if (path === '/fetch/download') return await handleEpisodeDownload(url, corsHeaders);
    if (path === '/fetch/watch') return await handleEpisodeWatch(url, corsHeaders);
    if (path === '/genres') return await handleCartoonGenres(corsHeaders);
    if (path === '/listing') return await handleCartoonListing(url, baseUrl, corsHeaders);
    if (path === '/trending') return await handleCartoonTrending(baseUrl, corsHeaders);
    
    // ========== WEBTOON ENDPOINTS ==========
    if (path === '/webtoon/home') return await handleWebtoonHome(corsHeaders);
    if (path === '/webtoon/search') return await handleWebtoonSearch(url, corsHeaders);
    if (path === '/webtoon/detail') return await handleWebtoonDetail(url, corsHeaders);
    if (path === '/webtoon/read') return await handleWebtoonRead(url, corsHeaders);
    if (path === '/webtoon/image') return await handleWebtoonImage(url, corsHeaders);
    
    // ========== ANICHIN ENDPOINTS ==========
    if (path === '/anichin/home') return await handleAnichinHome(url, corsHeaders);
    if (path === '/anichin/search') return await handleAnichinSearch(url, corsHeaders);
    if (path === '/anichin/info') return await handleAnichinInfo(url, corsHeaders);
    if (path === '/anichin/episode') return await handleAnichinEpisode(url, corsHeaders);
    if (path === '/anichin/anime-list') return await handleAnichinAnimeList(corsHeaders);
    if (path === '/anichin/genres') return await handleAnichinGenres(corsHeaders);
    if (path === '/anichin/genre') return await handleAnichinGenre(url, corsHeaders);
    
    // ========== OPLOVERZ ENDPOINTS ==========
    if (path === '/oploverz/home') return await handleOploverzHome(corsHeaders);
    if (path === '/oploverz/series') return await handleOploverzSeries(url, corsHeaders);
    if (path === '/oploverz/detail') return await handleOploverzDetail(url, corsHeaders);
    if (path === '/oploverz/watch') return await handleOploverzWatch(url, corsHeaders);
    if (path === '/oploverz/search') return await handleOploverzSearch(url, corsHeaders);
    
    // ========== HENTAI ENDPOINTS ==========
    const action = path.slice(1);
    
    try {
      let result;
      
      if (action === 'e' && query.get('url')) {
        result = await scrapeEpisode(query.get('url'));
      }
      else if (action === 't' && query.get('url')) {
        result = await scrapeTVShow(query.get('url'));
      }
      else if (action === 'g' && query.get('url')) {
        let page = parseInt(query.get('page')) || 1;
        let genreUrl = page > 1 ? query.get('url').replace(/\/$/, '') + `/page/${page}/` : query.get('url');
        result = await scrapeGenre(genreUrl);
      }
      else if (action === 's' && query.get('q')) {
        let page = parseInt(query.get('page')) || 1;
        result = await scrapeSearch(query.get('q'), page);
      }
      else if (action === 'hl') {
        let page = parseInt(query.get('page')) || 1;
        result = await scrapeHentaiList(page);
      }
      else if (action === 'tr') {
        let page = parseInt(query.get('page')) || 1;
        result = await scrapeTrending(page);
      }
      else if (action === 'ls' && query.get('url')) {
        result = await scrapeList(query.get('url'));
      }
      else if (action === 'as') {
        const params = Object.fromEntries(url.searchParams);
        result = await scrapeAdvanceSearch(params);
      }
      // Root endpoint
      else if (path === '/') {
        return new Response(JSON.stringify({
          ...CUSTOM_HEADER,
          endpoints: {
            globetv: {
              '/ch': 'Channels',
              '/co': 'Countries',
              '/ca': 'Categories',
              '/bl': 'Blocklist',
              '/st': 'Streams'
            },
            cartoons: {
              '/s?q=': 'Search cartoons',
              '/details?slug=': 'Get cartoon details',
              '/fetch/download?post_id=&episode=': 'Get download link',
              '/fetch/watch?post_id=&episode=': 'Get watch link',
              '/genres': 'List genres',
              '/listing?category=&page=': 'Category listing',
              '/trending': 'Trending cartoons'
            },
            webtoon: {
              '/webtoon/home': 'Home page',
              '/webtoon/search?keyword=': 'Search webtoons',
              '/webtoon/detail?titleNo=': 'Webtoon details',
              '/webtoon/read?url=': 'Read episode',
              '/webtoon/image?url=': 'Proxy image'
            },
            anichin: {
              '/anichin/home': 'Home page',
              '/anichin/search?q=': 'Search anime',
              '/anichin/info?slug=': 'Anime info',
              '/anichin/episode?slug=': 'Episode sources',
              '/anichin/anime-list': 'All anime list',
              '/anichin/genres': 'List genres',
              '/anichin/genre?slug=&page=': 'Genre filter'
            },
            oploverz: {
              '/oploverz/home': 'Home page',
              '/oploverz/series?page=&sort_by=&genre=': 'Series list',
              '/oploverz/detail?slug=': 'Series detail',
              '/oploverz/watch?slug=&episode=': 'Watch episode',
              '/oploverz/search?q=': 'Search series'
            },
            hentai: {
              '/e?url=': 'Get episode details',
              '/t?url=': 'Get TV show details',
              '/g?url=&page=': 'Get genre list',
              '/s?q=&page=': 'Search',
              '/hl?page=': 'Hentai list',
              '/tr?page=': 'Trending',
              '/ls?url=': 'Generic list',
              '/as?year=': 'Advance search'
            }
          }
        }, null, 2), { headers: corsHeaders });
      }
      else {
        return new Response(JSON.stringify({
          ...CUSTOM_HEADER,
          error: 'Invalid endpoint',
          hint: 'Visit / for available endpoints'
        }, null, 2), { status: 404, headers: corsHeaders });
      }
      
      return new Response(JSON.stringify({ ...CUSTOM_HEADER, success: true, data: result }, null, 2), {
        headers: corsHeaders
      });
      
    } catch (e) {
      return new Response(JSON.stringify({ ...CUSTOM_HEADER, success: false, error: e.message }, null, 2), {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};

// ==================== CARTOONS.LK FUNCTIONS ====================

async function getCartoonNonce() {
  if (nonceCache.value && Date.now() < nonceCache.expiry) return nonceCache.value;
  
  const response = await fetch(`${CARTOONS_BASE}/`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  
  const html = await response.text();
  let nonce = null;
  
  let match = html.match(/"nonce"\s*:\s*"([a-f0-9]+)"/i);
  if (!match) match = html.match(/var\s+nonce\s*=\s*['"]([^'"]+)['"]/i);
  if (!match) match = html.match(/data-nonce=["']([^"']+)["']/i);
  
  if (!match) throw new Error('Nonce not found');
  
  nonceCache = { value: match[1], expiry: Date.now() + 10 * 60 * 1000 };
  return match[1];
}

async function handleCartoonSearch(url, baseUrl, corsHeaders) {
  const query = url.searchParams.get('q');
  if (!query) return jsonError('Missing q parameter', 400, corsHeaders);
  
  const response = await fetch(`${CARTOONS_BASE}/?s=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  
  const html = await response.text();
  const results = [];
  const articleRegex = /<article[^>]*class="[^"]*item-list[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let match;
  
  while ((match = articleRegex.exec(html)) !== null) {
    const article = match[1];
    const titleMatch = article.match(/<h2[^>]*class="[^"]*post-box-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
    if (titleMatch) {
      const slug = titleMatch[1].replace(`${CARTOONS_BASE}/`, '').replace(/\/$/, '');
      results.push({
        title: cleanText(titleMatch[2]),
        'details-url': `${baseUrl}/details?slug=${slug}`,
        slug: slug
      });
    }
  }
  
  return jsonResponse({ ...CUSTOM_HEADER, query, total: results.length, results }, 200, corsHeaders);
}

async function handleCartoonDetails(url, baseUrl, corsHeaders) {
  const slug = url.searchParams.get('slug');
  if (!slug) return jsonError('Missing slug parameter', 400, corsHeaders);
  
  const response = await fetch(`${CARTOONS_BASE}/${slug}/`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  
  const html = await response.text();
  
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
        const episodeData = JSON.parse(scriptMatch[1]);
        episodes = episodeData.map((ep, idx) => ({
          number: parseInt(ep.number) || idx + 1,
          title: ep.title || `Episode ${idx + 1}`,
          quality: ep.download_links?.[0]?.label || ep.resolution,
          size: ep.download_links?.[0]?.file_size || ep.file_size,
          download_url: `${baseUrl}/fetch/download?post_id=${postId}&episode=${idx}`,
          watch_url: `${baseUrl}/fetch/watch?post_id=${postId}&episode=${idx}`
        }));
      } catch(e) {}
    }
  }
  
  return jsonResponse({
    ...CUSTOM_HEADER,
    id: postId,
    title,
    type: isTvSeries ? 'tv_series' : 'movie',
    episodes,
    total_episodes: episodes.length
  }, 200, corsHeaders);
}

async function handleEpisodeDownload(url, corsHeaders) {
  const postId = url.searchParams.get('post_id');
  const episode = url.searchParams.get('episode');
  if (!postId || !episode) return jsonError('Missing post_id or episode', 400, corsHeaders);
  
  const nonce = await getCartoonNonce();
  
  const pageResponse = await fetch(`${CARTOONS_BASE}/?p=${postId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  
  const cookies = pageResponse.headers.get('set-cookie') || '';
  
  const formData = new FormData();
  formData.append('action', 'get_movie_link');
  formData.append('nonce', nonce);
  formData.append('post_id', postId);
  formData.append('type', 'episode');
  formData.append('action_type', 'download');
  formData.append('episode_index', episode);
  formData.append('link_index', '0');
  
  const ajaxResponse = await fetch(`${CARTOONS_BASE}/wp-admin/admin-ajax.php`, {
    method: 'POST',
    headers: { 'Cookie': cookies, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    body: formData
  });
  
  const data = await ajaxResponse.json();
  
  if (data.success && data.data?.direct) {
    return jsonResponse({ ...CUSTOM_HEADER, success: true, download_url: data.data.direct }, 200, corsHeaders);
  }
  
  return jsonError('Download not available', 404, corsHeaders);
}

async function handleEpisodeWatch(url, corsHeaders) {
  const postId = url.searchParams.get('post_id');
  const episode = url.searchParams.get('episode');
  if (!postId || !episode) return jsonError('Missing post_id or episode', 400, corsHeaders);
  
  const nonce = await getCartoonNonce();
  
  const pageResponse = await fetch(`${CARTOONS_BASE}/?p=${postId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  
  const cookies = pageResponse.headers.get('set-cookie') || '';
  
  const formData = new FormData();
  formData.append('action', 'get_movie_link');
  formData.append('nonce', nonce);
  formData.append('post_id', postId);
  formData.append('type', 'episode');
  formData.append('action_type', 'watch');
  formData.append('episode_index', episode);
  formData.append('server_index', '0');
  
  const ajaxResponse = await fetch(`${CARTOONS_BASE}/wp-admin/admin-ajax.php`, {
    method: 'POST',
    headers: { 'Cookie': cookies, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    body: formData
  });
  
  const data = await ajaxResponse.json();
  
  if (data.success && data.data?.url) {
    return jsonResponse({ ...CUSTOM_HEADER, success: true, watch_url: data.data.url }, 200, corsHeaders);
  }
  
  return jsonError('Watch not available', 404, corsHeaders);
}

async function handleCartoonGenres(corsHeaders) {
  const response = await fetch(CARTOONS_BASE, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  
  const html = await response.text();
  const genres = [];
  const genreRegex = /<a[^>]*href="\/category\/([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let match;
  
  while ((match = genreRegex.exec(html)) !== null) {
    genres.push({ name: cleanText(match[2]), slug: match[1] });
  }
  
  return jsonResponse({ ...CUSTOM_HEADER, total: genres.length, genres }, 200, corsHeaders);
}

async function handleCartoonListing(url, baseUrl, corsHeaders) {
  const category = url.searchParams.get('category');
  const page = parseInt(url.searchParams.get('page')) || 1;
  if (!category) return jsonError('Missing category parameter', 400, corsHeaders);
  
  const pageUrl = page === 1 
    ? `${CARTOONS_BASE}/category/${category}/`
    : `${CARTOONS_BASE}/category/${category}/page/${page}/`;
  
  const response = await fetch(pageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  
  const html = await response.text();
  const items = [];
  const itemRegex = /<article[^>]*class="[^"]*item-list[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let match;
  
  while ((match = itemRegex.exec(html)) !== null) {
    const article = match[1];
    const titleMatch = article.match(/<h2[^>]*class="[^"]*post-box-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
    if (titleMatch) {
      const slug = titleMatch[1].replace(`${CARTOONS_BASE}/`, '').replace(/\/$/, '');
      items.push({
        title: cleanText(titleMatch[2]),
        'details-url': `${baseUrl}/details?slug=${slug}`,
        slug: slug
      });
    }
  }
  
  const hasNextPage = html.includes('rel="next"');
  
  return jsonResponse({
    ...CUSTOM_HEADER,
    category,
    page,
    total: items.length,
    next_page: hasNextPage ? page + 1 : null,
    items
  }, 200, corsHeaders);
}

async function handleCartoonTrending(baseUrl, corsHeaders) {
  const response = await fetch(CARTOONS_BASE, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  
  const html = await response.text();
  const items = [];
  const itemRegex = /<article[^>]*class="[^"]*item-list[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let match;
  
  while ((match = itemRegex.exec(html)) !== null && items.length < 20) {
    const article = match[1];
    const titleMatch = article.match(/<h2[^>]*class="[^"]*post-box-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
    if (titleMatch) {
      const slug = titleMatch[1].replace(`${CARTOONS_BASE}/`, '').replace(/\/$/, '');
      items.push({
        title: cleanText(titleMatch[2]),
        'details-url': `${baseUrl}/details?slug=${slug}`,
        slug: slug
      });
    }
  }
  
  return jsonResponse({ ...CUSTOM_HEADER, total: items.length, items }, 200, corsHeaders);
}

// ==================== WEBTOON FUNCTIONS ====================

function getWebtoonHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cookie': 'locale=id; needGDPR=false; needCCPA=false; needCOPPA=false; countryCode=ID',
  };
}

async function handleWebtoonHome(corsHeaders) {
  const response = await fetch(`${WEBTOON_BASE}/id`, {
    headers: getWebtoonHeaders()
  });
  
  const html = await response.text();
  
  const trending = [];
  const trendingRegex = /<a[^>]*class="[^"]*link[^"]*"[^>]*href="([^"]+)"[^>]*data-title-no="([^"]+)"[^>]*>[\s\S]*?<div[^>]*class="[^"]*info_text[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/div>/gi;
  let match;
  
  while ((match = trendingRegex.exec(html)) !== null) {
    trending.push({
      titleNo: match[2],
      title: cleanText(match[3]),
      url: match[1].replace(/^https?:\/\/m\.webtoons\.com/, '')
    });
    if (trending.length >= 20) break;
  }
  
  return jsonResponse({
    ...CUSTOM_HEADER,
    trending: trending.slice(0, 10),
    popular: trending.slice(10, 20),
    total_trending: Math.min(trending.length, 10),
    total_popular: Math.max(0, trending.length - 10)
  }, 200, corsHeaders);
}

async function handleWebtoonSearch(url, corsHeaders) {
  const keyword = url.searchParams.get('keyword');
  const page = parseInt(url.searchParams.get('page')) || 1;
  if (!keyword) return jsonError('Missing keyword parameter', 400, corsHeaders);
  
  const start = (page - 1) * 10 + 1;
  const searchUrl = `${WEBTOON_BASE}/id/search/result?keyword=${encodeURIComponent(keyword)}&searchType=ALL&start=${start}`;
  
  const response = await fetch(searchUrl, {
    headers: getWebtoonHeaders()
  });
  
  const data = await response.json();
  
  const webtoon = data?.result?.webtoonResult?.titleList || [];
  const canvas = data?.result?.challengeResult?.titleList || [];
  
  const results = [
    ...webtoon.map(item => ({
      titleNo: String(item.titleNo),
      title: item.title,
      genre: item.representGenre || null,
      type: 'WEBTOON',
      thumbnail: item.thumbnailMobile ? `https://webtoon-phinf.pstatic.net${item.thumbnailMobile}` : '',
      readCount: item.readCount
    })),
    ...canvas.map(item => ({
      titleNo: String(item.titleNo),
      title: item.title,
      genre: item.representGenre || null,
      type: 'CHALLENGE',
      thumbnail: item.thumbnailMobile ? `https://webtoon-phinf.pstatic.net${item.thumbnailMobile}` : '',
      readCount: item.readCount
    }))
  ];
  
  return jsonResponse({
    ...CUSTOM_HEADER,
    keyword,
    page,
    total_results: results.length,
    results
  }, 200, corsHeaders);
}

async function handleWebtoonDetail(url, corsHeaders) {
  const titleNo = url.searchParams.get('titleNo');
  if (!titleNo) return jsonError('Missing titleNo', 400, corsHeaders);
  
  const apiUrl = `${WEBTOON_BASE}/api/v1/webtoon/${titleNo}/episodes?pageSize=30`;
  
  const response = await fetch(apiUrl, {
    headers: {
      ...getWebtoonHeaders(),
      'x-requested-with': 'XMLHttpRequest'
    }
  });
  
  const data = await response.json();
  const list = data?.result?.episodeList || [];
  
  const episodes = list.map(ep => ({
    episodeNo: ep.episodeNo,
    title: ep.episodeTitle,
    date: ep.exposureDateMillis ? new Date(ep.exposureDateMillis).toISOString() : null,
    thumbnail: ep.thumbnail ? `https://webtoon-phinf.pstatic.net${ep.thumbnail}` : '',
    url: ep.viewerLink
  }));
  
  return jsonResponse({
    ...CUSTOM_HEADER,
    titleNo,
    episodes,
    total_episodes: episodes.length
  }, 200, corsHeaders);
}

async function handleWebtoonRead(url, corsHeaders) {
  const episodeUrl = url.searchParams.get('url');
  if (!episodeUrl) return jsonError('Missing episode url', 400, corsHeaders);
  
  const fullUrl = episodeUrl.startsWith('http') ? episodeUrl : `${WEBTOON_BASE}${episodeUrl}`;
  
  const response = await fetch(fullUrl, {
    headers: getWebtoonHeaders()
  });
  
  const html = await response.text();
  
  const images = [];
  const imageMatch = html.match(/var\s+imageList\s*=\s*(\[[\s\S]*?\]);/);
  
  if (imageMatch) {
    const block = imageMatch[1];
    const imageRegex = /url:\s*"([^"]+)"[\s\S]*?sortOrder:\s*(\d+)/g;
    let m;
    
    while ((m = imageRegex.exec(block)) !== null) {
      images.push({ url: m[1], sortOrder: Number(m[2]) });
    }
    
    images.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  
  const nextMatch = html.match(/nextEpisodeUrl:\s*"([^"]*)"/);
  const prevMatch = html.match(/prevEpisodeUrl:\s*"([^"]*)"/);
  
  return jsonResponse({
    ...CUSTOM_HEADER,
    images,
    total_images: images.length,
    next_episode_url: nextMatch ? nextMatch[1] : null,
    prev_episode_url: prevMatch ? prevMatch[1] : null
  }, 200, corsHeaders);
}

async function handleWebtoonImage(url, corsHeaders) {
  const imageUrl = url.searchParams.get('url');
  if (!imageUrl) return jsonError('Missing image url', 400, corsHeaders);
  
  const response = await fetch(imageUrl, {
    headers: {
      'Referer': 'https://www.webtoons.com/',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36'
    }
  });
  
  const imageData = await response.arrayBuffer();
  
  return new Response(imageData, {
    headers: {
      'Content-Type': response.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// ==================== ANICHIN FUNCTIONS - FIXED ====================

function getAnichinHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  };
}

// Extract anime cards from HTML
function extractAnichinCards(html) {
  const cards = [];
  const articleRegex = /<article[^>]*class="[^"]*bs[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let articleMatch;
  
  while ((articleMatch = articleRegex.exec(html)) !== null) {
    const article = articleMatch[1];
    
    const urlMatch = article.match(/<a[^>]*href="([^"]+)"[^>]*>/i);
    const url = urlMatch ? urlMatch[1] : null;
    
    const titleMatch = article.match(/<div[^>]*class="[^"]*tt[^"]*"[^>]*>([^<]+)<\/div>/i);
    const title = titleMatch ? cleanText(titleMatch[1]) : null;
    
    const epMatch = article.match(/<span[^>]*class="[^"]*epx[^"]*"[^>]*>Ep\s*(\d+)/i);
    const episode = epMatch ? parseInt(epMatch[1]) : null;
    
    const typeMatch = article.match(/<div[^>]*class="[^"]*typez[^"]*"[^>]*>([^<]+)<\/div>/i);
    const type = typeMatch ? cleanText(typeMatch[1]) : 'Donghua';
    
    const imgMatch = article.match(/<img[^>]*src="([^"]+)"[^>]*class="[^"]*ts-post-image[^"]*"[^>]*>/i);
    const thumbnail = imgMatch ? imgMatch[1] : null;
    
    const statusMatch = article.match(/<div[^>]*class="[^"]*status[^"]*"[^>]*>([^<]+)<\/div>/i);
    const status = statusMatch ? cleanText(statusMatch[1]) : null;
    
    if (title) {
      cards.push({
        title: title,
        url: url,
        episode: episode,
        type: type,
        thumbnail: thumbnail,
        status: status
      });
    }
  }
  
  return cards;
}

// Extract schedule from homepage
function extractAnichinSchedule(html) {
  const schedule = [];
  const dayRegex = /<div[^>]*class="[^"]*listSchh[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let dayMatch;
  
  while ((dayMatch = dayRegex.exec(html)) !== null) {
    const dayBlock = dayMatch[1];
    const dayNameMatch = dayBlock.match(/<h2>([^<]+)<\/h2>/i);
    const dayName = dayNameMatch ? cleanText(dayNameMatch[1]) : null;
    
    const animeList = [];
    const animeRegex = /<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let animeMatch;
    
    while ((animeMatch = animeRegex.exec(dayBlock)) !== null) {
      animeList.push({
        url: animeMatch[1],
        title: cleanText(animeMatch[2])
      });
    }
    
    if (dayName && animeList.length > 0) {
      schedule.push({
        day: dayName,
        anime: animeList
      });
    }
  }
  
  return schedule;
}

// Get pagination info
function extractPagination(html) {
  const pagination = {
    currentPage: 1,
    nextPage: null,
    hasNext: false
  };
  
  const nextMatch = html.match(/<a[^>]*href="\/page\/(\d+)\/[^>]*>Selanjutnya/i);
  if (nextMatch) {
    pagination.nextPage = parseInt(nextMatch[1]);
    pagination.hasNext = true;
  }
  
  return pagination;
}

// Extract banners from homepage
function extractAnichinBanners(html) {
  const banners = [];
  const bannerRegex = /<div[^>]*class="swiper-slide[^"]*item"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  let bannerMatch;
  
  while ((bannerMatch = bannerRegex.exec(html)) !== null) {
    const block = bannerMatch[1];
    
    const imgMatch = block.match(/<div[^>]*class="backdrop"[^>]*style="background-image:\s*url\(['"]?([^'"]+)['"]?\)/i);
    const image = imgMatch ? imgMatch[1] : null;
    
    const titleMatch = block.match(/<h2><a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a><\/h2>/i);
    const url = titleMatch ? titleMatch[1] : null;
    const title = titleMatch ? cleanText(titleMatch[2]) : null;
    
    const watchMatch = block.match(/<a[^>]*class="watch"[^>]*href="([^"]+)"[^>]*>Tonton<\/a>/i);
    const watchUrl = watchMatch ? watchMatch[1] : null;
    
    if (title) {
      banners.push({
        title: title,
        url: url,
        image: image,
        watch_url: watchUrl
      });
    }
  }
  
  return banners;
}

// Extract genres from filter
function extractAnichinGenres(html) {
  const genres = [];
  const genreRegex = /<input[^>]*name="genre\[\]"[^>]*value="([^"]+)"[^>]*>\s*<label[^>]*for="[^"]*"[^>]*>([^<]+)<\/label>/gi;
  let match;
  
  while ((match = genreRegex.exec(html)) !== null) {
    genres.push({
      slug: match[1],
      name: cleanText(match[2])
    });
  }
  
  return genres;
}

// Extract episode info from page
function extractAnichinEpisodeInfo(html) {
  const servers = [];
  const serverRegex = /<select[^>]*class="mirror"[^>]*>[\s\S]*?<option[^>]*value="([^"]+)"[^>]*>([^<]+)<\/option>[\s\S]*?<\/select>/gi;
  let serverMatch;
  
  while ((serverMatch = serverRegex.exec(html)) !== null) {
    let embedUrl = null;
    try {
      const decoded = atob(serverMatch[1]);
      const iframeMatch = decoded.match(/<iframe[^>]*src="([^"]+)"/);
      if (iframeMatch) embedUrl = iframeMatch[1];
    } catch(e) {}
    servers.push({
      label: cleanText(serverMatch[2]),
      embedUrl: embedUrl
    });
  }
  
  const downloads = [];
  const downloadRegex = /<div[^>]*class="soraurlx"[^>]*>[\s\S]*?<strong>([^<]+)<\/strong>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let downloadMatch;
  
  while ((downloadMatch = downloadRegex.exec(html)) !== null) {
    downloads.push({
      quality: cleanText(downloadMatch[1]),
      url: downloadMatch[2],
      host: cleanText(downloadMatch[3])
    });
  }
  
  return { servers, downloads };
}

// ==================== ANICHIN HANDLERS ====================

async function handleAnichinHome(url, corsHeaders) {
  const page = parseInt(url.searchParams.get('page')) || 1;
  const pagePath = page > 1 ? `/page/${page}/` : '';
  
  try {
    const response = await fetch(`${ANICHIN_BASE}${pagePath}`, {
      headers: getAnichinHeaders()
    });
    
    if (!response.ok) {
      return jsonResponse({
        ...CUSTOM_HEADER,
        results: [],
        page: page,
        total: 0,
        error: `HTTP ${response.status}`
      }, 200, corsHeaders);
    }
    
    const html = await response.text();
    
    const popular = extractAnichinCards(html);
    const schedule = extractAnichinSchedule(html);
    const pagination = extractPagination(html);
    const banners = extractAnichinBanners(html);
    
    // Extract latest releases from the listupd section
    const latestRegex = /<div[^>]*class="listupd[^"]*normal"[^>]*>[\s\S]*?<div[^>]*class="excstf"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i;
    const latestMatch = html.match(latestRegex);
    let latest = [];
    if (latestMatch) {
      latest = extractAnichinCards(latestMatch[1]);
    }
    
    return jsonResponse({
      ...CUSTOM_HEADER,
      page: page,
      banners: banners,
      popular: popular.slice(0, 10),
      latest: latest.slice(0, 20),
      schedule: schedule,
      pagination: pagination,
      total: popular.length + latest.length
    }, 200, corsHeaders);
    
  } catch (error) {
    return jsonResponse({
      ...CUSTOM_HEADER,
      results: [],
      page: page,
      total: 0,
      error: error.message
    }, 200, corsHeaders);
  }
}

async function handleAnichinSearch(url, corsHeaders) {
  const query = url.searchParams.get('q');
  if (!query) return jsonError('Missing q parameter', 400, corsHeaders);
  
  try {
    const response = await fetch(`${ANICHIN_BASE}/?s=${encodeURIComponent(query)}`, {
      headers: getAnichinHeaders()
    });
    
    if (!response.ok) {
      return jsonResponse({ ...CUSTOM_HEADER, error: `HTTP ${response.status}` }, 200, corsHeaders);
    }
    
    const html = await response.text();
    const results = extractAnichinCards(html);
    
    return jsonResponse({
      ...CUSTOM_HEADER,
      query: query,
      results: results,
      total: results.length
    }, 200, corsHeaders);
    
  } catch (error) {
    return jsonResponse({ ...CUSTOM_HEADER, error: error.message }, 200, corsHeaders);
  }
}

async function handleAnichinInfo(url, corsHeaders) {
  const slug = url.searchParams.get('slug');
  if (!slug) return jsonError('Missing slug parameter', 400, corsHeaders);
  
  try {
    const response = await fetch(`${ANICHIN_BASE}/${slug}`, {
      headers: getAnichinHeaders()
    });
    
    if (!response.ok) {
      return jsonResponse({ ...CUSTOM_HEADER, error: `HTTP ${response.status}` }, 200, corsHeaders);
    }
    
    const html = await response.text();
    
    const nameMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]+)</i);
    const name = nameMatch ? cleanText(nameMatch[1]) : 'Unknown Title';
    
    const thumbMatch = html.match(/<div[^>]*class="thumb"[^>]*>\s*<img[^>]*src="([^"]+)"/i);
    const thumbnail = thumbMatch ? thumbMatch[1] : null;
    
    const genres = [];
    const genreRegex = /<div[^>]*class="genxed"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/gi;
    let genreMatch;
    while ((genreMatch = genreRegex.exec(html)) !== null) {
      genres.push(cleanText(genreMatch[1]));
    }
    
    const episodes = [];
    const epRegex = /<div[^>]*class="eplister"[^>]*>[\s\S]*?<li>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<div[^>]*class="epl-title"[^>]*>([^<]+)<\/div>[\s\S]*?<div[^>]*class="epl-date"[^>]*>([^<]+)<\/div>/gi;
    let epMatch;
    while ((epMatch = epRegex.exec(html)) !== null) {
      const epSlug = epMatch[1].split('/').filter(Boolean).pop();
      episodes.push({
        slug: epSlug,
        title: cleanText(epMatch[2]),
        date: cleanText(epMatch[3])
      });
    }
    
    return jsonResponse({
      ...CUSTOM_HEADER,
      name: name,
      thumbnail: thumbnail,
      genres: genres,
      total_episodes: episodes.length,
      episodes: episodes.slice(0, 20)
    }, 200, corsHeaders);
    
  } catch (error) {
    return jsonResponse({ ...CUSTOM_HEADER, error: error.message }, 200, corsHeaders);
  }
}

async function handleAnichinEpisode(url, corsHeaders) {
  const slug = url.searchParams.get('slug');
  if (!slug) return jsonError('Missing slug parameter', 400, corsHeaders);
  
  try {
    const response = await fetch(`${ANICHIN_BASE}/${slug}`, {
      headers: getAnichinHeaders()
    });
    
    if (!response.ok) {
      return jsonResponse({ ...CUSTOM_HEADER, error: `HTTP ${response.status}` }, 200, corsHeaders);
    }
    
    const html = await response.text();
    const { servers, downloads } = extractAnichinEpisodeInfo(html);
    
    return jsonResponse({
      ...CUSTOM_HEADER,
      servers: servers,
      downloads: downloads
    }, 200, corsHeaders);
    
  } catch (error) {
    return jsonResponse({ ...CUSTOM_HEADER, error: error.message }, 200, corsHeaders);
  }
}

async function handleAnichinAnimeList(corsHeaders) {
  try {
    const response = await fetch(`${ANICHIN_BASE}/anime`, {
      headers: getAnichinHeaders()
    });
    
    if (!response.ok) {
      return jsonResponse({ ...CUSTOM_HEADER, error: `HTTP ${response.status}` }, 200, corsHeaders);
    }
    
    const html = await response.text();
    const results = extractAnichinCards(html);
    
    return jsonResponse({
      ...CUSTOM_HEADER,
      results: results,
      total: results.length
    }, 200, corsHeaders);
    
  } catch (error) {
    return jsonResponse({ ...CUSTOM_HEADER, error: error.message }, 200, corsHeaders);
  }
}

async function handleAnichinGenres(corsHeaders) {
  try {
    const response = await fetch(`${ANICHIN_BASE}/anime`, {
      headers: getAnichinHeaders()
    });
    
    if (!response.ok) {
      return jsonResponse({ ...CUSTOM_HEADER, error: `HTTP ${response.status}` }, 200, corsHeaders);
    }
    
    const html = await response.text();
    const genres = extractAnichinGenres(html);
    
    return jsonResponse({
      ...CUSTOM_HEADER,
      genres: genres,
      total: genres.length
    }, 200, corsHeaders);
    
  } catch (error) {
    return jsonResponse({ ...CUSTOM_HEADER, error: error.message }, 200, corsHeaders);
  }
}

async function handleAnichinGenre(url, corsHeaders) {
  const slug = url.searchParams.get('slug');
  const page = parseInt(url.searchParams.get('page')) || 1;
  if (!slug) return jsonError('Missing slug parameter', 400, corsHeaders);
  
  let genreUrl = `/anime?genre[]=${slug}`;
  if (page > 1) genreUrl += `&page=${page}`;
  
  try {
    const response = await fetch(`${ANICHIN_BASE}${genreUrl}`, {
      headers: getAnichinHeaders()
    });
    
    if (!response.ok) {
      return jsonResponse({ ...CUSTOM_HEADER, error: `HTTP ${response.status}` }, 200, corsHeaders);
    }
    
    const html = await response.text();
    const results = extractAnichinCards(html);
    const pagination = extractPagination(html);
    
    return jsonResponse({
      ...CUSTOM_HEADER,
      results: results,
      slug: slug,
      page: page,
      pagination: pagination,
      total: results.length
    }, 200, corsHeaders);
    
  } catch (error) {
    return jsonResponse({ ...CUSTOM_HEADER, error: error.message }, 200, corsHeaders);
  }
}

// ==================== OPLOVERZ FUNCTIONS ====================

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
  const dataNode = raw.nodes.find(n => n?.type === "data" && Array.isArray(n.data));
  if (!dataNode) return null;

  const arr = dataNode.data;

  function resolve(idx) {
    if (idx === null || idx === undefined) return null;
    const val = arr[idx];
    if (val === null || val === undefined) return val;
    if (typeof val !== "object") return val;
    if (Array.isArray(val)) return val.map(i => resolve(i));
    const result = {};
    for (const [k, v] of Object.entries(val)) result[k] = resolve(v);
    return result;
  }

  return resolve(0);
}

async function fetchOploverzDataJson(path, referer) {
  const endpoint = (path === "/" ? "" : path) + "/__data.json?x-sveltekit-invalidated=001";
  const response = await fetch(`${OPLOVERZ_BASE}${endpoint}`, {
    headers: { ...getOploverzHeaders(), Referer: referer || `${OPLOVERZ_BASE}/` }
  });
  
  if (!response.ok) throw new Error(`Failed to fetch ${endpoint}: ${response.status}`);
  const raw = await response.json();
  return decodeSvelteFlat(raw);
}

function oploverzFullUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return OPLOVERZ_BACKAPI + path;
}

function oploverzCleanUrl(url) {
  if (!url) return false;
  const adDomains = ["blogger.com", "blogspot.com", "slot", "casino", "mpo", "judol"];
  const lower = url.toLowerCase();
  return !adDomains.some(d => lower.includes(d));
}

function fmtOploverzStreamUrls(streamUrl = []) {
  return (streamUrl || [])
    .filter(s => s?.url && oploverzCleanUrl(s.url))
    .map(s => ({ label: s.source, url: s.url }));
}

function fmtOploverzDownloads(downloadUrl = []) {
  return (downloadUrl || []).flatMap(fmt =>
    (fmt?.resolutions || []).flatMap(res =>
      (res?.download_links || [])
        .filter(l => l?.url && oploverzCleanUrl(l.url))
        .map(l => ({
          format: fmt.format || null,
          quality: res.quality || null,
          host: l.host || null,
          url: l.url,
        }))
    )
  );
}

function fmtOploverzSeries(s) {
  if (!s?.slug) return null;
  return {
    id: s.id || null,
    title: s.title || null,
    japaneseTitle: s.japaneseTitle || null,
    slug: s.slug,
    status: s.status || null,
    poster: oploverzFullUrl(s.poster),
    score: s.score || null,
    genres: (s.genres || []).map(g => g?.name || g).filter(Boolean),
    studio: s.studio?.name || null,
    season: s.season?.name || null,
    totalEpisodes: s.totalEpisodes || null,
    releaseDate: s.releaseDate || null,
    releaseType: s.releaseType || null,
    url: `${OPLOVERZ_BASE}/series/${s.slug}`,
  };
}

function fmtOploverzEpisodeCard(ep) {
  if (!ep) return null;
  return {
    id: ep.id || null,
    seriesTitle: ep.series?.title || null,
    seriesSlug: ep.series?.slug || null,
    episodeNumber: ep.episodeNumber || null,
    subbed: ep.subbed || null,
    poster: oploverzFullUrl(ep.series?.poster) || null,
    releasedAt: ep.releasedAt || null,
    streamUrls: fmtOploverzStreamUrls(ep.streamUrl),
    downloadUrls: fmtOploverzDownloads(ep.downloadUrl),
    url: ep.series?.slug ? `${OPLOVERZ_BASE}/series/${ep.series.slug}/episode/${ep.episodeNumber}` : null,
  };
}

async function handleOploverzHome(corsHeaders) {
  const decoded = await fetchOploverzDataJson("/", `${OPLOVERZ_BASE}/`);
  if (!decoded) throw new Error("Failed to decode home __data.json");

  const trending = decoded.trending || {};
  const recently = decoded.recently || {};
  const latestEpisodes = decoded.latestEpisodes || {};

  const htmlResponse = await fetch(OPLOVERZ_BASE, {
    headers: { 'User-Agent': getOploverzHeaders()['User-Agent'] }
  });
  const html = await htmlResponse.text();
  
  const banners = [];
  const bannerRegex = /<div[^>]*data-embla-slide[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>[\s\S]*?<a[^>]*href="\/series\/([^"]+)"[^>]*>[\s\S]*?<h[12][^>]*>([^<]+)<\/h[12]>/gi;
  let bannerMatch;
  while ((bannerMatch = bannerRegex.exec(html)) !== null) {
    banners.push({
      image: bannerMatch[1],
      slug: bannerMatch[2],
      title: cleanText(bannerMatch[3])
    });
  }

  return jsonResponse({
    ...CUSTOM_HEADER,
    page: "home",
    banners: banners.slice(0, 5),
    trending: (trending.data || []).map(fmtOploverzSeries).filter(Boolean),
    recently: (recently.data || []).map(fmtOploverzSeries).filter(Boolean),
    latestEpisodes: (latestEpisodes.data || []).map(fmtOploverzEpisodeCard).filter(Boolean),
  }, 200, corsHeaders);
}

async function handleOploverzSeries(url, corsHeaders) {
  const page = parseInt(url.searchParams.get('page')) || 1;
  const sortBy = url.searchParams.get('sort_by') || 'recently';
  const genre = url.searchParams.get('genre') || '';
  
  const query = new URLSearchParams({ page, sort_by: sortBy });
  if (genre) query.append('genre', genre);
  
  const endpoint = `/series/__data.json?x-sveltekit-invalidated=001&${query}`;
  const response = await fetch(`${OPLOVERZ_BASE}${endpoint}`, {
    headers: getOploverzHeaders()
  });
  
  const raw = await response.json();
  const decoded = decodeSvelteFlat(raw);
  
  let items = (decoded?.allSeries?.data || []).map(fmtOploverzSeries).filter(Boolean);
  const meta = decoded?.allSeries?.meta || {};
  
  return jsonResponse({
    ...CUSTOM_HEADER,
    page: "series",
    total: meta.total || items.length,
    pagination: {
      currentPage: meta.currentPage || page,
      lastPage: meta.lastPage || 1,
      perPage: meta.perPage || items.length,
    },
    items,
  }, 200, corsHeaders);
}

async function handleOploverzDetail(url, corsHeaders) {
  const slug = url.searchParams.get('slug');
  if (!slug) return jsonError('Missing slug parameter', 400, corsHeaders);
  
  const decoded = await fetchOploverzDataJson(`/series/${slug}`, `${OPLOVERZ_BASE}/`);
  if (!decoded) throw new Error(`Failed to decode detail for: ${slug}`);
  
  const s = decoded.series || {};
  const eps = decoded.episodes || {};
  const epList = (eps.data || eps || []);
  
  return jsonResponse({
    ...CUSTOM_HEADER,
    page: "detail",
    id: s.id || null,
    title: s.title || null,
    japaneseTitle: s.japaneseTitle || null,
    slug,
    description: s.description || null,
    status: s.status || null,
    poster: oploverzFullUrl(s.poster),
    score: s.score || null,
    genres: (s.genres || []).map(g => g?.name || g).filter(Boolean),
    studio: s.studio?.name || null,
    season: s.season?.name || null,
    totalEpisodes: s.totalEpisodes || epList.length,
    releaseDate: s.releaseDate || null,
    releaseType: s.releaseType || null,
    episodes: epList
      .map(ep => ({
        episodeNumber: ep.episodeNumber || null,
        title: ep.title || null,
        releasedAt: ep.releasedAt || null,
        url: `${OPLOVERZ_BASE}/series/${slug}/episode/${ep.episodeNumber}`,
      }))
      .filter(ep => ep.episodeNumber)
      .sort((a, b) => a.episodeNumber - b.episodeNumber),
  }, 200, corsHeaders);
}

async function handleOploverzWatch(url, corsHeaders) {
  const slug = url.searchParams.get('slug');
  const episode = url.searchParams.get('episode');
  if (!slug || !episode) return jsonError('Missing slug or episode', 400, corsHeaders);
  
  const decoded = await fetchOploverzDataJson(`/series/${slug}/episode/${episode}`, `${OPLOVERZ_BASE}/series/${slug}`);
  if (!decoded) throw new Error(`Failed to decode watch for: ${slug} ep ${episode}`);
  
  const ep = decoded.episode || {};
  const all = decoded.allEpisodes || decoded.episodes || {};
  const allList = all.data || all || [];
  
  return jsonResponse({
    ...CUSTOM_HEADER,
    page: "watch",
    id: ep.id || null,
    seriesTitle: ep.series?.title || decoded.series?.title || null,
    seriesSlug: ep.series?.slug || slug,
    episodeNumber: ep.episodeNumber || parseInt(episode),
    subbed: ep.subbed || null,
    poster: oploverzFullUrl(ep.series?.poster) || oploverzFullUrl(decoded.series?.poster) || null,
    releasedAt: ep.releasedAt || null,
    streamUrls: fmtOploverzStreamUrls(ep.streamUrl),
    downloadUrls: fmtOploverzDownloads(ep.downloadUrl),
    allEpisodes: allList
      .map(e => ({
        episodeNumber: e.episodeNumber || null,
        releasedAt: e.releasedAt || null,
        url: `${OPLOVERZ_BASE}/series/${slug}/episode/${e.episodeNumber}`,
      }))
      .filter(e => e.episodeNumber)
      .sort((a, b) => a.episodeNumber - b.episodeNumber),
  }, 200, corsHeaders);
}

async function handleOploverzSearch(url, corsHeaders) {
  const query = url.searchParams.get('q');
  if (!query) return jsonError('Missing q parameter', 400, corsHeaders);
  
  const endpoint = `/series/__data.json?x-sveltekit-invalidated=001&q=${encodeURIComponent(query)}`;
  const response = await fetch(`${OPLOVERZ_BASE}${endpoint}`, {
    headers: getOploverzHeaders()
  });
  
  const raw = await response.json();
  const decoded = decodeSvelteFlat(raw);
  
  const items = (decoded?.allSeries?.data || []).map(fmtOploverzSeries).filter(Boolean);
  const meta = decoded?.allSeries?.meta || {};
  
  return jsonResponse({
    ...CUSTOM_HEADER,
    page: "search",
    query,
    total: meta.total || items.length,
    pagination: { currentPage: meta.currentPage || 1, lastPage: meta.lastPage || 1 },
    items,
  }, 200, corsHeaders);
}

// ==================== HENTAI HELPER FUNCTIONS ====================

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
  } catch(e) {
    // Silent fail
  }
  return links;
}

// ==================== HENTAI SCRAPER FUNCTIONS ====================

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

// ==================== HELPERS ====================

function jsonResponse(data, status, corsHeaders) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

function jsonError(message, status, corsHeaders) {
  return jsonResponse({ ...CUSTOM_HEADER, error: { code: status, message } }, status, corsHeaders);
}

function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
