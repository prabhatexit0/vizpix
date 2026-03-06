#!/usr/bin/env npx tsx
/**
 * Browser test helper for Ralph autonomous agent.
 *
 * Usage (run from repo root):
 *   npx tsx scripts/ralph/tests/browser-test.ts <scenario>
 *
 * Scenarios:
 *   screenshot     - Just screenshot current state
 *   create-text    - Create a text layer, type, commit, check props
 *   create-shape   - Create rectangle + ellipse, check layers
 *   test-scroll    - Create content, verify props panel scrolls
 *   test-resize    - Drag panel resize, check for flicker
 *   full-smoke     - Full end-to-end test (default)
 *   investigate    - Screenshot everything: all panels, all tool states
 *
 * Screenshots saved to: scripts/ralph/tests/screenshots/
 * Read them with: Read tool on the .png files
 */

import { chromium } from 'playwright-core'
import { mkdirSync, existsSync } from 'fs'
import { join, resolve } from 'path'

const SCREENSHOT_DIR = resolve(__dirname, 'screenshots')
const BASE_URL = 'http://localhost:5173'
const scenario = process.argv[2] || 'full-smoke'

mkdirSync(SCREENSHOT_DIR, { recursive: true })

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
  })
  const page = await context.newPage()

  try {
    await run(page)
  } catch (err) {
    console.error('Test failed:', err)
    await ss(page, 'error-state')
  } finally {
    await browser.close()
  }
}

async function ss(page: any, name: string) {
  const path = join(SCREENSHOT_DIR, `${name}.png`)
  await page.screenshot({ path })
  console.log(`SCREENSHOT: scripts/ralph/tests/screenshots/${name}.png`)
}

async function createCanvas(page: any) {
  await page.goto(BASE_URL)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)
  const createBtn = page.getByText('Create Canvas')
  if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await createBtn.click()
    await page.waitForTimeout(1000)
  }
}

async function getCanvasBox(page: any) {
  const canvas = page.locator('canvas').first()
  return canvas.boundingBox()
}

