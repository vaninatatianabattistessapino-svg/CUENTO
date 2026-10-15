// Configuración del worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

const bookContainer = document.getElementById('flip-book');
const loading = document.getElementById('loading');
const srAnnouncer = document.getElementById('sr-announcer');
const pageIndicator = document.getElementById('page-indicator');

let pageFlip = null;
let pdfDoc = null;
let pageTexts = []; // Almacena el texto extraído por página para TTS / Lector
let currentZoom = 16; // Tamaño base de fuente en px

// Generador de sonido sintético de paso de página (Web Audio API)
function playPageTurnSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const bufferSize = audioCtx.sampleRate * 0.1; // 100ms de ruido
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = audioCtx.createBufferSource();
        whiteNoise.buffer = buffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, audioCtx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

        whiteNoise.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);

        whiteNoise.start();
    } catch (e) {
        console.log("Audio Context no soportado o bloqueado por el navegador.");
    }
}

// Cargar automáticamente el PDF alojado en el repo ("cuento.final.pdf")
document.addEventListener('DOMContentLoaded', () => {
    loadRepoPDF('cuento.final.pdf');
});

async function loadRepoPDF(pdfPath) {
    loading.style.display = 'block';
    
    try {
        pdfDoc = await pdfjsLib.getDocument(pdfPath).promise;
        const totalPages = pdfDoc.numPages;

        const firstPage = await pdfDoc.getPage(1);
        const viewportInfo = firstPage.getViewport({ scale: 1.5 });
        const pageWidth = viewportInfo.width;
        const pageHeight = viewportInfo.height;

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            
            // Extraer texto para lectura en voz alta y lectores de pantalla
            const textContent = await page.getTextContent();
            const textItems = textContent.items.map(item => item.str).join(' ');
            pageTexts.push(textItems);

            // Renderizar canvas
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            pageDiv.appendChild(canvas);
            bookContainer.appendChild(pageDiv);
        }

        bookContainer.style.display = 'block';

        // Inicializar St.PageFlip
        pageFlip = new St.PageFlip(bookContainer, {
            width: pageWidth,
            height: pageHeight,
            size: "stretch",
            minWidth: 315,
            maxWidth: pageWidth,
            minHeight: 420,
            maxHeight: pageHeight,
            showCover: true,
            maxShadowOpacity: 0.5,
            usePortrait: true
        });

        const pages = document.querySelectorAll('.page');
        pageFlip.loadFromHTML(pages);

        // Eventos de animación/transición y sonido
        pageFlip.on('flip', (e) => {
            playPageTurnSound();
            const currentPage = e.data + 1;
            pageIndicator.innerText = `Página ${currentPage} de ${totalPages}`;
            announceToScreenReader(`Mostrando página ${currentPage}`);
        });

        loading.style.display = 'none';

    } catch (error) {
        console.error('Error al cargar cuento.final.pdf:', error);
        loading.innerText = 'Error al cargar el archivo cuento.final.pdf. Asegúrate de que el archivo existe en la raíz del repositorio.';
    }
}

// Lector de pantalla (Anuncio accesible directo)
function announceToScreenReader(text) {
    srAnnouncer.innerText = text;
}

// Botones de Navegación
document.getElementById('btn-prev').addEventListener('click', () => {
    if (pageFlip) pageFlip.flipPrev();
});

document.getElementById('btn-next').addEventListener('click', () => {
    if (pageFlip) pageFlip.flipNext();
});

// Botones para Agrandar / Achicar texto
document.getElementById('btn-zoom-in').addEventListener('click', () => {
    if (currentZoom < 28) {
        currentZoom += 2;
        document.body.style.fontSize = `${currentZoom}px`;
        announceToScreenReader(`Tamaño de texto aumentado a ${currentZoom} píxeles`);
    }
});

document.getElementById('btn-zoom-out').addEventListener('click', () => {
    if (currentZoom > 12) {
        currentZoom -= 2;
        document.body.style.fontSize = `${currentZoom}px`;
        announceToScreenReader(`Tamaño de texto disminuido a ${currentZoom} píxeles`);
    }
});

// Lectura en Voz Alta (Síntesis de Voz - TTS en Español)
document.getElementById('btn-read').addEventListener('click', () => {
    if (!('speechSynthesis' in window)) {
        alert('Tu navegador no soporta lectura en voz alta.');
        return;
    }

    window.speechSynthesis.cancel(); // Detener lecturas previas

    const currentPageIndex = pageFlip ? pageFlip.getCurrentPageIndex() : 0;
    const textToRead = pageTexts[currentPageIndex] || "No hay texto disponible en esta página.";

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-ES';
    utterance.rate = 0.9; // Velocidad cómoda para alumnos con baja visión

    announceToScreenReader("Iniciando lectura en voz alta de la página actual.");
    window.speechSynthesis.speak(utterance);
});

document.getElementById('btn-stop').addEventListener('click', () => {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        announceToScreenReader("Lectura de voz detenida.");
    }
});