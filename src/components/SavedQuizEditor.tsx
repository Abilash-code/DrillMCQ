import { useMemo, useState } from 'react'
import type { UseAI } from '../hooks/useAI'
import type { QuizQuestion, SavedQuiz } from '../types/quiz'
import { progressSummary } from '../utils/library'
import { questionsToMcqText } from '../utils/quiz'
import { ConfirmDialog } from './ConfirmDialog'
import { QuizImporter } from './QuizImporter'

interface SavedQuizEditorProps {
  quiz: SavedQuiz
  backLabel: string
  ai?: UseAI
  onSave: (questions: QuizQuestion[]) => void
  onCancel: () => void
}

/**
 * Edit the questions of an already-saved quiz as either JSON or plain text.
 * Reuses `QuizImporter` so validation, live preview, and optional AI repair
 * behave identically to importing a new quiz.
 */
export function SavedQuizEditor({
  quiz,
  backLabel,
  ai,
  onSave,
  onCancel,
}: SavedQuizEditorProps) {
  const initialJson = useMemo(() => JSON.stringify(quiz.questions, null, 2), [quiz.questions])
  const initialText = useMemo(() => questionsToMcqText(quiz.questions), [quiz.questions])
  const progress = quiz.progress ? progressSummary(quiz.progress) : null
  const [pendingQuestions, setPendingQuestions] = useState<QuizQuestion[] | null>(null)

  const handleLoad = (nextQuestions: QuizQuestion[]) => {
    if (quiz.progress !== undefined) {
      setPendingQuestions(nextQuestions)
      return
    }
    onSave(nextQuestions)
  }

  return (
    <section className="animate-fade-slide-in space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onCancel}
            className="-ml-2 min-h-11 rounded-lg px-2 text-sm font-medium text-slate-500 transition-colors hover:text-indigo-600 dark:text-slate-400"
          >
            ← Back to {backLabel}
          </button>
          <h2 className="mt-1 text-xl font-bold tracking-tight">Edit “{quiz.name}”</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Configure the JSON or plain-text questions below. Past results are kept.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>

      {progress !== null && (
        <div
          role="status"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
        >
          This quiz has an unfinished attempt ({progress.answered}/{progress.total} answered).
          Saving changes will clear that unfinished progress while keeping past results.
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <QuizImporter
          key={`${quiz.id}-${quiz.updatedAt}`}
          ai={ai}
          initialMode="json"
          initialJson={initialJson}
          initialText={initialText}
          submitLabel="Save changes"
          hideSample
          heading="Configure quiz questions"
          subheading="Switch between JSON (preserves IDs and all fields) and plain text."
          onLoad={handleLoad}
        />
      </div>

      {pendingQuestions !== null && (
        <ConfirmDialog
          title={`Save changes to “${quiz.name}”?`}
          message={
            <>
              <p>
                Replacing the questions ({quiz.questions.length} → {pendingQuestions.length}) will
                discard your unfinished attempt on this quiz.
              </p>
              <p className="mt-2">Past completed results stay in Results.</p>
            </>
          }
          confirmLabel="Save changes"
          onConfirm={() => {
            const next = pendingQuestions
            setPendingQuestions(null)
            onSave(next)
          }}
          onCancel={() => setPendingQuestions(null)}
        />
      )}
    </section>
  )
}
