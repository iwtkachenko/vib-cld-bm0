/** jsdom lacks a few browser APIs Mantine / ProseMirror touch. Loaded for every test file (see vitest.config.ts). */
if (typeof window !== 'undefined') {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
  // Mantine's autosize Textarea listens to font loading
  if (!('fonts' in document)) Object.defineProperty(document, 'fonts', { value: { addEventListener() {}, removeEventListener() {} } })
  // ProseMirror measures the DOM in a few places that jsdom does not implement
  document.createRange ??= (() => ({})) as never
  Range.prototype.getClientRects ??= () => ({ item: () => null, length: 0, [Symbol.iterator]: [][Symbol.iterator] }) as never
  Range.prototype.getBoundingClientRect ??= () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() {} })
  Element.prototype.scrollIntoView ??= () => {}
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
}
export {}
