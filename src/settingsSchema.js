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
  {
    title: "Rede",
    items: [
      {
        key: "lanAccess",
        type: "bool",
        restart: true,
        label: "Acesso pelo telemóvel/tablet",
        desc: "Permite abrir a página noutro dispositivo na mesma rede Wi-Fi. Reinicia o npm run dev depois de mudar.",
      },
    ],
  },
  {
    title: "Overlay (npm run overlay)",
    items: [
      { key: "overlaySectors", type: "bool", label: "Setores no overlay", desc: "Mostra S1, S2 e S3 com as cores." },
      { key: "overlayMap", type: "bool", label: "Mapa no overlay", desc: "Mapa pequeno com a posição do carro." },
      { key: "overlayOpacity", type: "number", min: 0, max: 100, label: "Opacidade do fundo (%)", desc: "0 = totalmente transparente." },
    ],
  },
];
