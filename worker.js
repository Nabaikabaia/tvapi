

/* worker.js — GlobeTV API + Hentaimama Scraper API
 * Deployed on Cloudflare Workers
 * Powered by Nabees Tech
 * WhatsApp: https://whatsapp.com/channel/0029VawtjOXJpe8X3j3NCZ3j
 **/

































const BASE_HENTAI = 'https://hentaimama.io';
const UA = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36';

// Custom branding 
const CUSTOM_HEADER = {
  creator: "NABEES",
  provider: "NABEES TECH NAIJA DEVOPS",
  country: "Nigeria",
  website: "https://nabees.online",
  whatsapp_channel: "https://whatsapp.com/channel/0029VawtjOXJpe8X3j3NCZ3j"
};

// GlobeTV endpoints mapping
const GLOBE_ENDPOINTS = {
  '/ch': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/channels.json.gz',
  '/co': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/countries.json.gz',
  '/ca': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/categories.json.gz',
  '/bl': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/blocklist.json.gz',
  '/st': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/streams.json.gz'
};

// Track worker start time for uptime calculation
const START_TIME = Date.now();

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const query = url.searchParams;
    
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
    
    // ========== HENTAI ENDPOINTS ==========
    const action = path.slice(1);
    
    try {
      let result;
      
      // Episode: /e?url=xxx
      if (action === 'e' && query.get('url')) {
        result = await scrapeEpisode(query.get('url'));
      }
      // TV Show: /t?url=xxx
      else if (action === 't' && query.get('url')) {
        result = await scrapeTVShow(query.get('url'));
      }
      // Genre: /g?url=xxx&page=1
      else if (action === 'g' && query.get('url')) {
        let page = parseInt(query.get('page')) || 1;
        let genreUrl = page > 1 ? query.get('url').replace(/\/$/, '') + `/page/${page}/` : query.get('url');
        result = await scrapeGenre(genreUrl);
      }
      // Search: /s?q=query&page=1
      else if (action === 's' && query.get('q')) {
        let page = parseInt(query.get('page')) || 1;
        result = await scrapeSearch(query.get('q'), page);
      }
      // Hentai List: /hl?page=1
      else if (action === 'hl') {
        let page = parseInt(query.get('page')) || 1;
        result = await scrapeHentaiList(page);
      }
      // Trending: /tr?page=1
      else if (action === 'tr') {
        let page = parseInt(query.get('page')) || 1;
        result = await scrapeTrending(page);
      }
      // List: /ls?url=xxx
      else if (action === 'ls' && query.get('url')) {
        result = await scrapeList(query.get('url'));
      }
      // Advance Search: /as?year=2024
      else if (action === 'as') {
        const params = Object.fromEntries(url.searchParams);
        result = await scrapeAdvanceSearch(params);
      }
      // Root endpoint with status, uptime, datetime, and IP
      else if (path === '/') {
        // Get user's timezone from Cloudflare
        const userTimezone = request.cf?.timezone || 'Africa/Lagos';
        
        // Get IP address from various headers
        const ip = request.headers.get('cf-connecting-ip') ||
                   request.headers.get('x-forwarded-for')?.split(',')[0] ||
                   request.headers.get('x-real-ip') ||
                   'Unknown';
        
        // Calculate uptime
        const uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1000);
        const uptimeMinutes = Math.floor(uptimeSeconds / 60);
        const uptimeHours = Math.floor(uptimeMinutes / 60);
        
        let uptimeString = '';
        if (uptimeHours > 0) uptimeString += `${uptimeHours}h `;
        if (uptimeMinutes % 60 > 0) uptimeString += `${uptimeMinutes % 60}m `;
        uptimeString += `${uptimeSeconds % 60}s`;
        
        return new Response(JSON.stringify({
          ...CUSTOM_HEADER,
          status: "alive",
          uptime: uptimeString,
          datetime: new Date().toLocaleString('en-NG', { 
            timeZone: userTimezone,
            hour12: false
          }),
          ip: ip
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

// ========== HELPER FUNCTIONS ==========

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

// ========== SCRAPER FUNCTIONS ==========

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
  
  // Find all links containing "/episodes/" or "/episode/"
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




// Fork and Deploy on Cloudflare Worker
 

