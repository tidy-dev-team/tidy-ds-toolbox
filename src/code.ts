// Main thread code for Figma plugin
figma.showUI(__html__, { width: 800, height: 600 })

// Import handlers
const { getModuleHandlers } = require('./moduleLoader')
const handlers = getModuleHandlers()

// Message routing
figma.ui.onmessage = async (msg: any) => {
  if (msg?.pluginMessage) {
    const { target, action, payload, requestId } = msg.pluginMessage

    console.log(`[Main] Received: ${target}:${action}`, payload)

    try {
      if (handlers[target]) {
        const result = await handlers[target](action, payload, figma)

        // Send response back to UI if requestId provided
        if (requestId) {
          figma.ui.postMessage({
            type: 'response',
            requestId,
            result
          })
        }
      } else {
        console.error(`[Main] Unknown target: ${target}`)
        figma.ui.postMessage({
          type: 'error',
          requestId,
          error: `Unknown module: ${target}`
        })
      }
    } catch (error) {
      console.error(`[Main] Error handling ${target}:${action}`, error)
      figma.ui.postMessage({
        type: 'error',
        requestId,
        error: error.message
      })
    }
  }
}

export {}