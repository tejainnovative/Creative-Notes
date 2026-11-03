import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Check, Trash2 } from 'lucide-react';
import { db } from '../db/schema';
import { createNote, deleteNote, getSettings, NOTE_MAX, restoreNote, setSetting, updateNote } from '../data';
import { Button, Composer, IconButton, TopBar, useToast } from '../ui';

/**
 * S12 Quick note. Three ways in:
 *  - #/quick              blank note, typed or dictated with the keyboard mic
 *  - #/quick?text=...     from the Siri / Shortcuts flow: saved straight away, text removed from the URL
 *  - #/quick?id=...       edit an existing note (from History)
 */
export function QuickNote() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [id, setId] = useState<string | undefined>(params.get('id') ?? undefined);
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(!params.get('id'));
  const [saved, setSaved] = useState(false);
  const handled = useRef(false);

  // Shortcut text: save once, then drop it from the address bar and history (security review row 9).
  useEffect(() => {
    const incoming = params.get('text');
    if (incoming === null || handled.current) return;
    handled.current = true;
    void (async () => {
      const note = await createNote({ text: incoming, source: 'shortcut' });
      // A shortcut can open the app before onboarding: count that as onboarded so the note stays visible.
      if (!(await getSettings()).onboarded) await setSetting('onboarded', true);
      setId(note.id);
      setText(note.text ?? '');
      setSaved(true);
      setParams({ id: note.id }, { replace: true });
      toast({ tone: 'success', text: 'Note saved' });
    })();
  }, [params, setParams, toast]);

  useEffect(() => {
    const existing = params.get('id');
    if (!existing || loaded) return;
    void db.notes.get(existing).then((n) => {
      setText(n?.text ?? '');
      setLoaded(true);
    });
  }, [params, loaded]);

  async function save() {
    const value = text.trim();
    if (!value) return;
    if (id) await updateNote(id, value);
    else {
      const note = await createNote({ text: value, source: 'typed' });
      setId(note.id);
      setParams({ id: note.id }, { replace: true });
    }
    setSaved(true);
    toast({ tone: 'success', text: 'Note saved' });
  }

  async function remove() {
    if (!id) return;
    const note = await deleteNote(id);
    navigate('/history', { replace: true });
    if (note) toast({ text: 'Note deleted', action: { label: 'Undo', onClick: () => void restoreNote(note) } });
  }

  return (
    <>
      <TopBar
        title={id ? 'Note' : 'Quick note'}
        back="/"
        actions={id ? <IconButton label="Delete note" onClick={() => void remove()}><Trash2 aria-hidden className="size-5" /></IconButton> : undefined}
      />
      <div className="mx-auto max-w-(--cn-content-max) space-y-3 px-4 py-4">
        {loaded ? (
          <Composer
            variant="note"
            label="Note"
            value={text}
            onChange={(v) => {
              setText(v.slice(0, NOTE_MAX));
              setSaved(false);
            }}
            onSubmit={() => void save()}
            placeholder="Type a note, or tap the microphone on your keyboard to dictate."
          />
        ) : (
          <p role="status" className="text-sm text-muted">Opening note…</p>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">{text.length} / {NOTE_MAX}</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate(-1)}>Done</Button>
            <Button disabled={!text.trim() || saved} icon={saved ? <Check aria-hidden className="size-5" /> : undefined} onClick={() => void save()}>
              {saved ? 'Saved' : 'Save'}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted">Tip: Ctrl or ⌘ + Enter saves.</p>
      </div>
    </>
  );
}
