const { configured, send, topTen } = require('./_lb');
module.exports = async (req, res) => {
  if (!configured()) return send(res, 503, { error: 'leaderboard not configured' });
  try {
    send(res, 200, { top: await topTen() }, { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' });
  } catch (e) { send(res, 500, { error: 'Leaderboard unavailable.' }); }
};
