import { theme } from "antd";

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';

const LIGHT = {
  primary: "#17171a",
  info: "#17171a",
  text: "#17171a",
  bg: "#fbfbf8",
  border: "#17171a",
  borderSec: "#cbc9c2",
  elevated: "#fbfbf8",
  track: "#cbc9c2",
  trackHover: "#aaa9a3",
  tagBg: "#ebeae5",
  input: "#ffffff",
  inputBorder: "#b9b8b2",
  ring: "rgba(23,23,26,.14)"
};

const DARK = {
  primary: "#f1f1ee",
  info: "#f1f1ee",
  text: "#f1f1ee",
  bg: "#15171c",
  border: "#4b4e57",
  borderSec: "#2c2f37",
  elevated: "#15171c",
  track: "#3a3d45",
  trackHover: "#4b4e57",
  tagBg: "#1d2027",
  input: "#1d2027",
  inputBorder: "#4b4e57",
  ring: "rgba(241,241,238,.16)"
};

export function createTheme(dark) {
  const c = dark ? DARK : LIGHT;
  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: c.primary,
      colorInfo: c.info,
      colorTextBase: c.text,
      colorBgBase: c.bg,
      colorBorder: c.border,
      colorBorderSecondary: c.borderSec,
      borderRadius: 3,
      borderRadiusLG: 6,
      borderRadiusSM: 2,
      wireframe: false,
      fontFamily: FONT,
      controlHeight: 36,
      fontSize: 14
    },
    components: {
      Button: {
        primaryShadow: "none",
        defaultShadow: "none",
        dangerShadow: "none",
        fontWeight: 650,
        controlHeight: 36
      },
      Drawer: { colorBgElevated: c.elevated },
      Modal: { colorBgElevated: c.elevated },
      Input: {
        colorBgContainer: c.input,
        colorBorder: c.inputBorder,
        hoverBorderColor: c.primary,
        activeBorderColor: c.primary,
        activeShadow: "0 0 0 3px " + c.ring,
        paddingBlock: 9,
        controlHeight: 44,
        controlHeightLG: 48
      },
      Select: {
        controlHeight: 38,
        colorBgContainer: c.input,
        colorBorder: c.inputBorder,
        optionSelectedBg: dark ? "#2c2f37" : "#ebeae5"
      },
      Segmented: dark ? { itemSelectedBg: "#2c2f37", trackBg: "#1d2027" } : {},
      Slider: {
        railBg: c.track,
        railHoverBg: c.trackHover,
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
