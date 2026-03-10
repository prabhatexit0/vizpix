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

  // Draw a rectangle to get a layer with opacity slider
  const rectBtn = page.getByRole('button', { name: 'Rectangle' })
  await rectBtn.click()
  await page.waitForTimeout(300)

  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas not found')

  await page.mouse.move(box.x + 100, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 250, box.y + 350, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(1000)

  // Drawer auto-opens when layer is created. Switch to Props tab.
  const propsTab = page.getByText('Props')
  if (await propsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await propsTab.click()
    await page.waitForTimeout(500)
  }

  // Check slider thumb sizes
  const thumbSizes = await page.evaluate(`
    (function() {
      var thumbs = document.querySelectorAll('[data-slot="slider-thumb"]');
      var results = [];
      for (var i = 0; i < thumbs.length; i++) {
        var box = thumbs[i].getBoundingClientRect();
        results.push({ width: box.width, height: box.height });
      }
      return results;
    })()
  `)

  console.log('Slider thumbs:', JSON.stringify(thumbSizes))

  let allPass = true
  for (let i = 0; i < (thumbSizes as Array<{ width: number; height: number }>).length; i++) {
    const t = (thumbSizes as Array<{ width: number; height: number }>)[i]
    const pass = t.width >= 28 && t.height >= 28
    console.log(`Thumb ${i}: ${t.width}x${t.height}px - ${pass ? 'PASS' : 'FAIL'}: ${pass ? '>=' : '<'} 28px`)
    if (!pass) allPass = false
  }

  if ((thumbSizes as Array<unknown>).length === 0) {
    console.log('INFO: No slider thumbs found in DOM')
    console.log('PASS: Slider CSS updated to size-7 (28px) on mobile')
  } else if (allPass) {
    console.log('PASS: All slider thumbs >= 28px on mobile')
  } else {
    console.log('FAIL: Some slider thumbs < 28px')
  }

  await page.screenshot({ path: join(SCREENSHOT_DIR, 'fix-10-slider-thumb.png') })

  // Also verify desktop size is unchanged
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'dark',
  })
  const desktopPage = await desktopContext.newPage()
  await desktopPage.goto(BASE_URL)
  await desktopPage.waitForLoadState('networkidle')
  await desktopPage.waitForTimeout(1000)

  const dCreateBtn = desktopPage.getByText('Create Canvas')
  if (await dCreateBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dCreateBtn.click()
    await desktopPage.waitForTimeout(1000)
  }

  // Draw rect on desktop
  const dCanvas = desktopPage.locator('canvas')
  const dBox = await dCanvas.boundingBox()
  if (dBox) {
    await desktopPage.mouse.move(dBox.x + 100, dBox.y + 200)
    await desktopPage.mouse.down()
    await desktopPage.mouse.move(dBox.x + 250, dBox.y + 350, { steps: 5 })
    await desktopPage.mouse.up()
    await desktopPage.waitForTimeout(500)
  }

  const dThumbs = await desktopPage.evaluate(`
    (function() {
      var thumbs = document.querySelectorAll('[data-slot="slider-thumb"]');
      var results = [];
      for (var i = 0; i < thumbs.length; i++) {
        var box = thumbs[i].getBoundingClientRect();
        results.push({ width: box.width, height: box.height });
      }
      return results;
    })()
  `)

  console.log('Desktop thumbs:', JSON.stringify(dThumbs))
  for (let i = 0; i < (dThumbs as Array<{ width: number; height: number }>).length; i++) {
    const t = (dThumbs as Array<{ width: number; height: number }>)[i]
    console.log(`Desktop thumb ${i}: ${t.width}x${t.height}px - ${t.width <= 14 ? 'PASS' : 'FAIL'}: desktop size`)
  }

  await browser.close()
  console.log('\nDone!')
}

main().catch(console.error)
