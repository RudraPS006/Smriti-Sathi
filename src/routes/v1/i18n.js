// Talks to the separate language microservice (i18n-service/), built with the
// raw http module. If that service is down, fall back to reading the JSON file
// directly — the monolith keeps working.
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const config = require('../../config');
const HttpError = require('../../middleware/httpError');

const router = express.Router();
const LOCALES = path.join(__dirname, '..', '..', '..', 'i18n-service', 'locales');

router.get('/:lang', async (req, res) => {
  const lang = req.params.lang;
  if (!config.languages.includes(lang)) throw new HttpError(404, 'Language not supported');
  req.session.language = lang; // express-session remembers it even before login

  try {
    const r = await fetch(`${config.i18nServiceUrl}/locales/${lang}`, { signal: AbortSignal.timeout(800) });
    if (!r.ok) throw new Error(`status ${r.status}`);
    res.set('X-Served-By', 'i18n-service');
    return res.json(await r.json());
  } catch {
    const json = JSON.parse(await fs.readFile(path.join(LOCALES, `${lang}.json`), 'utf8'));
    res.set('X-Served-By', 'monolith-fallback');
    res.json(json);
  }
});

module.exports = router;
