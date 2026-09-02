// Pixels in, pixels out. The upload is capped at 1024 on the long side: the Spaces multiply it by four, and
// 1024 → 4096² is the most a phone should be handed (5120² PNG came back at 18.7 MB from a 1280 input,
// measured 2026-09-02); the POST body stays under the proxy's cap the same way.
const MAX_SIDE = 1024;

// A deterministic stand-in picture for the gate: no network, the same frame for the same seed, so the shot and
// the e2e are stable and CI never spends a GPU minute. Fine lines, so "before" and "after" differ visibly when
// the gate's after is the same picture at 4× the viewBox.
export const mockArt = (seed, scale = 1) => {
  const h = (seed * 2654435761) % 360, w = 96 * scale, hh = 128 * scale;
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}" viewBox="0 0 96 128"><defs><radialGradient id="g" cx=".4" cy=".35" r=".8">` +
    `<stop offset="0" stop-color="hsl(${h} 70% 62%)"/><stop offset=".55" stop-color="hsl(${(h + 40) % 360} 55% 34%)"/>` +
    `<stop offset="1" stop-color="hsl(${(h + 200) % 360} 45% 12%)"/></radialGradient></defs>` +
    `<rect width="96" height="128" fill="url(#g)"/><path d="M8 100 Q 48 60 88 100 M8 90 Q 48 50 88 90" fill="none" stroke="white" stroke-opacity=".6" stroke-width=".8"/></svg>`)}`;
};

// Any same-origin image (blob: / data: / svg) → a capped JPEG data URL, the shape the proxy forwards to a
// Space's FileData. Same-origin only, so the canvas never taints. Also reports the size it sent.
export function toDataURL(url, maxSide = MAX_SIDE) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!w || !h) return reject(new Error("empty image"));
        const s = Math.min(1, maxSide / Math.max(w, h));
        w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s));
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve({ data: c.toDataURL("image/jpeg", 0.9), w, h });
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error("load failed"));
    img.src = url;
  });
}

// The pixel size of a picture, measured — naturalWidth lies on a scaled <img>; a decoded bitmap does not.
export async function sizeOf(blobOrUrl) {
  try {
    const bl = typeof blobOrUrl === "string" ? await (await fetch(blobOrUrl)).blob() : blobOrUrl;
    const bm = await createImageBitmap(bl);
    const s = { w: bm.width, h: bm.height }; bm.close?.(); return s;
  } catch { return null; }
}

export const extOf = (blob) => blob.type.includes("webp") ? "webp" : blob.type.includes("png") ? "png" : "jpg";
