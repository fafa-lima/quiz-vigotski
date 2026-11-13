/* Participação ao vivo da plateia: nuvem de palavras e ZDI.
   GET  /api/live?pid=<id>&cloud=<outraNuvem>   → atividade atual + dados (qualquer um pode ler)
   POST /api/live {action:'submit', pid, word}   → plateia envia uma palavra (máx. 3 por pessoa)
   POST /api/live {action:'zdi', pid}            → plateia: "resolvi!" (vale no nível de dica atual)
   POST /api/live {action:'set'|'hint'|'clear'|'remove'|'off', key, ...} → só o apresentador (HOST_KEY) */
const { redis, toObj, getBody, hostOK, fail } = require('./_lib');

const ACT = 'vq:live:act';
const kCloud = id => `vq:live:c:${id}`;
const kSubs = id => `vq:live:cs:${id}`;
const kZdi = (id, ch) => `vq:live:z:${id}:${ch}`;
const MAX_WORDS_PER_PERSON = 3;
const okId = s => /^[A-Za-z0-9_-]{1,40}$/.test(String(s || ''));
const okPid = s => /^[A-Za-z0-9]{6,40}$/.test(String(s || ''));

function cleanWord(w) {
  const s = String(w || '').toLowerCase().normalize('NFC')
    .replace(/[^\p{L}\p{N}\- ]/gu, ' ').replace(/\s+/g, ' ').trim();
  return s.length >= 2 && s.length <= 24 ? s : '';
}
const topWords = raw => {
  const o = toObj(raw);
  return Object.keys(o).map(w => ({ w, n: +o[w] || 0 })).sort((a, b) => b.n - a.n || a.w.localeCompare(b.w)).slice(0, 70);
};

module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();

    if (req.method === 'POST') {
      const b = getBody(req);
      const { action } = b;

      /* ---- plateia ---- */
      if (action === 'submit' || action === 'zdi') {
        if (!okPid(b.pid)) return res.status(400).json({ error: 'Identificação inválida.' });
        const a = toObj((await redis([['HGETALL', ACT]]))[0]);
        if (action === 'submit') {
          if (a.type !== 'cloud') return res.status(200).json({ ok: false, closed: true });
          const w = cleanWord(b.word);
          if (!w) return res.status(400).json({ error: 'Escreva uma palavra (2 a 24 letras).' });
          const [n] = await redis([['HINCRBY', kSubs(a.id), b.pid, 1]]);
          if (n > MAX_WORDS_PER_PERSON) {
            await redis([['HINCRBY', kSubs(a.id), b.pid, -1]]);
            return res.status(200).json({ ok: false, full: true });
          }
          await redis([['HINCRBY', kCloud(a.id), w, 1], ['EXPIRE', kCloud(a.id), 86400], ['EXPIRE', kSubs(a.id), 86400]]);
          return res.status(200).json({ ok: true, left: MAX_WORDS_PER_PERSON - n });
        }
        if (a.type !== 'zdi') return res.status(200).json({ ok: false, closed: true });
        const lvl = Math.max(0, Math.min(3, +a.hint || 0));
        const key = kZdi(a.id, a.ch || 0);
        const [added] = await redis([['HSETNX', key, b.pid, String(lvl)]]);
        await redis([['EXPIRE', key, 86400]]);
        return res.status(200).json({ ok: true, dup: added !== 1, lvl });
      }

      /* ---- apresentador ---- */
      if (!process.env.HOST_KEY) return res.status(500).json({ error: 'HOST_KEY não está definida na Vercel.' });
      if (!hostOK(b.key)) return res.status(401).json({ error: 'Chave do apresentador incorreta.' });

      if (action === 'set') {
        const type = b.type === 'zdi' ? 'zdi' : 'cloud';
        if (!okId(b.id)) return res.status(400).json({ error: 'id inválido' });
        await redis([['DEL', ACT], ['HSET', ACT, 'type', type, 'id', b.id, 'prompt', String(b.prompt || '').slice(0, 200),
          'ch', String(+b.ch || 0), 'hint', String(Math.max(0, Math.min(3, +b.hint || 0))), 'ts', String(Date.now())]]);
        return res.status(200).json({ ok: true });
      }
      if (action === 'hint') {
        await redis([['HSET', ACT, 'hint', String(Math.max(0, Math.min(3, +b.hint || 0)))]]);
        return res.status(200).json({ ok: true });
      }
      if (action === 'off') { await redis([['DEL', ACT]]); return res.status(200).json({ ok: true }); }
      if (action === 'clear') {
        if (!okId(b.id)) return res.status(400).json({ error: 'id inválido' });
        await redis([['DEL', kCloud(b.id)], ['DEL', kSubs(b.id)], ...[0, 1, 2, 3, 4, 5, 6, 7].map(c => ['DEL', kZdi(b.id, c)])]);
        return res.status(200).json({ ok: true });
      }
      if (action === 'remove') {
        if (!okId(b.id)) return res.status(400).json({ error: 'id inválido' });
        await redis([['HDEL', kCloud(b.id), String(b.word || '')]]);
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: 'Ação desconhecida.' });
    }

    /* ---- leitura ---- */
    const { pid, cloud, ch } = req.query || {};
    const a = toObj((await redis([['HGETALL', ACT]]))[0]);
    const out = { act: a.type ? { type: a.type, id: a.id, prompt: a.prompt || '', ch: +a.ch || 0, hint: +a.hint || 0 } : null, now: Date.now() };
    const cmds = [], tags = [];
    const add = (t, c) => { tags.push(t); cmds.push(c); };
    if (a.type === 'cloud') {
      add('words', ['HGETALL', kCloud(a.id)]);
      add('people', ['HLEN', kSubs(a.id)]);
      if (okPid(pid)) add('mine', ['HGET', kSubs(a.id), pid]);
    }
    if (a.type === 'zdi') {
      add('zdi', ['HVALS', kZdi(a.id, a.ch || 0)]);
      if (okPid(pid)) add('zmine', ['HGET', kZdi(a.id, a.ch || 0), pid]);
    }
    if (okId(cloud)) add('other', ['HGETALL', kCloud(cloud)]);
    const r = {};
    if (cmds.length) (await redis(cmds)).forEach((v, i) => { r[tags[i]] = v; });
    if (r.words !== undefined) { out.words = topWords(r.words); out.people = +r.people || 0; out.mine = +r.mine || 0; }
    if (r.zdi !== undefined) {
      const c = [0, 0, 0, 0];
      (r.zdi || []).forEach(v => { const l = +v; if (l >= 0 && l < 4) c[l]++; });
      out.zdi = c; out.zmine = r.zmine === null || r.zmine === undefined ? null : +r.zmine;
    }
    if (r.other !== undefined) out.other = topWords(r.other);
    res.status(200).json(out);
  } catch (e) { fail(res, e); }
};
