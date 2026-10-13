// Trust boundary for user-made (custom/edited) plan subjects: whitelist keys, type + size limits.
const MAX_CUSTOMS = 100;
const KEY_RE = /^[A-Za-z0-9_-]{1,40}$/;
const STR = { code: 32, name_th: 255, name_en: 255, credit: 32, time: 500, note: 255, lecturer: 255 };
const INT = ['year', 'semester', 'sec'];

// returns { ok: true, row: {custom_key, source_code, source_sec, data} } | { ok: false, msg }
function sanitizeCustomSubject(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return { ok: false, msg: 'custom subject must be an object' };
  if (typeof s.custom_id !== 'string' || !KEY_RE.test(s.custom_id)) return { ok: false, msg: 'invalid custom_id' };
  const data = {};
  for (const [k, max] of Object.entries(STR)) {
    if (s[k] == null) continue;
    if (typeof s[k] !== 'string' || s[k].length > max) return { ok: false, msg: `invalid ${k}` };
    data[k] = s[k];
  }
  for (const k of INT) {
    if (s[k] == null) continue;
    const n = Number(s[k]);
    if (!Number.isInteger(n) || n < 0 || n > 100000) return { ok: false, msg: `invalid ${k}` };
    data[k] = n;
  }
  if (!data.code || data.sec == null || !data.time) return { ok: false, msg: 'code, sec and time are required' };
  if (s.mute_alert != null) data.mute_alert = s.mute_alert === true;
  let source_code = null, source_sec = null;
  if (s.source_code != null) {
    if (typeof s.source_code !== 'string' || s.source_code.length > 32) return { ok: false, msg: 'invalid source_code' };
    source_code = s.source_code;
    const n = Number(s.source_sec);
    source_sec = Number.isInteger(n) && n >= 0 && n <= 100000 ? n : null;
  }
  return { ok: true, row: { custom_key: s.custom_id, source_code, source_sec, data } };
}

module.exports = { sanitizeCustomSubject, MAX_CUSTOMS };
