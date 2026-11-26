import type { QuizQuestion, QuizResult, QuizSession } from '../types/quiz'

/** Fisher–Yates shuffle. Returns a new array; never mutates the input. */
export function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// --- multi-answer helpers ------------------------------------------------

/** True when the question expects more than one option to be ticked. */
export function isMultiAnswer(question: QuizQuestion): boolean {
  return question.correctAnswers.length > 1
}

/** A question as written by a build before multiple correct answers existed. */
export interface LegacyQuizQuestion extends Omit<QuizQuestion, 'correctAnswers'> {
  correctAnswers?: string[]
  correctAnswer?: string
}

/**
 * Coerce a question that may still carry the pre-multi-answer `correctAnswer`
 * string into the current shape. Single point of backward compatibility —
 * used by the JSON importer and by every storage load path.
 */
export function normalizeQuestion(raw: LegacyQuizQuestion): QuizQuestion {
  const { correctAnswer, correctAnswers, ...rest } = raw
  return {
    ...rest,
    correctAnswers: correctAnswers ?? (correctAnswer === undefined ? [] : [correctAnswer]),
  }
}

/**
 * An answer counts only when the selection is exactly the correct set: every
 * correct option ticked and nothing else. No partial credit.
 */
export function isAnswerCorrect(question: QuizQuestion, selected?: string[]): boolean {
  if (selected === undefined || selected.length !== question.correctAnswers.length) return false
  return selected.every((option) => question.correctAnswers.includes(option))
}

/**
 * Has the user revealed this question's answer with "Check answer"?
 * `revealed` is the single source of truth for mid-quiz feedback.
 */
export function isRevealed(session: QuizSession, questionId: number): boolean {
  return session.revealed.includes(questionId)
}

/**
 * Is the question frozen against further changes?
 *
 * Two independent reasons, both permanent: the answer has been revealed (it is
 * on screen, so re-picking would be meaningless), or it is a multi-answer
 * question whose draft was already committed. The second clause is what keeps
 * sessions written before "Check answer" existed locked exactly as they were.
 */
export function isQuestionLocked(session: QuizSession, question: QuizQuestion): boolean {
  return (
    isRevealed(session, question.id) ||
    (isMultiAnswer(question) && session.answers[question.id] !== undefined)
  )
}

/** Add or remove an option from a multi-select draft. Never mutates. */
export function toggleOption(selected: string[], option: string): string[] {
  return selected.includes(option)
    ? selected.filter((o) => o !== option)
    : [...selected, option]
}

/**
 * Count how many questions have a submitted answer or a non-empty multi-select
 * draft (which will be committed when the quiz finishes).
 */
export function countAnswered(
  questions: QuizQuestion[],
  answers: Record<number, string[]>,
  drafts: Record<number, string[]> = {},
): number {
  let count = 0
  for (const q of questions) {
    if (answers[q.id] !== undefined || (drafts[q.id]?.length ?? 0) > 0) {
      count++
    }
  }
  return count
}

/**
 * Promote any non-empty multi-select drafts into `answers` without overwriting
 * already-submitted answers. Called when finishing a quiz so multi-select
 * questions answered without clicking "Check answer" are scored rather than
 * marked as skipped.
 */
export function commitDrafts(
  answers: Record<number, string[]>,
  drafts: Record<number, string[]>,
): Record<number, string[]> {
  let next: Record<number, string[]> | null = null
  for (const [key, draft] of Object.entries(drafts)) {
    const id = Number(key)
    if (!Number.isFinite(id) || draft.length === 0 || answers[id] !== undefined) continue
    next ??= { ...answers }
    next[id] = draft
  }
  return next ?? answers
}

/**
 * Parse and validate raw JSON text into a quiz.
 * Returns either the questions or a friendly, human-readable error message.
 */
