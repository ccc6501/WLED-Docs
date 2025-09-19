import { prisma } from '@/lib/prisma';
import { NotesBoard } from './NotesBoard';

export default async function NotesPage() {
  const notes = await prisma.note.findMany({ orderBy: { updatedAt: 'desc' } });
  return <NotesBoard initialNotes={notes} />;
}
