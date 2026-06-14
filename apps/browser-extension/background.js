const MAX_DOM_NODES = 100

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "capture") {
    handleCapture(message, sender)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }))
    return true
  }

  if (message.action === "ping") {
    sendResponse({ pong: true, version: "0.1.0" })
    return true
  }

  sendResponse({ error: "Unknown action: " + message.action })
  return false
})

async function handleCapture(message, sender) {
  const tabId = sender.tab?.id
  if (!tabId) {
    throw new Error("No tab available for capture")
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: captureBrowserContext,
      args: [MAX_DOM_NODES],
    })
    const ctx = results[0]?.result
    if (!ctx) throw new Error("Content script returned empty result")
    return { browserContext: ctx }
  } catch (err) {
    throw new Error("Failed to capture browser context: " + err.message)
  }
}

function captureBrowserContext(maxNodes) {
  const ctx = {}

  ctx.url = window.location.href
  ctx.title = document.title
  ctx.route = window.location.pathname + window.location.search + window.location.hash

  ctx.viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  }

  const cursorEl = window.__vystaCursorElement__
  if (cursorEl) {
    ctx.elementUnderCursor = elementToContext(cursorEl)
  }

  const ariaElements = document.querySelectorAll('[role]')
  const roles = new Set()
  const ariaLines = []
  let ariaCount = 0
  for (const el of ariaElements) {
    if (ariaCount >= maxNodes) break
    const role = el.getAttribute('role')
    if (role && !roles.has(role)) {
      roles.add(role)
    }
    const label = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || ''
    const text = (el.textContent || '').trim().slice(0, 80)
    if (label || text) {
      ariaLines.push(`[${role}] ${label || text}`)
      ariaCount++
    }
  }
  ctx.accessibilitySnapshot = ariaLines.join('\n')

  ctx.consoleMessages = (window.__vystaConsoleLogs__ || []).slice(-20)
  ctx.pageErrors = (window.__vystaPageErrors__ || []).slice(-10)

  const networkFailures = []
  try {
    const entries = performance.getEntriesByType('resource')
    for (const entry of entries) {
      if (entry.transferSize === 0 && entry.duration > 1000) {
        networkFailures.push(entry.name)
      }
    }
  } catch (_) { /* ignore */ }
  ctx.networkFailures = networkFailures.slice(-20)

  return ctx
}

function elementToContext(el) {
  const ctx = {}
  ctx.tagName = el.tagName?.toLowerCase()
  ctx.id = el.id || undefined
  if (el.className && typeof el.className === 'string') {
    ctx.className = el.className
  }
  ctx.textContent = (el.textContent || '').trim().slice(0, 200) || undefined
  const ariaLabel = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')
  if (ariaLabel) ctx.ariaLabel = ariaLabel

  const rect = el.getBoundingClientRect()
  if (rect) {
    ctx.boundingRect = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    }
  }
  return ctx
}
