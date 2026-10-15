// Configurar la ruta del worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Referencias a elementos del DOM
const bookContainer = document.getElementById('flip-book');
const loading = document.getElementById('loading');
const storyTextContainer = document.getElementById('story-text');
const announcer = document.getElementById('screen-reader-announcer');

const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnSpeak = document.getElementById('btn-speak');
const btnStop = document.getElementById('btn-stop');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const pageIndicator = document.getElementById('page-indicator');

let pageFlip = null;
let currentFontSize = 20; // Tamaño de letra inicial grande para baja visión (px)
let storyFullText = "";
let synth = window.speechSynthesis;
let currentUtterance = null;
let audioCtx = null;

// Función para anunciar mensajes al lector de pantalla
function announce(message) {
    if (announcer) {
        announcer.textContent = '';
        setTimeout(() => {
            announcer.textContent = message;
        }, 50);
    }
}

// Generador de sonido sintético de hoja al pasar página (Efecto de audio Web Audio API)
function playPageTurnSound() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const bufferSize = audioCtx.sampleRate * 0.15; // 150ms
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }

        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);

        noise.start();
    } catch (e) {
        console.log("No se pudo reproducir el sonido de página:", e);
    }
}

// Cargar automáticamente el archivo "cuento.pdf" alojado en el repositorio
window.addEventListener('DOMContentLoaded', () => {
    loadRepoPDF('cuento.pdf');
});

async function loadRepoPDF(pdfUrl) {
    loading.style.display = 'block';
    bookContainer.style.display = 'none';

    try {
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        const totalPages = pdf.numPages;

        const firstPage = await pdf.getPage(1);
        const viewportInfo = firstPage.getViewport({ scale: 1.5 });
        const pageWidth = viewportInfo.width;
        const pageHeight = viewportInfo.height;

        storyFullText = "";

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            
            // Extraer texto para síntesis de voz y baja visión
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            storyFullText += pageText + "\n\n";

            // Renderizar PDF en canvas
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };

            await page.render(renderContext).promise;

            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            pageDiv.appendChild(canvas);

            bookContainer.appendChild(pageDiv);
        }

        // Colocar texto extraído en el contenedor de texto accesible
        storyTextContainer.innerText = storyFullText;

        // Inicializar PageFlip (Efecto de Paginación)
        bookContainer.style.display = 'block';
        pageFlip = new St.PageFlip(bookContainer, {
            width: pageWidth,
            height: pageHeight,
            size: "stretch",
            minWidth: 300,
            maxWidth: pageWidth,
            minHeight: 400,
            maxHeight: pageHeight,
            showCover: true,
            maxShadowOpacity: 0.6,
            usePortrait: true
        });

        const pages = document.querySelectorAll('.page');
        pageFlip.loadFromHTML(pages);

        // Eventos al cambiar de página
        pageFlip.on('flip', (e) => {
            playPageTurnSound();
            const current = e.data + 1;
            pageIndicator.innerText = `Página ${current} de ${totalPages}`;
            announce(`Página ${current}`);
        });

        pageIndicator.innerText = `Página 1 de ${totalPages}`;
        loading.style.display = 'none';
        announce("El cuento ha sido cargado correctamente.");

    } catch (error) {
        console.error('Error al cargar el PDF:', error);
        loading.innerText = 'No se pudo cargar cuento.pdf. Verifica que el archivo exista en el repositorio.';
        announce("Error al cargar el cuento.");
    }
}

// -------------------------------------------------------------
// Controles de Navegación
// -------------------------------------------------------------
btnPrev.addEventListener('click', () => {
    if (pageFlip) {
        pageFlip.flipPrev();
    }
});

btnNext.addEventListener('click', () => {
    if (pageFlip) {
        pageFlip.flipNext();
    }
});

// -------------------------------------------------------------
// Controles de Tamaño de Letra (Baja Visión)
// -------------------------------------------------------------
btnZoomIn.addEventListener('click', () => {
    if (currentFontSize < 40) {
        currentFontSize += 2;
        storyTextContainer.style.fontSize = `${currentFontSize}px`;
        announce(`Tamaño de letra aumentado a ${currentFontSize} puntos`);
    }
});

btnZoomOut.addEventListener('click', () => {
    if (currentFontSize > 14) {
        currentFontSize -= 2;
        storyTextContainer.style.fontSize = `${currentFontSize}px`;
        announce(`Tamaño de letra disminuido a ${currentFontSize} puntos`);
    }
});

// -------------------------------------------------------------
// Lectura en Voz Alta (Text-to-Speech en Español)
// -------------------------------------------------------------
btnSpeak.addEventListener('click', () => {
    if (!synth) {
        alert("Tu navegador no soporta la lectura en voz alta.");
        return;
    }

    if (synth.speaking) {
        synth.cancel();
    }

    const textToRead = storyFullText.trim() || storyTextContainer.innerText;

    if (!textToRead) {
        announce("No hay texto disponible para leer.");
        return;
    }

    currentUtterance = new SpeechSynthesisUtterance(textToRead);
    currentUtterance.lang = 'es-ES'; // Configurar voz en español
    currentUtterance.rate = 0.9;     // Velocidad ligeramente pausada para facilitar la escucha

    // Intentar buscar una voz en español disponible
    const voices = synth.getVoices();
    const spanishVoice = voices.find(voice => voice.lang.startsWith('es'));
    if (spanishVoice) {
        currentUtterance.voice = spanishVoice;
    }

    currentUtterance.onstart = () => {
        btnSpeak.disabled = true;
        btnStop.disabled = false;
        announce("Iniciando lectura en voz alta");
    };

    currentUtterance.onend = () => {
        btnSpeak.disabled = false;
        btnStop.disabled = true;
        announce("Lectura finalizada");
    };

    currentUtterance.onerror = () => {
        btnSpeak.disabled = false;
        btnStop.disabled = true;
        announce("Error durante la lectura en voz alta");
    };

    synth.speak(currentUtterance);
});

btnStop.addEventListener('click', () => {
    if (synth && synth.speaking) {
        synth.cancel();
        btnSpeak.disabled = false;
        btnStop.disabled = true;
        announce("Lectura detenida");
    }
});