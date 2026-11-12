# Quiz ao vivo · Vigotski

Quiz estilo Kahoot para o seminário: a turma entra pelo celular (QR code), o apresentador
controla tudo pelo **telão** e o ranking aparece na tela.

```
public/index.html   → o que aparece no celular dos alunos
public/host.html    → telão do apresentador (QR code, perguntas, placar)
api/                → servidor (funções da Vercel) + perguntas em api/_questions.js
```

## Como colocar no ar (uma vez só, uns 10 minutos)

1. **Conta na Vercel** (vercel.com, pode entrar com o GitHub). É gratuita.
2. **Suba esta pasta**. Duas opções:
   - *Pelo GitHub:* crie um repositório, envie os arquivos desta pasta e, na Vercel, clique em
     **Add New → Project → Import** e escolha o repositório. Deixe tudo como está e clique **Deploy**.
   - *Pelo terminal:* dentro desta pasta, rode `npx vercel` e responda os passos (aceite os padrões).
3. **Crie o banco** (guarda jogadores e pontos): no projeto, aba **Storage → Create / Browse Marketplace →
   Upstash → Redis** (plano gratuito) e **conecte ao projeto**. A Vercel cria as variáveis de ambiente
   sozinha (`KV_REST_API_URL` e `KV_REST_API_TOKEN`, ou `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`).
   O código aceita qualquer um desses nomes.
4. **Crie a chave do apresentador**: em **Settings → Environment Variables**, adicione
   `HOST_KEY` com uma senha só de vocês (ex.: `vigotski2026`).
5. **Faça um novo deploy** (aba Deployments → ⋯ → Redeploy) para as variáveis valerem.

Pronto. Seu endereço será algo como `https://quiz-vigotski.vercel.app`.

## No dia do seminário

1. Abra `https://SEU-ENDERECO.vercel.app/host.html` no computador ligado ao projetor e digite a `HOST_KEY`.
2. A turma aponta a câmera do celular para o QR code e digita o nome. Os nomes aparecem na tela.
3. Clique em **Iniciar quiz**. Depois use o botão principal (ou **Espaço / →**):
   *Mostrar resposta* → *Próxima pergunta* → … → *Ver resultado final*.
   Se o tempo da pergunta acabar, a resposta aparece sozinha.
4. Antes de apresentar de novo, clique em **↺ Reiniciar** para limpar jogadores e pontos.

**Dica:** faça um teste antes com 2 celulares. No painel do seminário (`vigotski_painel_interativo.html`),
coloque o endereço em `QUIZ_URL` para o slide do quiz mostrar o QR code.

## Editar as perguntas

Abra `api/_questions.js`. Cada pergunta tem enunciado (`t`), 4 alternativas (`o`), o número da correta
(`c`, começando do 0), o tempo em segundos (`time`) e a explicação (`e`). Depois de editar, faça um novo deploy.

## Como funciona (resumo)

- Os celulares e o telão consultam `/api/state` a cada ~2 s (sem WebSocket, por isso roda na Vercel gratuita).
- Pontos: de 500 a 1000 por acerto, conforme a rapidez. O servidor calcula tudo; o celular só recebe a
  alternativa correta depois que a pergunta fecha.
- Só a primeira resposta de cada pessoa vale.
- Limites do plano gratuito do Upstash: uma turma de ~30 pessoas num quiz de 10 minutos usa bem menos que o limite mensal.
