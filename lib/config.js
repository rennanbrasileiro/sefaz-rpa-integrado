// lib/config.js — catálogos estáticos
const PROJECTS = [
  { value: "204", label: "CSN - Evolução - REDESIM" },
  { value: "86",  label: "DEF - Monitoramento do Simples Nacional (PROFISCO 2019)" },
  { value: "126", label: "DEF - Sustentação" },
  { value: "38",  label: "DMI - Integração DMI portal único (PROFISCO 2019)" },
  { value: "290", label: "GAF - Modernização do GAF" },
  { value: "149", label: "GAF - Sustentação" },
  { value: "254", label: "GDE - Integração com sistemas externos e internos" },
  { value: "191", label: "GIF - Gestão de Incentivos Fiscais (PROFISCO 2019)" },
  { value: "199", label: "GPF - Evolução - Emissão de DAE e Novo Recálculo" },
  { value: "245", label: "GCD - Autodeclaração de ITCMD" },
  { value: "124", label: "GSN - Sustentação" },
  { value: "293", label: "MariIA" },
  { value: "309", label: "DEF - Evolução - Implantação monitoramento SN" },
  { value: "221", label: "CAT - Evolução - Desburocratizar fluxo" },
  { value: "312", label: "TAT - Pauta de Julgamento e PUSH de Informações" },
  { value: "127", label: "GAE - Sustentação" },
  { value: "171", label: "GTU - Gestão de Transferências da União" },
  { value: "303", label: "GTU - Evolução - Cadastro do Instrumento e Execução" },
];

const ACTIVITY_TYPES = [
  { value: "-1",  label: "Nenhum tipo de atividade" },
  { value: "5",   label: "2 - Reunião" },
  { value: "6",   label: "3 - Horas Abonadas pela SEFAZ" },
  { value: "16",  label: "16 - Integração" },
  { value: "18",  label: "21 - Análise" },
  { value: "20",  label: "23 - Revisão de Código" },
  { value: "21",  label: "24 - Testes" },
  { value: "22",  label: "26 - Implementação" },
  { value: "24",  label: "28 - Implantação" },
  { value: "35",  label: "40 - Gerência de Projetos (Scrum Master)" },
  { value: "36",  label: "46 - Suporte ao Desenvolvimento" },
  { value: "37",  label: "47 - Suporte Técnico" },
  { value: "58",  label: "92 - Apresentações / Eventos / Cursos" },
  { value: "141", label: "184 - Montar pacotes de homologação" },
];

const DEFAULT_COMENTARIO = "Organização dos indicadores do projeto; cerimônia diária com o time e gestores; acompanhamento da evolução técnica e métricas de desempenho; facilitação das cerimônias; remoção de impedimentos; treinamento e capacitação do time; comunicação constante com gestores; promoção da cultura ágil; mediação de conflitos; incentivo ao feedback contínuo; colaboração no planejamento de entregas.";

module.exports = { PROJECTS, ACTIVITY_TYPES, DEFAULT_COMENTARIO };
