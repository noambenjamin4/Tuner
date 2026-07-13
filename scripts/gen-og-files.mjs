// Generates OG cards for the file-tool routes in the established style:
// white rounded card, vinyl logo, two-line bold title, gray footer line.
import sharp from "sharp";
import { readFileSync } from "node:fs";

const logo = readFileSync("public/logo-light.png");
const CARDS = [
  ["tools", "MORE FREE", "TOOLS"],
  ["image-converter", "IMAGE", "CONVERTER"],
  ["compress-image", "COMPRESS", "IMAGES"],
  ["resize-image", "RESIZE", "IMAGES"],
  ["resize-image-instagram", "RESIZE FOR", "INSTAGRAM"],
  ["compress-image-100kb", "COMPRESS", "TO 100KB"],
  ["heic-to-jpg", "HEIC TO", "JPG"],
  ["compress-video", "COMPRESS", "VIDEO"],
  ["compress-video-discord", "COMPRESS FOR", "DISCORD"],
  ["merge-pdf", "MERGE", "PDF FILES"],
  ["jpg-to-pdf", "JPG TO", "PDF"],
  ["unzip-files", "UNZIP", "FILES"],
  ["video-converter", "VIDEO", "CONVERTER"],
  ["audio-converter", "AUDIO", "CONVERTER"],
  ["compress-video-whatsapp", "COMPRESS FOR", "WHATSAPP"],
  ["split-pdf", "SPLIT", "PDF"],
  ["mkv-to-mp4", "MKV TO", "MP4"],
  ["mov-to-mp4", "MOV TO", "MP4"],
  ["flac-to-mp3", "FLAC TO", "MP3"],
  ["wav-to-mp3", "WAV TO", "MP3"],
  ["camelot-wheel", "CAMELOT", "WHEEL"],
  ["guide-ringtone", "MAKE A", "RINGTONE"],
  ["nightcore-maker", "NIGHTCORE", "MAKER"],
  ["bass-booster", "BASS", "BOOSTER"],
  ["8d-audio", "8D AUDIO", "MAKER"],
  ["audio-joiner", "AUDIO", "JOINER"],
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

for (const [name, line1, line2] of CARDS) {
  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="630" fill="#ffffff"/>
    <rect x="14" y="14" width="1172" height="602" rx="42" fill="#ffffff" stroke="#111111" stroke-width="3"/>
    <text x="92" y="330" font-family="Helvetica, Arial, sans-serif" font-size="86" font-weight="800" letter-spacing="2" fill="#111111">${esc(line1)}</text>
    <text x="92" y="428" font-family="Helvetica, Arial, sans-serif" font-size="86" font-weight="800" letter-spacing="2" fill="#111111">${esc(line2)}</text>
    <text x="92" y="528" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="700" letter-spacing="6" fill="#8a8a8a">TUNEBAD.COM · FREE · NO ADS</text>
  </svg>`;
  const base = await sharp(Buffer.from(svg)).png().toBuffer();
  const logoResized = await sharp(logo).resize(150, 150).png().toBuffer();
  await sharp(base)
    .composite([{ input: logoResized, top: 78, left: 88 }])
    .png()
    .toFile(`public/og/${name}.png`);
  console.log("wrote", name);
}
