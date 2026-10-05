// Shared editor plumbing for the JSON and HTML formatters: open a file, sample, copy, download,
// clear, indent choice and the size readout. Each tool adds its own format/minify and viewer.
(() => {
  const MAX_FILE_MB = 25; // a textarea holding more than this becomes sluggish to type in

  function formatSize(chars) {
    if (chars < 1024) return chars + ' chars';
    if (chars < 1024 * 1024) return (chars / 1024).toFixed(1) + ' KB';
    return (chars / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // options: { extension, mime, sample, onChange(text), output?() -> text to copy/download instead of the editor's }
  function bind(options) {
    const $ = (selector) => document.querySelector(selector);
    const input = $('#codeInput');
    const stats = $('#inputStats');
    const toast = $('#toast');
    let fileName = 'formatted';
    let toastTimer;
    let changeTimer;

    const notify = (text, isError = false) => {
      clearTimeout(toastTimer);
      toast.textContent = text;
      toast.classList.toggle('error', isError);
      toast.classList.add('show');
      toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
    };

    const changed = (immediate) => {
      const text = input.value;
      const lines = text ? text.split('\n').length : 0;
      stats.textContent = text ? `${lines.toLocaleString()} line${lines === 1 ? '' : 's'} · ${formatSize(text.length)}` : '';
      clearTimeout(changeTimer);
      // Re-checking a few MB on every keystroke would stall typing, so wait longer for big input.
      if (immediate) options.onChange(text);
      else changeTimer = setTimeout(() => options.onChange(text), Math.min(1500, 250 + text.length / 4000));
    };

    // Replaces the text as one undoable edit where the browser supports it, so Ctrl+Z still works.
    // Very large text skips that: the undoable insert gets slow at megabyte sizes.
    const setText = (text) => {
      input.focus();
      input.select();
      const undoable = text.length + input.value.length < 400000 && document.execCommand?.('insertText', false, text);
      if (!undoable || input.value !== text) input.value = text;
      input.setSelectionRange(0, 0);
      input.scrollTop = 0;
      changed(true);
    };

    const indent = () => {
      const value = $('#indentSelect').value;
      return value === 'tab' ? '\t' : ' '.repeat(Number(value));
    };

    $('#openBtn').addEventListener('click', () => $('#fileInput').click());
    $('#fileInput').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      if (file.size > MAX_FILE_MB * 1024 * 1024) { notify(`This file is larger than ${MAX_FILE_MB} MB. Please choose a smaller file.`, true); return; }
      try {
        fileName = file.name.replace(/\.[^.]+$/, '') || fileName;
        setText(await file.text());
      } catch (error) {
        console.error(error);
        notify('This file could not be read.', true);
      }
    });
    $('#sampleBtn').addEventListener('click', () => setText(options.sample));
    $('#clearBtn').addEventListener('click', () => setText(''));
    const result = () => options.output?.() ?? input.value;
    $('#copyBtn').addEventListener('click', async () => {
      const text = result();
      if (!text) { notify('There is nothing to copy yet.', true); return; }
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        input.select();
        document.execCommand('copy');
      }
      notify('Copied to clipboard.');
    });
    $('#downloadBtn').addEventListener('click', () => {
      const text = result();
      if (!text) { notify('There is nothing to download yet.', true); return; }
      const url = URL.createObjectURL(new Blob([text], { type: options.mime }));
      const link = Object.assign(document.createElement('a'), { href: url, download: `${fileName}.${options.extension}` });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    input.addEventListener('input', () => changed(false));
    // Tab indents instead of leaving the editor; Esc then Tab still moves focus on as usual.
    let escaped = false;
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { escaped = true; return; }
      if (event.key === 'Tab' && !event.shiftKey && !escaped && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        document.execCommand('insertText', false, indent());
      }
      escaped = false;
    });

    return { input, setText, indent, notify, refresh: () => changed(true) };
  }

  window.FormatterKit = { bind };
})();
