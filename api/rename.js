// Rename your own leaderboard entry. The edit pass comes from /api/score for that run and lasts two hours.
const crypto = require('crypto');
const { configured, redis, verify, cleanName, ipOf, send, readJson, topTen, KEY } = require('./_lb');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!configured()) return send(res, 503, { error: 'leaderboard not configured' });
  try {
    const body = await readJson(req);
    const ip = ipOf(req), minute = Math.floor(Date.now() / 60000);
    const rl = 'dmsy:rr:' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16) + ':' + minute;
    const [hits] = await redis([['INCR', rl], ['EXPIRE', rl, '70']]);
    if (hits > 20) return send(res, 429, { error: 'Slow down a little.' });

    const pass = verify(body.edit);
    if (!pass || typeof pass.id !== 'string' || typeof pass.x !== 'number') return send(res, 400, { error: 'Bad edit pass.' });
    if (Date.now() > pass.x) return send(res, 410, { error: 'Too late to rename that run.' });
    const ref = 'dmsy:m:' + pass.id;
    const [old] = await redis([['GET', ref]]);
    if (!old) return send(res, 410, { error: 'That run is no longer on the board.' });
    const [score] = await redis([['ZSCORE', KEY, old]]);
    if (score == null) return send(res, 410, { error: 'That run is no longer on the board.' });

    let m = {}; try { m = JSON.parse(old); } catch (e) {}
    const name = cleanName(body.name);
    const member = JSON.stringify({ id: pass.id, name, date: m.date });
    if (member !== old) {
      await redis([['ZREM', KEY, old], ['ZADD', KEY, String(score), member], ['SET', ref, member, 'KEEPTTL']]);
    }
    const [rank] = await redis([['ZRANK', KEY, member]]);
    send(res, 200, { id: pass.id, name, ms: Number(score), rank: rank == null ? null : rank + 1, top: await topTen() });
  } catch (e) {
    send(res, 500, { error: 'Leaderboard unavailable.' });
  }
};
