window.__omniCursorElement__ = null
window.__omniConsoleLogs__ = []
window.__omniPageErrors__ = []

document.addEventListener('mousemove', (e) => {
  window.__omniCursorElement__ = e.target
}, { passive: true })

document.addEventListener('mouseover', (e) => {
  window.__omniCursorElement__ = e.target
}, { passive: true })

const _origError = console.error
console.error = function (...args) {
  window.__omniConsoleLogs__.push('[error] ' + args.map(String).join(' '))
  _origError.apply(console, args)
}

const _origWarn = console.warn
console.warn = function (...args) {
  window.__omniConsoleLogs__.push('[warn] ' + args.map(String).join(' '))
  _origWarn.apply(console, args)
}

window.addEventListener('error', (event) => {
  window.__omniPageErrors__.push(
    event.message + ' at ' + event.filename + ':' + event.lineno + ':' + event.colno
  )
})

window.addEventListener('unhandledrejection', (event) => {
  window.__omniPageErrors__.push(
    'Unhandled rejection: ' + String(event.reason)
  )
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "ping") {
    sendResponse({ pong: true })
    return true
  }
  sendResponse({ error: "Unknown action: " + message.action })
  return false
})
