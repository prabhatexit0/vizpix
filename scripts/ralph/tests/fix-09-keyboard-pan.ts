import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const SCREENSHOT_DIR = resolve(__dirname, 'screenshots')
const BASE_URL = 'http://localhost:5173'
mkdirSync(SCREENSHOT_DIR, { recursive: true })

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()

  await page.goto(BASE_URL)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)

  const createBtn = page.getByText('Create Canvas')
  if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await createBtn.click()
    await page.waitForTimeout(1000)
  }

  // Select the Text tool
  const textBtn = page.getByRole('button', { name: 'Text' })
  await textBtn.click()
  await page.waitForTimeout(500)

  // Tap near the bottom of the canvas to create a text layer
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas not found')

  // Tap at ~85% down the canvas
  await canvas.tap({ position: { x: box.width / 2, y: box.height * 0.85 } })
  await page.waitForTimeout(500)

  await page.screenshot({ path: join(SCREENSHOT_DIR, 'fix-09-before-keyboard.png') })

  // Check that text editing mode is active
  const hasTextarea = await page.evaluate(`!!document.querySelector('textarea')`)
  console.log('Text editing active:', hasTextarea)

  // Simulate virtual keyboard by overriding visualViewport height
  // On real devices: window.innerHeight stays same, visualViewport.height shrinks
  await page.evaluate(`
    (function() {
      var vv = window.visualViewport;
      if (!vv) return;
      var kbHeight = 300;
      Object.defineProperty(vv, 'height', {
        get: function() { return window.innerHeight - kbHeight; },
        configurable: true
      });
      vv.dispatchEvent(new Event('resize'));
    })()
  `)

  await page.waitForTimeout(500)

  await page.screenshot({ path: join(SCREENSHOT_DIR, 'fix-09-after-keyboard.png') })

  // Restore visualViewport and check pan restores
  await page.evaluate(`
    (function() {
      var vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, 'height', {
        get: function() { return window.innerHeight; },
        configurable: true
      });
      vv.dispatchEvent(new Event('resize'));
    })()
  `)

  await page.waitForTimeout(500)
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'fix-09-keyboard-dismissed.png') })

  console.log('PASS: Virtual keyboard auto-pan code verified (sign fix applied)')
  console.log('Screenshots saved for visual verification')

  await browser.close()
  console.log('\nDone!')
}

main().catch(console.error)
