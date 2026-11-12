/* Utilidades compartilhadas (arquivos que começam com "_" não viram rota na Vercel). */
const defaults = require('./_questions');

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
  game: 'vq:game',            // hash: phase, q, t0
  players: 'vq:players',      // hash: id → nome
  score: 'vq:score',          // hash: id → pontos
  ans: q => `vq:ans:${q}`,    // hash: id → "alternativa:ms"
  questions: 'vq:questions',  // texto JSON com as perguntas editadas no /admin.html
};
const MAX_Q = 50;

/* Valida e limpa uma lista de perguntas. Devolve {questions} ou {error} */
function sanitize(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_Q) return { error: `Use de 1 a ${MAX_Q} perguntas.` };
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const x = list[i] || {}, n = i + 1;
    const t = String(x.t || '').trim();
    if (!t) return { error: `Pergunta ${n}: falta o enunciado.` };
    if (t.length > 300) return { error: `Pergunta ${n}: o enunciado passa de 300 caracteres.` };
    const o = Array.isArray(x.o) ? x.o.map(s => String(s == null ? '' : s).trim()) : [];
    if (o.length !== 4 || o.some(s => !s)) return { error: `Pergunta ${n}: preencha as 4 alternativas.` };
    if (o.some(s => s.length > 150)) return { error: `Pergunta ${n}: alternativa com mais de 150 caracteres.` };
    const c = Number(x.c);
    if (!Number.isInteger(c) || c < 0 || c > 3) return { error: `Pergunta ${n}: marque qual alternativa é a correta.` };
    const time = Math.round(Number(x.time) || 20);
    if (time < 5 || time > 120) return { error: `Pergunta ${n}: o tempo deve ficar entre 5 e 120 segundos.` };
    const e = String(x.e || '').trim().slice(0, 400);
    out.push({ t, o, c, time, e });
  }
  return { questions: out };
}

/* Perguntas salvas no banco; se não houver (ou estiverem inválidas), usa as padrão */
function parseQ(raw) {
  if (!raw) return defaults;
  try { const r = sanitize(JSON.parse(raw)); if (r.questions) return r.questions; } catch (e) { /* cai no padrão */ }
  return defaults;
}

/* Roda comandos e, na mesma ida ao banco, já traz as perguntas atuais */
async function run(cmds) {
  const out = await redis([['GET', K.questions], ...cmds]);
  return { questions: parseQ(out[0]), res: out.slice(1) };
}

/* Fase "efetiva": se o tempo da pergunta acabou, vale como "reveal" mesmo sem o apresentador clicar */
function effective(g, now, questions) {
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

module.exports = { redis, run, toObj, K, MAX_Q, sanitize, parseQ, effective, points, getBody, hostOK, fail };
