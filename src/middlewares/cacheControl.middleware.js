// src/middlewares/cacheControl.middleware.js
// Day 44 — HTTP caching headers for public, cacheable GET endpoints
// (/cars, /posts, /site-settings/contact). These responses are the same for
// every anonymous visitor, so a shared cache (CDN / nginx / browser) can serve
// them. We only set the header on successful GETs; anything else is left alone
// so we never accidentally cache an error or a mutation.
//
// `s-maxage` targets shared caches (CDN), `max-age` the browser, and
// `stale-while-revalidate` lets a cache serve slightly stale content while it
// refreshes in the background — smoothing traffic spikes on list endpoints.
export const publicCache =
  ({ maxAge = 60, sMaxAge = 300, staleWhileRevalidate = 60 } = {}) =>
  (req, res, next) => {
    if (req.method === 'GET') {
      res.set(
        'Cache-Control',
        `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`
      );
      // Vary on Accept-Encoding so a gzipped and identity copy aren't mixed up
      // by an intermediary cache.
      res.set('Vary', 'Accept-Encoding');
    }
    next();
  };
