// Shared helpers for the leaderboard API: Upstash Redis over REST (no dependencies) and signed run tokens.
const crypto = require('crypto');

const URL_ = process.env.LB_KV_REST_API_URL || process.env.LB_REST_API_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.LB_KV_REST_API_TOKEN || process.env.LB_REST_API_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'dmsy:lb';

function configured() { return !!(URL_ && TOKEN); }

// run one or more Redis commands in a single round trip
async function redis(cmds) {
  const r = await fetch(URL_.replace(/\/$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  const out = await r.json();
  return out.map(x => { if (x.error) throw new Error(x.error); return x.result; });
}

// the signing key lives only on the server: an explicit secret if one is set, otherwise derived from the database token
function secret() {
  return process.env.LEADERBOARD_SECRET || crypto.createHash('sha256').update('dmsy-run|' + TOKEN).digest();
}
const b64 = buf => Buffer.from(buf).toString('base64url');
function sign(payload) {
  const body = b64(JSON.stringify(payload));
  const sig = b64(crypto.createHmac('sha256', secret()).update(body).digest());
  return body + '.' + sig;
}
function verify(token) {
  if (typeof token !== 'string' || token.length > 300) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = b64(crypto.createHmac('sha256', secret()).update(body).digest());
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch (e) { return null; }
}

const BLOCK = ['fuck', 'shit', 'cunt', 'nigg', 'fag', 'retard', 'rapist', 'bitch', 'whore', 'slut', 'nazi', 'hitler', 'kys', 'penis', 'vagina', 'porn', 'pussy', 'asshole'];
function cleanName(raw) {
  let n = String(raw || '')
    .replace(/<[^>]*>/g, ' ')                                  // html tags
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ')              // links
    .replace(/\b[\w-]+\.(?:com|net|org|io|xyz|app|dev|gg|co|ly|me|ru|tv)\b\S*/gi, ' ')
    .replace(/[<>"'`\\{}]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ').trim();
  n = Array.from(n).slice(0, 18).join('').trim();
  const flat = n.toLowerCase().replace(/[^a-z]/g, '').replace(/0/g, 'o');
  if (!n || BLOCK.some(w => flat.includes(w))) n = 'Anonymous barber';
  return n;
}

function ipOf(req) {
  return String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}
function send(res, status, obj, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(obj));
}
async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 4096) break; chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch (e) { return {}; }
}
async function topTen() {
  const [rows] = await redis([['ZRANGE', KEY, '0', '9', 'WITHSCORES']]);
  const out = [];
  for (let i = 0; i < rows.length; i += 2) {
    let m = {}; try { m = JSON.parse(rows[i]); } catch (e) {}
    out.push({ id: m.id, name: m.name || 'Barber', ms: Number(rows[i + 1]), date: m.date });
  }
  return out;
}
module.exports = { configured, redis, sign, verify, cleanName, ipOf, send, readJson, topTen, KEY };
