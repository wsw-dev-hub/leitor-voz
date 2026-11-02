import fs from "node:fs";
import { carregar, falar, salvarWav } from "./prosodia.mjs";

const CENAS = {
  "depois-aula-masculina": {
    persona: { sexo: "masculino", idade: "adulto", entonacao: "professor", ritmo: 4, energia: "alta", bpm: 100 },
    texto: `[animado] Boa noite, turma! Que alegria ver vocês aqui de novo.
[calmo] Antes de começar, respirem fundo e soltem os ombros. [pausa]
[normal] Hoje vamos revisar a sequência do segundo bloco, com atenção à transferência de peso.
[contagem] Cinco, seis, sete, oito!`,
  },
  "depois-aula-feminina": {
    persona: { sexo: "feminino", idade: "adulto", entonacao: "professor", ritmo: 4, energia: "alta", bpm: 100 },
    texto: null, // mesmo texto da aula
  },
  "depois-relaxamento-masculina": {
    persona: { sexo: "masculino", idade: "maduro", entonacao: "acolhedor", ritmo: 2, energia: "baixa" },
    texto: `Feche os olhos e deixe o corpo pesar no chão.
Inspire devagar pelo nariz... e solte o ar pela boca. [pausa longa]
Sinta os ombros descendo, o pescoço relaxando, a respiração ficando mais lenta.`,
  },
  "depois-historia-masculina": {
    persona: { sexo: "masculino", idade: "adulto", entonacao: "narrador", ritmo: 3, energia: "media" },
    texto: `Era uma vez um bailarino que ensaiava sozinho, todas as noites, num teatro vazio.
[misterioso] Até que, numa dessas noites, as luzes se apagaram de repente.
[curioso] Quem estaria ali com ele?
[sussurrando] Ele prendeu a respiração e ouviu passos no palco.
[animado] Era a turma inteira, com um bolo, para comemorar o aniversário dele!`,
  },
};
CENAS["depois-aula-feminina"].texto = CENAS["depois-aula-masculina"].texto;

await carregar();
const so = process.argv[2];
for (const [nome, { persona, texto }] of Object.entries(CENAS)) {
  if (so && !nome.includes(so)) continue;
  const t0 = performance.now();
  const { audio, log } = await falar(texto, persona);
  salvarWav(`${nome}.wav`, audio);
  const seg = audio.length / 24000;
  console.log(`\n${nome}: ${seg.toFixed(1)} s de áudio em ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  for (const l of log) console.log("  ", JSON.stringify(l));
}
