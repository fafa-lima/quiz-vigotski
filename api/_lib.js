/* Utilidades compartilhadas (arquivos que começam com "_" não viram rota na Vercel). */
const questions = require('./_questions');

/* Aceita os nomes de variável tanto do Upstash quanto do antigo Vercel KV */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

/* Executa vários comandos Redis numa única requisição (pipeline) */
async function redis(cmds) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error('Banco não configurado: faltam as variáveis do Upstash/KV (veja o README).');
  }
  const r = await fetch(REDIS_URL.replace(/\/$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('Erro no banco: HTTP ' + r.status);
  const out = await r.json();
  return out.map(o => { if (o.error) throw new Error(o.error); return o.result; });
}

/* [k1, v1, k2, v2] → {k1: v1, k2: v2} */
const toObj = a => { const o = {}; for (let i = 0; i < (a || []).length; i += 2) o[a[i]] = a[i + 1]; return o; };

const K = {
  game: 'vq:game',        // hash: phase, q, t0
  players: 'vq:players',  // hash: id → nome
  score: 'vq:score',      // hash: id → pontos
  ans: q => `vq:ans:${q}` // hash: id → "alternativa:ms"
};

/* Fase "efetiva": se o tempo da pergunta acabou, vale como "reveal" mesmo sem o apresentador clicar */
function effective(g, now) {
  const phase = g.phase || 'lobby';
  if (phase === 'question') {
    const Q = questions[+g.q];
    if (Q && now > +g.t0 + Q.time * 1000) return 'reveal';
  }
  return phase;
}

/* 500 a 1000 pontos, conforme a rapidez */
const points = (ms, limitSec) => {
  const lim = limitSec * 1000;
  return Math.round(500 + 500 * (1 - Math.min(Math.max(ms, 0), lim) / lim));
};

const getBody = req => {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') { try { return JSON.parse(b); } catch (e) { return {}; } }
  return b;
};

const hostOK = key => !!process.env.HOST_KEY && key === process.env.HOST_KEY;

const fail = (res, e) => res.status(500).json({ error: e.message || 'Erro' });

module.exports = { redis, toObj, K, questions, effective, points, getBody, hostOK, fail };
