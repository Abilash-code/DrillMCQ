import { useState } from 'react'
import type { UseAI } from '../hooks/useAI'
import type { QuizQuestion } from '../types/quiz'
import { JsonUploader } from './JsonUploader'
import { TextUploader } from './TextUploader'

interface QuizImporterProps {
  onLoad: (questions: QuizQuestion[]) => void
  /** Forwarded to both tabs: each has its own AI clean-up for its own format. */
  ai?: UseAI
  /** Which tab starts active. Defaults to 'text'. */
  initialMode?: ImportMode
  /** Pre-populated text for the plain-text tab. */
  initialText?: string
  /** Pre-populated JSON for the JSON tab. */
  initialJson?: string
  /** Override the submit button label on both tabs. */
  submitLabel?: string
  /** Hide the sample-quiz shortcut on the JSON tab. */
  hideSample?: boolean
  heading?: string
  subheading?: string
}

export type ImportMode = 'text' | 'json'

/** Tabbed quiz import: plain-text MCQ parsing or raw JSON. */
export function QuizImporter({
  onLoad,
  ai,
  initialMode = 'text',
  initialText,
  initialJson,
  submitLabel,
  hideSample,
  heading = 'Paste your MCQ questions below',
  subheading = 'Nothing is uploaded — parsing happens in this browser.',
}: QuizImporterProps) {
  const [mode, setMode] = useState<ImportMode>(initialMode)

  const tabClass = (active: boolean) =>
    `min-h-11 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
      active
        ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-700 dark:text-indigo-300'
        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
    }`

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{heading}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">{subheading}</p>
      </div>

      <div
        role="tablist"
        aria-label="Import format"
        className="inline-flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'text'}
          onClick={() => setMode('text')}
          className={tabClass(mode === 'text')}
        >
          📝 Plain text
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'json'}
          onClick={() => setMode('json')}
          className={tabClass(mode === 'json')}
        >
          {'{ }'} JSON
        </button>
      </div>

      {mode === 'text' ? (
        <TextUploader onLoad={onLoad} ai={ai} initialText={initialText} submitLabel={submitLabel} />
      ) : (
        <JsonUploader
          onLoad={onLoad}
          ai={ai}
          initialText={initialJson}
          submitLabel={submitLabel}
          hideSample={hideSample}
        />
      )}
    </div>
  )
}
