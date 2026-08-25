'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Educator Library — upload, manage, and browse GCSE syllabus documents.
 * Syllabus content is chunked, embedded, and stored in Pinecone for RAG-based
 * lesson generation.
 */

interface SyllabusDocument {
  id: string;
  title: string;
  subject: string;
  examBoard: string;
  stage: string;
  fileName: string;
  fileSizeBytes: number;
  pageCount: number;
  chunkCount: number;
  status: string;
  sourceUrl: string | null;
  processedAt: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  uploaded: 'bg-gray-100 text-gray-700',
  processing: 'bg-yellow-100 text-yellow-700',
  indexed: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700'
};

const STAGE_OPTIONS = [
  { value: 'gcse', label: 'GCSE' },
  { value: 'alevel', label: 'A-Level' }
];

const COMMON_SUBJECTS = [
  'Mathematics', 'English Language', 'English Literature',
  'Combined Science', 'Biology', 'Chemistry', 'Physics',
  'Computer Science', 'Geography', 'History', 'Economics',
  'Business', 'Psychology', 'Sociology', 'Modern Foreign Languages'
];

export default function LibraryPage() {
  const [documents, setDocuments] = useState<SyllabusDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload form state
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [examBoard, setExamBoard] = useState('DfE');
  const [stage, setStage] = useState('gcse');

  // Lesson generation state
  const [showLessonGen, setShowLessonGen] = useState(false);
  const [lessonSubject, setLessonSubject] = useState('');
  const [lessonTopic, setLessonTopic] = useState('');
  const [lessonLevel, setLessonLevel] = useState('mixed');
  const [lessonDuration, setLessonDuration] = useState(30);
  const [generatingLesson, setGeneratingLesson] = useState(false);
  const [generatedLesson, setGeneratedLesson] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/educator/syllabus');
      const data = await res.json();
      setDocuments(data.documents ?? []);
    } catch {
      setError('Failed to load syllabus documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title || !(subject || customSubject)) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    formData.append('subject', customSubject || subject);
    formData.append('examBoard', examBoard);
    formData.append('stage', stage);

    try {
      const res = await fetch('/api/educator/syllabus/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      // Reset form
      setFile(null);
      setTitle('');
      setSubject('');
      setCustomSubject('');
      setShowUploadForm(false);
      await fetchDocuments();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this syllabus document? This will also remove its indexed content.')) return;

    try {
      await fetch(`/api/educator/syllabus/${id}`, { method: 'DELETE' });
      await fetchDocuments();
    } catch {
      setError('Failed to delete document');
    }
  };

  const handleGenerateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonSubject || !lessonTopic) return;

    setGeneratingLesson(true);
    setGeneratedLesson(null);
    setError(null);

    try {
      const res = await fetch('/api/lessons/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: lessonSubject,
          topic: lessonTopic,
          level: lessonLevel,
          durationMinutes: lessonDuration
        })
      });

      if (!res.ok) throw new Error('Generation failed');

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'token') {
                accumulated += event.text;
                setGeneratedLesson(accumulated);
              } else if (event.type === 'error') {
                throw new Error(event.error);
              }
            } catch {
              // Skip malformed SSE lines
            }
          }
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGeneratingLesson(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-title-2">Syllabus Library</h2>
          <p className="text-callout text-secondary-label">
            Upload official GCSE syllabus documents. The AI reads these to generate
            lessons that stay within the specification.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowLessonGen(!showLessonGen); setShowUploadForm(false); }}
            className="focus-halo rounded-control border border-sys-blue bg-sys-blue px-4 py-2 text-callout font-medium text-white hover:opacity-90"
          >
            Generate Lesson
          </button>
          <button
            onClick={() => { setShowUploadForm(!showUploadForm); setShowLessonGen(false); }}
            className="focus-halo rounded-control border border-separator bg-text-background px-4 py-2 text-callout font-medium hover:bg-gray5"
          >
            + Upload Syllabus
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-control border border-red-200 bg-red-50 px-4 py-3 text-callout text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Lesson Generation Panel */}
      {showLessonGen && (
        <div className="rounded-xl border border-sys-blue/20 bg-sys-blue/5 p-5">
          <h3 className="text-headline mb-3">Generate Syllabus-Aligned Lesson</h3>
          <form onSubmit={handleGenerateLesson} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-caption-1 font-medium text-secondary-label">Subject</label>
                <select
                  value={lessonSubject}
                  onChange={(e) => setLessonSubject(e.target.value)}
                  className="mt-1 w-full rounded-control border border-separator bg-text-background px-3 py-2 text-callout"
                  required
                >
                  <option value="">Select subject...</option>
                  {[...new Set(documents.map((d) => d.subject))].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                  {COMMON_SUBJECTS.filter((s) => !documents.some((d) => d.subject === s)).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-caption-1 font-medium text-secondary-label">Topic</label>
                <input
                  type="text"
                  value={lessonTopic}
                  onChange={(e) => setLessonTopic(e.target.value)}
                  placeholder="e.g. Quadratic Equations, Photosynthesis..."
                  className="mt-1 w-full rounded-control border border-separator bg-text-background px-3 py-2 text-callout"
                  required
                />
              </div>
              <div>
                <label className="text-caption-1 font-medium text-secondary-label">Tier</label>
                <select
                  value={lessonLevel}
                  onChange={(e) => setLessonLevel(e.target.value)}
                  className="mt-1 w-full rounded-control border border-separator bg-text-background px-3 py-2 text-callout"
                >
                  <option value="foundation">Foundation (Grades 1-5)</option>
                  <option value="higher">Higher (Grades 4-9)</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>
              <div>
                <label className="text-caption-1 font-medium text-secondary-label">Duration (minutes)</label>
                <input
                  type="number"
                  value={lessonDuration}
                  onChange={(e) => setLessonDuration(Number(e.target.value))}
                  min={5}
                  max={60}
                  className="mt-1 w-full rounded-control border border-separator bg-text-background px-3 py-2 text-callout"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={generatingLesson || !lessonSubject || !lessonTopic}
              className="focus-halo rounded-control bg-sys-blue px-5 py-2 text-callout font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {generatingLesson ? 'Generating...' : 'Generate Lesson'}
            </button>
          </form>

          {generatedLesson && (
            <div className="mt-4 rounded-lg border border-separator bg-text-background p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-headline">Generated Lesson</h4>
                <button
                  onClick={() => navigator.clipboard.writeText(generatedLesson)}
                  className="text-caption-1 text-sys-blue hover:underline"
                >
                  Copy to clipboard
                </button>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-callout text-label max-h-[500px] overflow-y-auto">
                {generatedLesson}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Upload Form */}
      {showUploadForm && (
        <div className="rounded-xl border border-separator bg-text-background p-5">
          <h3 className="text-headline mb-3">Upload Syllabus Document</h3>
          <form onSubmit={handleUpload} className="space-y-3">
            <div>
              <label className="text-caption-1 font-medium text-secondary-label">PDF File</label>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !title) {
                    setTitle(f.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' '));
                  }
                }}
                className="mt-1 w-full rounded-control border border-separator bg-text-background px-3 py-2 text-callout file:mr-3 file:rounded-control file:border-0 file:bg-gray5 file:px-3 file:py-1 file:text-callout file:font-medium hover:file:bg-gray4"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-caption-1 font-medium text-secondary-label">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. GCSE Mathematics (DfE)"
                  className="mt-1 w-full rounded-control border border-separator bg-text-background px-3 py-2 text-callout"
                  required
                />
              </div>
              <div>
                <label className="text-caption-1 font-medium text-secondary-label">Subject</label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-1 w-full rounded-control border border-separator bg-text-background px-3 py-2 text-callout"
                >
                  <option value="">Select or type custom...</option>
                  {COMMON_SUBJECTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                  placeholder="Or type custom subject..."
                  className="mt-1 w-full rounded-control border border-separator bg-text-background px-3 py-2 text-callout"
                />
              </div>
              <div>
                <label className="text-caption-1 font-medium text-secondary-label">Exam Board</label>
                <input
                  type="text"
                  value={examBoard}
                  onChange={(e) => setExamBoard(e.target.value)}
                  className="mt-1 w-full rounded-control border border-separator bg-text-background px-3 py-2 text-callout"
                />
              </div>
              <div>
                <label className="text-caption-1 font-medium text-secondary-label">Stage</label>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  className="mt-1 w-full rounded-control border border-separator bg-text-background px-3 py-2 text-callout"
                >
                  {STAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={uploading || !file || !title || !(subject || customSubject)}
                className="focus-halo rounded-control bg-sys-blue px-5 py-2 text-callout font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {uploading ? 'Uploading & Indexing...' : 'Upload & Index'}
              </button>
              <button
                type="button"
                onClick={() => setShowUploadForm(false)}
                className="focus-halo rounded-control border border-separator px-4 py-2 text-callout hover:bg-gray5"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Documents Grid */}
      {loading ? (
        <div className="py-12 text-center text-secondary-label">Loading library...</div>
      ) : documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-separator py-16 text-center">
          <p className="text-title-3 text-secondary-label">No syllabus documents yet</p>
          <p className="mt-2 text-callout text-tertiary-label">
            Upload official GCSE syllabus PDFs so the AI can generate lessons aligned to the specification.
          </p>
          <p className="mt-1 text-caption-1 text-tertiary-label">
            Documents are available from{' '}
            <a
              href="https://www.gov.uk/government/collections/gcse-subject-content"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sys-blue hover:underline"
            >
              gov.uk/government/collections/gcse-subject-content
            </a>
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="group rounded-xl border border-separator bg-text-background p-4 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-headline font-medium" title={doc.title}>
                    {doc.title}
                  </h3>
                  <p className="mt-0.5 text-caption-1 text-secondary-label">
                    {doc.subject} · {doc.examBoard} · {doc.stage.toUpperCase()}
                  </p>
                </div>
                <span className={`ml-2 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-caption-2 font-medium ${STATUS_COLORS[doc.status] ?? 'bg-gray-100 text-gray-700'}`}>
                  {doc.status}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-gray5/50 px-2 py-1.5">
                  <p className="text-title-3">{doc.pageCount}</p>
                  <p className="text-caption-2 text-tertiary-label">pages</p>
                </div>
                <div className="rounded-lg bg-gray5/50 px-2 py-1.5">
                  <p className="text-title-3">{doc.chunkCount}</p>
                  <p className="text-caption-2 text-tertiary-label">chunks</p>
                </div>
                <div className="rounded-lg bg-gray5/50 px-2 py-1.5">
                  <p className="text-title-3">{formatFileSize(doc.fileSizeBytes)}</p>
                  <p className="text-caption-2 text-tertiary-label">size</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-caption-2 text-tertiary-label">
                <span>{new Date(doc.createdAt).toLocaleDateString('en-GB')}</span>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="text-caption-2 text-red-500 opacity-0 transition-opacity group-hover:opacity-100 hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
