// Regenerates public/icons/icon-{16,32,64,80}.png from icon-source.svg.
// Requires `sharp` (not a project dependency; install temporarily with
// `npm install --no-save sharp` before running, if not already present).
import sharp from 'sharp'

for (const size of [16, 32, 64, 80]) {
  await sharp('public/icons/icon-source.svg').resize(size, size).png().toFile(`public/icons/icon-${size}.png`)
}
console.log('Generated icon-16/32/64/80.png from icon-source.svg')
