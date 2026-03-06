/**
 * Browser test helper for Ralph autonomous agent.
 *
 * Usage:
 *   npx playwright test scripts/ralph/tests/browser-helper.ts
 *
 * Or run specific scenarios:
 *   SCENARIO=screenshot npx playwright test scripts/ralph/tests/browser-helper.ts
 *   SCENARIO=create-text npx playwright test scripts/ralph/tests/browser-helper.ts
 *   SCENARIO=create-shape npx playwright test scripts/ralph/tests/browser-helper.ts
 *   SCENARIO=full-smoke npx playwright test scripts/ralph/tests/browser-helper.ts
 *
 * Screenshots are saved to scripts/ralph/tests/screenshots/
 * Ralph can read these with the Read tool to inspect visual state.
 */

import { test, expect } from '@playwright/test'
import { join } from 'path'

const BASE_URL = 'http://localhost:5173'
const SCREENSHOT_DIR = join(__dirname, 'screenshots')

const scenario = process.env.SCENARIO || 'full-smoke'

test.use({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
})

async function createCanvas(page) {
  await page.goto(BASE_URL)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)

  // Click "Create Canvas" if on the new canvas screen
  const createBtn = page.getByText('Create Canvas')
  if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await createBtn.click()
    await page.waitForTimeout(1000)
  }
}

