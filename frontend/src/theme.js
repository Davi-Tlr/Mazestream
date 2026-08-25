import { theme } from "antd";

// Tema do Ant Design em brutalismo preto e branco, com modo claro e escuro.
// Cantos retos, bordas fortes, sombras sem blur. Nenhuma cor de destaque nova:
// no claro a primaria e quase-preta, no escuro e quase-branca (contraste puro).
const FONTE = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';

const CLARO = {
  primary: "#17171a",
  info: "#17171a",
  texto: "#17171a",
  fundo: "#fbfbf9",
  borda: "#17171a",
  bordaSec: "#d7d6d1",
  elevado: "#fbfbf9",
  trilho: "#d7d6d1",
  trilhoHover: "#c4c3bd",
  tagBg: "#fbfbf9",
  campo: "#ffffff",       // superficie propria do input, distinta do papel
  campoBorda: "#c9c8c2",
  anel: "rgba(23,23,26,.13)"
};

const ESCURO = {
  primary: "#e9e9ec",
  info: "#e9e9ec",
  texto: "#e9e9ec",
  fundo: "#16181d",
  borda: "#3a3d45",
  bordaSec: "#2a2d33",
  elevado: "#16181d",
  trilho: "#3a3d45",
  trilhoHover: "#4a4e57",
  tagBg: "#1c1f25",
  campo: "#1e2129",       // input mais claro que a superficie, cria relevo
  campoBorda: "#41454f",
  anel: "rgba(233,233,236,.16)"
};

export function criarTema(escuro) {
  const c = escuro ? ESCURO : CLARO;
  return {
    algorithm: escuro ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: c.primary,
      colorInfo: c.info,
      colorTextBase: c.texto,
      colorBgBase: c.fundo,
      colorBorder: c.borda,
      colorBorderSecondary: c.bordaSec,
      borderRadius: 2,
      borderRadiusLG: 2,
      borderRadiusSM: 2,
      wireframe: false,
      fontFamily: FONTE,
      controlHeight: 40,
      fontSize: 14
    },
    components: {
      Button: {
        primaryShadow: "none",
        defaultShadow: "none",
        dangerShadow: "none",
        fontWeight: 650,
        controlHeight: 40
      },
      Drawer: { colorBgElevated: c.elevado },
      Modal: { colorBgElevated: c.elevado },
      Input: {
        colorBgContainer: c.campo,
        colorBorder: c.campoBorda,
        hoverBorderColor: c.primary,
        activeBorderColor: c.primary,
        activeShadow: "0 0 0 3px " + c.anel,
        paddingBlock: 9,
        controlHeight: 44,
        controlHeightLG: 48
      },
      Select: {
        controlHeight: 38,
        colorBgContainer: c.campo,
        colorBorder: c.campoBorda,
        optionSelectedBg: escuro ? "#2a2d33" : "#eeede8"
      },
      Segmented: escuro ? { itemSelectedBg: "#2a2d33", trackBg: "#1c1f25" } : {},
      Slider: {
        railBg: c.trilho,
        railHoverBg: c.trilhoHover,
        trackBg: c.primary,
        trackHoverBg: c.primary,
        handleColor: c.primary,
        handleActiveColor: c.primary,
        dotBorderColor: c.primary
      },
      Switch: { colorPrimary: c.primary },
      Tag: { defaultBg: c.tagBg }
    }
  };
}
