// --- DATI INIZIALI ---
const QUESTIONS = [
    "Cosa ti ha colpito oggi?",
    "Cosa stai evitando di fare in questo momento?",
    "Cosa vorresti provare, anche se non sei capace?",
    "Quale canzone o suono hai in testa e perché?",
    "Cosa hai visto online che ti ha fatto pensare \"io l'avrei fatto diversamente\"?",
    "Qual è un'idea che hai abbandonato e che ogni tanto ti torna in mente?",
    "Cosa faresti oggi se nessuno potesse giudicarti?",
    "Cosa hai imparato di recente che vorresti spiegare a qualcuno?",
    "Che progetto ti sta esaltando adesso?",
    "Cosa ti ha fatto perdere tempo oggi e ne è valsa la pena?",
    "Quale errore recente ti ha insegnato di più?",
    "Che opera, video o artista ti ha ispirato ultimamente?",
    "Cosa ti piacerebbe costruire con le mani o con il codice?",
    "Che cosa ti stanca di quello che fai e che cosa invece ti carica?",
    "Se potessi mostrare una sola cosa che hai fatto, quale sarebbe?",
    "Qual è una cosa che sai fare e che dai per scontata?",
    "Cosa ti ha irritato oggi, e cosa c'è sotto?",
    "Che cosa vorresti che qualcuno ti chiedesse?",
    "Quale sarebbe l'esperimento più strano che potresti fare questa settimana?",
    "Cosa ti è rimasto in testa dopo una conversazione recente?"
];

// --- STATO DELL'APP ---
let state = {
    currentQuestionIndex: 0,
    hasChangedQuestionToday: false,
    audioBlob: null,
    mediaRecorder: null,
    audioChunks: [],
    isRecording: false,
    recordingInterval: null,
    recordingTime: 0
};

// --- GESTIONE IndexedDB (per i file audio) ---
const DB_NAME = 'DepositoAudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'audioStore';

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = event => reject("Errore IndexedDB");
        request.onsuccess = event => resolve(event.target.result);
        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

async function saveAudioToDB(id, blob) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(blob, id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject();
    });
}

async function getAudioFromDB(id) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = event => resolve(event.target.result);
        request.onerror = () => reject();
    });
}

async function deleteAudioFromDB(id) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject();
    });
}

// --- GESTIONE DATI LOCALI (localStorage) ---
function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('deposito_settings') || '{}');
    const today = getTodayString();
    
    // Se è un nuovo giorno, mantieni o avanza la domanda, resetta il cambio
    if (settings.lastDate !== today) {
        // Seleziona una nuova domanda pseudocasualmente o in sequenza (qui usiamo l'indice del giorno dell'anno)
        const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
        state.currentQuestionIndex = dayOfYear % QUESTIONS.length;
        state.hasChangedQuestionToday = false;
        
        saveSettings(today);
    } else {
        state.currentQuestionIndex = settings.questionIndex || 0;
        state.hasChangedQuestionToday = settings.changedToday || false;
    }
}

function saveSettings(date = getTodayString()) {
    localStorage.setItem('deposito_settings', JSON.stringify({
        lastDate: date,
        questionIndex: state.currentQuestionIndex,
        changedToday: state.hasChangedQuestionToday
    }));
}

function getArchive() {
    return JSON.parse(localStorage.getItem('deposito_archive') || '[]');
}

function saveArchive(archive) {
    localStorage.setItem('deposito_archive', JSON.stringify(archive));
}

function getTotalDays() {
    return parseInt(localStorage.getItem('deposito_total_days') || '0', 10);
}

function setTotalDays(days) {
    localStorage.setItem('deposito_total_days', days);
    document.getElementById('totalDays').innerText = days;
}

