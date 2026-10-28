// Pre-publish guard: packs the tarball (dry run) and fails if it contains
// anything unexpected or anything shaped like a credential or real contact data.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pack = JSON.parse(execSync('npm pack --dry-run --json', { encoding: 'utf8' }))[0]
const files = pack.files.map((f) => f.path)
const allowed = /^(package\.json|README\.md|CHANGELOG\.md|dist\/(index\.(js|cjs|d\.ts|d\.cts)|runtime\.iife\.js))$/
const unexpected = files.filter((f) => !allowed.test(f))

const problems = []
if (unexpected.length) problems.push(`unexpected files in tarball: ${unexpected.join(', ')}`)
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  // Emails outside reserved example domains.
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)) {
    if (!/^example\.(com|org|net)$/.test(m[1])) problems.push(`${f}: email ${m[0]}`)
  }
  // CleverTap-project-ID-shaped tokens other than the placeholders.
  for (const m of text.matchAll(/\b[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{4}\b/g)) {
    if (!['XXX-XXX-XXXX', 'TEST-000-0000'].includes(m[0])) problems.push(`${f}: project-ID-shaped token ${m[0]}`)
  }
  if (/passcode\s*[:=]\s*['"][^'"]+['"]/i.test(text)) problems.push(`${f}: passcode-looking assignment`)
}

console.log(`${pack.name}@${pack.version}: ${files.length} files, ${(pack.size / 1024).toFixed(1)} KB packed`)
files.forEach((f) => console.log('  ' + f))
if (problems.length) {
  console.error('\ncheck-pack FAILED:\n  ' + problems.join('\n  '))
  process.exit(1)
}
console.log('check-pack OK')
