# Leitor com personalidade

App web que lê textos com vozes naturais. Você define **quem lê** (sexo da voz, idade, entonação, ritmo e intensidade) e marca **como cada trecho deve ser dito** com tags no próprio texto. O botão **Sugerir voz e marcações** analisa o texto e propõe tudo isso para você aprovar.

- **Frontend:** TypeScript puro (sem framework) com Vite
- **Backend:** Cloudflare Worker em TypeScript, que guarda as chaves das APIs e serve o site
- **Motores de voz:** OpenAI, ElevenLabs, Google Gemini e a voz do navegador (grátis, para testes)

## Publicar pelo GitHub (sem linha de comando)

O projeto é publicado pelo **Workers Builds** da Cloudflare: você conecta o repositório do GitHub ao Worker uma vez, e a cada push na branch principal a Cloudflare instala as dependências, roda os testes, gera o site e publica. Você não precisa rodar `wrangler` no seu computador.

### 1. Colocar o projeto no GitHub

Crie um repositório (pode ser privado) e envie os arquivos desta pasta. Dois jeitos sem terminal:

- **Pelo site do GitHub:** no repositório novo, **Add file → Upload files**, arraste o conteúdo da pasta e confirme o commit. Não envie `node_modules/`, `dist/` nem `.wrangler/`, se existirem.
- **Pelo GitHub Desktop:** a pasta já é um repositório Git com o primeiro commit. Use **File → Add local repository** e depois **Publish repository**.

Os arquivos que começam com ponto (`.gitignore`, `.node-version`, `.dev.vars.example`) ficam ocultos em alguns sistemas e podem não ir no arrastar. Não tem problema: o deploy funciona sem eles.

### 2. Conectar o repositório na Cloudflare

1. No painel da Cloudflare, abra **Workers & Pages → Create → Import a repository**.
2. Autorize o GitHub (só na primeira vez) e escolha o repositório.
3. Confira os campos:

| Campo | Valor |
|---|---|
| Project name | `leitor-voz` (precisa ser igual ao `name` do `wrangler.jsonc`) |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | deixe vazio (ou o nome da pasta, se o projeto estiver dentro de outra) |

4. Clique em **Deploy**. O primeiro build leva um ou dois minutos.

Se o Worker `leitor-voz` já existir, conecte por **Worker → Settings → Builds → Connect**.

### 3. Cadastrar as chaves

Em **Worker → Settings → Variables and Secrets → Add**, crie cada chave com o tipo **Secret**:

| Nome | Para que serve |
|---|---|
| `OPENAI_API_KEY` | Vozes da OpenAI e análise por IA (platform.openai.com → API keys) |
| `ELEVENLABS_API_KEY` | Vozes da ElevenLabs (elevenlabs.io → Developers → API keys) |
| `GEMINI_API_KEY` | Vozes do Gemini e análise por IA (aistudio.google.com → Get API key) |
| `ACCESS_CODE` | Código que o app pede antes de gerar voz. **Recomendado**, para estranhos não gastarem seus créditos |

Todas são opcionais: sem nenhuma, o app funciona com a voz do navegador e a análise rápida. As chaves valem assim que são salvas e continuam lá nos próximos deploys.

### 4. Atualizar

Qualquer commit na branch principal (inclusive editando um arquivo direto no site do GitHub) gera um novo deploy. Se o build falhar, por exemplo num teste quebrado, a versão anterior continua no ar e o erro aparece em **Worker → Deployments**. Commits em outras branches geram versões de prévia, sem trocar a que está no ar.

Os modelos de voz e de análise ficam em `wrangler.jsonc` (`OPENAI_TTS_MODEL`, `ELEVENLABS_MODEL`, `GEMINI_TTS_MODEL`, `OPENAI_ANALISE_MODEL`, `GEMINI_ANALISE_MODEL`). Para trocar, edite esse arquivo no GitHub.

## Rodar no seu computador (opcional)

Só é preciso para desenvolver. Requisitos: Node.js 22.

```bash
npm install
cp .dev.vars.example .dev.vars   # preencha as chaves dos motores que for usar
npm run dev                      # abre em http://localhost:5173
```

## Perfil da voz

| Opção | Valores | Como é usado |
|---|---|---|
| Sexo da voz | Feminina, Masculina, Neutra | Escolhe a voz automaticamente e entra na instrução |
| Idade | Criança, Jovem, Adulta, Madura, Idosa | Escolhe a voz automaticamente e entra na instrução |
| Entonação | Conversa, Narração, Didática, Locução, Acolhedora, Dramática, Jornalística, Lúdica | Instrução (OpenAI/Gemini) ou tags de áudio (ElevenLabs) |
| Ritmo | 1 (bem lento) a 5 (rápido) | Instrução e velocidade |
| Intensidade | Contida, Moderada, Vibrante | Instrução e tom |

