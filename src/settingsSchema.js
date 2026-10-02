// O que aparece na aba Configurações. Cada funcionalidade nova acrescenta aqui os seus itens
// (e o valor por defeito em shared/settings.js).
// type: "bool" (interruptor) | "number" (com min/max) | "select" (com options).
export const SETTINGS_GROUPS = [
  {
    title: "Cronómetro",
    items: [
      {
        key: "autoStart",
        type: "bool",
        label: "Detetar a partida sozinho",
        desc: "Ao fechares um circuito (voltar a passar no mesmo ponto, no mesmo sentido), esse ponto passa a ser a partida e a primeira volta conta logo.",
      },
      {
        key: "autoStartMinLength",
        type: "number",
        min: 300,
        max: 10000,
        label: "Comprimento mínimo do circuito (m)",
        desc: "Evita detetar voltas a um quarteirão sem querer.",
      },
    ],
  },
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
        key: "deltaReference",
        type: "select",
        options: [
          { value: "best", label: "Recorde" },
          { value: "ideal", label: "Volta ideal" },
        ],
        label: "Delta e fantasma comparam com",
        desc: "Volta ideal = os teus troços mais rápidos de todas as voltas deste carro nesta pista, juntos.",
      },
      {
        key: "compareChart",
        type: "bool",
        label: "Gráfico de comparação",
        desc: "Ao escolher uma volta, compara delta, velocidade, acelerador e travão com o recorde ao longo da pista.",
      },
      {
        key: "lapAnalysis",
        type: "bool",
        label: "Onde perdeste tempo",
        desc: "No fim de cada volta (e ao escolher uma volta), mostra as curvas onde perdeste mais tempo e a causa provável.",
      },
      {
        key: "showCorners",
        type: "bool",
        label: "Curvas no mapa",
        desc: "Curvas numeradas no mapa. Numa volta escolhida, clica numa curva para a ampliar e comparar travagem, velocidade mínima e aceleração.",
      },
      {
        key: "ghost",
        type: "bool",
        label: "Fantasma no mapa",
        desc: "Ponto roxo que mostra onde estaria o carro do recorde neste momento, e a distância até ele.",
      },
      {
        key: "miniSectors",
        type: "bool",
        label: "Mini-setores no mapa",
        desc: "Divide a pista em troços iguais: roxo = mais rápido que o recorde nesse troço, amarelo = mais lento.",
      },
      { key: "miniSectorCount", type: "number", min: 4, max: 40, label: "Número de mini-setores", desc: "Entre 4 e 40." },
    ],
  },
  {
    title: "Partilhar pistas",
    items: [
      { key: "exportImport", type: "bool", label: "Exportar e importar pistas", desc: "Botões para descarregar uma pista em ficheiro e importar pistas de amigos." },
      { key: "exportIncludeLaps", type: "bool", label: "Incluir histórico de voltas ao exportar", desc: "O ficheiro fica maior, mas leva todas as voltas e traçados." },
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
