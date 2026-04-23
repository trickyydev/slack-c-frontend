import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import os from 'node:os'

const [, , code] = process.argv
const KEYCHAIN_SERVICE = 'slack-c-frontend/UPLOAD_CODE_HASH_SALT'

function readSaltFromKeychain() {
  if (process.platform !== 'darwin') {
    return null
  }

  try {
    return execFileSync(
      'security',
      ['find-generic-password', '-a', os.userInfo().username, '-s', KEYCHAIN_SERVICE, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
  } catch {
    return null
  }
}

const salt = process.env.UPLOAD_CODE_HASH_SALT ?? readSaltFromKeychain()

if (!code) {
  console.error('Usage: npm run hash-code -- "your-code"')
  process.exit(1)
}

if (!salt) {
  console.error(
    'Set UPLOAD_CODE_HASH_SALT in your shell or store it in macOS Keychain before generating hashes.',
  )
  process.exit(1)
}

const digest = createHash('sha256')
  .update(`${salt}:${code.trim()}`, 'utf8')
  .digest('hex')

console.log(digest)
