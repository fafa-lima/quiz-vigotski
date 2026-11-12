/* POST /api/answer  {id, choice}
   Só a primeira resposta de cada jogador vale. A pontuação é calculada aqui,
   no servidor (o celular nunca recebe a alternativa correta antes da hora). */
const { redis, run, toObj, K, points, getBody, fail } = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    const { id, choice } = getBody(req);
    const c = Number(choice);
    if (!id || !Number.isInteger(c) || c < 0 || c > 3) return res.status(400).json({ error: 'Resposta inválida.' });

    const now = Date.now();
    const { questions, res: [gRaw, isPlayer] } = await run([['HGETALL', K.game], ['HEXISTS', K.players, id]]);
    if (!isPlayer) return res.status(404).json({ error: 'Jogador não encontrado. Entre de novo.' });

    const g = toObj(gRaw);
    const Q = questions[+g.q];
    /* 1,5 s de tolerância para a latência da rede */
    if (g.phase !== 'question' || !Q || now > +g.t0 + Q.time * 1000 + 1500) {
      return res.status(200).json({ ok: false, late: true });
    }
    const ms = Math.max(0, now - +g.t0);
    const [added] = await redis([['HSETNX', K.ans(+g.q), id, `${c}:${ms}`]]);
    if (added === 1 && c === Q.c) {
      await redis([['HINCRBY', K.score, id, String(points(ms, Q.time))]]);
    }
    res.status(200).json({ ok: true, dup: added !== 1 });
  } catch (e) { fail(res, e); }
};
