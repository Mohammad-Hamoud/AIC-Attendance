// "Modification Request" — floating button + modal. Any signed-in user can file
// a change request; it is POSTed to /api/modification-request, which opens a
// GitHub issue in the project backlog for review before the next release.
import { useState } from 'react';
import { useStore } from '../store';

export default function ModRequest({ screen }: { screen: string }) {
  const s = useStore();
  const { t, lang, role, employees } = s;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'ok' | 'err' | 'short'>('idle');
  const [ticket, setTicket] = useState<number | null>(null);

  const roleLabel = role?.type === 'manager'
    ? `Line Manager — ${employees.find(e => e.no === role.no)?.name ?? role.no}`
    : 'HR Operations';

  const reset = () => { setState('idle'); setTicket(null); };

  const submit = async () => {
    if (comment.trim().length < 5) { setState('short'); return; }
    setState('sending');
    try {
      const r = await fetch('/api/modification-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), role: roleLabel, screen, comment: comment.trim(), lang }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      setTicket(data.number ?? null);
      setState('ok');
      setComment('');
    } catch {
      setState('err');
    }
  };

  return (
    <>
      <button className="mod-fab" onClick={() => { setOpen(true); reset(); }}>
        ✉ {t('modRequest')}
      </button>
      {open && (
        <div className="modal-back" onClick={() => setOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h4>✉ {t('modRequest')}</h4>
            <p className="note" style={{ marginTop: 0 }}>{t('modRequestDesc')}</p>
            <div className="row">
              <label>{t('yourName')}</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder={roleLabel} />
            </div>
            <div className="row">
              <label>{t('screenField')}</label>
              <input value={screen} disabled />
            </div>
            <div className="row">
              <label>{t('commentsField')}</label>
              <textarea rows={4} value={comment} onChange={e => { setComment(e.target.value); if (state === 'short') reset(); }} />
            </div>
            {state === 'ok' && <div className="pill ok" style={{ display: 'block', textAlign: 'center', padding: 8 }}>✓ {t('sentOk')} {ticket ? `#${ticket}` : ''}</div>}
            {state === 'err' && <div className="pill bad" style={{ display: 'block', textAlign: 'center', padding: 8 }}>{t('sendFailed')}</div>}
            {state === 'short' && <div className="pill warn" style={{ display: 'block', textAlign: 'center', padding: 8 }}>{t('commentTooShort')}</div>}
            <div className="actions">
              <button className="ghost" onClick={() => setOpen(false)}>{t('close')}</button>
              {state !== 'ok' && (
                <button className="primary" onClick={submit} disabled={state === 'sending'}>
                  {state === 'sending' ? t('sending') : t('sendRequest')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
