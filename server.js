const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const dir = __dirname;
const dataDir = path.join(dir, 'data');
const inquiriesFile = path.join(dataDir, 'inquiries.json');

// Ensure persistent data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(inquiriesFile)) {
  fs.writeFileSync(inquiriesFile, JSON.stringify([], null, 2), 'utf8');
}

// Memory cache of recent inquiries to prevent duplicate submissions
const recentSubmissions = new Map();

// Helper to send JSON responses
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(data));
}

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // CORS Headers for API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --------------------------------------------------------------------------
  // API ROUTING
  // --------------------------------------------------------------------------
  // Health Check
  if (pathname === '/api/health') {
    sendJSON(res, 200, {
      status: 'healthy',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      service: 'Elegant Era Interior Studio Production Server',
      cwd: process.cwd(),
      inquiriesFile: inquiriesFile
    });
    return;
  }

  // Inquiries API
  if (pathname === '/api/inquiries') {
    if (req.method === 'GET') {
      try {
        const raw = fs.readFileSync(inquiriesFile, 'utf8');
        const list = JSON.parse(raw);
        // Return sanitized count & status without exposing sensitive personal info
        sendJSON(res, 200, {
          success: true,
          count: list.length,
          lastInquiry: list.length > 0 ? list[list.length - 1].createdAt : null
        });
      } catch (err) {
        sendJSON(res, 500, { success: false, error: 'Database read failure' });
      }
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 1e6) { // 1MB limit
          req.destroy();
        }
      });

      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const name = String(payload.name || '').trim();
          const phone = String(payload.phone || '').trim().replace(/\D/g, '');
          const email = String(payload.email || '').trim().toLowerCase();
          const projectType = String(payload.projectType || 'Not specified').trim();
          const message = String(payload.message || '').trim();
          const source = String(payload.source || 'website-form').trim();

          // Input Validation
          if (!name || name.length < 2) {
            sendJSON(res, 400, { success: false, error: 'Please provide a valid full name.' });
            return;
          }
          if (!phone || phone.length < 10) {
            sendJSON(res, 400, { success: false, error: 'Please provide a valid 10-digit mobile number.' });
            return;
          }

          // Duplicate prevention (within 60 seconds)
          const dedupeKey = `${phone}_${projectType}`;
          const now = Date.now();
          if (recentSubmissions.has(dedupeKey)) {
            const lastTime = recentSubmissions.get(dedupeKey);
            if (now - lastTime < 60000) {
              sendJSON(res, 429, { 
                success: false, 
                error: 'An inquiry was recently submitted with this phone number. Please wait a moment.' 
              });
              return;
            }
          }
          recentSubmissions.set(dedupeKey, now);

          // Clean older dedupe records periodically
          if (recentSubmissions.size > 200) {
            for (const [k, t] of recentSubmissions.entries()) {
              if (now - t > 120000) recentSubmissions.delete(k);
            }
          }

          // Build record
          const id = `EE-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
          const record = {
            id,
            name,
            phone,
            email,
            projectType,
            message,
            source,
            createdAt: new Date().toISOString()
          };

          // Save to local file
          let currentList = [];
          try {
            currentList = JSON.parse(fs.readFileSync(inquiriesFile, 'utf8'));
          } catch (_) {
            currentList = [];
          }
          currentList.push(record);
          fs.writeFileSync(inquiriesFile, JSON.stringify(currentList, null, 2), 'utf8');

          // Supabase sync if credentials exist
          const supabaseUrl = process.env.SUPABASE_URL;
          const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
          if (supabaseUrl && supabaseKey) {
            try {
              const fetch = require('node-fetch');
              fetch(`${supabaseUrl}/rest/v1/inquiries`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`,
                  'Prefer': 'return=minimal'
                },
                body: JSON.stringify(record)
              }).catch(e => console.error('Supabase background sync error:', e.message));
            } catch (e) {
              // ignore if node-fetch not installed
            }
          }

          sendJSON(res, 201, {
            success: true,
            id,
            message: 'Inquiry successfully received and stored.'
          });
        } catch (err) {
          sendJSON(res, 400, { success: false, error: 'Invalid JSON request payload.' });
        }
      });
      return;
    }

    sendJSON(res, 405, { success: false, error: 'Method not allowed.' });
    return;
  }

  // --------------------------------------------------------------------------
  // STATIC ASSETS & SPA ROUTING
  // --------------------------------------------------------------------------
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const filePath = path.join(dir, pathname);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // If requesting a static file with an extension that does not exist, return 404
      if (path.extname(pathname) !== '') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }

      // If route without extension (e.g. /services, /portfolio), serve index.html (SPA Fallback)
      fs.readFile(path.join(dir, 'index.html'), (readErr, fallbackHtml) => {
        if (readErr) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('500 Internal Server Error');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, must-revalidate',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'SAMEORIGIN'
        });
        res.end(fallbackHtml);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Caching Policy
    let cacheControl = 'public, max-age=86400'; // 1 day for assets
    if (ext === '.html') {
      cacheControl = 'no-cache, must-revalidate'; // Always fresh HTML
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Elegant Era Studio Server running on http://0.0.0.0:${PORT}`);
});