// --- INTERFACCIA E LOGICA ---
document.addEventListener('DOMContentLoaded', () => {
    // Inizializzazione
    loadSettings();
    updateQuestionUI();
    document.getElementById('totalDays').innerText = getTotalDays();
    renderArchive();

    // Event Listeners - Navigazione
    document.getElementById('navOggi').addEventListener('click', () => switchView('oggi'));
    document.getElementById('navArchivio').addEventListener('click', () => {
        switchView('archivio');
        renderArchive();
    });

    // Event Listeners - Domanda
    const btnChangeQ = document.getElementById('btnChangeQuestion');
    btnChangeQ.addEventListener('click', () => {
        if (!state.hasChangedQuestionToday) {
            state.currentQuestionIndex = (state.currentQuestionIndex + 1) % QUESTIONS.length;
            state.hasChangedQuestionToday = true;
            saveSettings();
            updateQuestionUI();
        }
    });

    // Event Listeners - Input Testo
    const textInput = document.getElementById('textInput');
    textInput.addEventListener('input', checkDepositState);

    // Event Listeners - Audio
    document.getElementById('btnRecord').addEventListener('click', startRecording);
    document.getElementById('btnStopRecord').addEventListener('click', stopRecording);
    document.getElementById('btnDeleteAudio').addEventListener('click', deleteAudioPreview);

    // Event Listeners - Deposita
    document.getElementById('btnDeposit').addEventListener('click', handleDeposit);
});

function switchView(viewName) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active', 'hidden'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    // Nascondi tutto prima
    document.getElementById('view-oggi').classList.add('hidden');
    document.getElementById('view-archivio').classList.add('hidden');

    // Mostra quello giusto
    document.getElementById(`view-${viewName}`).classList.remove('hidden');
    document.getElementById(`view-${viewName}`).classList.add('active');
    
    // Aggiorna Nav
    document.getElementById(`nav${viewName.charAt(0).toUpperCase() + viewName.slice(1)}`).classList.add('active');
}

function updateQuestionUI() {
    const qEl = document.getElementById('dailyQuestion');
    const btn = document.getElementById('btnChangeQuestion');
    
    qEl.innerText = QUESTIONS[state.currentQuestionIndex];
    
    if (state.hasChangedQuestionToday) {
        btn.style.display = 'none';
    } else {
        btn.style.display = 'block';
    }
}

// --- LOGICA AUDIO ---
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.mediaRecorder = new MediaRecorder(stream);
        state.audioChunks = [];

        state.mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
                state.audioChunks.push(event.data);
            }
        };

        state.mediaRecorder.onstop = () => {
            state.audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(state.audioBlob);
            document.getElementById('audioPreview').src = audioUrl;
            
            // UI Aggiornamento
            document.getElementById('audioControls').classList.add('hidden');
            document.getElementById('audioPreviewContainer').classList.remove('hidden');
            document.getElementById('textInput').classList.add('hidden'); // Nascondi testo se c'è audio
            
            checkDepositState();
        };

        state.mediaRecorder.start();
        state.isRecording = true;
        
        // UI
        document.getElementById('btnRecord').classList.add('hidden');
        document.getElementById('btnStopRecord').classList.remove('hidden');
        document.getElementById('recordingStatus').classList.remove('hidden');
        document.getElementById('micError').classList.add('hidden');
        document.getElementById('textInput').disabled = true;

        // Timer
        state.recordingTime = 0;
        document.getElementById('recordingTime').innerText = '0:00';
        state.recordingInterval = setInterval(() => {
            state.recordingTime++;
            const m = Math.floor(state.recordingTime / 60);
            const s = String(state.recordingTime % 60).padStart(2, '0');
            document.getElementById('recordingTime').innerText = `${m}:${s}`;
        }, 1000);

    } catch (err) {
        console.error("Errore microfono:", err);
        document.getElementById('micError').classList.remove('hidden');
        document.getElementById('audioControls').classList.add('hidden');
    }
}

function stopRecording() {
    if (state.mediaRecorder && state.isRecording) {
        state.mediaRecorder.stop();
        state.mediaRecorder.stream.getTracks().forEach(track => track.stop()); // Spegni mic
        state.isRecording = false;
        clearInterval(state.recordingInterval);
        
        // UI resettata (tranne preview che viene mostrata in onstop)
        document.getElementById('btnRecord').classList.remove('hidden');
        document.getElementById('btnStopRecord').classList.add('hidden');
        document.getElementById('recordingStatus').classList.add('hidden');
        document.getElementById('textInput').disabled = false;
    }
}

function deleteAudioPreview() {
    state.audioBlob = null;
    state.audioChunks = [];
    document.getElementById('audioPreview').src = "";
    
    // UI
    document.getElementById('audioControls').classList.remove('hidden');
    document.getElementById('audioPreviewContainer').classList.add('hidden');
    document.getElementById('textInput').classList.remove('hidden');
    
    checkDepositState();
}

