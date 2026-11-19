let cachedApp = null;

module.exports = function handler(req, res) {
  try {
    if (!cachedApp) {
      const { createApiApp } = require('./_server.cjs');
      cachedApp = createApiApp();
    }
    return cachedApp(req, res);
  } catch (err) {
    console.error('Vercel API handler error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
    }
    res.end(
      JSON.stringify({
        error: err && err.message ? err.message : 'Internal server error',
      })
    );
  }
};
