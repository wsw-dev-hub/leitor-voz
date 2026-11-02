import { describe, expect, it } from "vitest";
import { parseMarkup, plainText, renderForEleven, renderPieces, splitText, styleInstruction } from "./markup";

describe("parseMarkup", () => {
  it("texto sem tags vira um segmento com estilo base", () => {
    const s = parseMarkup("Olá turma.");
    expect(s).toHaveLength(1);
    expect(s[0].style).toBeNull();
    expect(plainText(s)).toBe("Olá turma.");
  });

  it("separa estilos, eventos e [normal]; ignora acentos e maiúsculas", () => {
    const s = parseMarkup("[Animado] Bem-vindos! [risada] Vamos lá. [SÉRIO] Atenção. [normal] Fim.");
    expect(s.map((x) => x.style)).toEqual(["animado", "serio", null]);
    expect(s[0].pieces.some((p) => p.kind === "event" && p.key === "risada")).toBe(true);
    expect(styleInstruction(s[1])).toContain("sério");
  });

  it("tag desconhecida vira estilo livre", () => {
    const s = parseMarkup("[voz de vilão de desenho] Muahaha.");
    expect(s[0].freeStyle).toBe(true);
    expect(styleInstruction(s[0])).toBe("voz de vilão de desenho");
    expect(renderForEleven(s, "")).toBe("[voz de vilão de desenho] Muahaha.");
  });

  it("renderiza eventos por motor", () => {
    const [seg] = parseMarkup("Um [pausa] dois [risada] três");
    expect(renderPieces(seg.pieces, "eleven")).toBe("Um ... dois [laughs] três");
    expect(renderPieces(seg.pieces, "gemini")).toBe("Um <short pause> dois <laugh> três");
    expect(renderPieces(seg.pieces, "fallback")).toBe("Um ... dois três");
  });

  it("ElevenLabs recebe tags base quando o trecho não tem estilo", () => {
    const s = parseMarkup("Oi. [sussurrando] segredo [normal] tchau");
    expect(renderForEleven(s, "[warm]")).toBe("[warm] Oi. [whispers] segredo [warm] tchau");
  });

  it("descarta segmentos vazios", () => {
    expect(parseMarkup("[animado] [calmo] Oi")).toHaveLength(1);
    expect(parseMarkup("   ")).toHaveLength(0);
  });
});

describe("splitText", () => {
  it("corta em fim de frase respeitando o limite", () => {
    const txt = "Frase um. Frase dois! Frase três? Frase quatro.";
    const parts = splitText(txt, 22);
    expect(parts.every((p) => p.length <= 22)).toBe(true);
    expect(parts.join(" ")).toBe(txt);
  });

  it("corta frases gigantes em espaços", () => {
    const txt = ("palavra ").repeat(100).trim();
    const parts = splitText(txt, 50);
    expect(parts.every((p) => p.length <= 50)).toBe(true);
    expect(parts.join(" ")).toBe(txt);
  });
});
