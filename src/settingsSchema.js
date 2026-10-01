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
    title: "Painel do carro",
    items: [
      { key: "tireTemps", type: "bool", label: "Temperatura dos pneus", desc: "Os 4 pneus em °C: frio (< 60), ideal (60–95) ou quente (> 95)." },
      { key: "wheelSlip", type: "bool", label: "Patinagem das rodas", desc: "Aderência de cada roda e aviso de subviragem/sobreviragem." },
      { key: "shiftLight", type: "bool", label: "Luz de mudança", desc: "Luzes que acendem com as rotações e piscam na hora de trocar." },
      { key: "shiftLightAt", type: "number", min: 70, max: 99, label: "Trocar mudança a (% das rotações máx.)", desc: "Ponto em que as luzes piscam." },
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
