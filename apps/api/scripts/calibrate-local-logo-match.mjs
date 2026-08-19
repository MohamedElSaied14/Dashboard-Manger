import sharp from "sharp";

async function normalizedPixels(input, trim = true) {
  let image = sharp(input).flatten({ background: "#ffffff" });
  if (trim) image = image.trim({ background: "#ffffff", threshold: 22 });
  const { data } = await image
    .resize(160, 80, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
}

function similarity(a, b) {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  let colorDistance = 0;
  for (let i = 0; i < a.length; i += 3) {
    const ag = 255 - (a[i] * .299 + a[i + 1] * .587 + a[i + 2] * .114);
    const bg = 255 - (b[i] * .299 + b[i + 1] * .587 + b[i + 2] * .114);
    dot += ag * bg;
    aa += ag * ag;
    bb += bg * bg;
    colorDistance += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  }
  const shape = dot / Math.sqrt(Math.max(1, aa * bb));
  const color = 1 - colorDistance / ((a.length / 3) * 3 * 255);
  return { shape, color, combined: shape * .75 + color * .25 };
}

async function cropAt(designPath, placement, referencePath) {
  const meta = await sharp(designPath).metadata();
  const refMeta = await sharp(referencePath)
    .flatten({ background: "#ffffff" })
    .trim({ background: "#ffffff", threshold: 22 })
    .metadata();
  const aspect = (refMeta.width ?? 1) / (refMeta.height ?? 1);
  const width = Math.round((meta.width ?? 1) * placement.width / 100);
  const height = Math.round(width / aspect);
  const left = Math.max(0, Math.min((meta.width ?? 1) - width, Math.round((meta.width ?? 1) * placement.x / 100)));
  const top = Math.max(0, Math.min((meta.height ?? 1) - height, Math.round((meta.height ?? 1) * placement.y / 100)));
  return sharp(designPath).extract({ left, top, width, height }).png().toBuffer();
}

async function search(designPath, referencePath, ranges) {
  const reference = await normalizedPixels(referencePath);
  let best = { combined: -1, shape: 0, color: 0, placement: null };
  for (const x of ranges.x) for (const y of ranges.y) for (const width of ranges.width) {
    const crop = await cropAt(designPath, { x, y, width }, referencePath);
    const score = similarity(await normalizedPixels(crop), reference);
    if (score.combined > best.combined) best = { ...score, placement: { x, y, width } };
  }
  return best;
}

const marketing = process.argv[2];
const alzahra = process.argv[3];
const marketingTrimmed = await sharp(marketing)
  .flatten({ background: "#ffffff" })
  .trim({ background: "#ffffff", threshold: 22 })
  .png()
  .toBuffer({ resolveWithObject: true });
const marketingSymbol = await sharp(marketingTrimmed.data)
  .extract({
    left: 0,
    top: 0,
    width: Math.round(marketingTrimmed.info.width * .34),
    height: marketingTrimmed.info.height,
  })
  .png()
  .toBuffer();
const alzahraTrimmed = await sharp(alzahra)
  .flatten({ background: "#ffffff" })
  .trim({ background: "#ffffff", threshold: 22 })
  .png()
  .toBuffer({ resolveWithObject: true });
const alzahraSymbol = await sharp(alzahraTrimmed.data)
  .extract({
    left: 0,
    top: 0,
    width: Math.round(alzahraTrimmed.info.width * .38),
    height: alzahraTrimmed.info.height,
  })
  .png()
  .toBuffer();
for (const design of process.argv.slice(4)) {
  const marketingFull = await search(design, marketing, {
    x: [0, 8, 16, 24, 32], y: [0, 6, 12, 18, 24], width: [8, 12, 16],
  });
  const marketingIcon = await search(design, marketingSymbol, {
    x: [0, 8, 16, 24, 32], y: [0, 6, 12, 18, 24], width: [8, 12, 16],
  });
  const alzahraFull = await search(design, alzahra, {
    x: [52, 60, 68, 76, 84], y: [0, 6, 12, 18, 24], width: [20, 25, 30],
  });
  const alzahraIcon = await search(design, alzahraSymbol, {
    x: [52, 60, 68, 76, 84], y: [0, 6, 12, 18, 24], width: [8, 12, 16],
  });
  const result = {
    design,
    marketing: marketingFull.combined >= marketingIcon.combined ? marketingFull : marketingIcon,
    marketingCandidates: { full: marketingFull, symbol: marketingIcon },
    alzahra: alzahraFull.combined >= alzahraIcon.combined ? alzahraFull : alzahraIcon,
    alzahraCandidates: { full: alzahraFull, symbol: alzahraIcon },
  };
  console.log(JSON.stringify(result, null, 2));
}
