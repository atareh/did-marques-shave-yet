const crypto = require('crypto');
const { configured, sign, send } = require('./_lb');
// hands the browser a signed note of when its run began; the score has to be at least that old
module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!configured()) return send(res, 503, { error: 'leaderboard not configured' });
  send(res, 200, { token: sign({ t: Date.now(), n: crypto.randomBytes(9).toString('base64url') }) });
};
