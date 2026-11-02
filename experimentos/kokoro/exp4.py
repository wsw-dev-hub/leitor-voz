from exp import *
T = "Boa noite, turma! Que alegria ver vocês aqui de novo. Hoje vamos revisar a sequência do segundo bloco."
ps = fonemas(T); n = len([c for c in ps if c in VOCAB])
base = metricas(sintetiza(ps, "pf_dora"), ps); print(f"{'pf_dora puro':20s}", base)
for doador, w in [("ef_dora",.35),("if_sara",.35),("af_bella",.35),("af_heart",.35),("af_nicole",.35),("af_sky",.35),("af_bella",.5)]:
    s = VOZES["pf_dora"][n].copy(); s[128:] = (1-w)*s[128:] + w*VOZES[doador][n][128:]
    m = metricas(sintetiza(ps, estilo=s), ps)
    print(f"{doador+' '+str(w):20s}", m, f"variação {100*(m['faixa_st']/base['faixa_st']-1):+.0f}%, tom {m['f0_med']-base['f0_med']:+.0f} Hz")
