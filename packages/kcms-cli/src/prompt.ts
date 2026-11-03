import { createInterface } from 'node:readline/promises'

export async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  try {
    return (await rl.question(question)).trim()
  } finally {
    rl.close()
  }
}

/** Read a secret without echoing it (falls back to a plain line when stdin is not a TTY). */
export async function askHidden(question: string): Promise<string> {
  const stdin = process.stdin
  if (!stdin.isTTY) return ask(question)
  process.stderr.write(question)
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')
  return new Promise((resolve, reject) => {
    let value = ''
    const done = (err?: Error) => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.off('data', onData)
      process.stderr.write('\n')
      if (err) reject(err)
      else resolve(value.trim())
    }
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') return done()
        if (ch === '\u0003') return done(new Error('Cancelled'))
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1)
        else value += ch
      }
    }
    stdin.on('data', onData)
  })
}

export async function confirm(question: string): Promise<boolean> {
  return /^(y|yes|c|có|co)$/i.test(await ask(`${question} [y/N] `))
}
