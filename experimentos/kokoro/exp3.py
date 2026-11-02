from exp import *
T = "Boa noite, turma! Que alegria ver vocês aqui de novo. Hoje vamos revisar a sequência do segundo bloco."
ps = fonemas(T); n = len([c for c in ps if c in VOCAB])
base = metricas(sintetiza(ps), ps); print(f"{'pm_alex puro':22s}", base)
for doador, w in [("em_alex",.35),("im_nicola",.35),("em_santa",.35),("am_puck",.2),("am_puck",.45),("am_fenrir",.3),("am_michael",.3),("bm_george",.3)]:
    s = VOZES["pm_alex"][n].copy(); s[128:] = (1-w)*s[128:] + w*VOZES[doador][n][128:]
    m = metricas(sintetiza(ps, estilo=s), ps)
    print(f"{doador+' '+str(w):22s}", m, f"variação {100*(m['faixa_st']/base['faixa_st']-1):+.0f}%")