async function screenshot(page, name) {
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`) })
  console.log(`Screenshot saved: scripts/ralph/tests/screenshots/${name}.png`)
}

// Get the canvas element
async function getCanvas(page) {
  return page.locator('canvas').first()
}

// Click a toolbar button by its position (0-indexed from top)
// Toolbar order: pointer(0), hand(1), zoom(2), crop(3), selection(4), DRAW_LABEL, rect(5), ellipse(6), text(7), group(8), ungroup(9), undo(10), redo(11), adjust(12), export(13)
async function clickToolByIndex(page, index) {
  const buttons = page.locator('[data-slot="editor-canvas"]').locator('..').locator('> div:first-child button')
  await buttons.nth(index).click()
  await page.waitForTimeout(300)
}

// Use keyboard shortcut to select tool
async function selectTool(page, key) {
  await page.keyboard.press(key)
  await page.waitForTimeout(200)
}

test('browser test scenario', async ({ page }) => {
  if (scenario === 'screenshot') {
    // Just take a screenshot of current state
    await page.goto(BASE_URL)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)
    await screenshot(page, 'current-state')
    return
  }

  if (scenario === 'create-text') {
    await createCanvas(page)
    await screenshot(page, '01-empty-canvas')

    // Select text tool with keyboard
    await selectTool(page, 't')
    await page.waitForTimeout(300)
    await screenshot(page, '02-text-tool-selected')

    // Click on canvas to create text
    const canvas = await getCanvas(page)
    const box = await canvas.boundingBox()
    await canvas.click({ position: { x: box.width / 2, y: box.height / 3 } })
    await page.waitForTimeout(800)
    await screenshot(page, '03-text-layer-created')

    // Type some text
    await page.keyboard.type('Hello World')
    await page.waitForTimeout(500)
    await screenshot(page, '04-text-typed')

    // Press Escape to commit
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    await screenshot(page, '05-text-committed')

    // Double-click to re-edit
    const textArea = { x: box.width / 2, y: box.height / 3 }
    await canvas.dblclick({ position: textArea })
    await page.waitForTimeout(500)
    await screenshot(page, '06-text-re-editing')

    // Press Escape again
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // Check properties panel
    await page.getByRole('tab', { name: 'Props' }).click()
    await page.waitForTimeout(500)
    await screenshot(page, '07-text-properties')

    return
  }

  if (scenario === 'create-shape') {
    await createCanvas(page)

    // Select rectangle tool
    await selectTool(page, 'r')
    await page.waitForTimeout(300)

    // Draw rectangle by dragging
    const canvas = await getCanvas(page)
    const box = await canvas.boundingBox()
    const startX = box.width * 0.3
    const startY = box.height * 0.3
    await page.mouse.move(box.x + startX, box.y + startY)
    await page.mouse.down()
    await page.mouse.move(box.x + startX + 200, box.y + startY + 150, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(800)
    await screenshot(page, '01-rectangle-created')

    // Select ellipse tool
    await selectTool(page, 'e')
    await page.waitForTimeout(300)

    // Draw ellipse
    const eStartX = box.width * 0.6
    const eStartY = box.height * 0.5
    await page.mouse.move(box.x + eStartX, box.y + eStartY)
    await page.mouse.down()
    await page.mouse.move(box.x + eStartX + 150, box.y + eStartY + 100, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(800)
    await screenshot(page, '02-ellipse-created')

    // Check layers panel
    await page.getByRole('tab', { name: 'Layers' }).click()
    await page.waitForTimeout(500)
    await screenshot(page, '03-layers-panel')

    // Check properties panel
    await page.getByRole('tab', { name: 'Props' }).click()
    await page.waitForTimeout(500)
    await screenshot(page, '04-properties-panel')

    return
  }

  if (scenario === 'test-scroll') {
    await createCanvas(page)

    // Create a text layer so properties panel has lots of content
    await selectTool(page, 't')
    const canvas = await getCanvas(page)
    const box = await canvas.boundingBox()
    await canvas.click({ position: { x: box.width / 2, y: box.height / 3 } })
    await page.waitForTimeout(500)
    await page.keyboard.type('Test scroll')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // Click on the text layer to select it
    await canvas.click({ position: { x: box.width / 2, y: box.height / 3 } })
    await page.waitForTimeout(500)

    // Go to Props tab
    await page.getByRole('tab', { name: 'Props' }).click()
    await page.waitForTimeout(500)
    await screenshot(page, '01-props-top')

    // Try scrolling the properties panel
    const propsPanel = page.locator('[role="tabpanel"]').first()
    await propsPanel.evaluate(el => el.scrollTop = 500)
    await page.waitForTimeout(300)
    await screenshot(page, '02-props-scrolled')

    return
  }

  if (scenario === 'test-resize') {
    await createCanvas(page)

    // Create some content first
    await selectTool(page, 'r')
    const canvas = await getCanvas(page)
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 200, box.y + 200)
    await page.mouse.down()
    await page.mouse.move(box.x + 500, box.y + 400, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(500)

    await screenshot(page, '01-before-resize')

    // Find the resize handle (left edge of right panel)
    const rightPanel = page.locator('.cursor-col-resize')
    const handleBox = await rightPanel.boundingBox()
    if (handleBox) {
      // Drag resize handle to the left
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
      await page.mouse.down()
      for (let i = 0; i < 10; i++) {
        await page.mouse.move(handleBox.x - i * 20, handleBox.y + handleBox.height / 2)
        await page.waitForTimeout(50)
      }
      await screenshot(page, '02-during-resize')
      await page.mouse.up()
      await page.waitForTimeout(500)
      await screenshot(page, '03-after-resize')
    }

    return
  }

  // Default: full-smoke test
  if (scenario === 'full-smoke') {
    await createCanvas(page)
    await screenshot(page, '01-empty-canvas')

    // Test 1: Create text via double-click
    const canvas = await getCanvas(page)
    const box = await canvas.boundingBox()
    await canvas.dblclick({ position: { x: box.width / 2, y: box.height / 4 } })
    await page.waitForTimeout(800)
    await page.keyboard.type('Title Text')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    await screenshot(page, '02-text-created')

    // Test 2: Create rectangle
    await selectTool(page, 'r')
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.3 + 200, box.y + box.height * 0.5 + 120, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(800)
    await screenshot(page, '03-rectangle-created')

    // Test 3: Check layers tab
    await page.getByRole('tab', { name: 'Layers' }).click()
    await page.waitForTimeout(500)
    await screenshot(page, '04-layers-panel')

    // Test 4: Select text layer and check props
    await canvas.click({ position: { x: box.width / 2, y: box.height / 4 } })
    await page.waitForTimeout(500)
    await screenshot(page, '05-text-selected-props')

    // Test 5: Test keyboard shortcut overlay
    await page.keyboard.press('Shift+/')
    await page.waitForTimeout(500)
    await screenshot(page, '06-shortcuts-dialog')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // Test 6: Undo/redo
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(500)
    await screenshot(page, '07-after-undo')

    await page.keyboard.press('Control+Shift+z')
    await page.waitForTimeout(500)
    await screenshot(page, '08-after-redo')

    // Test 7: Zoom indicator (bottom of canvas)
    await screenshot(page, '09-zoom-indicator')

    // Test 8: Canvas background toggle
    const bgToggle = page.locator('text=Check').first()
    if (await bgToggle.isVisible({ timeout: 1000 }).catch(() => false)) {
      await bgToggle.click()
      await page.waitForTimeout(300)
      await screenshot(page, '10-bg-toggled')
    }

    console.log('\n=== FULL SMOKE TEST COMPLETE ===')
    console.log('Review screenshots in scripts/ralph/tests/screenshots/')
    return
  }

  // Custom scenario - just take screenshot
  await page.goto(BASE_URL)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)
  await screenshot(page, 'custom')
})
