/* ===== Camada de dados =====
   A tela NÃO deve mexer direto nas listas em memória (LEADS, SCHED…) ao gravar:
   ela chama DB.*. Hoje DB.* usa a implementação fictícia (memória).
   Depois, trocar por uma implementação Supabase com a MESMA interface
   (só chave publishable; nomes de campo conforme as tabelas existentes). */
const DB={
  modo:'mock',
  /* mensagens agendadas (futuro: tabela de mensagens agendadas / atd_eventos) */
  agendar(m){SCHED.push(m);return m},
  cancelarAgendada(id){const i=SCHED.findIndex(x=>x.id===id);if(i>=0)SCHED.splice(i,1);return i>=0},
  /* leads (futuro: tabelas leads / fases / historico_fases) */
  criarLead(l){LEADS.push(l);return l},
  atualizarLead(l,patch){Object.assign(l,patch);return l}
};