export function parseQuizJson(
  raw: string,
): { ok: true; questions: QuizQuestion[] } | { ok: false; error: string } {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return {
      ok: false,
      error:
        'That is not valid JSON. Check for missing commas, unquoted keys, or trailing commas.',
    }
  }

  if (!Array.isArray(data)) {
    return { ok: false, error: 'The JSON must be an array of question objects: [ { ... }, ... ]' }
  }
  if (data.length === 0) {
    return { ok: false, error: 'The quiz is empty — add at least one question.' }
  }

  const seenIds = new Set<number>()
  for (let i = 0; i < data.length; i++) {
    const q = data[i] as Partial<LegacyQuizQuestion>
    const label = `Question ${i + 1}`

    if (typeof q !== 'object' || q === null) {
      return { ok: false, error: `${label}: expected an object, got ${typeof q}.` }
    }
    if (typeof q.id !== 'number') {
      return { ok: false, error: `${label}: "id" is required and must be a number.` }
    }
    if (seenIds.has(q.id)) {
      return { ok: false, error: `${label}: duplicate id ${q.id}. Every question needs a unique id.` }
    }
    seenIds.add(q.id)
    if (typeof q.question !== 'string' || q.question.trim() === '') {
      return { ok: false, error: `${label}: "question" is required and must be a non-empty string.` }
    }
    if (
      !Array.isArray(q.options) ||
      q.options.length < 2 ||
      !q.options.every((o) => typeof o === 'string')
    ) {
      return { ok: false, error: `${label}: "options" must be an array of at least 2 strings.` }
    }
    // "correctAnswers" is the current shape; a single "correctAnswer" string
    // is still accepted so quizzes exported by older builds keep loading.
    const options = q.options
    if (q.correctAnswers !== undefined) {
      if (
        !Array.isArray(q.correctAnswers) ||
        q.correctAnswers.length === 0 ||
        !q.correctAnswers.every((a) => typeof a === 'string')
      ) {
        return {
          ok: false,
          error: `${label}: "correctAnswers" must be an array of at least one string.`,
        }
      }
      const duplicate = q.correctAnswers.find((a, idx) => q.correctAnswers!.indexOf(a) !== idx)
      if (duplicate !== undefined) {
        return { ok: false, error: `${label}: "correctAnswers" lists "${duplicate}" twice.` }
      }
      const unknown = q.correctAnswers.find((a) => !options.includes(a))
      if (unknown !== undefined) {
        return {
          ok: false,
          error: `${label}: "correctAnswers" entry ("${unknown}") must exactly match one of the options.`,
        }
      }
    } else if (typeof q.correctAnswer === 'string') {
      if (!options.includes(q.correctAnswer)) {
        return {
          ok: false,
          error: `${label}: "correctAnswer" ("${q.correctAnswer}") must exactly match one of the options.`,
        }
      }
    } else {
      return {
        ok: false,
        error: `${label}: "correctAnswers" is required — an array of the options that are correct (a single "correctAnswer" string also works).`,
      }
    }
    for (const [key, type] of [
      ['explanation', 'string'],
      ['category', 'string'],
      ['difficulty', 'string'],
    ] as const) {
      if (q[key] !== undefined && typeof q[key] !== type) {
        return { ok: false, error: `${label}: "${key}" must be a string when provided.` }
      }
    }
  }

  return { ok: true, questions: (data as LegacyQuizQuestion[]).map(normalizeQuestion) }
}

/** Unique, sorted category names present in a question set. */
export function getCategories(questions: QuizQuestion[]): string[] {
  const set = new Set<string>()
  for (const q of questions) {
    if (q.category) set.add(q.category)
  }
  return [...set].sort()
}

/** Threshold a run must reach to pass, when the user hasn't picked one. */
export const DEFAULT_PASS_PERCENTAGE = 70

/**
 * Coerce anything into a usable pass mark: a whole number of percent, 0–100.
 * Used by the setup screen and by the storage normalizer, so a hand-edited or
 * older record can never produce a threshold nothing can be judged against.
 */
export function normalizePassPercentage(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_PASS_PERCENTAGE
  return Math.min(100, Math.max(0, Math.round(value)))
}

/**
 * Fewest correct answers out of `total` that reach the pass mark.
 *
 * Derived by walking the same rounding `computeResult` applies rather than by
 * a ceil of the raw ratio, so the number the setup screen promises is exactly
 * the number the result screen will honour.
 */
