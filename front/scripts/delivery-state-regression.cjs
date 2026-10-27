// Run against a local frontend with PLAYWRIGHT_MODULE pointing to an installed
// playwright package if it is not available in this project's node_modules.
// All API calls are intercepted; this test never starts real delivery tasks.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.DELIVERY_TEST_URL || 'http://127.0.0.1:6870'

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  let page
  try {
    page = await browser.newPage()
    page.on('pageerror', error => console.error('Browser error:', error.message))
    page.setDefaultTimeout(8000)
    let statusFailure = false
    let stopMode = 'normal'
    let startMode = 'normal'
    let delayedStatus = null
    let releaseStatus = null
    const running = { boss: false, liepin: false, '51job': false, zhilian: false }
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (!url.pathname.startsWith('/api/')) {
        if (url.origin === new URL(base).origin) return route.continue()
        return route.abort()
      }
      if (url.pathname.endsWith('/stream')) {
        return route.fulfill({ contentType: 'text/event-stream', body: 'event: connected\ndata: {"bossLoggedIn":true,"liepinLoggedIn":true,"job51LoggedIn":true,"zhilianLoggedIn":true}\n\n' })
      }
      const [, , platform, action] = url.pathname.split('/')
      let body = { success: true }
      let status = 200
      if (platform in running) {
        if (action === 'status') {
          if (statusFailure) return route.fulfill({ status: 503, json: { success: false } })
          body = { isRunning: running[platform] }
          if (delayedStatus === platform) {
            delayedStatus = null
            await new Promise(resolve => { releaseStatus = resolve })
          }
        }
        if (action === 'start') {
          if (running[platform]) {
            body = { success: false, status: 'running', message: '任务已在运行中' }
            status = 400
          } else if (startMode === 'lost-response') {
            running[platform] = true
            return route.abort()
          } else if (startMode !== 'delayed-worker') running[platform] = true
        }
        if (action === 'stop') {
          if (stopMode === 'failure') return route.fulfill({ status: 500, json: { success: false, message: '停止失败' } })
          if (stopMode === 'normal') running[platform] = false
        }
      }
      return route.fulfill({ status, json: body })
    })
    await page.goto(`${base}/boss`)
    await page.getByRole('button', { name: '开始投递', exact: true }).click()
    await page.getByRole('button', { name: '停止投递', exact: true }).waitFor()
    await page.getByRole('link', { name: '猎聘', exact: true }).click()
    await page.getByRole('button', { name: '开始投递', exact: true }).click()
    await page.getByRole('button', { name: '停止投递', exact: true }).waitFor()
    await page.getByRole('link', { name: 'Boss直聘', exact: true }).click()
    await page.getByRole('button', { name: '停止投递', exact: true }).waitFor({ timeout: 5000 })
    assert.equal(running.boss, true)
    console.log('PASS: BOSS → 猎聘启动 → BOSS 恢复停止入口')
    // A new mount must recover the backend task too (reload/new tab/cache eviction).
    await page.reload()
    await page.getByRole('button', { name: '停止投递', exact: true }).waitFor({ timeout: 5000 })
    console.log('PASS: 页面重新挂载后恢复正在运行的 BOSS 任务')

    const button = name => page.getByRole('button', { name, exact: true })
    const focus = () => page.evaluate(() => window.dispatchEvent(new Event('focus')))
    for (const platform of Object.keys(running)) {
      running[platform] = true
      await page.goto(`${base}/${platform}`)
      await button('停止投递').waitFor()
      running[platform] = false
      // Completion without any click must be reflected by polling.
      await button('开始投递').waitFor()
      await button('开始投递').click()
      await button('停止投递').waitFor()
      await button('停止投递').click()
      await button('开始投递').waitFor()
      console.log(`PASS: ${platform} 恢复状态、自然结束、启动、停止`)
    }

    await page.goto(`${base}/boss`)
    await button('开始投递').waitFor()
    running.boss = true // Another tab starts a task before this tab's next poll.
    await button('开始投递').click()
    await button('停止投递').waitFor()
    assert.equal(await page.getByText('启动失败', { exact: true }).count(), 0)
    console.log('PASS: 已在运行响应恢复停止入口，不弹启动失败')

    stopMode = 'failure'
    await button('停止投递').click()
    await button('停止投递').waitFor()
    assert.equal(await button('开始投递').count(), 0)
    console.log('PASS: 停止失败保留停止入口')

    stopMode = 'acknowledge'
    await button('停止投递').click()
    await button('正在停止...').waitFor()
    assert.equal(await button('正在停止...').isEnabled(), false)
    running.boss = false
    await focus()
    await button('开始投递').waitFor()
    stopMode = 'normal'
    console.log('PASS: 停止请求受理后等待后台确认退出')

    startMode = 'delayed-worker'
    await button('开始投递').click()
    await button('正在启动...').waitFor()
    await focus()
    await button('正在启动...').waitFor()
    running.boss = true
    await focus()
    await button('停止投递').waitFor()
    startMode = 'normal'
    console.log('PASS: 异步任务尚未置运行标志时保持启动过渡状态')

    statusFailure = true
    await page.goto(`${base}/liepin`)
    await button('重试获取状态').waitFor()
    assert.equal(await button('开始投递').count(), 0)
    running.liepin = true
    statusFailure = false
    await button('重试获取状态').click()
    await button('停止投递').waitFor()
    statusFailure = true
    await focus()
    await page.getByRole('status').filter({ hasText: '无法获取任务状态' }).waitFor()
    await button('停止投递').waitFor()
    statusFailure = false
    console.log('PASS: 初次查询失败不误报空闲，运行中断网保留停止入口')

    running.liepin = false
    await focus()
    await button('开始投递').waitFor()
    startMode = 'lost-response'
    await button('开始投递').click()
    await button('停止投递').waitFor()
    startMode = 'normal'
    console.log('PASS: 启动响应丢失后重新查询后台状态')

    running.liepin = false
    await focus()
    await button('开始投递').waitFor()
    delayedStatus = 'liepin'
    await focus()
    // Wait for the mock to capture an idle status response before starting.
    const deadline = Date.now() + 5000
    while (!releaseStatus && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
    assert.ok(releaseStatus, '捕获延迟的状态查询')
    await button('开始投递').click()
    releaseStatus()
    await button('停止投递').waitFor()
    await focus()
    await button('停止投递').waitFor()
    console.log('PASS: 启动前发出的旧状态响应不会覆盖新任务状态')

    running.boss = false
    await page.goto(`${base}/boss`)
    await button('开始投递').waitFor()
    delayedStatus = 'boss'
    releaseStatus = null
    startMode = 'lost-response'
    await button('开始投递').click()
    const cancellationDeadline = Date.now() + 5000
    while (!releaseStatus && Date.now() < cancellationDeadline) await new Promise(resolve => setTimeout(resolve, 20))
    assert.ok(releaseStatus, '捕获启动后的状态恢复查询')
    await page.getByRole('link', { name: '猎聘', exact: true }).click()
    await page.getByRole('heading', { name: '猎聘配置', exact: true }).waitFor()
    releaseStatus()
    startMode = 'normal'
    await page.getByRole('link', { name: 'Boss直聘', exact: true }).click()
    await button('停止投递').waitFor()
    assert.equal(await page.getByText('启动失败', { exact: true }).count(), 0)
    console.log('PASS: 离开页面时取消的请求不会在返回后弹出失败提示')

  } catch (error) {
    if (page) console.error('Visible page:', (await page.locator('body').innerText()).slice(0, 1500))
    throw error
  } finally {
    await browser.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
