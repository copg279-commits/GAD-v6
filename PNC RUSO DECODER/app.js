window.addEventListener('load', function () {
    const mainButtons = document.getElementById('mainButtons');
    const video = document.getElementById('video');
    const videoWrapper = document.getElementById('videoWrapper');
    const startCameraBtn = document.getElementById('startCamera');
    const fileInput = document.getElementById('fileInput');
    const resultBox = document.getElementById('resultBox');
    const rawOutput = document.getElementById('rawOutput');
    const decodedOutput = document.getElementById('decodedOutput');
    const statusMsg = document.getElementById('status');
    const copyBtn = document.getElementById('copyBtn');

    const cameraControls = document.getElementById('cameraControls');
    const zoomSlider = document.getElementById('zoomSlider');
    const guideWidthSlider = document.getElementById('guideWidth');
    const guideHeightSlider = document.getElementById('guideHeight');
    const scannerGuide = document.getElementById('scannerGuide');
    const manualCaptureBtn = document.getElementById('manualCaptureBtn');
    
    const cropperContainer = document.getElementById('cropperContainer');
    const imageToCrop = document.getElementById('imageToCrop');
    const cropAndReadBtn = document.getElementById('cropAndReadBtn');
    
    const showAppMenuBtn = document.getElementById('showAppMenuBtn');
    const smartPasteBtn = document.getElementById('smartPasteBtn');
    const clearBtn = document.getElementById('clearBtn');
    
    const appModal = document.getElementById('appModal');
    const closeAppModal = document.getElementById('closeAppModal');
    const appSelector = document.getElementById('appSelector');
    const nativeAppBtn = document.getElementById('nativeAppBtn');

    let cropper = null;
    let currentZoom = 1;
    let autoReadTimeout = null;

    if (showAppMenuBtn) showAppMenuBtn.addEventListener('click', () => { appModal.classList.add('show'); });
    if (closeAppModal) closeAppModal.addEventListener('click', () => { appModal.classList.remove('show'); });
    window.addEventListener('click', (event) => { if (event.target === appModal) appModal.classList.remove('show'); });
    if (nativeAppBtn) nativeAppBtn.addEventListener('click', () => { appModal.classList.remove('show'); });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            stopCamera();
            if(mainButtons) mainButtons.style.display = 'flex'; 
            if(clearBtn) clearBtn.style.display = 'none';       
            resultBox.style.display = 'none';
            cropperContainer.style.display = 'none';
            cameraControls.style.display = 'none';
            if (cropper) { cropper.destroy(); cropper = null; }
            fileInput.value = '';
            if(rawOutput) rawOutput.textContent = '-';
            if(decodedOutput) decodedOutput.textContent = '-';
            
            // Limpia el color de la tarjeta
            const virtualCard = document.getElementById('virtualCard');
            if(virtualCard) {
                virtualCard.classList.remove('valid-card', 'invalid-card');
            }

            window.history.replaceState({}, document.title, window.location.pathname);
            statusMsg.textContent = "Búsqueda limpiada. Esperando acción...";
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    if (smartPasteBtn) {
        smartPasteBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text && text.trim().length > 20) {
                    statusMsg.textContent = "¡Código leído del portapapeles!";
                    processSuccess(text.trim());
                } else {
                    alert("El portapapeles está vacío o no parece un código válido.");
                }
            } catch (err) {
                alert("No se pudo acceder al portapapeles. Da permiso al navegador si lo pide.");
            }
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const codigoDesdeApp = urlParams.get('codigo_escaneado');

    if (codigoDesdeApp) {
        window.history.replaceState({}, document.title, window.location.pathname);
        statusMsg.textContent = "¡Código recibido desde la App externa!";
        setTimeout(() => processSuccess(codigoDesdeApp), 500); 
    }

    const savedApp = localStorage.getItem('preferredScannerApp');
    if (savedApp !== null && appSelector) appSelector.value = savedApp;

    function updateIntentUrl() {
        if (!nativeAppBtn || !appSelector) return;
        const currentUrl = window.location.href.split('?')[0]; 
        const returnUrl = encodeURIComponent(currentUrl + '?codigo_escaneado={CODE}');
        const pkg = appSelector.value;
        
        if (pkg === 'web') {
            nativeAppBtn.href = "https://online-barcode-reader.inliteresearch.com/";
            nativeAppBtn.target = "_blank"; 
        } else {
            nativeAppBtn.target = "_self";
            const pkgString = pkg ? `package=${pkg};` : '';
            const fallbackUrl = pkg ? encodeURIComponent(`https://play.google.com/store/apps/details?id=${pkg}`) : '';
            const fallbackString = fallbackUrl ? `S.browser_fallback_url=${fallbackUrl};` : '';
            const intentUrl = `intent://scan/#Intent;action=com.google.zxing.client.android.SCAN;${pkgString}S.SCAN_FORMATS=PDF_417;S.RET_URL=${returnUrl};${fallbackString}end`;
            nativeAppBtn.href = intentUrl;
        }
    }

    if (appSelector) {
        updateIntentUrl();
        appSelector.addEventListener('change', (e) => {
            localStorage.setItem('preferredScannerApp', e.target.value);
            updateIntentUrl();
        });
    }

    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.PDF_417]);
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    const codeReader = new ZXing.BrowserMultiFormatReader(hints);

    function playBeep() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine'; osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.5, ctx.currentTime);
            osc.start(); osc.stop(ctx.currentTime + 0.15);
        } catch (e) {}
    }

    function decodeBase64ToText(base64Str) {
        try {
            const clean = base64Str.replace(/\s/g, '');
            const bin = atob(clean);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return new TextDecoder('utf-8').decode(bytes);
        } catch (e) { return "Error al decodificar Base64."; }
    }

    function formatDate(dateStr) {
        if (!dateStr || dateStr.length !== 8) return dateStr;
        return `${dateStr.substring(6, 8)}.${dateStr.substring(4, 6)}.${dateStr.substring(0, 4)}`;
    }

    // ALGORITMO DE SEGURIDAD PARA DETECTAR FALSIFICACIONES
    function isValidRussianDL(text) {
        if (!text || !text.includes('|')) return false;
        const parts = text.split('|');
        if (parts.length < 9) return false;
        
        const isNumeric = (str) => /^\d+$/.test(str);
        
        // Comprueba fechas (tienen que ser 8 números exactos)
        if (!parts[1] || parts[1].length !== 8 || !isNumeric(parts[1])) return false;
        if (!parts[2] || parts[2].length !== 8 || !isNumeric(parts[2])) return false;
        if (!parts[6] || parts[6].length !== 8 || !isNumeric(parts[6])) return false;
        
        // Comprueba lógica del tiempo (Caducidad posterior a la Expedición)
        const issueYear = parseInt(parts[1].substring(0, 4));
        const expYear = parseInt(parts[2].substring(0, 4));
        if (expYear < issueYear) return false;

        // Comprueba que los apartados numéricos de código no tienen letras coladas
        if (parts[0] && !isNumeric(parts[0])) return false;
        if (parts[8] && !isNumeric(parts[8])) return false;

        return true;
    }

    function populateVirtualCard(decodedText) {
        const parts = decodedText.split('|');
        document.getElementById('field5').textContent = parts[0] || '';
        document.getElementById('field4a').textContent = formatDate(parts[1]);
        document.getElementById('field4b').textContent = formatDate(parts[2]);
        document.getElementById('field1').textContent = parts[3] ? parts[3].trim().replace(/\s+/g, ' ') : '';
        const fName = parts[4] ? parts[4].trim().replace(/\s+/g, ' ') : '';
        const pat = parts[5] ? parts[5].trim().replace(/\s+/g, ' ') : '';
        document.getElementById('field2').textContent = `${fName} ${pat}`.trim();
        document.getElementById('field3').textContent = formatDate(parts[6]);
        document.getElementById('field9').textContent = parts[7] || '';
        document.getElementById('field4c').textContent = parts[8] || '';
        document.getElementById('field8').textContent = ''; 
        
        // APLICAR VERDE O ROJO SEGÚN ANÁLISIS DEL PATRÓN
        const virtualCard = document.getElementById('virtualCard');
        if (virtualCard) {
            virtualCard.classList.remove('valid-card', 'invalid-card');
            if (isValidRussianDL(decodedText)) {
                virtualCard.classList.add('valid-card');
            } else {
                virtualCard.classList.add('invalid-card');
            }
        }
    }

    function processSuccess(rawText) {
        playBeep();
        if (rawOutput) rawOutput.textContent = rawText;
        if (decodedOutput) decodedOutput.textContent = decodeBase64ToText(rawText);
        
        try {
            populateVirtualCard(decodeBase64ToText(rawText));
        } catch(err) {}
        
        if(mainButtons) mainButtons.style.display = 'none'; 
        if(clearBtn) clearBtn.style.display = 'block'; 
        
        resultBox.style.display = 'block'; 
        cropperContainer.style.display = 'none';
        if (cropper) { cropper.destroy(); cropper = null; } 
        stopCamera();
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function handleResult(result) {
        if (result && result.text) processSuccess(result.text);
    }

    if (zoomSlider) { zoomSlider.addEventListener('input', (e) => { currentZoom = parseFloat(e.target.value); if(video) video.style.transform = `scale(${currentZoom})`; }); }
    if (guideWidthSlider) { guideWidthSlider.addEventListener('input', (e) => { if(scannerGuide) scannerGuide.style.width = `${e.target.value}%`; }); }
    if (guideHeightSlider) { guideHeightSlider.addEventListener('input', (e) => { if(scannerGuide) scannerGuide.style.height = `${e.target.value}%`; }); }

    if (manualCaptureBtn) {
        manualCaptureBtn.addEventListener('click', () => {
            statusMsg.textContent = "Analizando captura...";
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const img = new Image();
            img.onload = () => { codeReader.decodeFromImageElement(img).then(handleResult).catch(() => statusMsg.textContent = "No detectado. Ajusta el código en el recuadro."); };
            img.src = canvas.toDataURL();
        });
    }

    if (startCameraBtn) {
        startCameraBtn.addEventListener('click', () => {
            if(mainButtons) mainButtons.style.display = 'none'; 
            if(clearBtn) clearBtn.style.display = 'block';      
            
            resultBox.style.display = 'none';
            cropperContainer.style.display = 'none';
            videoWrapper.style.display = 'block';
            cameraControls.style.display = 'flex'; 
            statusMsg.textContent = "Ajusta el marco y escanea o pulsa Capturar.";

            currentZoom = 1; 
            if(zoomSlider) zoomSlider.value = 1; 
            if(video) video.style.transform = `scale(1)`;
            
            if(scannerGuide) { scannerGuide.style.width = '95%'; scannerGuide.style.height = '95%'; }
            if(guideWidthSlider) guideWidthSlider.value = 95; 
            if(guideHeightSlider) guideHeightSlider.value = 95;

            const constraints = { video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: "continuous" }] } };
            codeReader.decodeFromConstraints(constraints, 'video', (result, err) => {
                if (result) handleResult(result);
            }).catch(() => statusMsg.textContent = "Error iniciando la cámara.");
            
            window.scrollTo({ top: 0, behavior: 'smooth' }); 
        });
    }

    function stopCamera() {
        codeReader.reset();
        if(videoWrapper) videoWrapper.style.display = 'none';
        if(cameraControls) cameraControls.style.display = 'none';
        if(statusMsg && statusMsg.textContent.includes("Ajusta el marco")) statusMsg.textContent = "Cámara detenida.";
    }

    function attemptAutoReadFromCropper() {
        if (!cropper) return;
        const sourceCanvas = cropper.getCroppedCanvas();
        const scale = 2; const margin = 100; 
        const paddedCanvas = document.createElement('canvas');
        paddedCanvas.width = (sourceCanvas.width * scale) + (margin * 2);
        paddedCanvas.height = (sourceCanvas.height * scale) + (margin * 2);
        const ctx = paddedCanvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, paddedCanvas.width, paddedCanvas.height);
        ctx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, margin, margin, sourceCanvas.width * scale, sourceCanvas.height * scale);

        const img = new Image();
        img.onload = () => {
            codeReader.decodeFromImageElement(img)
                .then(handleResult)
                .catch(() => {
                    const rotCanv = document.createElement('canvas');
                    rotCanv.width = paddedCanvas.height; rotCanv.height = paddedCanvas.width;
                    const cR = rotCanv.getContext('2d');
                    cR.fillStyle = '#FFFFFF'; cR.fillRect(0, 0, rotCanv.width, rotCanv.height);
                    cR.translate(rotCanv.width/2, rotCanv.height/2); cR.rotate(90 * Math.PI/180);
                    cR.drawImage(paddedCanvas, -paddedCanvas.width/2, -paddedCanvas.height/2);

                    const rImg = new Image();
                    rImg.onload = () => { codeReader.decodeFromImageElement(rImg).then(handleResult).catch(() => {}); };
                    rImg.src = rotCanv.toDataURL("image/jpeg", 1.0);
                });
        };
        img.src = paddedCanvas.toDataURL("image/jpeg", 1.0);
    }

    function scheduleAutoRead() {
        clearTimeout(autoReadTimeout);
        autoReadTimeout = setTimeout(attemptAutoReadFromCropper, 300); 
    }

    if (cropAndReadBtn) {
        cropAndReadBtn.addEventListener('click', () => {
            if(statusMsg) statusMsg.textContent = "Forzando lectura de recorte...";
            attemptAutoReadFromCropper();
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            if (e.target.files && e.target.files.length) {
                stopCamera(); 
                if(mainButtons) mainButtons.style.display = 'none'; 
                if(clearBtn) clearBtn.style.display = 'block'; 
                
                if(resultBox) resultBox.style.display = 'none'; 
                if(cameraControls) cameraControls.style.display = 'none'; 
                if(cropperContainer) cropperContainer.style.display = 'none'; 
                if(statusMsg) statusMsg.textContent = "Buscando código en toda la imagen...";
                const file = e.target.files[0]; const reader = new FileReader();
                
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = async () => {
                        let detected = false;
                        if ('BarcodeDetector' in window) {
                            try {
                                const detector = new BarcodeDetector({ formats: ['pdf417'] });
                                const barcodes = await detector.detect(img);
                                if (barcodes.length > 0) { processSuccess(barcodes[0].rawValue); detected = true; return; }
                            } catch (err) {}
                        }
                        if (!detected) {
                            try {
                                const result = await codeReader.decodeFromImageElement(img);
                                processSuccess(result.text); detected = true;
                            } catch (err) {}
                        }
                        if (!detected) {
                            if(statusMsg) statusMsg.textContent = "Ajusta el recuadro. Se leerá automáticamente.";
                            if(imageToCrop) imageToCrop.src = event.target.result; 
                            if(cropperContainer) cropperContainer.style.display = 'block';
                            window.scrollTo({ top: 0, behavior: 'smooth' }); 

                            if (cropper) cropper.destroy();
                            cropper = new Cropper(imageToCrop, {
                                viewMode: 1, 
                                dragMode: 'move', 
                                autoCropArea: 0.85, 
                                restore: false, 
                                guides: true, 
                                zoomable: true, 
                                movable: true, 
                                background: true,
                                responsive: true,
                                ready: scheduleAutoRead, 
                                cropend: scheduleAutoRead, 
                                zoom: scheduleAutoRead     
                            });
                        }
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(decodedOutput.textContent).then(() => {
                const orig = copyBtn.textContent;
                copyBtn.textContent = "¡Copiado!";
                setTimeout(() => copyBtn.textContent = orig, 2000);
            });
        });
    }
});