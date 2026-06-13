// Cloudflare Worker for GlobeTV API with custom headers and pretty print
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Define all available resources
    const resources = {
      '/channels': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/channels.json.gz',
      '/countries': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/countries.json.gz',
      '/categories': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/categories.json.gz',
      '/blocklist': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/blocklist.json.gz',
      '/streams': 'https://raw.githubusercontent.com/globetvapp/globetv.app/main/streams.json.gz'
    };
    
    // Custom header to add to every response
    const customHeader = {
      "creator": "NABEES",
      "provider": "NABEES TECH NAIJA DEVOPS",
      "country": "Nigeria",
      "website": "https://nabees.online",
      "whatsapp_channel": "https://whatsapp.com/channel/0029VawtjOXJpe8X3j3NCZ3j"
    };
    
    // Handle root endpoint - list available resources
    if (path === '/' || path === '/docs') {
      const responseData = {
        ...customHeader,
        endpoints: Object.keys(resources),
        usage: 'GET /channels, /countries, /categories, /blocklist, /streams',
        note: 'All endpoints return JSON data from gzipped sources'
      };
      
      return new Response(JSON.stringify(responseData, null, 2), {
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }
    
    // Find matching resource
    const resourceUrl = resources[path];
    if (!resourceUrl) {
      const errorResponse = {
        ...customHeader,
        error: 'Not found',
        available: Object.keys(resources)
      };
      
      return new Response(JSON.stringify(errorResponse, null, 2), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    try {
      // Fetch and decompress the gzipped file
      const response = await fetch(resourceUrl);
      
      if (!response.ok) {
        throw new Error(`GitHub returned ${response.status}`);
      }
      
      const compressed = await response.arrayBuffer();
      
      // Decompress gzip
      const decompressed = await new Response(compressed).body
        .pipeThrough(new DecompressionStream('gzip'));
      
      const originalData = await new Response(decompressed).json();
      
      // Merge custom header with the original data
      const finalResponse = {
        ...customHeader,
        data: originalData
      };
      
      // Return pretty-printed JSON with 2-space indentation
      return new Response(JSON.stringify(finalResponse, null, 2), {
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
          'Access-Control-Allow-Origin': '*'
        }
      });
      
    } catch (error) {
      const errorResponse = {
        ...customHeader,
        error: 'Failed to fetch resource',
        details: error.message
      };
      
      return new Response(JSON.stringify(errorResponse, null, 2), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
