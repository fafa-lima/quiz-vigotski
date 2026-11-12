/* GET /api/state?id=<jogador>&key=<chave do apresentador>
   Todos os celulares e o telão consultam isto a cada ~2 s. */
const { redis, run, toObj, K, effective, points, hostOK, fail } = require('./_lib');

module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const now = Date.now();
    const { id, key } = req.query || {};
    const isHost = hostOK(key);

    const { questions, res: [gRaw, nPlayers] } = await run([['HGETALL', K.game], ['HLEN', K.players]]);
    const g = toObj(gRaw);
    const phase = effective(g, now, questions);
    const q = g.q !== undefined ? +g.q : -1;
    const Q = questions[q];

    const out = { phase, q, total: questions.length, now, t0: +g.t0 || 0, nPlayers, host: isHost };
    if (Q && (phase === 'question' || phase === 'reveal')) {
      out.question = { n: q + 1, text: Q.t, options: Q.o, limit: Q.time };
    }

    /* comandos extras, montados conforme o que a fase precisa */
    const cmds = [], tags = [];
    const add = (tag, cmd) => { tags.push(tag); cmds.push(cmd); };
    if (id) {
      add('name', ['HGET', K.players, id]);
      add('score', ['HGET', K.score, id]);
      if (Q) add('mine', ['HGET', K.ans(q), id]);
    }
    if (isHost && phase === 'question') add('answered', ['HLEN', K.ans(q)]);
    if (isHost && phase === 'lobby') add('lobbyNames', ['HVALS', K.players]);
    if (phase === 'reveal') add('dist', ['HVALS', K.ans(q)]);
    if (phase === 'reveal' || phase === 'end') {
      add('scores', ['HGETALL', K.score]);
      add('names', ['HGETALL', K.players]);
    }
    const resArr = cmds.length ? await redis(cmds) : [];
    const r = {};
    tags.forEach((t, i) => { r[t] = resArr[i]; });

    if (phase === 'reveal' && Q) {
      out.correct = Q.c;
      out.explanation = Q.e;
      const dist = [0, 0, 0, 0];
      (r.dist || []).forEach(v => { const c = +String(v).split(':')[0]; if (c >= 0 && c < 4) dist[c]++; });
      out.dist = dist;
    }

    let board = [];
    if (r.scores) {
      const sc = toObj(r.scores), nm = toObj(r.names);
      board = Object.keys(sc)
        .map(pid => ({ id: pid, name: nm[pid] || '?', score: +sc[pid] || 0 }))
        .sort((a, b) => b.score - a.score);
      out.board = board.slice(0, phase === 'end' ? 10 : 5).map(({ name, score }) => ({ name, score }));
    }

    if (id) {
      if (r.name === null || r.name === undefined) {
        out.you = null; /* sessão perdida (jogo reiniciado) */
      } else {
        const you = { name: r.name, score: +r.score || 0, answered: !!r.mine };
        if (r.mine) {
          const [c, ms] = String(r.mine).split(':').map(Number);
          you.choice = c;
          if (phase === 'reveal' && Q) {
            you.correct = c === Q.c;
            you.gained = you.correct ? points(ms, Q.time) : 0;
          }
        }
        if (board.length) {
          you.rank = board.findIndex(b => b.id === id) + 1;
          you.of = board.length;
        }
        out.you = you;
      }
    }

    if (isHost) {
      if (r.answered !== undefined) out.answered = r.answered;
      if (r.lobbyNames) out.names = r.lobbyNames.slice(0, 80);
    }
    res.status(200).json(out);
  } catch (e) { fail(res, e); }
};
