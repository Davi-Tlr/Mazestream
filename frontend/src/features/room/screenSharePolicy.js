export function chooseScreenCodec(contentHint, vp9Supported) {
  if (contentHint === "detail") return "vp8";
  return vp9Supported ? "vp9" : "vp8";
}
