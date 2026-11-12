/* POST /api/admin  {key, action, questions?}
   action: get | save | defaults
   Usado pela página /admin.html para ler, salvar e restaurar as perguntas. */
const { redis, parseQ, sanitize, K, MAX_Q, getBody, hostOK, fail } = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    const { key, action, questions: list } = getBody(req);
    if (!process.env.HOST_KEY) return res.status(500).json({ error: 'HOST_KEY não está definida na Vercel (veja o README).' });
    if (!hostOK(key)) return res.status(401).json({ error: 'Chave do apresentador incorreta.' });

    if (action === 'get') {
      const [raw] = await redis([['GET', K.questions]]);
      return res.status(200).json({ questions: parseQ(raw), custom: !!raw, max: MAX_Q });
    }

    if (action === 'save' || action === 'defaults') {
      /* não deixa mexer nas perguntas com o quiz rolando */
      const [phase] = await redis([['HGET', K.game, 'phase']]);
      if (phase && phase !== 'lobby' && phase !== 'end') {
        return res.status(409).json({ error: 'O quiz está em andamento. Clique em "Reiniciar" no telão antes de editar as perguntas.' });
      }
      if (action === 'save') {
        const r = sanitize(list);
        if (r.error) return res.status(400).json({ error: r.error });
        await redis([['SET', K.questions, JSON.stringify(r.questions)]]);
        return res.status(200).json({ ok: true, count: r.questions.length });
      }
      await redis([['DEL', K.questions]]);
      return res.status(200).json({ ok: true });
    }
    res.status(400).json({ error: 'Ação desconhecida.' });
  } catch (e) { fail(res, e); }
};