export function questionsNeededToPass(total: number, passPercentage: number): number {
  const mark = normalizePassPercentage(passPercentage)
  for (let correct = 0; correct <= total; correct++) {
    if (Math.round((correct / total) * 100) >= mark) return correct
  }
  return total
}

/**
 * Score a finished (or in-progress) session, including the pass/fail verdict.
 *
 * The verdict lives here rather than in the result screen so every consumer —
 * a live result, a replayed attempt — reads the same number and the same rule.
 */
export function computeResult(session: QuizSession): QuizResult {
  const total = session.questions.length
  let correct = 0
  let unanswered = 0
  for (const q of session.questions) {
    const answer = session.answers[q.id]
    if (answer === undefined) unanswered++
    else if (isAnswerCorrect(q, answer)) correct++
  }
  const incorrect = total - correct - unanswered
  const percentage = total === 0 ? 0 : Math.round((correct / total) * 100)
  const passPercentage = normalizePassPercentage(session.settings.passPercentage)
  return {
    total,
    correct,
    incorrect,
    unanswered,
    percentage,
    passPercentage,
    passed: percentage >= passPercentage,
  }
}

/**
 * Active milliseconds spent in a session up to `now`.
 *
 * When paused (`pausedAt !== undefined`), returns only the frozen `elapsedMs`
 * accumulated before the pause. When finished with a frozen `elapsedMs`, returns
 * that value directly so pauses are excluded from attempt duration.
 */
export function getElapsedMs(
  timing: Pick<QuizSession, 'startedAt' | 'elapsedMs' | 'resumedAt' | 'pausedAt'> & {
    status?: QuizSession['status']
  },
  now = Date.now(),
): number {
  const prior = timing.elapsedMs ?? 0
  if (timing.pausedAt !== undefined) return prior
  if (timing.status === 'finished' && timing.elapsedMs !== undefined) return prior
  const segmentStart = timing.resumedAt ?? timing.startedAt
  return prior + Math.max(0, now - segmentStart)
}

/**
 * Freeze active elapsed time when exiting an active quiz so the timer does
 * not keep counting down while the quiz is paused in the library.
 */
export function pauseSession(session: QuizSession, now = Date.now()): QuizSession {
  if (session.status !== 'active' || session.pausedAt !== undefined) return session
  return {
    ...session,
    elapsedMs: getElapsedMs(session, now),
    pausedAt: now,
  }
}

/** Format seconds as m:ss (or h:mm:ss above one hour). */
export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds)
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

/**
 * Serialize questions into DrillMCQ's plain-text MCQ format so a saved quiz
 * can be edited in the plain-text editor as well as JSON.
 */
export function questionsToMcqText(questions: QuizQuestion[]): string {
  return questions
    .map((q, index) => {
      const cleanQuestion = q.question.replace(/\s*\n+\s*/g, ' ').trim()
      const lines: string[] = [`${index + 1}. ${cleanQuestion}`, '']
      const useLetters = q.options.length <= OPTION_LETTERS.length

      if (useLetters) {
        const answerLetters: string[] = []
        q.options.forEach((option, optIndex) => {
          const cleanOption = option.replace(/\s*\n+\s*/g, ' ').trim()
          const letter = OPTION_LETTERS[optIndex]
          lines.push(`${letter}. ${cleanOption}`)
          if (q.correctAnswers.includes(option)) answerLetters.push(letter)
        })
        lines.push('')
        lines.push(
          `Answer: ${answerLetters.length > 0 ? answerLetters.join(', ') : q.correctAnswers.join(', ')}`,
        )
      } else {
        for (const option of q.options) {
          const cleanOption = option.replace(/\s*\n+\s*/g, ' ').trim()
          const prefix = q.correctAnswers.includes(option) ? '✓' : '-'
          lines.push(`${prefix} ${cleanOption}`)
        }
      }

      if (q.explanation) {
        lines.push(`Explanation: ${q.explanation.replace(/\s*\n+\s*/g, ' ').trim()}`)
      }
      if (q.category) {
        lines.push(`Category: ${q.category.replace(/\s*\n+\s*/g, ' ').trim()}`)
      }
      return lines.join('\n')
    })
    .join('\n\n')
}
