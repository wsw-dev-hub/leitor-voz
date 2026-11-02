import { describe, expect, it } from "vitest";
import { analisarLocal, mesmoTexto, sanitizarAnalise, stripTags } from "./analise";
import { parseMarkup } from "./markup";

const AULA = `Boa noite, turma! Hoje vamos revisar a coreografia do segundo bloco.
Atenção à postura: ombros soltos e joelhos levemente flexionados.
Cinco, seis, sete, oito!
Muito bem, vocês arrasaram! Haha, eu estou muito orgulhoso de vocês.`;

const HISTORIA = `Era uma vez uma princesa que vivia num castelo no alto da montanha.
Todas as noites ela olhava as estrelas e sentia saudade da mãe.
De repente, uma sombra cruzou o céu escuro.
Será que era um dragão?`;

const RELAX = `Respire fundo e solte os ombros. Inspire devagar, contando até quatro.
Expire com calma, sentindo o corpo relaxar. Fique tranquila, estou aqui com você.`;

describe("analisarLocal", () => {
  it("aula de dança: entonação didática, contagem marcada, narrador masculino pela concordância", () => {
    const a = analisarLocal(AULA);
    expect(a.tipoTexto).toBe("Aula ou instrução");
    expect(a.sugestao.entonacao).toBe("professor");
    expect(a.sugestao.sexo).toBe("masculino");
    expect(a.textoMarcado).toContain("[contagem] Cinco, seis, sete, oito!");
    expect(a.textoMarcado).toContain("[risada] Haha");
    expect(a.textoMarcado).toContain("[serio] Atenção");
    expect(mesmoTexto(AULA, a.textoMarcado!)).toBe(true);
  });

  it("história infantil: tom lúdico, tristeza, mistério e curiosidade por frase", () => {
    const a = analisarLocal(HISTORIA);
    expect(a.sugestao.entonacao).toBe("infantil");
    const estilos = parseMarkup(a.textoMarcado!).map((s) => s.style);
    expect(estilos).toEqual([null, "triste", "misterioso", "curioso"]);
    expect(a.sugestao.sexo).toBeNull();
    expect(a.avisos.join(" ")).toContain("não dá pistas");
  });

  it("relaxamento: acolhedora, lenta, contida, sem repetir [calmo]", () => {
    const a = analisarLocal(RELAX);
    expect(a.sugestao).toMatchObject({ entonacao: "acolhedor", ritmo: 1, energia: "baixa" });
    expect(a.textoMarcado ?? "").not.toContain("[calmo]");
  });

  it("ignora marcações já existentes no texto", () => {
    expect(stripTags("[animado] Oi [risada] tudo bem?")).toBe("Oi tudo bem?");
  });
});

describe("sanitizarAnalise", () => {
  it("aceita resposta válida e descarta marcações que alteram o texto", () => {
    const ok = sanitizarAnalise(
      { tipo_texto: "Aula", sexo: "feminino", idade: "xx", entonacao: "professor", ritmo: 9, intensidade: "alta", motivos: ["a"], texto_marcado: "[animado] Boa noite, turma!" },
      "Boa noite, turma!",
      "openai",
    );
    expect(ok.sugestao).toMatchObject({ sexo: "feminino", idade: null, entonacao: "professor", energia: "alta" });
    expect(ok.sugestao.ritmo).toBeGreaterThanOrEqual(1);
    expect(ok.textoMarcado).toBe("[animado] Boa noite, turma!");

    const alterado = sanitizarAnalise({ texto_marcado: "[animado] Boa noite, pessoal!" }, "Boa noite, turma!", "gemini");
    expect(alterado.textoMarcado).toBeNull();
    expect(alterado.avisos[0]).toContain("alterou palavras");
  });
});
