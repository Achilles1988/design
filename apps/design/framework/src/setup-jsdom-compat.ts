// Fixes a Node.js v25 incompatibility where globalThis.localStorage exists but lacks
// Storage methods. When vitest runs a test in the jsdom environment, jsdom's real
// Storage object is accessible via globalThis.jsdom.window.localStorage.
// We re-expose it as globalThis.localStorage so tests can use the standard API.
if (
  typeof globalThis !== 'undefined' &&
  // @ts-ignore
  typeof globalThis.jsdom !== 'undefined' &&
  // @ts-ignore
  typeof globalThis.jsdom?.window?.localStorage?.setItem === 'function'
) {
  Object.defineProperty(globalThis, 'localStorage', {
    // @ts-ignore
    value: globalThis.jsdom.window.localStorage,
    writable: true,
    configurable: true,
  })
}
