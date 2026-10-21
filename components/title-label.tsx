'use client';

import { useState } from 'react';
import { Tag, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { Card } from '@/lib/board';
import { readApiResponse } from '@/lib/api-response';
import { TITLE_LABEL_COLORS, TITLE_LABEL_MAX_LENGTH, type TitleLabel, type TitleLabelColor } from '@/lib/title-labels';
import './title-label.css';

const colorNames: Record<TitleLabelColor, string> = { green: 'Verde', yellow: 'Amarelo', red: 'Vermelho' };

export function TitleLabelBadge({ label }: { label?: TitleLabel | null }) {
  return label ? <span className={`title-label title-label-${label.color}`} title={`${label.text} · ${colorNames[label.color]}`}>
    <Tag size={12} aria-hidden="true" /><span>{label.text}</span>
  </span> : null;
}

export function TitleLabelDialog({ card, onClose, onSaved }: {
  card: Card;
  onClose: () => void;
  onSaved: (document: string, label: TitleLabel | null) => void;
}) {
  const [text, setText] = useState(card.label?.text ?? '');
  const [color, setColor] = useState<TitleLabelColor>(card.label?.color ?? 'yellow');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(action: 'save' | 'remove') {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/title-label', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: card.id, document: card.document, text, color }),
      });
      const result = await readApiResponse<{ document: string; label: TitleLabel | null }>(response);
      onSaved(result.document, result.label);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="editor title-label-dialog" showCloseButton={!busy}>
      <DialogTitle>{card.label ? 'Editar marcação' : 'Adicionar marcação'}</DialogTitle>
      <DialogDescription>
        Título {card.document}. A marcação será mantida se você excluir os títulos e importar o CSV novamente.
      </DialogDescription>
      <form onSubmit={event => { event.preventDefault(); void submit('save'); }}>
        <label htmlFor="title-label-text">Texto da marcação</label>
        <input id="title-label-text" required maxLength={TITLE_LABEL_MAX_LENGTH} placeholder="Ex.: EM CARTORIO"
          value={text} onChange={event => setText(event.target.value)} disabled={busy} />
        <fieldset disabled={busy} className="title-label-colors">
          <legend>Cor da marcação</legend>
          <div>{TITLE_LABEL_COLORS.map(option => <label key={option} className={`title-label-choice title-label-${option}`}>
            <input type="radio" name="title-label-color" value={option} checked={color === option}
              onChange={() => setColor(option)} />
            <span>{colorNames[option]}</span>
          </label>)}</div>
        </fieldset>
        {text.trim() && <div className="title-label-preview"><span>Prévia</span><TitleLabelBadge label={{ text: text.trim(), color }} /></div>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="title-label-actions">
          {card.label && <button type="button" className="btn secondary title-label-remove" disabled={busy} onClick={() => void submit('remove')}>
            <Trash2 size={15} />Remover marcação
          </button>}
          <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn" disabled={busy || !text.trim()}>{busy ? 'Salvando…' : 'Salvar marcação'}</button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
