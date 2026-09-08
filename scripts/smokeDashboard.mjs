const value = process.argv[2] || process.env.DASHBOARD_URL

if (!value) {
  throw new Error('Pass the dashboard URL, for example: yarn smoke:dashboard https://castle-grooves.example')
}

const origin = new URL(value)
const url = (path) => new URL(path, origin)

const check = async (path, expectedStatus) => {
  const response = await fetch(url(path), { redirect: 'manual' })
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}; expected ${expectedStatus}.`)
  }
  return response
}

const page = await check('/', 200)
if (!(await page.text()).includes('<div id="root">')) {
  throw new Error('Dashboard root did not return the React application.')
}

const health = await check('/healthz', 200)
const payload = await health.json()
if (payload.status !== 'ok') throw new Error('Dashboard health endpoint did not report ok.')

const me = await check('/api/v1/me', 401)
const mePayload = await me.json()
if (mePayload?.error?.code !== 'UNAUTHENTICATED') {
  throw new Error('Unauthenticated dashboard API response was not recognised.')
}

console.log(`Dashboard smoke test passed for ${origin.origin}`)
