/* POST /api/join  {name}  →  {id, name} */
const { redis, K, getBody, fail } = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    const name = String(getBody(req).name || '').replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!name) return res.status(400).json({ error: 'Digite um nome.' });
    const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
    await redis([['HSET', K.players, id, name], ['HSET', K.score, id, '0']]);
    res.status(200).json({ id, name });
  } catch (e) { fail(res, e); }
};
