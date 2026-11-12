/* POST /api/host  {key, action}   action: start | reveal | next | reset
   Só o apresentador (que sabe a HOST_KEY) consegue chamar. */
const { redis, toObj, K, questions, getBody, hostOK, fail } = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    const { key, action } = getBody(req);
    if (!process.env.HOST_KEY) return res.status(500).json({ error: 'HOST_KEY não está definida na Vercel (veja o README).' });
    if (!hostOK(key)) return res.status(401).json({ error: 'Chave do apresentador incorreta.' });

    const now = String(Date.now());
    if (action === 'start') {
      await redis([['HSET', K.game, 'phase', 'question', 'q', '0', 't0', now]]);
    } else if (action === 'reveal') {
      await redis([['HSET', K.game, 'phase', 'reveal']]);
    } else if (action === 'next') {
      const [gRaw] = await redis([['HGETALL', K.game]]);
      const q = +toObj(gRaw).q;
      if (!(q >= 0) || q + 1 >= questions.length) {
        await redis([['HSET', K.game, 'phase', 'end']]);
      } else {
        await redis([['HSET', K.game, 'phase', 'question', 'q', String(q + 1), 't0', now]]);
      }
    } else if (action === 'reset') {
      await redis([
        ['DEL', K.game], ['DEL', K.players], ['DEL', K.score],
        ...questions.map((_, i) => ['DEL', K.ans(i)]),
      ]);
    } else {
      return res.status(400).json({ error: 'Ação desconhecida.' });
    }
    res.status(200).json({ ok: true });
  } catch (e) { fail(res, e); }
};
