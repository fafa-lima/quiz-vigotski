/* Controle remoto do painel de slides pelo celular.
   POST /api/remote  {code, cmd}              → celular manda comando (next, prev, reveal, index, theme, goto)
   POST /api/remote  {code, info:{...}}       → o painel informa em que slide está
   GET  /api/remote?code=ABC123&since=N       → painel/celular consultam (comando novo + info do slide)
   O "code" é gerado pelo painel; vale por 6 horas. Sem senha: o código aleatório é a chave. */
const { redis } = require('./_lib');

const TTL = 6 * 3600;
const CMDS = ['next', 'prev', 'reveal', 'index', 'theme', 'goto'];

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const src = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})) : (req.query || {});
    const code = String(src.code || '').toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(code)) return res.status(400).json({ error: 'Código inválido.' });
    const k = 'vq:rc:' + code;

    if (req.method === 'POST') {
      if (src.cmd !== undefined) {
        if (!CMDS.includes(src.cmd)) return res.status(400).json({ error: 'Comando inválido.' });
        const arg = Math.max(0, Math.min(999, parseInt(src.arg, 10) || 0));
        const out = await redis([['HINCRBY', k, 'seq', 1], ['HSET', k, 'cmd', src.cmd, 'arg', String(arg)], ['EXPIRE', k, TTL]]);
        return res.status(200).json({ ok: true, seq: out[0] });
      }
      if (src.info && typeof src.info === 'object') {
        const info = JSON.stringify({
          i: +src.info.i || 0, total: +src.info.total || 0,
          title: String(src.info.title || '').slice(0, 120), who: String(src.info.who || '').slice(0, 60),
          next: String(src.info.next || '').slice(0, 120),
        });
        await redis([['HSET', k, 'info', info, 'ping', String(Date.now())], ['EXPIRE', k, TTL]]);
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: 'Nada para fazer.' });
    }

    const out = await redis([['HGETALL', k]]);
    const a = out[0] || [], h = {};
    for (let i = 0; i < a.length; i += 2) h[a[i]] = a[i + 1];
    let info = null; try { info = h.info ? JSON.parse(h.info) : null; } catch (e) { /* ignora */ }
    return res.status(200).json({ seq: +h.seq || 0, cmd: h.cmd || null, arg: +h.arg || 0, info, ping: +h.ping || 0, now: Date.now() });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
};
