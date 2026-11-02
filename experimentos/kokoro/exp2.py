from exp import *
T = "Boa noite, turma! Que alegria ver vocês aqui de novo. Hoje vamos revisar a sequência do segundo bloco."
ps = fonemas(T)
r = lambda nome, x, p=ps: print(f"{nome:34s}", metricas(x, p))
for k in [0.5, 0.75]: r(f"k={k}", sintetiza(ps, k=k))
# pontuação: tudo com exclamação / tudo com ponto
ps_ex = fonemas(T.replace(".", "!")); r("pontuação ! em tudo", sintetiza(ps_ex), ps_ex)
ps_pt = fonemas(T.replace("!", ".")); r("pontuação . em tudo", sintetiza(ps_pt), ps_pt)
# índice de estilo deslocado (estilos de frases mais curtas/longas)
ids = [VOCAB[c] for c in ps if c in VOCAB]; n = len(ids)
for off in [-80, -40, 40, 120]:
    r(f"índice de estilo {off:+d}", sintetiza(ps, estilo=VOZES["pm_alex"][max(1, min(509, n+off))]))
# mistura de prosódia: alex (timbre) + santa (prosódia)
for w in [0.3, 0.6]:
    s = VOZES["pm_alex"][n].copy(); s[128:] = (1-w)*s[128:] + w*VOZES["pm_santa"][n][128:]
    r(f"prosódia santa {w}", sintetiza(ps, estilo=s))
# mistura com voz inglesa expressiva (am_puck) só na prosódia
for w in [0.3]:
    s = VOZES["pm_alex"][n].copy(); s[128:] = (1-w)*s[128:] + w*VOZES["am_puck"][n][128:]
    r(f"prosódia am_puck {w}", sintetiza(ps, estilo=s))
