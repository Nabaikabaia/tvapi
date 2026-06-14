// worker.js - Universal AI Gateway with chatday.ai
// Supports: 20+ AI models including GPT-5.5, Claude Opus 4.8, Gemini 3 Pro, etc.

import crypto from 'node:crypto';

const base_url = 'https://www.chatday.ai';
const baseHeaders = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
  'Origin': base_url,
  'Referer': `${base_url}/chat`,
};

// Available models (from your scrape)
const AVAILABLE_MODELS = [
  "openai/gpt-5.5", "openai/gpt-5.4", "openai/gpt-5.3-chat", "openai/gpt-5.1-instant", "openai/gpt-5",
  "openai/gpt-4o", "openai/gpt-4o-mini", "xai/grok-4.1-fast-non-reasoning",
  "anthropic/claude-haiku-4.5", "anthropic/claude-sonnet-4.6", "anthropic/claude-opus-4.5",
  "anthropic/claude-opus-4.6", "anthropic/claude-opus-4.7", "anthropic/claude-opus-4.8",
  "anthropic/claude-fable-5", "deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v3.2-thinking", "google/gemini-3.1-pro-preview", "google/gemini-3-pro-preview",
  "google/gemini-3.1-flash-lite", "alibaba/qwen3-max", "meta/llama-4-maverick", "moonshotai/kimi-k2.6"
];

// Model name mappings for cleaner URLs
const MODEL_MAP = {
  'gpt55': 'openai/gpt-5.5',
  'gpt54': 'openai/gpt-5.4',
  'gpt4o': 'openai/gpt-4o',
  'gpt4omini': 'openai/gpt-4o-mini',
  'grok': 'xai/grok-4.1-fast-non-reasoning',
  'claude-haiku': 'anthropic/claude-haiku-4.5',
  'claude-sonnet': 'anthropic/claude-sonnet-4.6',
  'claude-opus': 'anthropic/claude-opus-4.8',
  'claude-fable': 'anthropic/claude-fable-5',
  'deepseek-pro': 'deepseek/deepseek-v4-pro',
  'deepseek-flash': 'deepseek/deepseek-v4-flash',
  'deepseek-thinking': 'deepseek/deepseek-v3.2-thinking',
  'gemini-pro': 'google/gemini-3.1-pro-preview',
  'gemini-flash': 'google/gemini-3.1-flash-lite',
  'qwen': 'alibaba/qwen3-max',
  'llama': 'meta/llama-4-maverick',
  'kimi': 'moonshotai/kimi-k2.6'
};

// Reverse mapping
const SHORT_TO_MODEL = Object.fromEntries(
  Object.entries(MODEL_MAP).map(([short, full]) => [full, short])
);

const sessionStore = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    if (request.method === 'OPTIONS') {
      return handleOptions();
    }
    
    // ==================== LIST MODELS ENDPOINT ====================
    if (path === '/api/models') {
      return jsonResponse({
        models: AVAILABLE_MODELS,
        shortcuts: MODEL_MAP,
        count: AVAILABLE_MODELS.length
      });
    }
    
    // ==================== CHAT ENDPOINT ====================
    // GET /api/chat?q=...&model=...&session=...
    // GET /api/{model}?q=...&session=...
    if (path === '/api/chat') {
      const query = url.searchParams.get('q');
      const modelName = url.searchParams.get('model') || 'openai/gpt-5.5';
      const sessionId = url.searchParams.get('session');
      
      if (!query) {
        return jsonResponse({ error: 'Missing "q" parameter' }, 400);
      }
      
      return handleChat(query, modelName, sessionId);
    }
    
    // Route: /api/{shortcut}?q=...
    const modelMatch = path.match(/^\/api\/([a-zA-Z0-9_-]+)$/);
    
    if (modelMatch) {
      const shortcut = modelMatch[1].toLowerCase();
      const query = url.searchParams.get('q');
      const sessionId = url.searchParams.get('session');
      
      if (!query) {
        return jsonResponse({ error: 'Missing "q" parameter' }, 400);
      }
      
      // Check if shortcut maps to a model
      if (MODEL_MAP[shortcut]) {
        return handleChat(query, MODEL_MAP[shortcut], sessionId);
      }
      
      // Check if it's a direct model name
      if (AVAILABLE_MODELS.includes(shortcut)) {
        return handleChat(query, shortcut, sessionId);
      }
      
      return jsonResponse({ 
        error: 'Unknown model', 
        available_models: Object.keys(MODEL_MAP),
        full_models: AVAILABLE_MODELS
      }, 404);
    }
    
    return jsonResponse({ 
      error: 'Not found', 
      endpoints: {
        list_models: 'GET /api/models',
        chat: 'GET /api/chat?q=...&model=...',
        shortcuts: 'GET /api/gpt55?q=..., /api/claude-opus?q=..., /api/gemini-pro?q=..., /api/grok?q=..., /api/deepseek-pro?q=..., /api/llama?q=...'
      }
    }, 404);
  }
};

// ==================== CHAT HANDLER ====================

async function handleChat(prompt, model, sessionId) {
  try {
    // Get or create session
    let session = sessionId ? sessionStore.get(sessionId) : null;
    
    if (!session) {
      session = {
        id: crypto.randomUUID(),
        visitorId: crypto.randomUUID().replace(/-/g, ''),
        conversationId: null
      };
    }
    
    // Get fresh session (sign in anonymously)
    const auth = await signInAnonymous();
    if (!auth || !auth.cookie) {
      return jsonResponse({ error: 'Failed to authenticate with chatday.ai' }, 500);
    }
    
    // Generate or use existing conversation ID
    const conversationId = session.conversationId || 
      Math.random().toString(36).slice(2, 10).toUpperCase() + 
      Math.random().toString(36).slice(2, 10).toUpperCase();
    
    session.conversationId = conversationId;
    session.cookie = auth.cookie;
    sessionStore.set(session.id, session);
    
    // Make chat request
    const response = await fetch(`${base_url}/api/v2/chat/anonymous`, {
      method: 'POST',
      headers: {
        ...baseHeaders,
        'Content-Type': 'application/json',
        'Cookie': auth.cookie,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        content: prompt,
        model: model,
        visitorId: session.visitorId,
        conversationId: conversationId
      })
    });
    
    if (!response.ok || !response.body) {
      return jsonResponse({ error: `Chat API error: ${response.status}` }, 500);
    }
    
    // Parse SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullReply = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        
        try {
          const evt = JSON.parse(payload);
          if (evt.type === 'text-delta' && typeof evt.delta === 'string') {
            fullReply += evt.delta;
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
    
    // Clean up empty responses
    if (!fullReply.trim()) {
      fullReply = "No response from AI";
    }
    
    return jsonResponse({
      reply: fullReply,
      model: model,
      short_name: SHORT_TO_MODEL[model] || model.split('/').pop(),
      session: session.id
    });
    
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

// ==================== AUTHENTICATION ====================

async function signInAnonymous() {
  try {
    const response = await fetch(`${base_url}/api/auth/sign-in/anonymous`, {
      method: 'POST',
      headers: {
        ...baseHeaders,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    
    if (!response.ok) {
      return null;
    }
    
    // Extract cookies
    const setCookie = response.headers.getSetCookie?.() ?? 
                     [response.headers.get('set-cookie')].filter(Boolean);
    const cookie = setCookie.map(c => c.split(';')[0]).join('; ');
    
    const data = await response.json();
    
    return {
      cookie: cookie,
      token: data.token,
      user: data.user
    };
  } catch (error) {
    return null;
  }
}

// ==================== HELPERS ====================

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    }
  });
}
