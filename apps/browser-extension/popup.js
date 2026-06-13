const captureBtn = document.getElementById('captureBtn')
const copyBtn = document.getElementById('copyBtn')
const statusEl = document.getElementById('status')
const summaryEl = document.getElementById('summary')
const summaryUrl = document.getElementById('summaryUrl')
const summaryConsole = document.getElementById('summaryConsole')
const summaryErrors = document.getElementById('summaryErrors')

let lastResult = null

function setStatus(type, text) {
  statusEl.className = 'status ' + type
  statusEl.textContent = text
}

function clearStatus() {
  statusEl.className = 'status'
  statusEl.textContent = ''
}

captureBtn.addEventListener('click', async () => {
  captureBtn.disabled = true
  copyBtn.disabled = true
  setStatus('loading', 'Capturing...')
  summaryEl.classList.remove('visible')

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab) throw new Error('No active tab found')

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' }).catch(() => null)

    let result
    if (response?.pong) {
      const captureResp = await chrome.tabs.sendMessage(tab.id, {
        action: 'capture',
        requestId: 'popup_' + Date.now(),
      })
      if (captureResp?.browserContext) {
        result = captureResp.browserContext
      }
    }

    if (!result) {
      const bgResp = await chrome.runtime.sendMessage({
        action: 'capture',
        requestId: 'popup_' + Date.now(),
      })
      if (bgResp.error) throw new Error(bgResp.error)
      if (bgResp.browserContext) {
        result = bgResp.browserContext
      }
    }

    if (!result) throw new Error('Failed to capture context')

    lastResult = result

    if (result.url) {
      summaryUrl.textContent = result.url.length > 60
        ? result.url.slice(0, 57) + '...'
        : result.url
    } else {
      summaryUrl.textContent = '-'
    }

    const consoleCount = result.consoleMessages?.length ?? 0
    summaryConsole.textContent = consoleCount + ' messages'

    const errorCount = result.pageErrors?.length ?? 0
    summaryErrors.textContent = errorCount + ' errors'

    summaryEl.classList.add('visible')
    copyBtn.disabled = false
    setStatus('success', 'Context captured successfully')

    await navigator.clipboard.writeText(JSON.stringify(result, null, 2))
    setStatus('success', 'Captured and copied to clipboard')
  } catch (err) {
    setStatus('error', 'Error: ' + err.message)
  } finally {
    captureBtn.disabled = false
  }
})

copyBtn.addEventListener('click', async () => {
  if (!lastResult) return
  try {
    await navigator.clipboard.writeText(JSON.stringify(lastResult, null, 2))
    setStatus('success', 'Copied to clipboard')
  } catch (err) {
    setStatus('error', 'Failed to copy: ' + err.message)
  }
})
