import { useEffect, useState } from 'react';
import { downloadBlob, pickFile, readText } from '../lib/storage';
import { deleteTemplate, importTemplateText, listTemplates, renameTemplate, TEMPLATE_EXT, templateFileName, templateToText, type UserTemplate } from '../lib/userTemplates';
import { PosterThumb } from './NewPosterDialog';
import ConfirmDialog from './ConfirmDialog';

interface Props {
  selected: string | null;
  onSelect: (t: UserTemplate | null) => void;
}

const fmtSize = (t: UserTemplate) => `${Math.round(t.poster.width)} × ${Math.round(t.poster.height)} mm · ${t.poster.columns} col`;

/** The "My templates" row of the New poster gallery: pick, rename, delete, export and import saved templates. */
export default function MyTemplates({ selected, onSelect }: Props) {
  const [items, setItems] = useState<UserTemplate[] | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<UserTemplate | null>(null);
  const [error, setError] = useState('');

  const refresh = () =>
    listTemplates()
      .then((list) => {
        setItems(list);
        return list;
      })
      .catch((e) => {
        setItems([]);
        setError('Could not read your templates: ' + String(e));
        return [] as UserTemplate[];
      });
  useEffect(() => {
    refresh();
  }, []);

  async function finishRename() {
    if (!renaming) return;
    const { id, name } = renaming;
    setRenaming(null);
    await renameTemplate(id, name);
    const list = await refresh();
    if (selected === id) onSelect(list.find((t) => t.id === id) ?? null);
  }

  async function remove(t: UserTemplate) {
    setDeleting(null);
    await deleteTemplate(t.id);
    if (selected === t.id) onSelect(null);
    refresh();
  }

  async function importFile() {
    const f = await pickFile(`${TEMPLATE_EXT},.json,application/json`);
    if (!f) return;
    try {
      const t = await importTemplateText(await readText(f));
      setError('');
      await refresh();
      onSelect(t);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const exportFile = (t: UserTemplate) => downloadBlob(new Blob([templateToText(t)], { type: 'application/json' }), templateFileName(t));

  return (
    <div className="span2 my-templates">
      <div className="field-label my-templates-head">
        <span>
          My templates{' '}
          {!items?.length && <span className="muted">· save any poster as a template from its ⋯ menu in the editor</span>}
        </span>
        <button type="button" className="link" onClick={importFile}>Import template file…</button>
      </div>
      {error && (
        <div className="banner error" role="alert" onClick={() => setError('')}>
          {error}
        </div>
      )}
      {!!items?.length && (
        <div className="template-grid">
          {items.map((t) => (
            <div key={t.id} className={'template-card mine' + (selected === t.id ? ' active' : '')} data-my-template={t.name}>
              <button type="button" className="mine-pick" aria-pressed={selected === t.id} onClick={() => onSelect(selected === t.id ? null : t)}>
                <PosterThumb poster={t.poster} />
                {renaming?.id !== t.id && <strong>{t.name}</strong>}
                <span>{fmtSize(t)}</span>
              </button>
              {renaming?.id === t.id && (
                <input
                  className="card-rename"
                  aria-label="Template name"
                  autoFocus
                  value={renaming.name}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setRenaming({ id: t.id, name: e.target.value })}
                  onBlur={finishRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      finishRename();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      setRenaming(null);
                    }
                  }}
                />
              )}
              <div className="card-actions">
                <button type="button" className="link" onClick={() => setRenaming({ id: t.id, name: t.name })} aria-label={`Rename ${t.name}`}>Rename</button>
                <button type="button" className="link" onClick={() => exportFile(t)} aria-label={`Export ${t.name}`} title="Save a file you can share or import on another computer">Export</button>
                <button type="button" className="link danger" onClick={() => setDeleting(t)} aria-label={`Delete ${t.name}`}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete the template “${deleting.name}”?`}
          message="Posters you already made from it are not affected. Export it first if you might want it again."
          confirmLabel="Delete template"
          danger
          onConfirm={() => remove(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