function checkDepositState() {
    const text = document.getElementById('textInput').value.trim();
    const btn = document.getElementById('btnDeposit');
    
    if (text.length > 0 || state.audioBlob) {
        btn.disabled = false;
    } else {
        btn.disabled = true;
    }
}

// --- DEPOSITO ---
async function handleDeposit() {
    const btn = document.getElementById('btnDeposit');
    btn.disabled = true;
    
    const text = document.getElementById('textInput').value.trim();
    const today = getTodayString();
    const id = Date.now().toString();
    
    const entry = {
        id: id,
        date: today,
        timestamp: Date.now(),
        question: QUESTIONS[state.currentQuestionIndex],
        text: text,
        hasAudio: !!state.audioBlob
    };

    try {
        if (state.audioBlob) {
            await saveAudioToDB(id, state.audioBlob);
        }

        const archive = getArchive();
        archive.unshift(entry); // Aggiungi in cima
        saveArchive(archive);

        // Aggiorna contatore giorni (se oggi non c'era già un deposito)
        // Se vogliamo contare *ogni* deposito o solo *giorni unici*?
        // Il requisito dice: "GIORNI TOTALI in cui ho depositato".
        // Verifico se nell'archivio (prima di questo inserimento) c'era già un deposito di oggi
        const depositsToday = archive.filter(item => item.date === today);
        if (depositsToday.length === 1) { // È il primo di oggi (appena aggiunto)
            setTotalDays(getTotalDays() + 1);
        }

        // Reset UI
        document.getElementById('textInput').value = '';
        deleteAudioPreview();
        
        // Mostra successo temporaneo
        const successEl = document.getElementById('successMessage');
        successEl.classList.remove('hidden');
        setTimeout(() => {
            successEl.classList.add('hidden');
        }, 2000);

    } catch (e) {
        console.error("Errore salvataggio:", e);
        alert("Errore durante il salvataggio.");
        btn.disabled = false;
    }
}

// --- ARCHIVIO ---
async function renderArchive() {
    const container = document.getElementById('archiveList');
    const archive = getArchive();
    
    container.innerHTML = '';
    
    if (archive.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted);">Il tuo deposito è vuoto.</p>';
        return;
    }

    for (const item of archive) {
        const div = document.createElement('div');
        div.className = 'archive-item';
        
        // Data formattata
        const dateObj = new Date(item.timestamp);
        const dateStr = dateObj.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
        
        let contentHtml = '';
        if (item.text) {
            contentHtml = `<div class="archive-text">${escapeHTML(item.text)}</div>`;
        }
        
        div.innerHTML = `
            <div class="archive-date">${dateStr}</div>
            <div class="archive-question">${escapeHTML(item.question)}</div>
            ${contentHtml}
            <div class="audio-container" id="audio-container-${item.id}"></div>
            <button class="btn-text danger" onclick="deleteEntry('${item.id}')">Elimina</button>
        `;
        
        container.appendChild(div);

        // Se ha audio, caricalo asincronamente
        if (item.hasAudio) {
            const audioBlob = await getAudioFromDB(item.id);
            if (audioBlob) {
                const url = URL.createObjectURL(audioBlob);
                const audioEl = document.createElement('audio');
                audioEl.controls = true;
                audioEl.src = url;
                audioEl.className = 'archive-audio';
                document.getElementById(`audio-container-${item.id}`).appendChild(audioEl);
            } else {
                document.getElementById(`audio-container-${item.id}`).innerText = "Audio non trovato.";
            }
        }
    }
}

async function deleteEntry(id) {
    if (confirm("Vuoi davvero eliminare questa idea?")) {
        // Rimuovi audio da DB
        await deleteAudioFromDB(id);
        
        // Rimuovi da localStorage
        let archive = getArchive();
        
        // Logica giorni: se era l'unico deposito di quel giorno, togli un giorno dal contatore
        const entryToDelete = archive.find(i => i.id === id);
        if (entryToDelete) {
            const depositsOnThatDay = archive.filter(i => i.date === entryToDelete.date);
            if (depositsOnThatDay.length === 1) {
                setTotalDays(Math.max(0, getTotalDays() - 1));
            }
        }
        
        archive = archive.filter(item => item.id !== id);
        saveArchive(archive);
        
        // Ricarica UI
        renderArchive();
    }
}

// Utility per sicurezza
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
