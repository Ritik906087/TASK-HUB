interface WorkerEnv {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  BACKEND_API_URL?: string;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const incomingUrl = new URL(request.url);

    if (incomingUrl.pathname.startsWith('/api/')) {
      const backendBase = (env.BACKEND_API_URL || '').replace(/\/+$/, '');

      if (!backendBase) {
        return new Response(
          JSON.stringify({
            error:
              'BACKEND_API_URL is not configured. Set BACKEND_API_URL (e.g. your Render backend URL) in Cloudflare Worker -> Settings -> Variables and Secrets.',
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const targetUrl = `${backendBase}${incomingUrl.pathname}${incomingUrl.search}`;
      const forwardedHeaders = new Headers(request.headers);
      forwardedHeaders.delete('host');

      const init: RequestInit = {
        method: request.method,
        headers: forwardedHeaders,
        redirect: 'manual',
      };

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = await request.arrayBuffer();
      }

      return fetch(targetUrl, init);
    }

    return env.ASSETS.fetch(request);
  },
};
