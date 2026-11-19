interface PagesContext {
  request: Request;
  env: {
    BACKEND_API_URL?: string;
  };
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const backendBase = (env.BACKEND_API_URL || '').replace(/\/+$/, '');

  if (!backendBase) {
    return new Response(
      JSON.stringify({
        error:
          'BACKEND_API_URL is not configured on Cloudflare Pages. Set BACKEND_API_URL (e.g. your Render backend URL) in Cloudflare Pages -> Settings -> Environment Variables.',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const incomingUrl = new URL(request.url);
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
