import { theme } from "antd";

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';

const LIGHT = {
  primary: "#17171a",
  info: "#17171a",
  text: "#17171a",
  bg: "#fbfbf9",
  border: "#17171a",
  borderSec: "#d7d6d1",
  elevated: "#fbfbf9",
  track: "#d7d6d1",
  trackHover: "#c4c3bd",
  tagBg: "#fbfbf9",
  input: "#ffffff",
  inputBorder: "#c9c8c2",
  ring: "rgba(23,23,26,.13)"
};

const DARK = {
  primary: "#e9e9ec",
  info: "#e9e9ec",
  text: "#e9e9ec",
  bg: "#16181d",
  border: "#3a3d45",
  borderSec: "#2a2d33",
  elevated: "#16181d",
  track: "#3a3d45",
  trackHover: "#4a4e57",
  tagBg: "#1c1f25",
  input: "#1e2129",
  inputBorder: "#41454f",
  ring: "rgba(233,233,236,.16)"
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
      borderRadius: 2,
      borderRadiusLG: 2,
      borderRadiusSM: 2,
      wireframe: false,
      fontFamily: FONT,
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
        optionSelectedBg: dark ? "#2a2d33" : "#eeede8"
      },
      Segmented: dark ? { itemSelectedBg: "#2a2d33", trackBg: "#1c1f25" } : {},
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