Com **Escolher a voz automaticamente** ligado, o app troca a voz sempre que você muda sexo ou idade, usando o perfil de cada voz (fixo para OpenAI e Gemini, vindo da sua conta na ElevenLabs, deduzido pelo nome no navegador). Os motores raramente têm vozes infantis de verdade: em "Criança", a idade vai como instrução e a voz escolhida é a mais próxima.

## Sugestão por análise do texto

O botão **Sugerir voz e marcações** lê o texto e propõe:

- o tipo de texto (aula, história infantil, notícia, anúncio, meditação, poema, narrativa…);
- sexo e idade de quem narra, **só quando o próprio texto dá pistas** (ex.: "estou cansada", "meus netos"); sem pista, mantém o que está;
- entonação, ritmo e intensidade, com os motivos de cada escolha;
- as marcações de emoção frase a frase.

Você marca o que quer aplicar, pode criar uma nova persona com a sugestão e pode desfazer as marcações aplicadas.

- **Com IA** (OpenAI `gpt-5.4-mini` ou Gemini `gemini-3.8-flash`, configuráveis em `wrangler.jsonc`): entende contexto e ironia. O Worker confere que a IA não mudou nenhuma palavra; se mudou, as marcações são descartadas. Textos acima de 8.000 caracteres: a IA analisa o início e as marcações vêm da análise rápida.
- **Análise rápida** (sem IA, no navegador): regras de vocabulário e pontuação. Funciona offline e é a reserva se a IA falhar.

## Marcações no texto

Escreva tags entre colchetes ou use os botões acima do editor. Com um trecho selecionado, o botão de estilo envolve o trecho e fecha com `[normal]`.

**Estilos** valem até a próxima marcação ou até `[normal]`:
`[animado]` `[calmo]` `[sério]` `[triste]` `[sussurrando]` `[gritando]` `[curioso]` `[misterioso]` `[sarcástico]` `[contagem]`

**Efeitos pontuais:**
`[risada]` `[suspiro]` `[pausa]` `[pausa longa]` `[tosse]` `[surpresa]`

**Estilo livre:** qualquer outra palavra entre colchetes vira instrução, por exemplo `[voz de locutor de rádio]`. Na ElevenLabs ela é repassada como está, então tags em inglês da própria ElevenLabs (`[British accent]`, `[mischievously]`) também funcionam.

Acentos e maiúsculas não importam: `[SÉRIO]` e `[serio]` são a mesma tag.

## Como cada motor usa a persona

| | Personalidade | Marcações de estilo | Efeitos pontuais |
|---|---|---|---|
| **OpenAI** | Vai como instrução em linguagem natural | Cada trecho é gerado com a própria instrução, e os áudios são unidos | Só pausas (risada etc. são ignoradas) |
| **ElevenLabs** | Vem da voz escolhida + tags de base | Viram tags de áudio em inglês dentro do texto | Todos |
| **Gemini** | Vai como estilo de cada trecho | Cada trecho recebe seu próprio estilo, num pedido só | Todos |
| **Navegador** | Só ritmo e energia (velocidade e tom) | Ajustam velocidade, tom e volume | Só pausas |

## Detalhes técnicos

- Todos os motores devolvem PCM 16-bit, 24 kHz, mono. O Worker junta os pedaços e entrega um WAV.
- Textos longos são divididos em fins de frase, respeitando o limite de cada motor. Os blocos são gerados em paralelo e remontados na ordem.
- **Cache:** o mesmo texto com a mesma persona e o mesmo modelo é guardado por 7 dias e não é cobrado de novo. O cache do Worker só funciona em domínio próprio; em `*.workers.dev` ele é ignorado.
- Personas e o último texto ficam salvos no navegador (localStorage).

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Site + API em modo desenvolvimento |
| `npm test` | Testes das marcações, da análise e das chamadas aos motores (com respostas simuladas) |
| `npm run typecheck` | Verifica os tipos do frontend e do Worker |
| `npm run build` | Verifica tipos, roda os testes e gera o site (é o que a Cloudflare executa) |

## Estrutura

```
shared/      código usado pelo site e pelo Worker
  markup.ts    parser das marcações e conversão para cada motor
  perfil.ts    sexo, idade, entonação, ritmo e intensidade: o que cada opção significa
  persona.ts   persona → instrução de voz, personas padrão, migração de versões antigas
  voices.ts    vozes com perfil (sexo/idade) e escolha automática
  analise.ts   análise rápida, prompt da IA e validação da resposta
worker/      backend (Cloudflare Worker)
  index.ts     rotas /api/engines, /api/voices, /api/speak, /api/analyze, cache e código de acesso
  engines/     uma integração por motor + análise por IA
  audio.ts     PCM → WAV, junção e paralelismo
src/         frontend (TypeScript puro)
  main.ts      tela, personas e geração
  editor.ts    editor com marcações coloridas e faixa de interpretação
  sugestao.ts  janela de sugestão da análise
  browserTts.ts voz do navegador
```
