function serialize(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const xml = new XMLSerializer().serializeToString(clone)
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadSvg(svg: SVGSVGElement, filename = 'dendrograph.svg') {
  const blob = new Blob([serialize(svg)], { type: 'image/svg+xml' })
  triggerDownload(blob, filename)
}

async function svgToPngBlob(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const width = Number(svg.getAttribute('width'))
  const height = Number(svg.getAttribute('height'))
  const svgBlob = new Blob([serialize(svg)], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(svgBlob)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('SVGの画像化に失敗しました'))
      img.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D コンテキストを取得できませんでした')
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('PNGの生成に失敗しました'))
      }, 'image/png')
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function downloadPng(svg: SVGSVGElement, filename = 'dendrograph.png', scale = 2) {
  const blob = await svgToPngBlob(svg, scale)
  triggerDownload(blob, filename)
}

export async function copyPngToClipboard(svg: SVGSVGElement, scale = 2) {
  const blob = await svgToPngBlob(svg, scale)
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}
