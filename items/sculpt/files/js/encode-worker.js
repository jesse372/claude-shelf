// JPEG encoding off the main thread (Process shoot): the main thread hands over a snapshot of the finished render and
// moves on to the next photo while this worker encodes it. Chrome's own toBlob/convertToBlob on the main thread encodes
// JPEG in idle slices, so it starves while the next photo renders; a worker runs truly in parallel.
self.onmessage = async (e) => {
  const { id, bmp, quality } = e.data;
  try {
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    c.getContext('2d').drawImage(bmp, 0, 0); bmp.close();
    self.postMessage({ id, blob: await c.convertToBlob({ type: 'image/jpeg', quality }) });
  } catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};
