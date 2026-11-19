// QuickCart — /sitemap.xml and /robots.txt, built from the address the visitor used (or APP_URL), so nothing to edit when you change domain.
module.exports = (req, res) => {
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const base = (process.env.APP_URL || (host ? proto + '://' + host : '')).replace(/\/+$/, '');
  const f = (req.query && req.query.f) || 'robots';
  res.setHeader('Cache-Control', 'public, max-age=3600');
  if (f === 'sitemap') {
    const pages = [['/', '1.0'], ['/features', '0.9'], ['/demo', '0.8'], ['/how-it-works', '0.8'], ['/pricing', '0.9'], ['/faq', '0.7'], ['/contact', '0.6'], ['/terms', '0.3'], ['/privacy', '0.3']];
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + pages.map((p) => `  <url><loc>${base}${p[0]}</loc><priority>${p[1]}</priority></url>`).join('\n') + '\n</urlset>\n');
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(200).send(`User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /admin\nDisallow: /pos\nDisallow: /payment\nDisallow: /api/\n${base ? 'Sitemap: ' + base + '/sitemap.xml\n' : ''}`);
};
