'use client';

import { useMemo, useState } from 'react';
import { formatDate } from '@/lib/utils';

interface Note {
  id: string;
  title: string;
  body: string;
  tags: string;
  createdAt: string;
  updatedAt: string;
}

interface NotesBoardProps {
  initialNotes: Note[];
}

export function NotesBoard({ initialNotes }: NotesBoardProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [selectedNoteId, setSelectedNoteId] = useState(initialNotes[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ title: '', body: '', tags: '' });

  const filteredNotes = useMemo(
    () =>
      notes.filter((note) =>
        note.title.toLowerCase().includes(query.toLowerCase()) ||
        note.body.toLowerCase().includes(query.toLowerCase()) ||
        note.tags.toLowerCase().includes(query.toLowerCase())
      ),
    [notes, query]
  );

  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null;

  async function refreshNotes(newQuery = query) {
    const response = await fetch(`/api/notes${newQuery ? `?q=${encodeURIComponent(newQuery)}` : ''}`);
    const data = await response.json();
    setNotes(data);
    if (!data.find((note: Note) => note.id === selectedNoteId)) {
      setSelectedNoteId(data[0]?.id ?? null);
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    const note = await response.json();
    setNotes((prev) => [note, ...prev]);
    setSelectedNoteId(note.id);
    setForm({ title: '', body: '', tags: '' });
  }

  async function handleUpdate() {
    if (!selectedNote) return;
    await fetch(`/api/notes/${selectedNote.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selectedNote)
    });
    await refreshNotes();
  }

  async function handleDelete() {
    if (!selectedNote) return;
    await fetch(`/api/notes/${selectedNote.id}`, { method: 'DELETE' });
    await refreshNotes();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-4">
        <input
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            void refreshNotes(value);
          }}
          placeholder="Search notes"
          className="w-full rounded-2xl border border-border/40 bg-black/30 px-4 py-2 text-sm outline-none focus:border-primary"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredNotes.map((note) => (
            <button
              key={note.id}
              onClick={() => setSelectedNoteId(note.id)}
              className={`rounded-3xl border border-border/60 bg-black/40 p-4 text-left shadow-glass transition ${
                selectedNoteId === note.id ? 'border-primary/60 bg-primary/10' : 'hover:border-border'
              }`}
            >
              <h3 className="text-sm font-semibold text-foreground">{note.title}</h3>
              <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{note.body}</p>
              <div className="mt-3 flex items-center justify-between text-[10px] uppercase text-muted-foreground">
                <span>{note.tags}</span>
                <span>{formatDate(note.updatedAt)}</span>
              </div>
            </button>
          ))}
          {!filteredNotes.length && <p className="text-xs text-muted-foreground">No notes yet.</p>}
        </div>
      </div>
      <div className="space-y-4">
        <form onSubmit={handleCreate} className="space-y-3 rounded-3xl border border-border/60 bg-black/40 p-4 shadow-glass">
          <h2 className="text-sm font-semibold text-foreground">Create Note</h2>
          <input
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Title"
            className="w-full rounded-2xl border border-border/40 bg-black/30 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <textarea
            value={form.body}
            onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
            rows={4}
            placeholder="Body"
            className="w-full rounded-2xl border border-border/40 bg-black/30 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <input
            value={form.tags}
            onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
            placeholder="tags,comma,separated"
            className="w-full rounded-2xl border border-border/40 bg-black/30 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button type="submit" className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-black">
            Save Note
          </button>
        </form>
        {selectedNote ? (
          <div className="space-y-3 rounded-3xl border border-border/60 bg-black/40 p-4 shadow-glass">
            <h2 className="text-sm font-semibold text-foreground">Edit Note</h2>
            <input
              value={selectedNote.title}
              onChange={(event) =>
                setNotes((prev) =>
                  prev.map((note) => (note.id === selectedNote.id ? { ...note, title: event.target.value } : note))
                )
              }
              className="w-full rounded-2xl border border-border/40 bg-black/30 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <textarea
              value={selectedNote.body}
              onChange={(event) =>
                setNotes((prev) =>
                  prev.map((note) => (note.id === selectedNote.id ? { ...note, body: event.target.value } : note))
                )
              }
              rows={6}
              className="w-full rounded-2xl border border-border/40 bg-black/30 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              value={selectedNote.tags}
              onChange={(event) =>
                setNotes((prev) =>
                  prev.map((note) => (note.id === selectedNote.id ? { ...note, tags: event.target.value } : note))
                )
              }
              className="w-full rounded-2xl border border-border/40 bg-black/30 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="flex gap-2">
              <button onClick={() => void handleUpdate()} className="flex-1 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-black">
                Update
              </button>
              <button onClick={() => void handleDelete()} className="flex-1 rounded-full border border-destructive px-4 py-2 text-sm font-semibold text-destructive">
                Delete
              </button>
            </div>
          </div>
        ) : (
          <p className="rounded-3xl border border-border/60 bg-black/40 p-4 text-xs text-muted-foreground shadow-glass">
            Select a note to edit.
          </p>
        )}
      </div>
    </div>
  );
}
