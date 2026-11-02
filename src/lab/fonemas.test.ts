import { describe, expect, it } from "vitest";
import { idsKokoro, idsPiper } from "./fonemas";

describe("formato de entrada dos modelos", () => {
  it("Piper: ^ _ f1 _ f2 _ $, com til decomposto (NFD) e caracteres desconhecidos ignorados", () => {
    const mapa = { _: [0], "^": [1], $: [2], a: [10], "̃": [11], m: [12], "ˈ": [13] };
    const { ids, ignorados } = idsPiper("mˈã#", mapa);
    expect(ids).toEqual([1, 0, 12, 0, 13, 0, 10, 0, 11, 0, 2]);
    expect(ignorados).toBe("#");
  });

  it("Kokoro: um ID por caractere, sem os desconhecidos, no máximo 510", () => {
    expect(idsKokoro("ab?", { a: 1, b: 2 })).toEqual([1, 2]);
    expect(idsKokoro("a".repeat(600), { a: 1 })).toHaveLength(510);
  });
});
