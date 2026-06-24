// One-off icon generator. Renders a navy/gold dumbbell emblem to the PNG sizes a
// PWA + iOS home-screen install needs. Re-run with `node scripts/gen-icons.mjs`
// after editing the emblem. Output goes to public/ (committed).
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const NAVY = '#1a2535'
const GOLD = '#C9A84C'

// Centered dumbbell (font-free, stays within the maskable safe zone).
const emblem = `
  <g fill="${GOLD}">
    <rect x="196" y="240" width="120" height="32" rx="10"/>
    <rect x="140" y="192" width="58" height="128" rx="16"/>
    <rect x="314" y="192" width="58" height="128" rx="16"/>
    <rect x="112" y="220" width="30" height="72" rx="12"/>
    <rect x="370" y="220" width="30" height="72" rx="12"/>
  </g>`

// rounded = nice standalone icon; square = full-bleed for maskable + iOS (OS masks).
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="104" fill="${NAVY}"/>${emblem}</svg>`
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${NAVY}"/>${emblem}</svg>`

async function png(svg, size, file) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/${file}`)
  console.log('  wrote public/' + file)
}

await mkdir('public', { recursive: true })
await png(rounded, 192, 'icon-192.png')
await png(rounded, 512, 'icon-512.png')
await png(square, 512, 'icon-maskable-512.png')
await png(square, 180, 'apple-touch-icon.png')
console.log('done')
