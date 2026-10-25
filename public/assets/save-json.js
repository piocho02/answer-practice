// Opens the native Save As dialog when supported; no handles or permissions are retained.
window.saveAnswerJson = async function (blob, suggestedName) {
  if (typeof window.showSaveFilePicker === 'function') {
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        id: 'answer-json',
        suggestedName,
        types: [{ description: '답안 JSON 파일', accept: { 'application/json': ['.json'] } }]
      });
    } catch (error) {
      if (error.name === 'AbortError') return 'cancelled';
      throw error;
    }
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      try { await writable.abort(); } catch {}
      throw error;
    }
    return 'saved';
  }
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url;
  link.download = suggestedName;
  document.body.append(link);
  try { link.click(); } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  return 'downloaded';
};
