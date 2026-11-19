const crypto = require('crypto');
const { configured, redis, verify, cleanName, ipOf, send, readJson, topTen, KEY } = require('./_lb');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!configured()) return send(res, 503, { error: 'leaderboard not configured' });
  try {
    const body = await readJson(req);
    const ip = ipOf(req), minute = Math.floor(Date.now() / 60000);
    const rl = 'dmsy:rl:' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16) + ':' + minute;
    const [hits] = await redis([['INCR', rl], ['EXPIRE', rl, '70']]);
    if (hits > 5) return send(res, 429, { error: 'Too many scores. Try again in a minute.' });

    const run = verify(body.token);
    if (!run || typeof run.t !== 'number' || typeof run.n !== 'string') return send(res, 400, { error: 'Bad run token.' });
    const ms = Math.round(Number(body.ms));
    if (!Number.isFinite(ms) || ms < 8000 || ms > 3600000) return send(res, 400, { error: 'That time is out of range.' });
    const now = Date.now(), elapsed = now - run.t;
    if (elapsed > 2 * 3600000) return send(res, 400, { error: 'That run is too old.' });
    if (elapsed < ms - 2000) return send(res, 400, { error: 'That time doesn’t add up.' });

    // each run token counts once
    const [fresh] = await redis([['SET', 'dmsy:run:' + run.n, '1', 'NX', 'EX', '10800']]);
    if (fresh !== 'OK') return send(res, 409, { error: 'That run was already submitted.' });

    const name = cleanName(body.name);
    const id = crypto.randomBytes(6).toString('base64url');
    const member = JSON.stringify({ id, name, date: new Date(now).toISOString().slice(0, 10) });
    const [, rank] = await redis([['ZADD', KEY, String(ms), member], ['ZRANK', KEY, member], ['ZREMRANGEBYRANK', KEY, '2000', '-1']]);
    send(res, 200, { id, name, ms, rank: rank == null ? null : rank + 1, top: await topTen() });
  } catch (e) {
    send(res, 500, { error: 'Leaderboard unavailable.' });
  }
};