async function run(page: any) {
  if (scenario === 'screenshot') {
    await page.goto(BASE_URL)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)
    await ss(page, 'current-state')
    return
  }

  if (scenario === 'create-text') {
    await createCanvas(page)
    await ss(page, '01-empty-canvas')

    // Text tool via keyboard
    await page.keyboard.press('t')
    await page.waitForTimeout(300)

    // Click canvas center-ish
    const box = await getCanvasBox(page)
    await page.locator('canvas').first().click({
      position: { x: box.width / 2, y: box.height / 3 },
    })
    await page.waitForTimeout(800)
    await ss(page, '02-text-created')

    // Type
    await page.keyboard.type('Hello World')
    await page.waitForTimeout(500)
    await ss(page, '03-text-typed')

    // Escape to commit
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    await ss(page, '04-text-committed')

    // Click on text to re-select
    await page.locator('canvas').first().click({
      position: { x: box.width / 2, y: box.height / 3 },
    })
    await page.waitForTimeout(500)

    // Check Props tab
    await page.getByRole('tab', { name: 'Props' }).click()
    await page.waitForTimeout(500)
    await ss(page, '05-text-properties')

    console.log('\nCREATE-TEXT TEST DONE')
    return
  }

  if (scenario === 'create-shape') {
    await createCanvas(page)

    // Rectangle
    await page.keyboard.press('r')
    await page.waitForTimeout(300)
    const box = await getCanvasBox(page)
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.3 + 200, box.y + box.height * 0.3 + 150, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(500)
    await ss(page, '01-rectangle')

    // Ellipse
    await page.keyboard.press('e')
    await page.waitForTimeout(300)
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.6 + 150, box.y + box.height * 0.5 + 100, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(500)
    await ss(page, '02-ellipse')

    // Layers
    await page.getByRole('tab', { name: 'Layers' }).click()
    await page.waitForTimeout(500)
    await ss(page, '03-layers')

    console.log('\nCREATE-SHAPE TEST DONE')
    return
  }

  if (scenario === 'test-scroll') {
    await createCanvas(page)

    // Create text
    await page.keyboard.press('t')
    const box = await getCanvasBox(page)
    await page.locator('canvas').first().click({ position: { x: box.width / 2, y: box.height / 3 } })
    await page.waitForTimeout(500)
    await page.keyboard.type('Scroll test')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // Select the layer
    await page.locator('canvas').first().click({ position: { x: box.width / 2, y: box.height / 3 } })
    await page.waitForTimeout(500)

    // Props tab
    await page.getByRole('tab', { name: 'Props' }).click()
    await page.waitForTimeout(500)
    await ss(page, '01-props-top')

    // Scroll down in the panel
    const tabPanel = page.locator('[role="tabpanel"]:visible')
    await tabPanel.evaluate((el: HTMLElement) => { el.scrollTop = 500 })
    await page.waitForTimeout(300)
    await ss(page, '02-props-scrolled')

    const scrollTop = await tabPanel.evaluate((el: HTMLElement) => el.scrollTop)
    console.log(`Scroll position: ${scrollTop}`)
    console.log(scrollTop > 0 ? 'SCROLL WORKS' : 'SCROLL BROKEN')
    return
  }

  if (scenario === 'test-resize') {
    await createCanvas(page)

    // Create content
    await page.keyboard.press('r')
    const box = await getCanvasBox(page)
    await page.mouse.move(box.x + 200, box.y + 200)
    await page.mouse.down()
    await page.mouse.move(box.x + 500, box.y + 400, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(500)
    await ss(page, '01-before-resize')

    // Drag resize handle
    const handle = page.locator('.cursor-col-resize')
    const hBox = await handle.boundingBox()
    if (hBox) {
      await page.mouse.move(hBox.x + hBox.width / 2, hBox.y + hBox.height / 2)
      await page.mouse.down()
      for (let i = 1; i <= 10; i++) {
        await page.mouse.move(hBox.x - i * 15, hBox.y + hBox.height / 2)
        await page.waitForTimeout(30)
      }
      await ss(page, '02-during-resize')
      await page.mouse.up()
      await page.waitForTimeout(500)
      await ss(page, '03-after-resize')
    }

    console.log('\nRESIZE TEST DONE')
    return
  }

  if (scenario === 'investigate') {
    await createCanvas(page)
    await ss(page, '01-empty-canvas')

    const box = await getCanvasBox(page)

    // Create text via double-click
    await page.locator('canvas').first().dblclick({ position: { x: box.width / 2, y: 150 } })
    await page.waitForTimeout(600)
    await page.keyboard.type('Heading Text')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    await ss(page, '02-text-created')

    // Create rectangle
    await page.keyboard.press('r')
    await page.waitForTimeout(200)
    await page.mouse.move(box.x + 200, box.y + 300)
    await page.mouse.down()
    await page.mouse.move(box.x + 450, box.y + 450, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(500)
    await ss(page, '03-with-shapes')

    // Create ellipse
    await page.keyboard.press('e')
    await page.waitForTimeout(200)
    await page.mouse.move(box.x + 500, box.y + 300)
    await page.mouse.down()
    await page.mouse.move(box.x + 700, box.y + 450, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(500)

    // Screenshot each tab with content
    await page.getByRole('tab', { name: 'Layers' }).click()
    await page.waitForTimeout(400)
    await ss(page, '04-layers-tab')

    await page.getByRole('tab', { name: 'Props' }).click()
    await page.waitForTimeout(400)
    await ss(page, '05-props-tab')

    await page.getByRole('tab', { name: 'Adjust' }).click()
    await page.waitForTimeout(400)
    await ss(page, '06-adjust-tab')

    // Select text layer, check its props
    await page.locator('canvas').first().click({ position: { x: box.width / 2, y: 150 } })
    await page.waitForTimeout(500)
    await page.getByRole('tab', { name: 'Props' }).click()
    await page.waitForTimeout(400)
    await ss(page, '07-text-props')

    // Scroll the props panel
    const tabPanel = page.locator('[role="tabpanel"]:visible')
    await tabPanel.evaluate((el: HTMLElement) => { el.scrollTop = 9999 })
    await page.waitForTimeout(300)
    await ss(page, '08-props-scrolled-bottom')

    // Double-click text to edit (force: true to bypass SVG overlay interception)
    await page.locator('canvas').first().dblclick({ position: { x: box.width / 2, y: 150 }, force: true })
    await page.waitForTimeout(600)
    await ss(page, '09-text-editing')

    // Escape
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // Try shortcuts dialog
    await page.keyboard.press('Shift+/')
    await page.waitForTimeout(500)
    await ss(page, '10-shortcuts-dialog')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // Zoom in
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Equal')
      await page.waitForTimeout(100)
    }
    await page.waitForTimeout(300)
    await ss(page, '11-zoomed-in')

    // Zoom out
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Minus')
      await page.waitForTimeout(100)
    }
    await page.waitForTimeout(300)
    await ss(page, '12-zoomed-out')

    // Deselect and check layers tab
    await page.locator('canvas').first().click({ position: { x: 50, y: 50 } })
    await page.waitForTimeout(500)
    await ss(page, '13-deselected')

    // Undo a few times
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(500)
    await ss(page, '14-after-undo')

    // Redo
    await page.keyboard.press('Control+Shift+z')
    await page.waitForTimeout(500)
    await ss(page, '15-after-redo')

    console.log('\nINVESTIGATE DONE — 15 screenshots captured')
    return
  }

  // Default: full-smoke
  await createCanvas(page)
  await ss(page, '01-empty-canvas')

  const box = await getCanvasBox(page)

  // Create text
  await page.locator('canvas').first().dblclick({ position: { x: box.width / 2, y: box.height / 4 } })
  await page.waitForTimeout(800)
  await page.keyboard.type('Title Text')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  await ss(page, '02-text-created')

  // Create rectangle
  await page.keyboard.press('r')
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.3 + 200, box.y + box.height * 0.5 + 120, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  await ss(page, '03-rectangle')

  // Layers
  await page.getByRole('tab', { name: 'Layers' }).click()
  await page.waitForTimeout(400)
  await ss(page, '04-layers')

  // Select text, check props
  await page.locator('canvas').first().click({ position: { x: box.width / 2, y: box.height / 4 } })
  await page.waitForTimeout(500)
  await ss(page, '05-text-selected')

  // Shortcuts
  await page.keyboard.press('Shift+/')
  await page.waitForTimeout(500)
  await ss(page, '06-shortcuts')
  await page.keyboard.press('Escape')

  // Undo/redo
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(500)
  await ss(page, '07-undo')
  await page.keyboard.press('Control+Shift+z')
  await page.waitForTimeout(500)
  await ss(page, '08-redo')

  await ss(page, '09-final-state')
  console.log('\nFULL SMOKE TEST DONE')
}

main().catch(console.error)
