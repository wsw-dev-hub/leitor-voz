// Ajustes de uma "tomada" do laboratório e as predefinições.

export interface Ajustes {
  voz: string; // id do catálogo
  velocidade: number; // 0.6–1.4
  pausas: number; // 0.4–2.5: multiplica as pausas entre frases
  contraste: number; // 0–2: multiplica as diferenças de volume entre emoções
  bpm: number; // 60–180: andamento da [contagem]
  usarMarcacoes: boolean;
  // Kokoro
  tom: number; // 0.6–1.8 (1 = original)
  expressividade: number; // 0–0.7: peso da entonação doadora
  doador: string;
  // Piper
  variacaoEntonacao: number; // noise_scale 0.2–1.2
  variacaoRitmo: number; // noise_w 0.2–1.4
}

export const PADRAO: Ajustes = {
  voz: "piper-faber",
  velocidade: 1,
  pausas: 1,
  contraste: 1,
  bpm: 100,
  usarMarcacoes: true,
  tom: 1,
  expressividade: 0.25,
  doador: "em_santa",
  variacaoEntonacao: 0.667,
  variacaoRitmo: 0.8,
};

export interface Predefinicao {
  id: string;
  nome: string;
  ajustes: Partial<Ajustes>;
}

export const PREDEFINICOES: Predefinicao[] = [
  { id: "neutro", nome: "Neutro (original do modelo)", ajustes: { velocidade: 1, pausas: 1, contraste: 1, tom: 1, expressividade: 0, variacaoEntonacao: 0.667, variacaoRitmo: 0.8 } },
  { id: "aula", nome: "Aula animada", ajustes: { velocidade: 1.05, pausas: 1.1, contraste: 1.2, tom: 1, expressividade: 0.4, doador: "am_puck", variacaoEntonacao: 0.85, variacaoRitmo: 0.9, bpm: 100 } },
  { id: "historia", nome: "Contação de história", ajustes: { velocidade: 0.93, pausas: 1.35, contraste: 1.3, tom: 1, expressividade: 0.3, doador: "em_santa", variacaoEntonacao: 0.8, variacaoRitmo: 0.85 } },
  { id: "relaxamento", nome: "Relaxamento guiado", ajustes: { velocidade: 0.82, pausas: 1.9, contraste: 0.6, tom: 1.3, expressividade: 0.2, doador: "am_michael", variacaoEntonacao: 0.5, variacaoRitmo: 0.6 } },
  { id: "locucao", nome: "Locução de rádio", ajustes: { velocidade: 1.08, pausas: 0.85, contraste: 1.1, tom: 1.15, expressividade: 0.45, doador: "am_fenrir", variacaoEntonacao: 0.9, variacaoRitmo: 0.8 } },
  { id: "noticia", nome: "Leitura neutra de notícia", ajustes: { velocidade: 1, pausas: 1, contraste: 0.5, tom: 1.1, expressividade: 0.1, doador: "am_michael", variacaoEntonacao: 0.55, variacaoRitmo: 0.7 } },
];

export function aplicarPredefinicao(atual: Ajustes, id: string): Ajustes {
  const p = PREDEFINICOES.find((x) => x.id === id);
  return p ? { ...atual, ...p.ajustes } : atual;
}

export const TEXTOS_EXEMPLO: { id: string; nome: string; texto: string }[] = [
  {
    id: "aula", nome: "Aula de dança",
    texto: `[animado] Boa noite, turma! Que alegria ver vocês aqui de novo.
[calmo] Antes de começar, respirem fundo e soltem os ombros. [pausa]
[normal] Hoje vamos revisar a sequência do segundo bloco, com atenção à transferência de peso.
[contagem] Cinco, seis, sete, oito!`,
  },
  {
    id: "historia", nome: "História",
    texto: `Era uma vez um bailarino que ensaiava sozinho, todas as noites, num teatro vazio.
[misterioso] Até que, numa dessas noites, as luzes se apagaram de repente.
[curioso] Quem estaria ali com ele?
[sussurrando] Ele prendeu a respiração e ouviu passos no palco.
[animado] Era a turma inteira, com um bolo, para comemorar o aniversário dele!`,
  },
  {
    id: "relaxamento", nome: "Relaxamento",
    texto: `Feche os olhos e deixe o corpo pesar no chão.
Inspire devagar pelo nariz... e solte o ar pela boca. [pausa longa]
Sinta os ombros descendo, o pescoço relaxando, a respiração ficando mais lenta.`,
  },
  {
    id: "locucao", nome: "Chamada de evento",
    texto: `[animado] Atenção, bailarinos! As inscrições para o festival de dezembro estão abertas!
[normal] São três dias de oficinas, mostras e premiações, no Teatro Municipal.
[sério] As vagas são limitadas. Garanta a sua até o dia trinta de novembro.`,
  },
  {
    id: "pronuncia", nome: "Teste de pronúncia",
    texto: `O tempo de hoje está ótimo para dançar. Leite quente, noite fria, dia de festa.
Você prefere tia, tio ou titio? Mãe, pão e coração. Ritmo, rítmico e arritmia.`,
  },
];
