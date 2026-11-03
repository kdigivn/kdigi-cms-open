/**
 * One-shot verification script for the DeepSeek API.
 *
 * Confirms that DEEPSEEK_API_KEY + DEEPSEEK_MODEL are valid by sending a
 * minimal chat.completions call requesting {"ok":true} and printing the result.
 *
 * Usage (requires .env with DEEPSEEK_API_KEY and DEEPSEEK_MODEL set):
 *   node --env-file=.env --import tsx src/scripts/verify-deepseek-model.ts
 *
 * On success: prints the model id + parsed response.
 * On failure: prints the error message and exits with code 1.
 */
import { chatJson, getModel } from '../lib/ai/deepseek-client'

async function main(): Promise<void> {
  const model = getModel()
  console.log(`[verify-deepseek] Using model: ${model}`)

  const result = await chatJson([{ role: 'user', content: 'Reply with {"ok":true}' }])

  console.log('[verify-deepseek] Parsed response:', result)
  console.log('[verify-deepseek] OK — model is working. Set DEEPSEEK_MODEL in .env.example.')
}

main().catch((err: unknown) => {
  console.error('[verify-deepseek] FAILED:', err instanceof Error ? err.message : err)
  process.exit(1)
})
