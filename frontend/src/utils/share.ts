/**
 * Viral loops: carry Kryzen content into other apps (Instagram, WhatsApp…).
 * Prefers the native share sheet, falls back to clipboard, then download.
 */

export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'unsupported'> {
  try {
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      await (navigator as any).share({ title, text })
      return 'shared'
    }
  } catch (e: any) {
    // Dismissing the sheet is fine — treat as done, not an error.
    if (e?.name === 'AbortError') return 'shared'
  }
  try {
    await navigator.clipboard.writeText(`${title}\n${text}`)
    return 'copied'
  } catch {
    return 'unsupported'
  }
}

export async function shareFile(file: File, title: string, text: string): Promise<'shared' | 'downloaded' | 'unsupported'> {
  try {
    const nav = navigator as any
    if (nav?.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
      await nav.share({ title, text, files: [file] })
      return 'shared'
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') return 'shared'
  }
  try {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    return 'downloaded'
  } catch {
    return 'unsupported'
  }
}
