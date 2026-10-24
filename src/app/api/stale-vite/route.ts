import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const asset = url.searchParams.get('asset') || 'generic';

  // Return a safe JavaScript module that clears stale Vite service workers and caches,
  // and reloads the true Supply Chain Sentinel application if the page is currently in a stale Vite root.
  const code = `
// Supply Chain Sentinel: Stale Vite asset interceptor (${asset})
if (typeof window !== 'undefined') {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for (var reg of registrations) {
        reg.unregister();
      }
    });
  }
  if ('caches' in window) {
    caches.keys().then(function(keys) {
      for (var key of keys) {
        caches.delete(key);
      }
    });
  }
  // If the browser loaded a cached Vite index.html with <div id="root"></div>, reload to Next.js
  if (document.getElementById('root') && !document.querySelector('.cyber-grid')) {
    console.warn('[Sentinel] Intercepted stale Vite dev server cache. Invalidating and reloading...');
    setTimeout(function() {
      window.location.replace('/');
    }, 50);
  }
}

export default {};
export const injectIntoGlobalHook = function() {};
export const createHotContext = function() {
  return {
    accept: function() {},
    prune: function() {},
    dispose: function() {},
    decline: function() {},
    invalidate: function() {},
    on: function() {},
    send: function() {}
  };
};
`;

  return new NextResponse(code, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
