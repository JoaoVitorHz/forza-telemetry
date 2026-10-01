// O que aparece na aba Configurações. Cada funcionalidade nova acrescenta aqui os seus itens
// (e o valor por defeito em shared/settings.js).
// type: "bool" (interruptor) | "number" (com min/max); restart: só tem efeito depois de reiniciar.
export const SETTINGS_GROUPS = [
  {
    title: "Painel ao vivo",
    items: [
      { key: "showPedals", type: "bool", label: "Rotações e pedais", desc: "Velocidade, mudança e barras de rotações, acelerador e travão." },
      { key: "showLapHistory", type: "bool", label: "Tabela de voltas", desc: "Histórico das voltas da sessão com os setores." },
    ],
  },
  {
    title: "Análise",
    items: [
      {
        key: "compareChart",
        type: "bool",
        label: "Gráfico de comparação",
        desc: "Ao escolher uma volta, compara delta, velocidade, acelerador e travão com o recorde ao longo da pista.",
      },
    ],
  },
];
