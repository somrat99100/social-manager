import { useEffect, useRef, useState } from 'react';
import {
  PROVIDER_INFO,
  openInGemini,
  openInChatGPT,
  focusOrReopenPopup,
  readImageFromPasteEvent,
  fileToBase64,
} from '../services/webAiBridge';

/**
 * Docks the Gemini/ChatGPT web app alongside the app in a small, positioned
 * popup window (not a full new tab), and keeps this modal open the whole
 * time as the "home base" — instructions, live open/closed status, and a
 * paste/upload zone to bring the finished image straight back into the
 * post. The real site can't be embedded (X-Frame-Options blocks it), so
 * this is the closest it gets to feeling like it's part of the same flow.
 */
export default function WebAiBridgeModal({ provider, prompt, onCapture, onClose }) {
  const info = PROVIDER_INFO[provider];
  const [popup, setPopup] = useState(null);
  const [popupOpen, setPopupOpen] = useState(true);
  const [copied, setCopied] = useState(null); // null while opening, true/false once known
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const pasteZoneRef = useRef(null);
  const launchedRef = useRef(false);

  // Launch the popup once, on open.
  useEffect(() => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    (async () => {
      try {
        if (provider === 'gemini') {
          const { window: win, copied: didCopy } = await openInGemini(prompt);
          setPopup(win || null);
          setCopied(didCopy);
          setPopupOpen(!!win);
        } else {
          const { window: win } = await openInChatGPT(prompt);
          setPopup(win || null);
          setCopied(true);
          setPopupOpen(!!win);
        }
      } catch (e) {
        setError(e.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch whether the popup is still open so the panel status stays honest.
  useEffect(() => {
    const t = setInterval(() => {
      setPopup((p) => {
        if (p) setPopupOpen(!p.closed);
        return p;
      });
    }, 700);
    return () => clearInterval(t);
  }, []);

  // Close the popup window when this panel closes.
  useEffect(
    () => () => {
      try {
        if (popup && !popup.closed) popup.close();
      } catch {
        /* ignore */
      }
    },
    [popup]
  );

  useEffect(() => {
    pasteZoneRef.current?.focus();
  }, []);

  const finish = async (promise, label) => {
    setError('');
    try {
      const { base64, mimeType, dataUrl } = await promise;
      onCapture({ base64, mimeType, dataUrl, label });
      try {
        popup?.close();
      } catch {
        /* ignore */
      }
      onClose();
    } catch (e) {
      setError(e.message || 'Could not read that image.');
    }
  };

  const handlePaste = (e) => {
    const found = readImageFromPasteEvent(e);
    if (!found) {
      setError(`No image on your clipboard yet — copy the image from ${info.label} first, then paste here.`);
      return;
    }
    e.preventDefault();
    finish(found, info.label);
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    finish(fileToBase64(file), info.label);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    finish(fileToBase64(file), info.label);
  };

  const handleBringToFront = () => {
    const win = focusOrReopenPopup(popup, provider);
    setPopup(win || null);
    setPopupOpen(!!win);
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal bridge-modal" onClick={(e) => e.stopPropagation()}>
        {/* Fake browser chrome — makes the docked window read as part of this panel */}
        <div className="bridge-window">
          <div className="bridge-window-bar">
            <div className="bridge-window-dots">
              <span />
              <span />
              <span />
            </div>
            <div className="bridge-window-url mono">
              <span className="bridge-window-lock">🔒</span> {info.host}
            </div>
            <span className={`bridge-status-pill ${popupOpen ? 'bridge-status-live' : 'bridge-status-closed'}`}>
              {popupOpen ? '● open' : '○ closed'}
            </span>
          </div>
          <div className="bridge-window-body">
            <div className="bridge-window-icon">{provider === 'gemini' ? '✦' : '⌘'}</div>
            <p className="bridge-window-title">{info.label} is docked in a window next to this one</p>
            <p className="field-hint">
              {provider === 'gemini'
                ? copied === false
                  ? "Your prompt didn't auto-copy — type it into Gemini yourself."
                  : 'Your prompt is on the clipboard — paste it (Ctrl/Cmd+V) into Gemini.'
                : 'Your prompt was sent straight into ChatGPT.'}
            </p>
            <button className="btn btn-ghost btn-sm" onClick={handleBringToFront}>
              {popupOpen ? '↗ Bring to front' : '↗ Reopen window'}
            </button>
          </div>
        </div>

        <div className="modal-header" style={{ marginTop: 18 }}>
          <h3>Bring the image back</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <ol className="bridge-steps">
          <li>In the {info.label} window, generate the image.</li>
          <li>Right-click it → <strong>Copy image</strong>.</li>
          <li>Come back here and paste (Ctrl/Cmd+V) below, or drop/upload the file.</li>
        </ol>

        <div
          ref={pasteZoneRef}
          className={`bridge-drop-zone ${dragOver ? 'bridge-drop-zone-active' : ''}`}
          tabIndex={0}
          onPaste={handlePaste}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => pasteZoneRef.current?.focus()}
        >
          <div className="bridge-drop-zone-icon">⧉</div>
          <div>Click here, then paste (Ctrl/Cmd+V)</div>
          <div className="field-hint">or drag an image in</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
            ⬆ Upload the image instead
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
        </div>

        {error && <div className="field-error" style={{ marginTop: 12 }}>{error}</div>}

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
