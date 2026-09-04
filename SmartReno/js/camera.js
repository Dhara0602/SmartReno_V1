/**
 * CameraModule — handles image capture and upload on mobile & desktop.
 * Exposes: CameraModule.init(containerId), CameraModule.getImageData()
 */
const CameraModule = (() => {
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
  const MAX_DIMENSION = 1920;
  const JPEG_QUALITY = 0.85;

  let _container = null;
  let _imageData = null; // { base64, mimeType }
  let _webcamStream = null;
  let _onCapture = null;

  // ── Detection ──────────────────────────────────────────────────────────────
  function isMobile() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }

  // ── Image Processing ───────────────────────────────────────────────────────
  function resizeAndEncodeFile(file) {
    return new Promise((resolve, reject) => {
      if (file.size > MAX_FILE_SIZE) {
        reject(new Error('File is too large. Please choose an image under 10 MB.'));
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Invalid image file.'));
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;

          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            if (width > height) {
              height = Math.round((height / width) * MAX_DIMENSION);
              width = MAX_DIMENSION;
            } else {
              width = Math.round((width / height) * MAX_DIMENSION);
              height = MAX_DIMENSION;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
          resolve({ base64: dataUrl, mimeType: 'image/jpeg' });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function captureFromVideo(videoEl) {
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth || 1280;
    canvas.height = videoEl.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0);

    let { width, height } = canvas;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(width, height);
      const scaled = document.createElement('canvas');
      scaled.width = Math.round(width * scale);
      scaled.height = Math.round(height * scale);
      scaled.getContext('2d').drawImage(canvas, 0, 0, scaled.width, scaled.height);
      return { base64: scaled.toDataURL('image/jpeg', JPEG_QUALITY), mimeType: 'image/jpeg' };
    }

    return { base64: canvas.toDataURL('image/jpeg', JPEG_QUALITY), mimeType: 'image/jpeg' };
  }

  // ── Webcam ─────────────────────────────────────────────────────────────────
  async function startWebcam(videoEl, statusEl) {
    try {
      _webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 } },
        audio: false,
      });
      videoEl.srcObject = _webcamStream;
      await videoEl.play();
      videoEl.classList.add('active');
      if (statusEl) statusEl.textContent = 'Camera active — click Capture when ready';
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Camera permission denied. Please use file upload instead.'
        : 'Could not access camera: ' + err.message;
      throw new Error(msg);
    }
  }

  function stopWebcam() {
    if (_webcamStream) {
      _webcamStream.getTracks().forEach(t => t.stop());
      _webcamStream = null;
    }
  }

  // ── UI Builders ────────────────────────────────────────────────────────────
  function buildMobileUI() {
    return `
      <div class="drop-zone" id="cm-dropzone" role="button" tabindex="0" aria-label="Upload a photo">
        <div class="drop-zone-icon">🏠</div>
        <div class="drop-zone-title">Upload a room photo</div>
        <div class="drop-zone-sub">Choose from gallery or take a new photo</div>
      </div>
      <div class="capture-btn-row">
        <button class="btn btn-primary" id="cm-take-photo">
          📷 Take Photo
        </button>
        <button class="btn btn-secondary" id="cm-upload-gallery">
          🖼 From Gallery
        </button>
      </div>
      <input type="file" id="cm-input-camera"  accept="image/*" capture="environment" class="sr-only" aria-hidden="true">
      <input type="file" id="cm-input-gallery" accept="image/jpeg,image/png,image/webp" class="sr-only" aria-hidden="true">
      <div class="preview-container" id="cm-preview">
        <img id="cm-preview-img" class="preview-image" alt="Room preview" src="">
        <div class="preview-actions">
          <button class="btn btn-ghost btn-sm" id="cm-retake">↩ Retake</button>
          <button class="btn btn-primary" id="cm-continue">Looks Good — Continue ›</button>
        </div>
      </div>`;
  }

  function buildDesktopUI() {
    return `
      <div class="drop-zone" id="cm-dropzone" role="button" tabindex="0" aria-label="Drag and drop or click to upload">
        <div class="drop-zone-icon">📂</div>
        <div class="drop-zone-title">Drag & drop a photo here</div>
        <div class="drop-zone-sub">or click to browse — JPEG, PNG, WebP up to 10 MB</div>
      </div>
      <div class="capture-btn-row">
        <button class="btn btn-secondary" id="cm-pick-file">
          📁 Browse Files
        </button>
        <button class="btn btn-ghost" id="cm-webcam-btn">
          📹 Use Webcam
        </button>
      </div>
      <input type="file" id="cm-input-file" accept="image/jpeg,image/png,image/webp" class="sr-only" aria-hidden="true">
      <video id="cm-webcam-video" class="webcam-preview" autoplay muted playsinline aria-label="Webcam preview"></video>
      <div id="cm-webcam-controls" style="display:none; gap:10px; justify-content:center; flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" id="cm-webcam-capture">📸 Capture</button>
        <button class="btn btn-ghost btn-sm" id="cm-webcam-stop">✕ Stop</button>
        <span id="cm-webcam-status" style="color:var(--text-secondary);font-size:0.8rem;align-self:center;"></span>
      </div>
      <div class="preview-container" id="cm-preview">
        <img id="cm-preview-img" class="preview-image" alt="Room preview" src="">
        <div class="preview-actions">
          <button class="btn btn-ghost btn-sm" id="cm-retake">↩ Retake</button>
          <button class="btn btn-primary" id="cm-continue">Looks Good — Continue ›</button>
        </div>
      </div>`;
  }

  // ── Preview ────────────────────────────────────────────────────────────────
  function showPreview(data) {
    _imageData = data;
    const previewEl  = _container.querySelector('#cm-preview');
    const previewImg = _container.querySelector('#cm-preview-img');
    const dropzone   = _container.querySelector('#cm-dropzone');
    const btnRow     = _container.querySelector('.capture-btn-row');

    previewImg.src = data.base64;
    previewEl.classList.add('visible');
    if (dropzone) dropzone.style.display = 'none';
    if (btnRow)   btnRow.style.display   = 'none';

    // Hide webcam controls on desktop
    const wc = _container.querySelector('#cm-webcam-controls');
    const wv = _container.querySelector('#cm-webcam-video');
    if (wc) wc.style.display = 'none';
    if (wv) { wv.classList.remove('active'); stopWebcam(); }
  }

  function resetPreview() {
    _imageData = null;
    const previewEl = _container.querySelector('#cm-preview');
    const dropzone  = _container.querySelector('#cm-dropzone');
    const btnRow    = _container.querySelector('.capture-btn-row');

    previewEl.classList.remove('visible');
    if (dropzone) dropzone.style.display = '';
    if (btnRow)   btnRow.style.display   = '';

    // Reset file inputs
    ['#cm-input-camera', '#cm-input-gallery', '#cm-input-file'].forEach(sel => {
      const el = _container.querySelector(sel);
      if (el) el.value = '';
    });
  }

  // ── File Input Handling ────────────────────────────────────────────────────
  function handleFileInput(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    resizeAndEncodeFile(file)
      .then(showPreview)
      .catch(err => {
        window.SmartReno && window.SmartReno.toast
          ? window.SmartReno.toast(err.message, 'error')
          : alert(err.message);
        input.value = '';
      });
  }

  // ── Event Wiring ───────────────────────────────────────────────────────────
  function wireMobileEvents() {
    const dropzone     = _container.querySelector('#cm-dropzone');
    const inputCamera  = _container.querySelector('#cm-input-camera');
    const inputGallery = _container.querySelector('#cm-input-gallery');
    const btnTake      = _container.querySelector('#cm-take-photo');
    const btnGallery   = _container.querySelector('#cm-upload-gallery');
    const btnRetake    = _container.querySelector('#cm-retake');
    const btnContinue  = _container.querySelector('#cm-continue');

    dropzone.addEventListener('click', () => inputCamera.click());
    dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') inputCamera.click(); });
    btnTake.addEventListener('click', () => inputCamera.click());
    btnGallery.addEventListener('click', () => inputGallery.click());
    inputCamera.addEventListener('change', () => handleFileInput(inputCamera));
    inputGallery.addEventListener('change', () => handleFileInput(inputGallery));
    btnRetake.addEventListener('click', resetPreview);
    btnContinue.addEventListener('click', () => { if (_onCapture) _onCapture(_imageData); });
  }

  function wireDesktopEvents() {
    const dropzone    = _container.querySelector('#cm-dropzone');
    const inputFile   = _container.querySelector('#cm-input-file');
    const btnFile     = _container.querySelector('#cm-pick-file');
    const btnWebcam   = _container.querySelector('#cm-webcam-btn');
    const videoEl     = _container.querySelector('#cm-webcam-video');
    const wcControls  = _container.querySelector('#cm-webcam-controls');
    const wcCapture   = _container.querySelector('#cm-webcam-capture');
    const wcStop      = _container.querySelector('#cm-webcam-stop');
    const wcStatus    = _container.querySelector('#cm-webcam-status');
    const btnRetake   = _container.querySelector('#cm-retake');
    const btnContinue = _container.querySelector('#cm-continue');

    // File pick
    dropzone.addEventListener('click', () => inputFile.click());
    dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') inputFile.click(); });
    btnFile.addEventListener('click', () => inputFile.click());
    inputFile.addEventListener('change', () => handleFileInput(inputFile));

    // Drag & drop
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) {
        const fakeInput = { files: [file] };
        resizeAndEncodeFile(file)
          .then(showPreview)
          .catch(err => alert(err.message));
      }
    });

    // Webcam
    btnWebcam.addEventListener('click', async () => {
      try {
        dropzone.style.display = 'none';
        wcControls.style.display = 'flex';
        await startWebcam(videoEl, wcStatus);
      } catch (err) {
        wcControls.style.display = 'none';
        dropzone.style.display = '';
        const msg = err.message;
        window.SmartReno && window.SmartReno.toast
          ? window.SmartReno.toast(msg, 'error')
          : alert(msg);
      }
    });

    wcCapture.addEventListener('click', () => {
      if (!_webcamStream) return;
      const data = captureFromVideo(videoEl);
      stopWebcam();
      videoEl.classList.remove('active');
      wcControls.style.display = 'none';
      showPreview(data);
    });

    wcStop.addEventListener('click', () => {
      stopWebcam();
      videoEl.classList.remove('active');
      wcControls.style.display = 'none';
      dropzone.style.display = '';
    });

    btnRetake.addEventListener('click', resetPreview);
    btnContinue.addEventListener('click', () => { if (_onCapture) _onCapture(_imageData); });
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function init(containerId, onCapture) {
    _container = typeof containerId === 'string'
      ? document.getElementById(containerId)
      : containerId;

    if (!_container) throw new Error(`CameraModule: container "${containerId}" not found`);

    _onCapture = onCapture || null;
    _imageData = null;

    if (isMobile()) {
      _container.innerHTML = buildMobileUI();
      wireMobileEvents();
    } else {
      _container.innerHTML = buildDesktopUI();
      wireDesktopEvents();
    }
  }

  function getImageData() {
    return _imageData;
  }

  function destroy() {
    stopWebcam();
    _imageData = null;
    _container = null;
    _onCapture = null;
  }

  return { init, getImageData, destroy };
})();

window.CameraModule = CameraModule;
