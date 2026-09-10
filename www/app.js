

  // Funzione comoda per generare l'effetto caricamento
function getSkeletonLoader() {
    return `
    <div class="skeleton-box">
        <div class="skeleton sk-avatar"></div>
        <div style="overflow:hidden;">
            <div class="skeleton sk-title"></div>
            <div class="skeleton sk-text"></div>
            <div class="skeleton sk-text short"></div>
        </div>
    </div>
    <div class="skeleton-box" style="opacity:0.6;">
        <div class="skeleton sk-avatar"></div>
        <div style="overflow:hidden;">
            <div class="skeleton sk-title"></div>
            <div class="skeleton sk-text"></div>
        </div>
    </div>`;
}


var cacheDocs = []; // Memorizza i file scaricati per filtrarli velocemente
var curCategory = "TUTTI"; // Filtro attuale
var curSearchDocs = "";


/* --- VARIABILI GLOBALI --- */
const urlWebAppData = "https://script.google.com/macros/s/AKfycbxjpLf3WOmooekqZkxvRRkhQriyFYxHMr0YB2kJJy46hmkAG9Nl4EW4HeXHYtbHib7a5Q/exec";
var curEmail = "";
var curPass = "";
var curDocMode = "PUBBLICO";
var configVoto = { mode: "", max: 1 };


// Funzione per mostrare notifiche fluttuanti (Stile iOS)
function showToast(messaggio, tipo = "info") {
    // 1. Cerca il contenitore dei toast, se non c'è lo crea dinamicamente nel body
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        document.body.appendChild(container);
    }

    // 2. Crea il singolo toast
    let toast = document.createElement("div");
    toast.className = `toast-msg toast-${tipo}`;
    
    // 3. Assegna l'emoji corretta in base al tipo
    let icona = "ℹ️";
    if (tipo === "success") icona = "✅";
    if (tipo === "error") icona = "⚠️";

    toast.innerHTML = `<span style="font-size:16px;">${icona}</span> <span>${messaggio}</span>`;
    
    // 4. Inserisce il toast nello schermo
    container.appendChild(toast);

    // 5. Lo fa sparire elegantemente dopo 3.5 secondi
    setTimeout(() => {
        toast.style.animation = "toastLeave 0.4s ease forwards";
        // Rimuove fisicamente l'elemento dall'HTML dopo che l'animazione è finita
        setTimeout(() => { toast.remove(); }, 400); 
    }, 3500);
}


/* --- NAVIGATION --- */
function toggleView(viewId) {
  document.querySelectorAll('.fullscreen-view').forEach(x => x.classList.add('hidden'));
  document.getElementById(viewId).classList.remove('hidden');
}

function nav(viewId, el) {
  // 1. GESTIONE PAGINE (Nascondi tutte, mostra quella giusta)
  document.querySelectorAll('.page-section').forEach(x => x.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  
  // 2. TITOLI
  var titles = {
      'viewDash': 'Dashboard', 
      'viewElezioni': 'Centro Elettorale', 
      'viewDocs': 'Archivio Documenti', 
      'viewProf': 'Profilo Utente',
      'viewAdmin': 'Amministrazione'
  };
  document.getElementById('pageTitle').innerText = titles[viewId] || 'Gens Ssshhh';
  
  // 3. MENU LATERALE (Illumina il tasto giusto)
  if(el) {
    document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
    el.classList.add('active');
  } else {
    var mapping = { 'viewDash': 0, 'viewElezioni': 1, 'viewDocs': 2, 'viewProf': 3 };
    var items = document.querySelectorAll('.nav-item');
    items.forEach(x => x.classList.remove('active'));
    
    if(mapping[viewId] !== undefined && items[mapping[viewId]]) {
        items[mapping[viewId]].classList.add('active');
    }
  }
  
  // 4. CHIUDI MENU MOBILE E OVERLAY
  document.getElementById('sidebar').classList.remove('open');
  document.querySelector('.overlay').classList.remove('open');
  if(document.getElementById('userDropdown')) document.getElementById('userDropdown').classList.remove('show');

 
  // 5. CARICAMENTO DATI (Lazy Load)
  if(viewId === 'viewElezioni') {
      // Carica la nuova Cabina Elettorale multi-campagna e le candidature aperte
      caricaCentroElettorale();
      
      // Manteniamo le funzioni di supporto per le ammissioni soci se ti servono
      caricaAmmissioni();
      caricaVotiAmmissioni();

      // Carica i nomi dei soci per il menu a tendina "Sponsor 2"
      chiamaServer("getListaSociPerSponsor").then(function(soci) {
          var sel = document.getElementById('candSponsor2');
          if (!sel) return;
          sel.innerHTML = "<option value=''>Seleziona un socio...</option>";
          
          soci.forEach(function(s) {
              if(s.email !== curEmail) { 
                  sel.innerHTML += `<option value="${s.email}">${s.nomeCompleto}</option>`;
              }
          });
      });
  }
  
  if(viewId === 'viewDocs') {
      document.getElementById('filterContainer').classList.remove('hidden'); 
      document.getElementById('uploadArea').classList.remove('hidden');
      loadDocs('PUBBLICO');
  }
  
  if(viewId === 'viewProf') caricaProfilo();
  if(viewId === 'viewFirma') caricaRichiesteFirma();
  
  // Aggiungi questo blocco per le Spese Condivise:
  if(viewId === 'viewSpese') {
      caricaListaGruppi(); 
  }
}


function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.querySelector('.overlay').classList.toggle('open');
}

function togglePass(id) {
  var x = document.getElementById(id);
  x.type = (x.type === "password") ? "text" : "password";
}

async function chiamaServer(nomeAzione, parametri = {}) {
  try {
    const response = await fetch(urlWebAppData, {
      method: "POST",
      body: JSON.stringify({ azione: nomeAzione, payload: parametri }),
      headers: { "Content-Type": "text/plain" }
    });
    const risultato = await response.json();
    
    if (risultato.status === "SUCCESS") {
      return risultato.data;
    } else {
      console.error("Errore server:", risultato.messaggio);
      return null;
    }
  } catch (err) {
    console.error("Errore di rete:", err);
    return null;
  }
}

/* --- LOGIN LOGIC CON SALVATAGGIO SESSIONE --- */
async function faiLogin() {
  var e = document.getElementById('logEmail').value;
  var p = document.getElementById('logPass').value;
  var msg = document.getElementById('loginMsg');
  
  if(!e || !p) { msg.innerText = "Inserisci dati"; return; }
  
  msg.innerText = "Accesso in corso..."; 
  msg.style.color="blue";
  
  // URL DELLA TUA WEB APP GOOGLE (lo trovi cliccando su "Esegui il deployment")
  const urlWebAppData = "https://script.google.com/macros/s/AKfycbxjpLf3WOmooekqZkxvRRkhQriyFYxHMr0YB2kJJy46hmkAG9Nl4EW4HeXHYtbHib7a5Q/exec"; 
  
  const richiesta = {
    azione: "login",
    email: e,
    password: p
  };

  try {
    const response = await fetch(urlWebAppData, {
      method: "POST",
      body: JSON.stringify(richiesta),
      headers: { "Content-Type": "text/plain" } 
    });
    
    const risultato = await response.json();
    
    if(risultato.status === "SUCCESS") {
      curEmail = e;
      curPass = p;
      
      localStorage.setItem('gens_email', e);
      localStorage.setItem('gens_pass', p);

      document.getElementById('viewLogin').classList.add('hidden');
      
      // Momentaneamente disabilitiamo la verifica consenso per testare l'app nuda e cruda
      document.getElementById('appInterface').classList.remove('hidden');
      initApp(); 

    } else {
      msg.innerText = risultato.messaggio; 
      msg.style.color = "red";
    }
    
  } catch (errore) {
    console.error(errore);
    msg.innerText = "Errore di connessione al server."; 
    msg.style.color = "red";
  }
}



function initApp() {
  // Mostra feedback che stiamo caricando
  document.getElementById('welcomeMsg').innerText = "Caricamento in corso...";
  
  chiamaServer("getStartData", curEmail).then(function(data){
    if(!data || !data.utente) return;
    
    // =================================================================
    // NUOVO: ACCENDIAMO LA BOTTOM BAR SE L'UTENTE E' LOGGATO CON SUCCESSO
    // =================================================================
    var navBar = document.getElementById('bottomNavBar');
    if(navBar) {
        navBar.classList.add('show-nav');
    }
    // =================================================================
    
    // 1. POPOLA DATI UTENTE (Sidebar e Welcome)
    var u = data.utente;
    document.getElementById('welcomeMsg').innerText = "Ciao, " + u.nome + " " + (u.cognome || "");
    document.getElementById('sumVoti').innerText = u.votiAttivi;
    document.getElementById('sumFiles').innerText = u.numFiles;
    document.getElementById('userInitials').innerText = u.nome.charAt(0);
    
    document.getElementById('swName').innerText = u.nome + " " + u.cognome;
    document.getElementById('swRole').innerText = u.ruolo || "Socio";
    document.getElementById('swCode').innerText = u.tessera;
    
    // QR Code (Generazione rapida)
    var qrData = "GENS-CARD:" + u.tessera + "|" + u.scadenza;
    var qrUrl = "https://quickchart.io/chart?chs=150x150&cht=qr&chl=" + encodeURIComponent(qrData);
    document.getElementById('sidebarQr').src = qrUrl;

    // Gestione Menu Admin (se l'utente è admin)
    if (u.isAdmin === true) {
       // Controlla se il bottone esiste già per non duplicarlo
       var menu = document.querySelector('.nav-links');
       if (!document.getElementById('btnAdminMenu')) {
           var btnAdmin = document.createElement('div');
           btnAdmin.id = 'btnAdminMenu'; // ID per evitare duplicati
           btnAdmin.className = 'nav-item';
           btnAdmin.style.color = '#fca5a5'; 
           btnAdmin.innerHTML = 'Amministrazione';
           btnAdmin.onclick = function() {
              nav('viewAdmin', this); 
              caricaDatiAdmin();      
           };
           menu.appendChild(btnAdmin);
       }
       // Carica grafici admin in background senza bloccare
       caricaGraficoOverview(); 
       if(document.getElementById('listaNewsAdmin')) renderNewsAdmin(data.avvisi);
    }

    // 2. POPOLA NEWS (Senza fare un'altra chiamata!)
    var divNews = document.getElementById('containerAvvisi');
    if(!data.avvisi || data.avvisi.length === 0) {
        divNews.innerHTML = "<p style='color:var(--text-muted); font-size:14px; font-style:italic;'>Nessun avviso recente.</p>";
    } else {
        var htmlNews = "";
        data.avvisi.forEach(a => {
            htmlNews += `<div class="news-item" style="border-bottom:1px solid #f1f5f9; padding-bottom:10px; margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="font-weight:bold; color:#0f172a; font-size:14px;">${a.titolo}</div>
                    <div style="font-size:10px; background:#f1f5f9; padding:2px 6px; border-radius:4px; color:#64748b; white-space:nowrap;">${a.data}</div>
                </div>
                <div style="font-size:13px; color:#475569; margin-top:4px; line-height:1.4;">${a.testo}</div>
            </div>`;
        });
        divNews.innerHTML = htmlNews;
    }

    // 3. AGGIORNA CARD VOTO (Stato rapido)
    var cardVoto = document.getElementById('sumVoti');
    if(data.statoVoto === "CHIUSE") {
        cardVoto.innerText = "Chiuso";
        cardVoto.style.color = "var(--text-main)";
    } else if(data.statoVoto === "GIA_VOTATO") { 
        cardVoto.innerText = "Hai già votato!"; 
        cardVoto.style.color="#10b981"; 
    } else {
        cardVoto.innerText = "Vota Ora";
        cardVoto.style.color="var(--primary)";
    }

  }); 
}



/* --- FUNZIONI VOTO --- */
function caricaStatoVoto() {
  var div = document.getElementById('areaVotoContent');
  div.innerHTML = getSkeletonLoader();
  chiamaServer("checkStatoVoto", curEmail).then(function(res){
    if(res === "CHIUSE") div.innerHTML = "<div style='text-align:center; color:#64748b'>⛔ Nessuna votazione attiva.</div>";
    else if(res === "GIA_VOTATO") div.innerHTML = "<div style='text-align:center; color:#10b981; font-weight:600'>✅ Hai già votato.</div>";
    else if(res.status === "PUO_VOTARE") {
      configVoto = res.config;
      var isMulti = (configVoto.mode && configVoto.mode.toUpperCase().trim() === "SCELTA MULTIPLA");
      var type = isMulti ? "checkbox" : "radio";
      var html = `<h4 style='margin-top:0'>Scheda Elettorale</h4><p style='font-size:13px; color:#64748b'>Seleziona max ${configVoto.max} preferenze.</p>`;
      
      res.candidati.forEach(c => {
         html += `<label class="vote-option" onclick="handleVoteClick(this, '${type}')">
           <input type="${type}" name="votoCand" value="${c}"> <b>${c}</b>
         </label>`;
      });
      // Disclaimer statutario sul voto elettronico (Art. 14, comma 4)
html += `<p style="font-size: 11px; color: #64748b; text-align: center; margin-top: 25px; margin-bottom: 10px; line-height: 1.4; padding: 10px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
    Ai sensi dell'<b>Art. 14, comma 4</b> dello Statuto, l'accesso tramite credenziali personali autentica l'identità del socio. L'espressione del voto per via elettronica in questa cabina ha valore formale e vincolante per l'Assemblea.
</p>`;

html += `<button class="btn-primary" style="margin-top:10px; width: 100%; font-weight: bold; padding: 12px;" onclick="inviaVoto()">CONFERMA VOTO</button>`;
      div.innerHTML = html;
    }
  });
}

function handleVoteClick(el, type) {
  if(type==='radio') {
    document.querySelectorAll('.vote-option').forEach(x => x.classList.remove('selected'));
    el.classList.add('selected');
    el.querySelector('input').checked = true;
  } else {
    var inp = el.querySelector('input');
    // Toggle manuale non serve se clicchi label, ma gestiamo lo stile
    setTimeout(() => {
       if(inp.checked) el.classList.add('selected'); else el.classList.remove('selected');
       // Check Limit
       var checked = document.querySelectorAll('input[name="votoCand"]:checked');
       if(checked.length > configVoto.max) { 
         inp.checked = false; el.classList.remove('selected'); 
         alert("Massimo " + configVoto.max + " preferenze."); 
       }
    }, 10);
  }
}

function inviaVoto() {
  var checked = document.querySelectorAll('input[name="votoCand"]:checked');
  // Vecchio: if(checked.length === 0) return alert("Seleziona un candidato.");
  if(checked.length === 0) return showToast("Devi selezionare un candidato!", "error"); // NUOVO
  
  var scelte = []; checked.forEach(c => scelte.push(c.value));
  
  if(!confirm("Confermi il voto?")) return;
  
  chiamaServer("riceviVoto", {email:curEmail, password: curPass, candidato:scelte}).then(function(r){
    // Vecchio: alert(r==="SUCCESS"?"Voto Registrato!":"Errore");
    if(r === "SUCCESS") {
        showToast("Voto registrato correttamente!", "success");
    } else {
        showToast("Errore durante il voto: " + r, "error");
    }
    caricaStatoVoto();
    initApp();
  });
}


/* --- GESTIONE DOCUMENTI AVANZATA --- */

function cambiaModoDocs(mode, el) {
    curDocMode = mode;
    curCategory = "TUTTI"; // Reset filtro
    curSearchDocs = "";
    
    // Aggiorna grafica Tabs
    if(el) {
        el.parentElement.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
    }

    // Gestione visibilità aree
    if (mode === 'CESTINO') {
        document.getElementById('filterContainer').classList.add('hidden');
        document.getElementById('uploadArea').classList.add('hidden');
        document.getElementById('docTitle').innerText = "Cestino Utente (File eliminati)";
    } else {
        document.getElementById('filterContainer').classList.remove('hidden');
        document.getElementById('uploadArea').classList.remove('hidden');
        document.getElementById('docTitle').innerText = mode === 'PUBBLICO' ? "Documenti Pubblici" : "Documenti Personali";
        // Reset visivo chips
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        document.querySelector('.chip').classList.add('active');
    }

    loadDocs(mode);
    
}

function loadDocs(mode) {
    var div = document.getElementById('listaFiles');
    div.innerHTML = getSkeletonLoader();
    
    chiamaServer("getListaDocumenti", [mode, curEmail]).then(function(files){
        if(!files) return;
        cacheDocs = files; // Salva in memoria
        renderDocs();      // Disegna a video
    });
}

function filtraCategoria(cat, el) {
    curCategory = cat;
    // Aggiorna stile chips
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    renderDocs();
}



function renderDocs() {
    var div = document.getElementById('listaFiles');
    
    // 1. Filtra i dati in memoria (Categoria AND Testo)
    var filtered = cacheDocs.filter(f => {
        // Controllo Categoria
        var matchCat = (curCategory === "TUTTI" || f.categoria === curCategory);
        
        // Controllo Testo (Nome file)
        var matchText = true;
        if(curSearchDocs !== "") {
            matchText = f.nome.toLowerCase().includes(curSearchDocs);
        }
        
        return matchCat && matchText; // Deve soddisfare entrambi!
    });

    if(filtered.length === 0) { 
        div.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="empty-icon">📂</div>
            <div class="empty-title">Nessun documento</div>
            <div class="empty-sub">Non ci sono file in questa categoria o corrispondenti alla ricerca.</div>
        </div>`;
        return; 
    }

    // 2. Genera l'HTML corretto per le card dei documenti
    var html = "";
    filtered.forEach(f => {
        // Logica pulsanti: se siamo nel cestino mostra l'icona per ripristinare, altrimenti quella per eliminare
        var actionBtn = curDocMode === 'CESTINO' 
            ? `<div class="doc-action restore" onclick="gestisciFile('${f.id}', 'restore', event)" title="Ripristina file">♻️</div>`
            : `<div class="doc-action" onclick="gestisciFile('${f.id}', 'delete', event)" title="Sposta nel cestino">🗑️</div>`;

        html += `<a href="${f.url}" target="_blank" class="doc-card">
            ${actionBtn}
            <div class="doc-icon">📄</div>
            <div class="doc-name">${f.nome}</div>
            <div style="font-size:10px; color:#94a3b8; margin-top:8px; background:#f1f5f9; padding:2px 8px; border-radius:10px;">${f.categoria || 'Altro'}</div>
        </a>`;
    });
    
    div.innerHTML = html;
}



function filtraDocsTesto() {
    var input = document.getElementById('searchDoc');
    if(input) {
        curSearchDocs = input.value.toLowerCase(); // Salva il testo in minuscolo
        renderDocs(); // Ridisegna la lista
    }
}



function gestisciFile(id, azione, e) {
    e.preventDefault(); // Evita che si apra il file quando clicchi l'icona
    e.stopPropagation();
    
    if(!confirm(azione === 'delete' ? "Spostare nel cestino?" : "Ripristinare il file?")) return;

    // Animazione locale (nasconde subito la card)
    e.target.closest('.doc-card').style.opacity = "0.3";

    chiamaServer("spostaFileUtente", [id, azione, curEmail]).then(function(res){
        if(res === "OK") {
            showToast(azione === 'delete' ? "File spostato nel cestino" : "File ripristinato", "success");
            loadDocs(curDocMode); // Ricarica la vista
        } else {
            showToast("Errore: " + res, "error");
        }
    });
}

function uploadFile() {
    var fi = document.getElementById('fileInput');
    var cat = document.getElementById('uploadCat').value; 
    
    // Controlla se ci sono file
    if(fi.files.length === 0) return showToast("Scegli almeno un file", "error");
    
    var files = fi.files;
    var total = files.length;
    var completed = 0;
    var errors = 0;

    showToast("Caricamento di " + total + " file in corso...", "info");

    // Ciclo su tutti i file selezionati
    for (var i = 0; i < total; i++) {
        (function(file) { // Usiamo una chiusura per mantenere il riferimento al file corrente
            var r = new FileReader();
            
            r.onload = function(e) {
                var raw = e.target.result.split(',')[1];
                
                var fileData = { content: raw, filename: file.name, mimeType: file.type, category: cat };
                chiamaServer("uploadFile", [fileData, curDocMode, curEmail]).then(function(res){
                    if(res === "UPLOAD_OK") {
                        completed++;
                    } else {
                        errors++;
                        console.log("Errore upload: " + res);
                    }
                    
                    if ((completed + errors) === total) {
                        if(errors === 0) {
                            showToast("✅ Tutti i " + total + " file caricati!", "success");
                        } else {
                            showToast("⚠️ Finito con " + errors + " errori.", "error");
                        }
                        
                        loadDocs(curDocMode);
                        document.getElementById('fileInput').value = ""; 
                    }
                });
            };
            
            r.readAsDataURL(file); // Legge il file e fa partire l'upload
            
        })(files[i]);
    }
}



// Carica il box della candidatura dinamico
function caricaCandidatura() {
    var div = document.getElementById('areaCandContent');
    div.innerHTML = getSkeletonLoader();
    
    chiamaServer("getElezioniPerCandidatura", curEmail).then(function(elezioniAperte){
        // Se non c'è nulla di aperto in questo preciso momento
        if(!elezioniAperte || elezioniAperte.length === 0) {
            div.innerHTML = `
                <div style="text-align:center; padding: 20px 0;">
                    <div style="font-size:30px; opacity:0.5; margin-bottom:10px;">⏳</div>
                    <div style="color:#64748b; font-size:13px;">Nessun bando di candidatura aperto al momento.</div>
                </div>`;
            return;
        }
        
        // Se ci sono elezioni aperte, costruiamo il menu a tendina
        var html = `
            <div class="input-group">
                <label class="form-label" style="color:#1e40af;">Scegli la consultazione per cui ti candidi:</label>
                <select id="selCandElezione" class="form-input" style="font-weight:bold;">`;
                
        elezioniAperte.forEach(e => {
            html += `<option value="${e.id}">${e.titolo}</option>`;
        });
        
        html += `
                </select>
            </div>
            <div class="input-group">
                <label class="form-label">Motivazione / Breve presentazione</label>
                <textarea id="txtCand" class="form-input" style="height:100px; resize:none;" placeholder="Scrivi perché ti candidi per questo ruolo..."></textarea>
            </div>
            <button class="btn-primary" style="width:100%;" onclick="inviaCand()">INVIA CANDIDATURA</button>
        `;
        
        div.innerHTML = html;

    });
}

// Invia la candidatura al database
function inviaCand() {
    var idElezione = document.getElementById('selCandElezione').value;
    var testo = document.getElementById('txtCand').value;
    if(!testo.trim()) return showToast("Scrivi una breve motivazione!", "error");
    showToast("Invio candidatura in corso...", "info");
    chiamaServer("inviaCandidatura", { email: curEmail, idElezione: idElezione, motivazione: testo }).then(function(res){ 
        if(res === "OK") { showToast("✅ Candidatura inviata con successo!", "success"); caricaCandidatura(); } 
        else if (res === "GIA_FATTO") { showToast("Ti sei già candidato per questa elezione!", "error"); } 
        else { showToast("Errore: " + res, "error"); }
    });
}

function caricaProfilo() {
  chiamaServer("getDatiUtente", curEmail).then(function(d){
    if(!d) return;
    document.getElementById('profNome').value = d.nome;
    document.getElementById('profCognome').value = d.cognome;
    document.getElementById('profEmail').value = d.email;
    document.getElementById('profTel').value = d.telefono;
    document.getElementById('profInd').value = d.indirizzo;
    document.getElementById('profHash').innerText = d.hash;

    var statoEl = document.getElementById('profBadgeStato');
    statoEl.innerText = d.stato;
    statoEl.style.color = d.stato === 'ATTIVO' ? "#10b981" : "#ef4444";
    
    document.getElementById('profBadgeRuolo').innerText = d.ruolo;
    document.getElementById('profBadgeScad').innerText = d.scadenza;
  });
}


// Funzione carina per copiare il codice con un click
function copiaHash() {
    var text = document.getElementById('profHash').innerText;
    navigator.clipboard.writeText(text).then(function() {
        showToast("Codice copiato negli appunti!", "success");
    }, function(err) {
        alert("Copia manuale: " + text);
    });
}

function salvaProfilo() {
  var d = { email:curEmail, password:curPass, cognome:document.getElementById('profCognome').value, telefono:document.getElementById('profTel').value, indirizzo:document.getElementById('profInd').value };
  chiamaServer("salvaDatiUtente", d).then(function(){ showToast("Profilo aggiornato con successo!", "success"); });
}

function richiediDimissioni() {
  if(confirm("Sei sicuro di voler richiedere le dimissioni?")) {
    chiamaServer("inviaRichiestaDimissioni", {email:curEmail, password:curPass}).then(function(){ alert("Richiesta inviata."); });
  }
}

function scaricaTesseraPDF() {
  if(!confirm("Scaricare PDF?")) return;
  chiamaServer("generaTesseraPDF", curEmail).then(function(b64){
    if(b64.startsWith("ERRORE")) return alert("Errore");
    var a = document.createElement('a'); a.href=b64; a.download="Tessera.pdf"; 
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  });
}

function recupera() {
  var e = document.getElementById('recEmail').value;
  if(!e) return alert("Inserisci email");
  chiamaServer("inviaLinkReset", e).then(function(r){
    if(r==="LINK_INVIATO") { alert("Link inviato (se email esiste)."); toggleView('viewLogin'); }
    else alert("Errore");
  });
}

function eseguiCambio() {
  var e=document.getElementById('cpEmail').value, o=document.getElementById('cpOld').value, n=document.getElementById('cpNew').value;
  if(!e||!o||!n) return alert("Compila tutto");
  chiamaServer("cambiaPassword", {email:e, oldPass:o, newPass:n}).then(function(r){
    if(r==="CAMBIO_OK") { alert("Password cambiata!"); toggleView('viewLogin'); }
    else alert("Errore credenziali");
  });
}

function salvaPassReset() {
  var t=document.getElementById('tokenReset').value, p1=document.getElementById('newResetPass').value, p2=document.getElementById('newResetPassConfirm').value;
  if(p1!==p2) return alert("Non coincidono");
  chiamaServer("completaResetPassword", [t, p1]).then(function(r){
    if(r==="SUCCESS") { alert("Password aggiornata!"); window.location.href = window.location.href.split('?')[0]; }
    else alert("Link scaduto o errore");
  });
}

function setVoto(nuovoStato) {
    if(!confirm("Cambiare stato elezioni in: " + nuovoStato + "?")) return;
    chiamaServer("adminCambiaStatoVoto", [curEmail, nuovoStato]).then(function(){
        showToast("Stato elezioni aggiornato!", "success");
        caricaDatiAdmin(); 
    });
}

/* --- FUNZIONI ADMIN AGGIORNATE --- */

var cacheSoci = []; // Memoria temporanea per i dati dei soci

function switchAdminTab(tabId, el) {
    document.querySelectorAll('.admin-tab-content').forEach(x => x.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
    if (el) {
        el.parentElement.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
    }

    // Se l'utente apre il tab delle elezioni, ricarichiamo le campagne fresche dal DB
    if (tabId === 'tabElez') {
        caricaCampagneAdmin();
        caricaCandidatureAdmin();
    }
}

function caricaDatiAdmin() {
    chiamaServer("getDashboardAdmin", curEmail).then(function(data){
        if(!data) return alert("Errore caricamento o Accesso Negato");
        
        // A. STATISTICHE GENERALI (Con controlli di sicurezza se l'ID non c'è nella pagina)
        if(document.getElementById('admTotSoci')) document.getElementById('admTotSoci').innerText = data.totSoci || 0;
        if(document.getElementById('admAventi')) document.getElementById('admAventi').innerText = data.aventiDiritto || 0;
        if(document.getElementById('admVotanti')) document.getElementById('admVotanti').innerText = data.votanti || "-";
        if(document.getElementById('admStatoVoto')) document.getElementById('admStatoVoto').innerText = data.statoVoto || "MULTI";

        // B. SALVATAGGIO CACHE SOCI (Fondamentale per il filtro)
        cacheSoci = data.listaSoci || []; 

        // C. GENERAZIONE TABELLA (Usa la tua funzione originale)
        renderTabellaSoci(cacheSoci);

        // D. ALTRE CHIAMATE (Grafici e Candidature)
        if(typeof caricaCandidatureAdmin === 'function') caricaCandidatureAdmin();
        if(typeof caricaAmmissioniAdmin === 'function') caricaAmmissioniAdmin();
        if(typeof caricaCampagneAdmin === 'function') caricaCampagneAdmin();
        if(typeof caricaGraficoElezioni === 'function') caricaGraficoElezioni();

        caricaContiDalNuovoFoglio();

    });
}


// Funzione che disegna la tabella (usata sia all'avvio che quando cerchi)
function renderTabellaSoci(lista) {
    // 1. AGGIUNTA COLONNA "AZIONI" NELL'INTESTAZIONE QUI SOTTO
    var html = `<tr style="background:#f8fafc; text-align:left; color:#64748b;">
        <th style="padding:10px;">Nome</th>
        <th style="padding:10px;">Tessera</th>
        <th style="padding:10px;">Stato</th>
        <th style="padding:10px;">Carica</th>
        <th style="padding:10px; text-align:right;">Azioni</th>
    </tr>`;
    
    if(lista.length === 0) {
        html += `<tr><td colspan="5" style="padding:20px; text-align:center; color:#94a3b8;">Nessun socio trovato.</td></tr>`;
    } else {
        lista.forEach(s => {
            var color = s.stato === 'attivo' ? '#10b981' : '#ef4444';
            
            // 2. CREAZIONE DEL BOTTONE DI RINNOVO IN BASE ALLO STATO
            let btnRinnovoHTML = '';
            if (s.stato === 'non attivo' || s.stato === 'scaduto') {
                btnRinnovoHTML = `<button class="btn-primary" style="padding: 6px 12px; font-size: 11px; background: #10b981; border: none; width: auto; margin:0;" onclick="event.stopPropagation(); rinnovoRapido('${s.email}', '${s.nome.replace(/'/g, "\\'")}')">💰 Segna Pagato</button>`;
            } else {
                btnRinnovoHTML = `<button class="btn-secondary" style="padding: 6px 12px; font-size: 11px; width: auto; margin:0;" onclick="event.stopPropagation(); rinnovoRapido('${s.email}', '${s.nome.replace(/'/g, "\\'")}')">🔄 Rinnova</button>`;
            }

            // 3. INSERIMENTO DELLA NUOVA CELLA NELLA RIGA
            html += `<tr style="border-bottom:1px solid #e2e8f0; cursor:pointer;" onclick="apriModaleSocio('${s.tessera}')">
                <td style="padding:10px;"><b>${s.cognome}</b> ${s.nome}<br><span style="font-size:11px; color:#94a3b8">${s.email}</span></td>
                <td style="padding:10px; font-family:monospace;">${s.tessera}</td>
                <td style="padding:10px;"><span style="color:${color}; font-weight:600; font-size:12px;">${s.stato.toUpperCase()}</span></td>
                <td style="padding:10px; font-size:12px;">${s.ruolo}</td>
                <td style="padding:10px; text-align:right;">${btnRinnovoHTML}</td>
            </tr>`;
        });
    }
    document.getElementById('tabellaSoci').innerHTML = html;
}

// Nuova funzione per il rinnovo rapido direttamente dalla tabella
function rinnovoRapido(emailSocio, nomeSocio) {
    let metodo = prompt(`Rinnovo quota per ${nomeSocio}.\n\nDigita 1 per CONTANTI\nDigita 2 per BONIFICO`, "1");
    
    if (metodo === null) return; // L'utente ha cliccato Annulla
    
    let metodoPagamento = "";
    if (metodo === "1") metodoPagamento = "CONTANTI";
    else if (metodo === "2") metodoPagamento = "BONIFICO";
    else {
        alert("Metodo non valido. Operazione annullata.");
        return;
    }
    
    showToast(`⏳ Registrazione rinnovo in corso...`, "info");
    
    chiamaServer("adminRegistraRinnovo", [curEmail, emailSocio, metodoPagamento]).then(function(res) {
            if(res === "OK") {
                showToast("✅ Rinnovo registrato con successo!", "success");
                caricaDatiAdmin(); // Ricarica tutta la pagina admin (Aggiorna le statisiche in cima e la tabella!)
            } else {
                showToast("❌ Errore: " + res, "error");
            }
        });
}

function filtraSoci() {
    // Prende il testo scritto nella tua barra di ricerca
    var input = document.getElementById('searchSocio').value.toLowerCase().trim();
    
    // Se la barra è vuota, ricarica tutta la tabella originale
    if (input === "") {
        renderTabellaSoci(cacheSoci);
        return;
    }
    
    // Altrimenti, filtra i soci per Nome, Cognome, Email o Tessera
    var filtrati = cacheSoci.filter(function(s) {
        var nomeCompleto = (s.nome + " " + s.cognome).toLowerCase();
        var email = (s.email || "").toLowerCase();
        var tessera = (s.tessera || "").toString().toLowerCase();
        
        return nomeCompleto.includes(input) || email.includes(input) || tessera.includes(input);
    });
    
    // Disegna la tabella solo con i soci trovati
    renderTabellaSoci(filtrati);
}





// --- NUOVA FUNZIONE PER I GRAFICI ---
function caricaGraficoElezioni() {
    var div = document.getElementById('admRisultati');
    if (!div) return; // <--- SALVAVITA: Se il blocco non è visibile nella pagina, esce subito.

    div.innerHTML = getSkeletonLoader();

    chiamaServer("getRisultatiLive", curEmail).then(function(res){
        if(!res) return;

        // 1. BARRA QUORUM / AFFLUENZA
        var html = `
        <div style="margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:5px;">
                <span>Affluenza: <b>${res.totaleVoti}</b> su ${res.aventiDiritto}</span>
                <span>${res.percAffluenza}%</span>
            </div>
            <div style="width:100%; background:#e2e8f0; height:10px; border-radius:5px; overflow:hidden;">
                <div style="width:${res.percAffluenza}%; background:var(--primary); height:100%;"></div>
            </div>
        </div>`;

        // 2. GRAFICO A TORTA (QuickChart)
        if(res.totaleVoti > 0) {
            var chartConfig = {
                type: 'doughnut',
                data: {
                    labels: res.labels,
                    datasets: [{
                        data: res.data,
                        backgroundColor: ['#2563eb', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6']
                    }]
                },
                options: {
                    plugins: {
                        legend: { position: 'right' },
                        datalabels: { display: true, color: 'white' }
                    }
                }
            };
            
            var chartUrl = "https://quickchart.io/chart?c=" + encodeURIComponent(JSON.stringify(chartConfig));
            html += `<div style="text-align:center;"><img src="${chartUrl}" style="max-width:100%; height:auto; max-height:250px;"></div>`;
        } else {
            html += `<p style="text-align:center; color:#94a3b8; padding:20px;">Nessun voto registrato.</p>`;
        }

        // Controllo di sicurezza finale prima di scrivere
        var checkDiv = document.getElementById('admRisultati');
        if(checkDiv) {
            checkDiv.innerHTML = html;
        }

    });
}

// Funzione che apre la finestra
function apriModaleSocio(tessera) {
    // Trova i dati del socio nella memoria
    var socio = cacheSoci.find(x => x.tessera == tessera);
    if(!socio) return;

    // Riempie i campi della finestra
    document.getElementById('modTessera').value = socio.tessera;
    document.getElementById('modNome').value = socio.cognome + " " + socio.nome;
    document.getElementById('modEmail').value = socio.email;
    document.getElementById('modTel').value = socio.telefono || ""; 
    document.getElementById('modStato').value = socio.stato;

    // NOVITÀ: Carica il ruolo (se non c'è, mette "Socio semplice")
    var tendinaRuolo = document.getElementById('modRuolo');
    if (tendinaRuolo) {
        var ruolo = socio.ruolo ? socio.ruolo.trim() : "Socio semplice";
        // Se ha un ruolo non in lista, lo aggiungiamo al volo
        if (!Array.from(tendinaRuolo.options).some(opt => opt.value === ruolo)) {
            tendinaRuolo.innerHTML += `<option value="${ruolo}">${ruolo}</option>`;
        }
        tendinaRuolo.value = ruolo;
    }

    // Mostra la finestra
    document.getElementById('modalEditSocio').classList.remove('hidden');
}

function chiudiModaleSocio() {
    document.getElementById('modalEditSocio').classList.add('hidden');
}

// Funzione che salva
function salvaModificheSocioAdmin() {
    var dati = {
        adminEmail: curEmail,
        tesseraTarget: document.getElementById('modTessera').value,
        email: document.getElementById('modEmail').value,
        telefono: document.getElementById('modTel').value,
        stato: document.getElementById('modStato').value,
        ruolo: document.getElementById('modRuolo') ? document.getElementById('modRuolo').value : "Socio semplice" // NOVITÀ
    };

    // Usiamo il modale elegante invece del confirm() brutto
    showCustomConfirm("Confermi le modifiche?", function() {
        showToast("Salvataggio in corso...", "info");
        
        chiamaServer("adminUpdateSocio", dati).then(function(res){
            if(res === "OK") {
                showToast("Dati socio salvati con successo!", "success");
                chiudiModaleSocio();
                caricaDatiAdmin(); // Ricarica la tabella
            } else {
                showToast("Errore: " + res, "error");
            }
        });
    });
}


/* --- AUTO START E GESTIONE SESSIONE --- */
window.onload = function() {
  // 1. Controllo Token Reset Password (Se provieni da una mail)
  var token = document.getElementById('tokenReset').value;
  if(token && token !== "") {
      toggleView('viewResetFinale');
      return;
  }

  // 2. Controllo Auto-Login (Ricorda utente)
  var savedEmail = localStorage.getItem('gens_email');
  var savedPass = localStorage.getItem('gens_pass');

  if (savedEmail && savedPass) {
      // Mostra un messaggio di caricamento nella schermata di login
      var msg = document.getElementById('loginMsg');
      msg.innerText = "Accesso automatico in corso..."; 
      msg.style.color = "#2563eb"; // Blu corporate

      chiamaServer("verificaLogin", {email: savedEmail, password: savedPass, info: navigator.userAgent}).then(function(res){
          if(res === "OK_LOGIN") {
              // Se i dati salvati sono ancora validi, entra
              curEmail = savedEmail;
              curPass = savedPass;
              document.getElementById('viewLogin').classList.add('hidden');
              verificaConsenso();
          } else {
              // Se la password è cambiata nel frattempo, cancella la memoria vecchia
              eseguiLogout(true);
              msg.innerText = "Sessione scaduta. Effettua di nuovo l'accesso.";
              msg.style.color = "#ef4444";
          }
      });
  }
};

// Funzione di Logout (Pulisce la memoria e ricarica)
function eseguiLogout(soloPulizia) {
    localStorage.removeItem('gens_email');
    localStorage.removeItem('gens_pass');
    curEmail = "";
    curPass = "";
    
    // Se non è solo una pulizia silenziosa, ricarica la pagina per azzerare tutto
    if (soloPulizia !== true) {
        location.href = location.href.split('?')[0];
    }
}


/* --- FUNZIONI TESORERIA --- */
var cacheTeso = [];



function caricaTesoreria() {
    var div = document.getElementById('listaTesoreria');
    div.innerHTML = getSkeletonLoader();

    chiamaServer("adminGetListaPagamenti", curEmail).then(function(lista){
        cacheTeso = lista;
        renderTesoreria(lista);
    });
}

function renderTesoreria(lista) {
    var div = document.getElementById('listaTesoreria');
    if(lista.length === 0) { div.innerHTML = "Nessun socio trovato."; return; }

    var html = "";
    lista.forEach(s => {
        // Calcolo giorni alla scadenza
        var oggi = new Date();
        var scad = new Date(s.scadenzaRaw); // Data grezza dal server
        var diffTime = scad - oggi;
        var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        var statusColor = diffDays < 0 ? "#fee2e2" : (diffDays < 30 ? "#ffedd5" : "#ffffff");
        var statusBorder = diffDays < 0 ? "#ef4444" : (diffDays < 30 ? "#f97316" : "#e2e8f0");
        var statusText = diffDays < 0 ? "SCADUTO da " + Math.abs(diffDays) + " gg" : "Scade tra " + diffDays + " gg";

        html += `
        <div class="teso-card" style="background:${statusColor}; border:1px solid ${statusBorder}; padding:15px; border-radius:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            
            <div style="min-width:150px;">
                <div style="font-weight:bold; font-size:15px;">${s.cognome} ${s.nome}</div>
                <div style="font-size:12px; color:#64748b;">${s.tessera} | ${statusText}</div>
                <div style="font-size:11px; color:#64748b; font-family:monospace;">Scad: ${s.scadenzaFmt}</div>
            </div>

            <div style="display:flex; gap:8px;">
                <button onclick="rinnovaSocio('${s.email}', 'CONTANTI')" style="background:#10b981; color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:5px;">
                    💶 <span class="hide-mobile">Contanti</span>
                </button>
                <button onclick="rinnovaSocio('${s.email}', 'BONIFICO')" style="background:#3b82f6; color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:5px;">
                    🏦 <span class="hide-mobile">Bonifico</span>
                </button>
            </div>

        </div>`;
    });
    div.innerHTML = html;
}

function filtraTesoreria() {
    var q = document.getElementById('searchTeso').value.toLowerCase();
    var filtrati = cacheTeso.filter(s => 
        s.nome.toLowerCase().includes(q) || 
        s.cognome.toLowerCase().includes(q) || 
        s.tessera.toString().includes(q)
    );
    renderTesoreria(filtrati);
}

function rinnovaSocio(targetEmail, metodo) {
    if(!confirm("Confermi il rinnovo di " + targetEmail + " tramite " + metodo + "?\nLa scadenza verrà portata avanti di 1 anno.")) return;

    // Feedback visivo immediato (Skeleton loading sulla card specifica sarebbe top, ma usiamo toast)
    showToast("Elaborazione rinnovo...", "info");

    chiamaServer("adminRegistraRinnovo", [curEmail, targetEmail, metodo]).then(function(res){
        if(res === "OK") {
            showToast("✅ Rinnovo registrato!", "success");
            caricaTesoreria(); // Ricarica la lista
        } else {
            showToast("❌ Errore: " + res, "error");
        }
    });
}


function caricaGraficoBilancio() {
    var box = document.getElementById('chartBilancio');
    if(!box) return; // Se non trova il box, esce senza errori

    chiamaServer("getDatiBilancio").then(function(data){
        // Se non ci sono dati validi
        if(!data || !data.labels || data.labels.length === 0) {
            box.innerHTML = "<p style='font-size:12px; color:#ccc'>Dati bilancio non disponibili</p>";
            return;
        }

        // Configurazione QuickChart (Doughnut)
        var chartConfig = {
            type: 'doughnut',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.data,
                    backgroundColor: ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#1e40af'],
                    borderWidth: 0
                }]
            },
            options: {
                cutoutPercentage: 70, // Buco centrale più grande (stile moderno)
                legend: { 
                    position: 'right', 
                    align: 'center',
                    labels: { boxWidth: 12, fontSize: 11, fontColor: '#334155', fontFamily: 'sans-serif' } 
                },
                plugins: {
                    datalabels: { display: false },
                    doughnutlabel: {
                        labels: [{ text: 'SPESE', font: { size: 12, weight: 'bold' }, color: '#94a3b8' }]
                    }
                }
            }
        };
        
        var url = "https://quickchart.io/chart?c=" + encodeURIComponent(JSON.stringify(chartConfig));
        // Imposta altezza massima per non spaccare il layout
        box.innerHTML = `<img src="${url}" style="max-width:100%; height:auto; max-height:180px;">`;
        
    });
}


function aggiornaListaMovimenti() {
    var tab = document.getElementById('tabellaMovimenti');
    while(tab.rows.length > 1) { tab.deleteRow(1); }
    
    var row = tab.insertRow(1);
    row.innerHTML = "<td colspan='3' style='text-align:center; padding:20px;'><div class='loader' style='width:20px; height:20px; margin:0 auto;'></div></td>";

    chiamaServer("adminGetUltimiMovimentiPD", curEmail).then(function(lista){
        tab.deleteRow(1); 

        if(lista.length === 0) {
            var r = tab.insertRow(1);
            r.innerHTML = "<td colspan='3' style='text-align:center; color:#ccc; padding:15px;'>Nessun movimento recente.</td>";
            return;
        }

        lista.forEach(item => {
            var r = tab.insertRow(-1);
            r.style.borderBottom = "1px solid #f1f5f9";
            
            var isEntrata = (item.tipo === "Entrata");
            var color = isEntrata ? "#16a34a" : "#ef4444"; 
            var sign = isEntrata ? "+ " : "- ";
            var bgBadge = isEntrata ? "#dcfce7" : "#fee2e2";

            r.innerHTML = `
                <td style="padding:10px; white-space:nowrap;">
                    <div style="font-size:12px; color:#64748b;">${item.data}</div>
                    <span style="font-size:10px; background:${bgBadge}; color:${color}; padding:2px 6px; border-radius:4px; font-weight:bold;">${item.tipo || 'Uscita'}</span>
                </td>
                <td style="padding:10px;">
                    <div style="font-weight:bold; color:#0f172a;">${item.cat}</div>
                    <div style="font-size:12px; color:#64748b;">${item.desc || '-'}</div>
                    <div style="font-size:11px; color:#94a3b8;">${item.mezzo}</div>
                </td>
                <td style="padding:10px; text-align:right; color:${color}; font-weight:bold; font-size:14px;">${sign}${item.imp} €</td>
            `;
        });
    });
}


/* --- FUNZIONI NEWS --- */

// 1. Carica le news nella Dashboard Utente
function caricaNewsDashboard() {
    var div = document.getElementById('containerAvvisi');
    // Non mettiamo il loader se c'è già contenuto, per non fare "flash"
    if(!div.innerHTML.includes('news-item')) div.innerHTML = "<div class='loader'></div>";

    chiamaServer("getAvvisiPubblici").then(function(avvisi){
        if(avvisi.length === 0) {
            div.innerHTML = "<p style='color:var(--text-muted); font-size:14px; font-style:italic;'>Nessun avviso recente.</p>";
            return;
        }
        
        var html = '<div class="timeline-container">'; // Apre il contenitore della timeline

// Ciclo per creare ogni avviso
avvisi.forEach(function(n) {
    html += `
    <div class="timeline-item">
        <span class="timeline-date">${n.data}</span>
        <div class="timeline-title">${n.titolo}</div>
        <div class="timeline-content">${n.testo}</div>
    </div>`;
});

html += '</div>'; // Chiude il contenitore della timeline

// Metti l'HTML nel div della dashboard
document.getElementById('divDegliAvvisi').innerHTML = html;
        
        // Se siamo admin, aggiorniamo anche la lista per cancellare
        if(document.getElementById('listaNewsAdmin')) renderNewsAdmin(avvisi);

    });
}

// 2. Pubblica una news (Admin)
function pubblicaAvviso() {
    var t = document.getElementById('newsTitolo').value;
    var m = document.getElementById('newsTesto').value;
    
    if(!t || !m) return showToast("Compila titolo e messaggio", "error");
    
    showToast("Pubblicazione...", "info");
    
    chiamaServer("adminPubblicaNews", {email:curEmail, titolo:t, testo:m}).then(function(res){
        if(res === "OK") {
            showToast("✅ Avviso pubblicato!", "success");
            document.getElementById('newsTitolo').value = "";
            document.getElementById('newsTesto').value = "";
            caricaNewsDashboard(); // Ricarica subito
        } else {
            showToast("Errore: " + res, "error");
        }
    });
}

// 3. Render lista Admin (con tasto cancella)
function renderNewsAdmin(avvisi) {
    var div = document.getElementById('listaNewsAdmin');
    if(!div) return;
    
    var html = "";
    avvisi.forEach(a => {
        html += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border:1px solid #e2e8f0; border-radius:6px; margin-bottom:8px; background:#f8fafc;">
            <div>
                <div style="font-weight:600; font-size:13px;">${a.titolo}</div>
                <div style="font-size:11px; color:#64748b;">${a.data}</div>
            </div>
            <button class="btn-danger" style="padding:4px 8px; font-size:11px; width:auto;" onclick="cancellaAvviso('${a.id}')">🗑️</button>
        </div>`;
    });
    div.innerHTML = html || "<p style='font-size:12px; color:#ccc'>Nessuna news attiva.</p>";
}

function cancellaAvviso(id) {
    if(!confirm("Cancellare questo avviso?")) return;
    chiamaServer("adminCancellaNews", {email:curEmail, idNews:id}).then(function(){
        showToast("Avviso cancellato", "info");
        caricaNewsDashboard();
    });
}


function toggleInfoHash() {
    var el = document.getElementById('infoHashContent');
    if (el.style.display === 'none') {
        el.style.display = 'block'; // Mostra
    } else {
        el.style.display = 'none';  // Nascondi
    }
}


function openWallet() {
    // 1. Prendi i dati che abbiamo già in memoria (dalla Dashboard)
    var nome = document.getElementById('swName').innerText;
    var ruolo = document.getElementById('swRole').innerText;
    var code = document.getElementById('swCode').innerText;
    var qrSrc = document.getElementById('sidebarQr').src;
    
    // Per la scadenza e lo stato, dobbiamo leggerli dal Profilo se sono caricati, 
    // altrimenti usiamo un valore di default o facciamo una chiamata rapida.
    // TRUCCO: Usiamo i dati della sidebar widget che sono già lì!
    // (Per la scadenza precisa, facciamo una chiamata rapida se serve, ma per ora usiamo l'anno corrente)
    
    document.getElementById('passNome').innerText = nome;
    document.getElementById('passRuolo').innerText = ruolo;
    document.getElementById('passTessera').innerText = code;
    document.getElementById('passQr').src = qrSrc;
    
    // Apri il modale
    document.getElementById('walletModal').classList.add('open');
}

function closeWallet() {
    document.getElementById('walletModal').classList.remove('open');
}


/* --- NUOVA CONTABILITÀ PARTITA DOPPIA --- */

// Variabile globale per memorizzare i dati dei fornitori (Messa una sola volta)
var anagrafeFornitori = [];

function caricaTabSpese() {
    var dateField = document.getElementById('pdData');
    if(!dateField.value) dateField.valueAsDate = new Date();
    
    // Carica i conti per le righe dinamiche
    caricaContiDalNuovoFoglio();
    
    // Carica i fornitori per l'autocompletamento
    caricaFornitoriDalNuovoFoglio();

    // Aggiorna la tabella sottostante
    aggiornaListaMovimentiPD();
}

// Funzione dedicata ESCLUSIVAMENTE al caricamento dei fornitori
function caricaFornitoriDalNuovoFoglio() {
    chiamaServer("getAnagrafeFornitoriDinamica").then(function(fornitori) {
        anagrafeFornitori = fornitori || [];
        var datalist = document.getElementById('listaFornitoriDatalist');
        if(!datalist) return;
        
        var html = '';
        // Partiamo da i = 1 per saltare la riga di intestazione
        for(var i = 1; i < anagrafeFornitori.length; i++) {
            var nomeFornitore = anagrafeFornitori[i][0]; // Colonna A = Nome
            if(nomeFornitore) {
                html += `<option value="${nomeFornitore}">`;
            }
        }
        datalist.innerHTML = html;
    });
}

// Compila automaticamente il campo CF/PIVA
function autocompilaCF(nomeInserito) {
    for(var i = 1; i < anagrafeFornitori.length; i++) {
        if(anagrafeFornitori[i][0] && anagrafeFornitori[i][0].toLowerCase() === nomeInserito.toLowerCase()) {
            var piva = anagrafeFornitori[i][1] || ''; // Colonna B = Partita IVA
            document.getElementById('pdCF').value = piva;
            break;
        }
    }
}


function aggiornaListaMovimentiPD() {
    chiamaServer("adminGetUltimiMovimentiPD", curEmail).then(function(lista){
        var t = document.getElementById('tabellaMovimentiPD');
        var html = `<tr style="background:#f8fafc; text-align:left; color:#64748b;">
            <th style="padding:8px;">Data</th>
            <th style="padding:8px;">Descrizione</th>
            <th style="padding:8px; color:#ef4444;">Dare</th>
            <th style="padding:8px; color:#10b981;">Avere</th>
            <th style="padding:8px; text-align:right;">€</th>
        </tr>`;
        
        if(!lista || lista.length === 0) {
            html += `<tr><td colspan="5" style="text-align:center; color:#ccc; padding:15px;">Nessun movimento recente.</td></tr>`;
        } else {
            lista.forEach(r => {
                html += `<tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:8px;">${r.data}<br><span style="font-size:9px; background:#e2e8f0; padding:2px 4px; border-radius:3px;">${r.tipo ? String(r.tipo).substring(0,3) : ''}</span></td>
                    <td style="padding:8px;"><b>${r.desc}</b></td>
                    <td style="padding:8px; font-size:11px; color:#ef4444;">${r.dare}</td>
                    <td style="padding:8px; font-size:11px; color:#10b981;">${r.avere}</td>
                    <td style="padding:8px; text-align:right; font-weight:bold;">${r.imp} €</td>
                </tr>`;
            });
        }
        t.innerHTML = html;
    });
}

function scaricaExcel() {
    var anno = prompt("Inserisci l'anno da esportare (es. 2026):", new Date().getFullYear());
    if(!anno) return;
    
    showToast("Generazione Excel in corso...", "info");
    
    chiamaServer("exportBilancioExcel", [curEmail, anno]).then(function(base64){
        var a = document.createElement('a'); 
        a.href = "data:text/csv;base64," + base64; 
        a.download = "Bilancio_Gens_" + anno + ".csv"; 
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        showToast("Download avviato!", "success");
    });
}

// Variabile globale per immagazzinare il piano dei conti
var htmlOpzioniConti = '<option value="">Caricamento conti in corso...</option>';

// Chiamata al server per leggere dal nuovo foglio "conti"
function caricaContiDalNuovoFoglio() {
    chiamaServer("getPianoDeiContiDinamico").then(function(datiConti) {
        if (!datiConti) return alert("Errore nel caricamento conti");
        var optGroups = {};
        for(var i = 1; i < datiConti.length; i++) {
            var cat = datiConti[i][0];
            var nome = datiConti[i][1];
            if(!cat || !nome) continue;
            if(!optGroups[cat]) optGroups[cat] = [];
            optGroups[cat].push(nome);
        }
        
        var html = '<option value="">Seleziona un conto...</option>';
        for(var categoria in optGroups) {
            html += `<optgroup label="${categoria}">`;
            optGroups[categoria].forEach(c => {
                html += `<option value="${c}">${c}</option>`;
            });
            html += `</optgroup>`;
        }
        htmlOpzioniConti = html;
        
        document.querySelectorAll('.select-conto').forEach(sel => sel.innerHTML = htmlOpzioniConti);
        
        var contenitore = document.getElementById('contenitoreRighePD');
        if(contenitore && contenitore.children.length === 0) {
            aggiungiRigaPD('DARE');
            aggiungiRigaPD('AVERE');
        }
    });
}

function aggiungiRigaPD(sezioneDefault = 'DARE') {
    var contenitore = document.getElementById('contenitoreRighePD');
    var idRiga = 'riga_' + new Date().getTime();
    
    var htmlRiga = `
    <div id="${idRiga}" class="riga-pd" style="display:grid; grid-template-columns: 3fr 1fr 2fr 40px; gap:10px; align-items:center;">
        <select class="form-input select-conto riga-conto" style="margin:0;">
            ${htmlOpzioniConti}
        </select>
        <select class="form-input riga-sezione" style="margin:0; font-weight:bold;" onchange="calcolaQuadratura()">
            <option value="DARE" style="color:#ef4444;" ${sezioneDefault === 'DARE' ? 'selected' : ''}>DARE</option>
            <option value="AVERE" style="color:#10b981;" ${sezioneDefault === 'AVERE' ? 'selected' : ''}>AVERE</option>
        </select>
        <input type="number" class="form-input riga-importo" style="margin:0;" placeholder="0.00" step="0.01" onkeyup="calcolaQuadratura()" onchange="calcolaQuadratura()">
        <button class="btn-secondary" style="padding:8px; background:#fee2e2; color:#ef4444; border:none;" onclick="document.getElementById('${idRiga}').remove(); calcolaQuadratura();" title="Rimuovi riga">✖</button>
    </div>`;
    
    contenitore.insertAdjacentHTML('beforeend', htmlRiga);
}

function calcolaQuadratura() {
    var totDare = 0;
    var totAvere = 0;
    
    var righe = document.querySelectorAll('.riga-pd');
    righe.forEach(r => {
        var sezione = r.querySelector('.riga-sezione').value;
        var importo = parseFloat(r.querySelector('.riga-importo').value) || 0;
        
        if(sezione === 'DARE') totDare += importo;
        else if(sezione === 'AVERE') totAvere += importo;
    });
    
    document.getElementById('totDare').innerText = totDare.toFixed(2) + " €";
    document.getElementById('totAvere').innerText = totAvere.toFixed(2) + " €";
    
    var sbilancio = Math.abs(totDare - totAvere);
    var btnSalva = document.getElementById('btnSalvaPD');
    var boxSbilancio = document.getElementById('boxSbilancio');
    
    if(sbilancio > 0.001 || totDare === 0) { 
        btnSalva.disabled = true;
        btnSalva.style.opacity = "0.5";
        btnSalva.style.background = "#94a3b8";
        btnSalva.innerText = sbilancio > 0.001 ? "⚠️ MOVIMENTO SBILANCIATO DI " + sbilancio.toFixed(2) + "€" : "INSERISCI GLI IMPORTI";
        if(sbilancio > 0.001) boxSbilancio.style.display = "block";
        if(document.getElementById('valSbilancio')) document.getElementById('valSbilancio').innerText = sbilancio.toFixed(2);
    } else { 
        btnSalva.disabled = false;
        btnSalva.style.opacity = "1";
        btnSalva.style.background = "#2563eb";
        btnSalva.innerText = "✅ SALVA MOVIMENTO QUADRATO";
        if(boxSbilancio) boxSbilancio.style.display = "none";
    }
}

/* --- GESTIONE CONSENSO --- */

function verificaConsenso() {
    chiamaServer("checkAccettazioneRegolamento", curEmail).then(function(res){
        if(res.blocco === true) {
            // Mostra il blocco
            document.getElementById('modalConsenso').classList.remove('hidden');
            
            // Imposta i dati
            document.getElementById('lblVersione').innerText = res.versione;
            document.getElementById('btnLeggiDoc').href = res.url;
            
            // Nasconde l'app sotto (per sicurezza visiva)
            document.getElementById('appInterface').classList.add('hidden');
        } else {
            // Tutto ok, carica l'app normale
            document.getElementById('appInterface').classList.remove('hidden');
            initApp(); 
        }
    });
}

function toggleBtnConsenso() {
    var ck = document.getElementById('checkConsenso');
    var btn = document.getElementById('btnAccettaDoc');
    if(ck.checked) {
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
    } else {
        btn.style.opacity = "0.5";
        btn.style.pointerEvents = "none";
    }
}

function inviaAccettazione() {
    var btn = document.getElementById('btnAccettaDoc');
    btn.innerText = "Registrazione in corso...";
    
    chiamaServer("registraAccettazioneRegolamento", curEmail).then(function(res){
        if(res === "OK") {
            showToast("Accettazione registrata!", "success");
            document.getElementById('modalConsenso').classList.add('hidden');
            document.getElementById('appInterface').classList.remove('hidden');
            initApp(); // Avvia l'app finalmente
        } else {
            alert("Errore di connessione. Riprova.");
        }
    });
}


var docIdDaFirmare = ""; // Variabile temporanea

function avviaProcessoFirma(docId, docName) {
    docIdDaFirmare = docId;
    document.getElementById('signDocName').innerText = docName;
    
    // Reset Grafica
    document.getElementById('signStep1').classList.remove('hidden');
    document.getElementById('signStep2').classList.add('hidden');
    document.getElementById('otpInput').value = "";
    
    document.getElementById('modalFirma').classList.remove('hidden');
}

function richiediOTP() {
    // --- NUOVO: BLOCCO DEL BOTTONE ---
    // (Assicurati che nel tuo HTML il bottone abbia id="btnRichiediOTP", come abbiamo detto prima)
    var btn = document.getElementById('btnRichiediOTP');
    if(btn) {
        btn.disabled = true;
        btn.innerText = "Invio in corso...";
        btn.style.opacity = "0.7";
    }
    // ---------------------------------

    showToast("Invio codice in corso...", "info");
    
    chiamaServer("requestSignOTP", [curEmail, docIdDaFirmare]).then(function(res){
        
        // --- NUOVO: SBLOCCO DEL BOTTONE ---
        // Se c'è un errore o se l'utente annulla per riprovare, il bottone torna cliccabile
        if(btn) {
            btn.disabled = false;
            btn.innerText = "INVIA CODICE OTP";
            btn.style.opacity = "1";
        }
        // ----------------------------------

        if(res === "OTP_SENT") {
            document.getElementById('signStep1').classList.add('hidden');
            document.getElementById('signStep2').classList.remove('hidden');
        } else {
            showToast("Errore invio: " + res, "error");
        }
    });
}






function caricaRichiesteFirma() {
    var div = document.getElementById('containerFirme');
    div.innerHTML = getSkeletonLoader();

    chiamaServer("getRichiesteFirmaUtente", curEmail).then(function(lista){
        if(lista.length === 0) {
            div.innerHTML = `
            <div style="text-align:center; padding:40px; background:white; border-radius:12px; border:1px solid #e2e8f0;">
                <div style="font-size:30px;">✅</div>
                <h3 style="color:#0f172a;">Tutto fatto!</h3>
                <p style="color:#64748b; font-size:13px;">Non hai documenti in attesa di firma.</p>
            </div>`;
            return;
        }

        var html = "";
        lista.forEach(item => {
            html += `
            <div style="background:white; padding:20px; border-radius:12px; border:1px solid #e2e8f0; border-left:5px solid #f59e0b; display:flex; flex-wrap:wrap; gap:15px; align-items:center; justify-content:space-between; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                <div>
                    <div style="font-size:11px; text-transform:uppercase; color:#f59e0b; font-weight:bold; margin-bottom:5px;">Richiesta del ${item.data}</div>
                    <div style="font-weight:bold; font-size:16px; color:#0f172a; margin-bottom:5px;">${item.nomeFile}</div>
                    <a href="${item.urlFile}" target="_blank" style="font-size:13px; color:#3b82f6; text-decoration:underline;">📄 Leggi Documento</a>
                </div>
                
                <button class="btn-primary" style="width:auto; padding:10px 25px; background:#0f172a;" onclick="avviaFirmaRichiesta('${item.idRichiesta}', '${item.nomeFile}')">
                    🖋️ FIRMA ORA
                </button>
            </div>`;
        });
        div.innerHTML = html;
    });
}

// Avvia il modale di firma (quello fatto nel passaggio precedente)
var currentRichiestaId = "";

function avviaFirmaRichiesta(idReq, nomeFile) {
    currentRichiestaId = idReq;
    // Riutilizza il modale firma esistente ma setta una flag per sapere che è una richiesta database
    document.getElementById('signDocName').innerText = nomeFile;
    document.getElementById('signStep1').classList.remove('hidden');
    document.getElementById('signStep2').classList.add('hidden');
    document.getElementById('otpInput').value = "";
    document.getElementById('modalFirma').classList.remove('hidden');
    
    // IMPORTANTE: Dobbiamo dire al sistema di chiedere l'OTP per questo file
    // Ma l'OTP server side vuole un DocID o un Context. 
    // Possiamo usare una funzione wrapper.
}


function confermaFirma() {
    var otp = document.getElementById('otpInput').value;
    if(otp.length < 6) return showToast("Codice non valido", "error");
    
    var info = navigator.userAgent; 
    
    // --- NUOVO: BLOCCO DEL BOTTONE ---
    // Peschiamo il bottone tramite il suo ID (assicurati che nel HTML abbia id="btnConfermaFirma")
    var btn = document.getElementById('btnConfermaFirma');
    if(btn) {
        btn.disabled = true; // Lo spegne
        btn.innerText = "Firma in corso..."; // Cambia il testo per rassicurare l'utente
        btn.style.opacity = "0.7"; // Lo fa sembrare disattivato
    }
    // ---------------------------------

    showToast("Validazione in corso...", "info");

    chiamaServer("finalizzaFirmaRichiesta", [currentRichiestaId, otp, curEmail, info]).then(function(res){
        
        // --- NUOVO: SBLOCCO DEL BOTTONE ---
        // Qualsiasi cosa succeda (successo o errore), riattiviamo il bottone
        if(btn) {
            btn.disabled = false;
            btn.innerText = "FIRMA DOCUMENTO";
            btn.style.opacity = "1";
        }
        // ----------------------------------

        if(res === "OK") {
            showToast("✅ Documento Firmato!", "success");
            document.getElementById('modalFirma').classList.add('hidden');
            caricaRichiesteFirma(); // Ricarica la lista per far sparire il doc
        } else {
            showToast("Errore: " + res, "error");
        }
    });
}



/* --- GESTIONE CENTRO FIRME ADMIN (V2.0) --- */

function caricaStatsFirme() {
    var div = document.getElementById('containerStatsFirme');
    div.innerHTML = getSkeletonLoader();

    chiamaServer("adminGetStatisticheFirme", curEmail).then(function(data){
        if(data.length === 0) {
            div.innerHTML = "<p style='color:#ccc; text-align:center;'>Nessun documento in corso.</p>";
            return;
        }

        var html = "";
        data.forEach(d => {
            // Calcolo Percentuale
            var perc = Math.round((d.firmati / d.totale) * 100);
            var colorBar = (perc === 100) ? "#10b981" : "#3b82f6";
            
            // Gestione Controfirma
            var actionBlock = "";
            if(d.daControfirmare.length > 0) {
                actionBlock = `
                <div style="margin-top:10px; background:#fff7ed; border:1px solid #ffedd5; padding:10px; border-radius:6px; font-size:12px;">
                    <div style="font-weight:bold; color:#c2410c; margin-bottom:5px;">⚠️ ${d.daControfirmare.length} firme da validare</div>
                    ${d.daControfirmare.map(req => `
                        <div style="display:flex; justify-content:space-between; margin-top:5px; border-bottom:1px solid #fed7aa; padding-bottom:2px;">
                            <span>${req.email}</span>
                            <button onclick="eseguiControfirma('${req.id}')" style="background:#f97316; color:white; border:none; border-radius:4px; cursor:pointer; font-size:10px; padding:2px 6px;">FIRMA</button>
                        </div>
                    `).join('')}
                </div>`;
            }

            // Gestione Sollecito
            var btnSollecito = "";
            if(d.pendenti.length > 0) {
                var emailListStr = JSON.stringify(d.pendenti).replace(/"/g, "&quot;");
                btnSollecito = `<button class="btn-danger" style="width:auto; padding:4px 8px; font-size:10px; margin-right:5px;" onclick="lanciaSollecito('${d.nome}', ${emailListStr})">🔔 Sollecita (${d.pendenti.length})</button>`;
            }

            // COSTRUZIONE CARD CON IL NUOVO BOTTONE
            html += `
            <div style="border-bottom:1px solid #f1f5f9; padding-bottom:20px; margin-bottom:20px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                    
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:18px;">📄</span>
                        <div style="font-weight:bold; color:#0f172a; font-size:14px; word-break:break-word;">${d.nome}</div>
                    </div>

                    <div style="display:flex; align-items:center; gap:8px;">
                        ${btnSollecito}
                        
                        <button onclick="chiudiCampagnaFirme('${d.nome}')" style="background:#10b981; color:white; border:none; border-radius:6px; cursor:pointer; padding:5px 10px; font-size:11px; font-weight:bold; box-shadow:0 2px 4px rgba(16,185,129,0.3);" title="Chiudi pratica e crea Registro PDF">
                            🏁 Chiudi Pratica
                        </button>

                        <button onclick="eliminaGruppoRichieste('${d.nome}')" style="background:white; border:1px solid #e2e8f0; color:#ef4444; border-radius:6px; cursor:pointer; padding:4px 8px; font-size:12px;" title="Elimina definitivamente">
                            🗑️
                        </button>
                    </div>
                </div>
                
                <div style="display:flex; justify-content:space-between; font-size:11px; color:#64748b; margin-bottom:4px;">
                    <span>Completato: ${d.firmati}/${d.totale}</span>
                    <span>${perc}%</span>
                </div>
                
                <div style="width:100%; height:8px; background:#f1f5f9; border-radius:4px; overflow:hidden;">
                    <div style="width:${perc}%; background:${colorBar}; height:100%; transition:width 1s;"></div>
                </div>

                ${actionBlock}
            </div>`;
        });
        div.innerHTML = html;
    });
}


function lanciaSollecito(docName, list) {
    if(!confirm("Inviare una mail di sollecito a " + list.length + " soci?")) return;
    showToast("Invio solleciti in corso...", "info");
    
    chiamaServer("adminInviaSollecito", [docName, list]).then(function(res){
        showToast("Solleciti inviati!", "success");
    });
}

function eseguiControfirma(idReq) {
    if(!confirm("Apporre la tua controfirma su questo documento?")) return;
    
    chiamaServer("adminEseguiControfirma", [idReq, curEmail]).then(function(res){
        if(res === "OK") {
            showToast("Documento validato!", "success");
            caricaStatsFirme(); // Ricarica la lista
        } else {
            alert("Errore");
        }
    });
}



/* --- GESTIONE SELEZIONE MANUALE --- */

function toggleSelezioneManuale() {
    var val = document.getElementById('signTarget').value;
    var box = document.getElementById('manualSelector');
    
    if(val === 'MANUAL') {
        box.classList.remove('hidden');
        renderTabellaManuale(); // Disegna la tabella usando cacheSoci
    } else {
        box.classList.add('hidden');
    }
}

function renderTabellaManuale() {
    var tbody = document.getElementById('tableManualSign');
    // Usiamo cacheSoci che è già caricata in memoria quando apri l'admin
    // Filtriamo solo gli attivi
    var sociAttivi = cacheSoci.filter(s => s.stato === 'attivo');
    
    var html = "";
    // Aggiungi riga "Seleziona Tutti"
    html += `<tr style="background:#f1f5f9; border-bottom:1px solid #cbd5e1;">
        <td style="padding:8px; width:30px;"><input type="checkbox" onchange="toggleAllManual(this)"></td>
        <td style="padding:8px; font-weight:bold; color:#64748b;">Seleziona Tutti</td>
        <td></td>
    </tr>`;

    sociAttivi.forEach(s => {
        html += `<tr class="row-manual-socio" style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:8px;"><input type="checkbox" class="chk-socio" value="${s.email}" onchange="updateCountManual()"></td>
            <td style="padding:8px;"><b>${s.cognome}</b> ${s.nome}</td>
            <td style="padding:8px; color:#64748b;">${s.ruolo}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

function filtraTabellaManuale() {
    var q = document.getElementById('searchManualSocio').value.toLowerCase();
    var rows = document.querySelectorAll('.row-manual-socio');
    
    rows.forEach(r => {
        var text = r.innerText.toLowerCase();
        r.style.display = text.includes(q) ? "" : "none";
    });
}

function updateCountManual() {
    var c = document.querySelectorAll('.chk-socio:checked').length;
    document.getElementById('countSelected').innerText = c;
}

function toggleAllManual(master) {
    var state = master.checked;
    // Seleziona solo quelli visibili (se stai filtrando)
    var rows = document.querySelectorAll('.row-manual-socio');
    rows.forEach(r => {
        if(r.style.display !== 'none') {
            r.querySelector('.chk-socio').checked = state;
        }
    });
    updateCountManual();
}



function adminInviaFirma() {
    var fi = document.getElementById('signFileInput');
    var mode = document.getElementById('signTarget').value;
    var needCounter = document.getElementById('checkControfirma').checked;
    
    if(fi.files.length === 0) return alert("Seleziona un PDF");

    var targetFinale = mode; // Di base è la stringa (TUTTI, DIRETTIVO...)

    // SE È MANUALE, raccogli gli array
    if (mode === 'MANUAL') {
        var checked = document.querySelectorAll('.chk-socio:checked');
        if (checked.length === 0) return alert("Seleziona almeno un socio dalla lista!");
        
        var listaEmail = [];
        checked.forEach(c => listaEmail.push(c.value));
        targetFinale = listaEmail; // Ora targetFinale è un ARRAY
    }

    var msgConfirm = (mode === 'MANUAL') 
        ? "Invio documento a " + targetFinale.length + " soci selezionati. Confermi?"
        : "Invio documento a " + mode + ". Confermi?";

    if(!confirm(msgConfirm)) return;

    var file = fi.files[0];
    var reader = new FileReader();
    
    showToast("Caricamento e invio...", "info");

    reader.onload = function(e) {
        var raw = e.target.result.split(',')[1];
        var data = {
            adminEmail: curEmail,
            content: raw,
            filename: file.name,
            mimeType: file.type
        };

        chiamaServer("adminInviaDocumentoFirma", [data, targetFinale, needCounter]).then(function(res){
            if(res.startsWith("OK")) {
                showToast("✅ Inviato con successo!", "success");
                fi.value = "";
                // Resetta selezione manuale
                if(mode==='MANUAL') toggleSelezioneManuale(); 
                caricaStatsFirme();
            } else {
                alert("Errore: " + res);
            }
        });
    };
    reader.readAsDataURL(file);
}


function eliminaGruppoRichieste(docName) {
    if(!confirm("ATTENZIONE!\nStai per eliminare la richiesta di firma per:\n" + docName + "\n\nQuesta azione rimuoverà il documento dalle dashboard di TUTTI i soci. I certificati già firmati rimarranno validi nel registro Audit, ma l'operazione verrà interrotta.\n\nProcedere?")) return;

    // Feedback visivo immediato (Opzionale: mette un'icona di caricamento)
    showToast("Eliminazione in corso...", "info");

    chiamaServer("adminEliminaGruppoRichieste", [docName, curEmail]).then(function(res){
        if(res === "OK") {
            showToast("Richiesta eliminata.", "success");
            caricaStatsFirme(); // Ricarica la lista per far sparire la riga
        } else {
            showToast("Errore: " + res, "error");
        }
    });
}


function chiudiCampagnaFirme(docName) {
    if(!confirm("🏁 Vuoi chiudere definitivamente la pratica per:\n" + docName + "?\n\n- Verrà generato il Registro Ufficiale PDF con le firme.\n- Il file verrà salvato su Drive e inviato alla tua email.\n- La pratica sparirà da questa lista.\n\nProcedere?")) return;

    showToast("Generazione registro in corso (può richiedere 10-15 sec)...", "info");

    chiamaServer("adminChiudiEGeneraRegistroFirme", [docName, curEmail]).then(function(res){
        if(res === "OK") {
            showToast("Registro PDF generato e salvato su Drive!", "success");
            caricaStatsFirme(); // Ricarica dashboard (il documento ora sparirà)
            loadDocs('PUBBLICO'); // Ricarica i file in background
        } else {
            showToast("Errore: " + res, "error");
        }
    });
}


/* --- GESTIONE TABS FIRMA E STORICO --- */
function switchFirmaTab(tab, el) {
    // Stile bottoni
    el.parentElement.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
    el.classList.add('active');
    
    // Switch vista
    if(tab === 'DA_FIRMARE') {
        document.getElementById('tabDaFirmare').classList.remove('hidden');
        document.getElementById('tabStoricoFirme').classList.add('hidden');
        caricaRichiesteFirma(); // Ricarica quelle da fare
    } else {
        document.getElementById('tabDaFirmare').classList.add('hidden');
        document.getElementById('tabStoricoFirme').classList.remove('hidden');
        caricaStoricoFirme();   // Carica lo storico
    }
}

function caricaStoricoFirme() {
    var div = document.getElementById('containerStoricoFirme');
    div.innerHTML = getSkeletonLoader();

    chiamaServer("getStoricoFirmeUtente", curEmail).then(function(lista){
        if(lista.length === 0) {
            div.innerHTML = `<div style="text-align:center; padding:30px; color:#64748b; background:white; border-radius:12px; border:1px solid #e2e8f0;">Nessun documento firmato in precedenza.</div>`;
            return;
        }

        var html = "";
        lista.forEach(item => {
            // Colori e testi basati sullo stato della pratica
            var badgeColor = item.stato === 'ARCHIVIATO' ? '#64748b' : (item.stato === 'DA_CONTROFIRMARE' ? '#f59e0b' : '#10b981');
            var badgeText = item.stato === 'ARCHIVIATO' ? 'Pratica Chiusa' : (item.stato === 'DA_CONTROFIRMARE' ? 'In attesa di controfirma' : 'Firmato');

            html += `
            <div style="background:white; padding:20px; border-radius:12px; border:1px solid #e2e8f0; border-left:5px solid ${badgeColor}; display:flex; flex-wrap:wrap; gap:15px; align-items:center; justify-content:space-between; box-shadow:0 2px 5px rgba(0,0,0,0.02);">
                <div>
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:5px;">
                        <div style="font-weight:bold; font-size:16px; color:#0f172a;">${item.nomeFile}</div>
                        <span style="font-size:10px; background:#f1f5f9; color:${badgeColor}; padding:2px 6px; border-radius:4px; font-weight:bold; border:1px solid ${badgeColor}33;">${badgeText}</span>
                    </div>
                    <div style="font-size:12px; color:#64748b; margin-bottom:8px;">Hai firmato il: <b>${item.dataFirma}</b></div>
                    <div style="font-size:10px; color:#94a3b8; font-family:monospace;">ID Transazione: ${item.txId || 'N/D'}</div>
                </div>
                
                <div style="display:flex; gap:10px;">
                    <a href="${item.urlFile}" target="_blank" class="btn-secondary" style="width:auto; padding:8px 15px; font-size:12px; text-decoration:none; display:flex; align-items:center; gap:5px;">
                        📄 Leggi
                    </a>
                    
                    <button class="btn-primary" style="width:auto; padding:8px 15px; font-size:12px; background:#0f172a; display:flex; align-items:center; gap:5px;" onclick="scaricaMioCertificato('${item.txId}')">
                        🔐 Certificato
                    </button>
                </div>
            </div>`;
        });
        div.innerHTML = html;
    });
}

function scaricaMioCertificato(txId) {
    if(!txId || txId === 'N/D') return showToast("Certificato non disponibile per vecchie firme.", "error");
    
    showToast("Generazione certificato in corso...", "info");
    
    chiamaServer("rigeneraCertificatoUtente", [txId, curEmail]).then(function(base64Str){
        if(base64Str === "ERR_NOT_FOUND") return showToast("Certificato non trovato negli archivi.", "error");
        
        // Crea il link invisibile e fa partire il download del PDF
        var a = document.createElement('a'); 
        a.href = base64Str; 
        a.download = "Certificato_Firma_" + txId.substring(0,8) + ".pdf"; 
        document.body.appendChild(a); 
        a.click(); 
        document.body.removeChild(a);
        
        showToast("Download completato!", "success");
    });
}


/* --- SCARICA XML FATTURA --- */
function creaEScaricaFattura(emailSocio, numFattura, importo, causale) {
    showToast("Generazione XML in corso...", "info");
    
    chiamaServer("generaFatturaXML", [emailSocio, numFattura, importo, causale]).then(function(risposta) {
        if(risposta && risposta.startsWith && risposta.startsWith("ERRORE")) {
            showToast(risposta, "error");
            return;
        }
        
        // Magia: crea un link invisibile e fa scaricare il file XML
        var a = document.createElement('a');
        a.href = risposta;
        a.download = "IT01234567890_" + numFattura + ".xml"; // Modifica con la tua vera P.IVA
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showToast("File XML scaricato! Ora puoi caricarlo sull'AdE.", "success");
    });
}


/* --- LOGICA GENERATORE XML FATTURE --- */
function cambiaTipoFattura() {
    var tipo = document.getElementById("xmlTipoCliente").value;
    if(tipo === "socio") {
        document.getElementById("campiSocio").style.display = "block";
        document.getElementById("campiAzienda").style.display = "none";
    } else {
        document.getElementById("campiSocio").style.display = "none";
        document.getElementById("campiAzienda").style.display = "flex";
    }
}

/* --- LOGICA GENERATORE FATTURE (XML + PDF) --- */
function avviaCreazioneXML() {
    var btn = document.getElementById("btnGeneraXML");
    
    var payload = {
        tipoCliente: document.getElementById("xmlTipoCliente").value,
        numero: document.getElementById("xmlNumero").value,
        importo: document.getElementById("xmlImporto").value,
        causale: document.getElementById("xmlCausale").value,
        email: document.getElementById("xmlEmail").value,
        ragioneSociale: document.getElementById("xmlRagioneSociale").value,
        piva: document.getElementById("xmlPIVA").value,
        sdi: document.getElementById("xmlSDI").value || "0000000",
        indirizzo: document.getElementById("xmlIndirizzo").value,
        comune: document.getElementById("xmlComune").value,
        cap: document.getElementById("xmlCAP").value,
        prov: document.getElementById("xmlProv").value
    };

    if(!payload.numero || !payload.importo || !payload.causale) {
        return showToast("Compila Numero, Importo e Causale", "error");
    }

    btn.disabled = true; btn.innerText = "Generazione in corso..."; btn.style.opacity = "0.7";
    showToast("Creazione XML e PDF in corso...", "info");

    chiamaServer("generaFatturaXML", payload).then(function(res) {
        btn.disabled = false; btn.innerText = "SCARICA FATTURA (XML + PDF)"; btn.style.opacity = "1";

        // Ora il server ci risponde con un oggetto strutturato, controlliamo se c'è un errore
        if(res.errore) {
            showToast(res.errore, "error");
            return;
        }

        var nomePulito = payload.numero.replace("/", "_").replace("\\", "_");

        // 1. SCARICA IL PDF CORTESE
        var aPdf = document.createElement("a");
        aPdf.href = res.pdfBase64;
        aPdf.download = "Fattura_" + nomePulito + ".pdf";
        document.body.appendChild(aPdf);
        aPdf.click();
        document.body.removeChild(aPdf);

        // 2. SCARICA L'XML (Con un piccolissimo ritardo per non far bloccare i popup dal browser)
        setTimeout(function() {
            var aXml = document.createElement("a");
            aXml.href = res.xmlBase64;
            aXml.download = "IT01234567890_" + nomePulito.padStart(5, '0') + ".xml";
            document.body.appendChild(aXml);
            aXml.click();
            document.body.removeChild(aXml);
            
            showToast("✅ Fattura ed XML generati con successo!", "success");
        }, 800);

    });
}


/* --- GESTIONE DATABASE AZIENDE ESTERNE --- */
var databaseAziende = [];

// Carica i dati in background
function caricaAziendeInMemoria() {
    chiamaServer("getListaFornitori").then(function(dati) {
        databaseAziende = dati;
        var datalist = document.getElementById('listaAziendeDB');
        datalist.innerHTML = "";
        dati.forEach(function(az) {
            var opt = document.createElement('option');
            opt.value = az.ragioneSociale;
            datalist.appendChild(opt);
        });
    });
}

// Scatta quando l'utente sceglie un'azienda dalla tendina
function autocompilaAziendaEsterna() {
    var valoreInserito = document.getElementById("xmlRagioneSociale").value;
    
    // Cerca l'azienda nell'array che abbiamo scaricato
    var aziendaTrovata = databaseAziende.find(a => a.ragioneSociale === valoreInserito);
    
    if(aziendaTrovata) {
        // Se la trova, compila tutti i campi istantaneamente!
        document.getElementById("xmlPIVA").value = aziendaTrovata.piva;
        document.getElementById("xmlSDI").value = aziendaTrovata.sdi;
        document.getElementById("xmlIndirizzo").value = aziendaTrovata.indirizzo;
        document.getElementById("xmlCAP").value = aziendaTrovata.cap;
        document.getElementById("xmlComune").value = aziendaTrovata.comune;
        document.getElementById("xmlProv").value = aziendaTrovata.prov;
        
        showToast("Dati azienda caricati!", "info");
    }
}

/* --- REGISTRAZIONE FATTURE RICEVUTE (SPESE) --- */
function registraFatturaRicevuta() {
    var btn = document.getElementById("btnRegistraSpesa");
    var dataDoc = document.getElementById("spesaData").value;
    var numero = document.getElementById("spesaNumero").value;
    var fornitore = document.getElementById("spesaFornitore").value;
    var causale = document.getElementById("spesaCausale").value;
    var importo = document.getElementById("spesaImporto").value;
    var fileInput = document.getElementById("spesaFile");

    if(!dataDoc || !fornitore || !causale || !importo) {
        return showToast("Compila Data, Fornitore, Causale e Importo", "error");
    }

    btn.disabled = true; btn.innerText = "Salvataggio in corso..."; btn.style.opacity = "0.7";
    showToast("Invio dati all'archivio...", "info");

    var payload = {
        data: dataDoc,
        numero: numero || "Senza N.",
        fornitore: fornitore,
        causale: causale,
        importo: importo,
        fileBase64: null,
        fileName: null,
        mimeType: null
    };

    // Se l'utente ha allegato un file, lo prepariamo per Google Drive
    if(fileInput.files.length > 0) {
        var file = fileInput.files[0];
        var reader = new FileReader();
        reader.onload = function(e) {
            payload.fileBase64 = e.target.result.split(',')[1];
            payload.fileName = file.name;
            payload.mimeType = file.type;
            inviaSpesaBackend(payload, btn);
        };
        reader.readAsDataURL(file);
    } else {
        inviaSpesaBackend(payload, btn); // Senza allegato
    }
}

function inviaSpesaBackend(payload, btn) {
    chiamaServer("salvaFatturaRicevuta", payload).then(function(res) {
        btn.disabled = false; btn.innerText = "💾 REGISTRA SPESA IN ARCHIVIO"; btn.style.opacity = "1";
        if(res === "OK") {
            showToast("✅ Spesa registrata con successo!", "success");
            // Svuotiamo i campi per la prossima spesa
            document.getElementById("spesaNumero").value = "";
            document.getElementById("spesaCausale").value = "";
            document.getElementById("spesaImporto").value = "";
            document.getElementById("spesaFile").value = "";
        } else {
            showToast("Errore: " + res, "error");
        }
    });
}


// Funzioni per l'interazione Frontend
function togglePartecipante(el, nome) {
  el.classList.toggle('active');
  var input = document.getElementById('spesaPartecipanti');
  var attuali = input.value.split(',').map(s => s.trim()).filter(s => s !== "");
  
  if (el.classList.contains('active')) {
    if (!attuali.includes(nome)) attuali.push(nome);
  } else {
    attuali = attuali.filter(n => n !== nome);
  }
  input.value = attuali.join(', ');
}

function toggleCryptoFields() {
  var metodo = document.getElementById('spesaMetodo').value;
  var box = document.getElementById('cryptoFields');
  if (metodo.includes("BTC")) {
    box.classList.remove('hidden');
  } else {
    box.classList.add('hidden');
  }
}

function salvaSpesa() {
    var totale = parseFloat(document.getElementById('spesaTotale').value) || 0;
    var pagatoDa = document.getElementById('spesaChi').value;

    // 1. Controlli di base
    if (!pagatoDa || totale <= 0 || partecipantiSelezionati.length === 0) {
        return showToast("Compila chi ha pagato, il totale e seleziona i partecipanti", "error");
    }

    // 2. Controlla che le quote personalizzate quadrino prima di proseguire
    if (modalitaDivisione !== 'UGUALE' && !validaSomma()) {
        return showToast("Correggi gli importi prima di salvare", "error");
    }

    var quoteEsatte = {};

    // 3. Raccoglie i dati matematici dal frontend in base alla modalità
    if (modalitaDivisione === 'UGUALE') {
        var base = Math.floor((totale / partecipantiSelezionati.length) * 100) / 100;
        var resto = Math.round((totale - (base * partecipantiSelezionati.length)) * 100) / 100;
        partecipantiSelezionati.forEach((p, idx) => { 
            quoteEsatte[p] = base + (idx === 0 ? resto : 0); // Il primo assorbe l'eventuale centesimo di resto
        });
    } else if (modalitaDivisione === 'ESATTI') {
        document.querySelectorAll('.q-esatta').forEach(inp => { 
            quoteEsatte[inp.getAttribute('data-nome')] = parseFloat(inp.value) || 0; 
        });
    } else if (modalitaDivisione === 'PERCENTUALE') {
        var sommaCheck = 0;
        var inputs = document.querySelectorAll('.q-perc');
        inputs.forEach((inp, idx) => { 
            var quotaCents = (totale * ((parseFloat(inp.value) || 0) / 100));
            var finale = Math.floor(quotaCents * 100) / 100; 
            quoteEsatte[inp.getAttribute('data-nome')] = finale;
            sommaCheck += finale;
        });
        // Corregge eventuale scarto di 1 centesimo dovuto alle percentuali
        var diff = Math.round((totale - sommaCheck)*100)/100;
        if(diff !== 0) quoteEsatte[inputs[0].getAttribute('data-nome')] += diff;
    }

    // 4. Gestione stringa per esclusioni alimentari
    var esc = [];
    var checkAlcolici = document.getElementById('escludiAlcolici');
    var checkAffettati = document.getElementById('escludiAffettati');
    
    if (checkAlcolici && checkAlcolici.checked) esc.push("Alcolici");
    if (checkAffettati && checkAffettati.checked) esc.push("Salumi/Formaggi");
    
    var stringaEsclusioni = "";
    if (esc.length > 0) {
        stringaEsclusioni = pagatoDa + " (" + esc.join(", ") + ")";
    }

    // 5. Costruzione del pacchetto dati per il backend
    var dati = {
      pagatoDa: pagatoDa,
      descrizione: document.getElementById('spesaDesc').value,
      importo: totale,
      quoteEsatte: quoteEsatte,      // Invia il dizionario con le quote già calcolate
      esclusioniNomi: stringaEsclusioni, // Invia la nota sulle esclusioni
      metodo: document.getElementById('spesaMetodo').value,
      txid: document.getElementById('spesaTXID') ? document.getElementById('spesaTXID').value : "",
      gruppo: gruppoAttivo,
    };

    showToast("Registrazione in corso...", "info");
    
    // 6. Chiamata al server
    chiamaServer("aggiungiSpesaGruppo", dati).then(function(res) {
      if (res === "OK") {
        showToast("Spesa registrata correttamente", "success");
        
        // Pulizia campi
        document.getElementById('spesaDesc').value = "";
        document.getElementById('spesaTotale').value = "";
        if(document.getElementById('spesaTXID')) document.getElementById('spesaTXID').value = "";
        
        if (checkAlcolici) checkAlcolici.checked = false;
        if (checkAffettati) checkAffettati.checked = false;

        // Ricalcola la UI e il pannello bilanci
        aggiornaUIQuote();
        aggiornaBilanci();
      } else {
        showToast("Errore: " + res, "error");
      }
    });
}

function aggiornaBilanci() {
  var contenitore = document.getElementById('listaBilanci');
  contenitore.innerHTML = "<div class='loader'></div>";
  
  chiamaServer("calcolaSaldiGruppo", gruppoAttivo).then(function(saldi) {
    if (saldi.length === 0) {
      contenitore.innerHTML = "<p style='color:#94a3b8; font-size:13px; text-align:center;'>Siete tutti pari!</p>";
      return;
    }
    
    var html = "";
    saldi.forEach(s => {
      var color = s.saldo > 0 ? "#10b981" : "#ef4444";
      var label = s.saldo > 0 ? "Avanza:" : "Deve dare:";
      html += `
      <div style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid #f1f5f9;">
        <span style="font-weight:600; color:#0f172a;">${s.nome}</span>
        <div style="text-align:right;">
          <div style="font-size:10px; color:#64748b; text-transform:uppercase;">${label}</div>
          <div style="font-weight:bold; color:${color};">${s.formattato}</div>
        </div>
      </div>`;
    });
    contenitore.innerHTML = html;
  });
}


function caricaChipsSoci() {
  var box = document.getElementById('boxChipsSpese');
  var selectChi = document.getElementById('spesaChi'); // Prende il menu a tendina
  
  box.innerHTML = "<div class='loader' style='width:15px; height:15px; border-width:2px; margin:0;'></div>";
  
  chiamaServer("getNomiSociAttivi").then(function(nomi) {
    if (nomi.length === 0) {
      box.innerHTML = "<span style='font-size:12px; color:#94a3b8;'>Nessun socio attivo trovato.</span>";
      selectChi.innerHTML = "<option value=''>Nessun socio attivo</option>";
      return;
    }
    
    var htmlChips = "";
    var htmlSelect = "<option value=''>Seleziona chi ha pagato...</option>"; 
    
    // --- NOVITÀ 1: Svuotiamo e riempiamo subito l'array con TUTTI i nomi ---
    partecipantiSelezionati = [];
    
    nomi.forEach(function(nome) {
      var nomePulito = nome.replace(/'/g, "\\'"); 
      
      partecipantiSelezionati.push(nome); // Aggiunge il socio in memoria
      
      // --- NOVITÀ 2: Aggiunta la classe 'active' al div ---
      htmlChips += `<div class="chip active" onclick="togglePartecipante(this, '${nomePulito}')">${nome}</div>`;
      
      // Crea l'opzione per il menu a tendina "Chi ha pagato?"
      htmlSelect += `<option value="${nome}">${nome}</option>`;
    });
    
    // Inserisce l'HTML creato nella pagina
    box.innerHTML = htmlChips;
    selectChi.innerHTML = htmlSelect;

    // Imposta il tuo nome come default per chi ha pagato
    chiamaServer("getDatiUtente", curEmail).then(function(utente) {
        if (utente && utente.nome) {
            selectChi.value = utente.nome; 
        }
    });

    // --- NOVITÀ 3: Ricalcola subito la grafica per mostrare la lista sotto ---
    aggiornaUIQuote();

  });
}

var modalitaDivisione = 'UGUALE';
var partecipantiSelezionati = [];

function cambiaModalitaDiv(mod, el) {
    modalitaDivisione = mod;
    el.parentElement.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
    el.classList.add('active');
    aggiornaUIQuote();
}

function togglePartecipante(el, nome) {
    el.classList.toggle('active');
    if (el.classList.contains('active')) {
        if (!partecipantiSelezionati.includes(nome)) partecipantiSelezionati.push(nome);
    } else {
        partecipantiSelezionati = partecipantiSelezionati.filter(n => n !== nome);
    }
    aggiornaUIQuote();
}

function aggiornaUIQuote() {
    var box = document.getElementById('dettaglioQuoteBox');
    var lista = document.getElementById('listaQuoteDinamiche');
    var totInput = document.getElementById('spesaTotale').value;
    var totale = parseFloat(totInput) || 0;

    if (partecipantiSelezionati.length === 0) {
        box.style.display = 'none';
        return;
    }

    box.style.display = 'block';
    var html = "";

    if (modalitaDivisione === 'UGUALE') {
        // Matematica per divisione equa (con gestione dei centesimi di resto)
        var base = Math.floor((totale / partecipantiSelezionati.length) * 100) / 100;
        var resto = Math.round((totale - (base * partecipantiSelezionati.length)) * 100) / 100;
        
        partecipantiSelezionati.forEach((p, idx) => {
            var quota = base + (idx === 0 ? resto : 0); // Il primo si prende l'eventuale centesimo di scarto
            html += `<div style="display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid #e2e8f0; font-size:14px;">
                        <span>${p}</span>
                        <span style="font-weight:bold; color:#0f172a;">€ ${quota.toFixed(2)}</span>
                     </div>`;
        });
        document.getElementById('erroreQuote').innerText = "";

    } else if (modalitaDivisione === 'ESATTI') {
        partecipantiSelezionati.forEach(p => {
            html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid #e2e8f0;">
                        <span style="font-size:14px;">${p}</span>
                        <div style="display:flex; align-items:center; gap:5px;">
                            <span>€</span>
                            <input type="number" step="0.01" class="form-input q-esatta" data-nome="${p}" style="width:80px; padding:4px;" onkeyup="validaSomma()" onchange="validaSomma()">
                        </div>
                     </div>`;
        });
        
    } else if (modalitaDivisione === 'PERCENTUALE') {
        partecipantiSelezionati.forEach(p => {
            html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid #e2e8f0;">
                        <span style="font-size:14px;">${p}</span>
                        <div style="display:flex; align-items:center; gap:5px;">
                            <input type="number" step="1" class="form-input q-perc" data-nome="${p}" style="width:70px; padding:4px;" onkeyup="validaSomma()" onchange="validaSomma()">
                            <span>%</span>
                        </div>
                     </div>`;
        });
    }

    lista.innerHTML = html;
    if (modalitaDivisione !== 'UGUALE') validaSomma();
}

function validaSomma() {
    var totale = parseFloat(document.getElementById('spesaTotale').value) || 0;
    var erroreBox = document.getElementById('erroreQuote');
    
    if (modalitaDivisione === 'ESATTI') {
        var somma = 0;
        document.querySelectorAll('.q-esatta').forEach(inp => somma += parseFloat(inp.value) || 0);
        var diff = Math.abs(totale - somma);
        if (diff > 0.01) {
            erroreBox.innerText = "La somma degli importi (" + somma.toFixed(2) + "€) non coincide col totale (" + totale.toFixed(2) + "€). Manca: " + (totale-somma).toFixed(2) + "€";
            return false;
        }
    } else if (modalitaDivisione === 'PERCENTUALE') {
        var sommaPerc = 0;
        document.querySelectorAll('.q-perc').forEach(inp => sommaPerc += parseFloat(inp.value) || 0);
        if (sommaPerc !== 100) {
            erroreBox.innerText = "La somma delle percentuali è " + sommaPerc + "%. Deve essere 100%.";
            return false;
        }
    }
    erroreBox.innerText = "";
    return true;
}

function caricaListaGruppi() {
    document.getElementById('stepSelezioneGruppo').classList.remove('hidden');
    document.getElementById('stepDettaglioGruppo').classList.add('hidden');
    var div = document.getElementById('listaGruppiSpese');
    div.innerHTML = getSkeletonLoader();
    chiamaServer("getGruppiSpese").then(function(gruppi) {
        var html = "";
        gruppi.forEach(g => {
           html += `<button class="btn-secondary" style="width:auto; padding:12px 24px; border-color:#3b82f6; color:#1e40af; font-weight:bold; font-size:14px; background:#eff6ff;" onclick="entraNelGruppo('${g.replace(/'/g, "\\'")}')">📁 ${g}</button>`;
        });
        div.innerHTML = html;
    });
}

function creaNuovoGruppo() {
    var nome = document.getElementById('nuovoNomeGruppo').value;
    if(!nome) return showToast("Inserisci un nome per il gruppo", "error");
    showToast("Creazione gruppo...", "info");
    chiamaServer("creaGruppoSpese", nome).then(function(res) {
        document.getElementById('nuovoNomeGruppo').value = "";
        showToast("Gruppo creato!", "success");
        entraNelGruppo(nome);
    });
}

function entraNelGruppo(nome) {
    gruppoAttivo = nome;
    document.getElementById('titoloGruppoAttivo').innerText = nome;
    
    // Cambia schermata
    document.getElementById('stepSelezioneGruppo').classList.add('hidden');
    document.getElementById('stepDettaglioGruppo').classList.remove('hidden');
    
    // Prepara il form e i bilanci per QUESTO gruppo
    caricaChipsSoci();
    aggiornaBilanci();
}

function tornaAiGruppi() {
    document.getElementById('stepSelezioneGruppo').classList.remove('hidden');
    document.getElementById('stepDettaglioGruppo').classList.add('hidden');
    gruppoAttivo = "";
}

function inviaPropostaAmmissione() {
    var nome = document.getElementById('candNome').value;
    var cognome = document.getElementById('candCognome').value.trim();
    var email = document.getElementById('candEmail').value;
    var sponsor2 = document.getElementById('candSponsor2').value;
    
    if(!nome || !cognome || !email || !sponsor2) return showToast("Compila tutti i campi", "error");
    if(sponsor2 === curEmail) return showToast("Non puoi essere contemporaneamente il primo e il secondo garante", "error");
    
    var dati = {
        nomeCandidato: nome,
        cognomeCandidato: cognome,
        emailCandidato: email,
        telefono: "", // Opzionale
        sponsor1: curEmail,
        sponsor2: sponsor2,
        emailSponsor2: sponsor2 // In questo setup base, usiamo l'identificativo come email
    };
    
    showToast("Invio proposta in corso...", "info");
    
    chiamaServer("proponiNuovoSocio", dati).then(function(res) {
        if(res === "OK") {
            showToast("Proposta inviata! In attesa della conferma del Secondo Garante.", "success");
            document.getElementById('candNome').value = "";
            document.getElementById('candCognome').value = "";
            document.getElementById('candEmail').value = "";
        }
    });
}

function caricaAmmissioni() {
    chiamaServer("getCandidatureAttive", curEmail).then(function(dati) {
        var boxSostieni = document.getElementById('boxSostieniCandidati');
        var listaDati = document.getElementById('listaDaSostenere');
        
        if(dati.daSostenere.length > 0) {
            boxSostieni.style.display = "block";
            var html = "";
            dati.daSostenere.forEach(c => {
                html += `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #fdba74; padding-bottom:10px; margin-bottom:10px;">
                    <div>
                        <div style="font-weight:bold; color:#9a3412;">${c.nome}</div>
                        <div style="font-size:12px; color:#c2410c;">Proposto da: ${c.sponsor1}</div>
                    </div>
                    <button class="btn-primary" style="background:#f97316; width:auto; padding:8px 15px; font-size:12px;" onclick="confermaSostegno('${c.email}')">
                        SOTTOSCRIVI
                    </button>
                </div>`;
            });
            listaDati.innerHTML = html;
        } else {
            boxSostieni.style.display = "none";
        }
        
    });
}

function confermaSostegno(emailCandidato) {
    if(!confirm("Confermi di voler fare da secondo garante per l'ammissione di questo candidato in assemblea?")) return;
    
    chiamaServer("sostieniCandidato", [emailCandidato, curEmail]).then(function(res) {
        if(res === "OK") {
            showToast("Sostegno confermato! La candidatura passerà all'assemblea.", "success");
            caricaAmmissioni(); // Ricarica la vista
        } else {
            showToast("Errore di conferma", "error");
        }
    });
}

function caricaVotiAmmissioni() {
    var box = document.getElementById('boxVotoAmmissioni');
    var lista = document.getElementById('listaAmmissioniDaVotare');
    
    chiamaServer("getAmmissioniInVoto", curEmail).then(function(candidati){
        if(candidati.length > 0) {
            box.style.display = "block";
            var html = "";
            candidati.forEach(c => {
                html += `
                <div style="background:white; padding:15px; border-radius:8px; border:1px solid #e2e8f0;">
                    <div style="font-weight:bold; font-size:15px; color:#0f172a; margin-bottom:10px;">Candidato: ${c.nome}</div>
                    <div style="display:flex; gap:10px;">
                        <button class="btn-primary" style="flex:1; background:#10b981; padding:8px;" onclick="esprimiVotoAmmissione('${c.email}', 'FAVOREVOLE')">👍 Favorevole</button>
                        <button class="btn-primary" style="flex:1; background:#ef4444; padding:8px;" onclick="esprimiVotoAmmissione('${c.email}', 'CONTRARIO')">👎 Contrario</button>
                        <button class="btn-secondary" style="flex:1; padding:8px;" onclick="esprimiVotoAmmissione('${c.email}', 'ASTENUTO')">⚪ Astieniti</button>
                    </div>
                </div>`;
            });
            lista.innerHTML = html;
        } else {
            box.style.display = "none";
        }
    });
}

function esprimiVotoAmmissione(emailCand, voto) {
    if(!confirm("Confermi il tuo voto " + voto + " per questo candidato?\nIl voto è segreto e definitivo.")) return;
    
    showToast("Registrazione voto in corso...", "info");
    var dati = { email: curEmail, password: curPass, emailCandidato: emailCand, voto: voto };
    
    chiamaServer("votaAmmissioneSocio", dati).then(function(res){
        if(res === "OK") {
            showToast("Voto registrato in cassaforte!", "success");
            caricaVotiAmmissioni(); // Ricarica la scheda per far sparire il candidato votato
        } else if(res === "GIA_VOTATO") {
            showToast("Hai già votato per questa mozione.", "error");
        } else {
            showToast("Errore di registrazione", "error");
        }
    });
}

// Aggiungi questo al tuo blocco Javascript in fondo:
function adminApriVotoAmmissione(emailCandidato) {
    if(!confirm("Vuoi sottoporre l'ammissione all'Assemblea aprendo le votazioni?")) return;
    chiamaServer("adminGestisciAmmissione", [curEmail, emailCandidato, "APRI_VOTO"]).then(function(res){
        showToast("Votazione aperta a tutti i soci!", "success");
        // Se avevi una funzione per ricaricare la tabella admin, chiamala qui
    });
}

function adminChiudiSpoglioAmmissione(emailCandidato) {
    if(!confirm("Chiudere le votazioni e avviare lo spoglio elettronico?")) return;
    
    showToast("Calcolo quorum in corso...", "info");
    chiamaServer("adminGestisciAmmissione", [curEmail, emailCandidato, "CHIUDI_VOTO"]).then(function(res){
        if(res.startsWith("OK_SPOGLIO")) {
            var pezzi = res.split("|"); // OK_SPOGLIO | ESITO | FAVOREVOLI | TOTALI | QUORUM
            var esito = pezzi[1];
            var messaggio = "Spoglio Concluso!\n\nVoti Totali: " + pezzi[3] + 
                            "\nQuorum 2/3 Richiesto: " + pezzi[4] + 
                            "\nVoti Favorevoli: " + pezzi[2] + 
                            "\n\nESITO FINALE: " + esito;
            alert(messaggio);
        } else {
            showToast("Errore: " + res, "error");
        }
    });
}

function caricaAmmissioniAdmin() {
    var box = document.getElementById('boxGestioneAmmissioni');
    var lista = document.getElementById('listaAmmissioniAdmin');
    
    chiamaServer("getAmmissioniAdmin", curEmail).then(function(dati) {
        if(dati.length === 0) {
            box.style.display = "none";
            return;
        }
        
        box.style.display = "block";
        var html = "";
        
        dati.forEach(c => {
            var btnAzione = "";
            
            // Bottone verde per Aprire il voto, Rosso per chiudere e scrutinare
            if(c.stato === "SOSTENUTO (PRONTO PER ASSEMBLEA)") {
                btnAzione = `<button class="btn-primary" style="background:#10b981; width:auto; padding:8px 15px; font-size:12px;" onclick="adminApriVotoAmmissione('${c.email}')">🟢 APRI VOTO IN ASSEMBLEA</button>`;
            } else if(c.stato === "IN VOTAZIONE") {
                btnAzione = `<button class="btn-primary" style="background:#ef4444; width:auto; padding:8px 15px; font-size:12px;" onclick="adminChiudiSpoglioAmmissione('${c.email}')">🔴 CHIUDI VOTO E CALCOLA QUORUM (2/3)</button>`;
            }

            html += `
            <div style="border:1px solid #e2e8f0; padding:15px; border-radius:8px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div>
                    <div style="font-weight:bold; color:#0f172a; font-size:15px;">${c.nome}</div>
                    <div style="font-size:12px; color:#64748b;">Garantito da: <b>${c.sponsor1}</b> e <b>${c.sponsor2}</b></div>
                    <div style="font-size:11px; font-weight:bold; color:#c2410c; margin-top:4px;">Stato: ${c.stato}</div>
                </div>
                <div>
                    ${btnAzione}
                </div>
            </div>`;
        });
        lista.innerHTML = html;
    });
}

function adminApriVotoAmmissione(emailCandidato) {
    if(!confirm("Vuoi sottoporre l'ammissione all'Assemblea aprendo le votazioni?\nTutti i soci attivi vedranno la scheda elettorale.")) return;
    
    showToast("Apertura votazione in corso...", "info");
    
    chiamaServer("adminGestisciAmmissione", [curEmail, emailCandidato, "APRI_VOTO"]).then(function(res){
        if(res === "OK") {
            showToast("Votazione aperta a tutti i soci!", "success");
            caricaAmmissioniAdmin(); // Ricarica il pannello
        } else {
            showToast("Errore: " + res, "error");
        }
    });
}

function adminChiudiSpoglioAmmissione(emailCandidato) {
    if(!confirm("Sei sicuro di voler chiudere le votazioni e avviare lo spoglio elettronico?\nIl sistema calcolerà automaticamente la maggioranza dei 2/3.")) return;
    
    showToast("Calcolo spoglio in corso...", "info");
    
    chiamaServer("adminGestisciAmmissione", [curEmail, emailCandidato, "CHIUDI_VOTO"]).then(function(res){
        if(res.startsWith("OK_SPOGLIO")) {
            var pezzi = res.split("|"); 
            var esito = pezzi[1]; // AMMESSO o RESPINTO
            var favorevoli = pezzi[2];
            var totali = pezzi[3];
            var quorum = pezzi[4];
            
            var icona = esito === "AMMESSO" ? "✅" : "❌";
            var messaggio = icona + " SPOGLIO CONCLUSO\n\n" +
                            "Voti Totali: " + totali + "\n" +
                            "Quorum (2/3) Richiesto: " + quorum + "\n" +
                            "Voti Favorevoli: " + favorevoli + "\n\n" +
                            "ESITO ASSEMBLEA: " + esito;
            
            // Usiamo un alert classico in modo che l'Admin sia obbligato a leggerlo e cliccare OK
            alert(messaggio); 
            caricaAmmissioniAdmin(); // Aggiorna il pannello (facendo sparire la pratica completata)
        } else {
            showToast("Errore: " + res, "error");
        }
    });
}

// Funzione per leggere e analizzare il CSV caricato
function gestisciCaricamentoCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        elaboraDatiSpese(text, file.name);
    };
    reader.readAsText(file);
}

// Variabile globale per tenere in memoria il report appena letto
let reportTemporaneo = null;

function elaboraDatiSpese(csvText, nomeFile) {
    const righe = csvText.split('\n');
    if (righe.length < 2) {
        showToast("Il file CSV sembra vuoto o non valido.", "error");
        return;
    }

    const intestazioni = righe[0].split(',').map(h => h.trim());
    let speseTotali = 0;
    let categorieMap = {};
    let saldiPersone = {};

    const nomiPersone = intestazioni.slice(5);
    nomiPersone.forEach(p => saldiPersone[p] = 0);

    let conteggioSpese = 0;

    for (let i = 1; i < righe.length; i++) {
        let riga = righe[i].trim();
        if (!riga) continue;

        let col = riga.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        if (col.length < 5) continue;

        let categoria = col[2] ? col[2].replace(/"/g, '').trim() : 'Altro';
        
        // 👉 IL FILTRO MAGICO: Ignora le transazioni di rimborso!
        if (categoria.toLowerCase() === 'pagamento' || categoria.toLowerCase() === 'payment') {
            continue; // Salta questa riga e passa alla prossima
        }
        
        let costo = parseFloat(col[3].replace(/"/g, '').trim());

        if (!isNaN(costo)) {
            speseTotali += costo;
            conteggioSpese++;

            if (!categorieMap[categoria]) categorieMap[categoria] = 0;
            categorieMap[categoria] += costo;

            nomiPersone.forEach((p, idx) => {
                let valIdx = 5 + idx;
                if (col[valIdx]) {
                    let quota = parseFloat(col[valIdx].replace(/"/g, '').trim());
                    if (!isNaN(quota)) saldiPersone[p] += quota;
                }
            });
        }
    }

    // Funzioncina per troncare l'infinito decimale di Javascript a 2 cifre esatte
    const arrotonda = (num) => Math.round(num * 100) / 100;

    // Puliamo tutti i valori prima di salvare
    for (let cat in categorieMap) categorieMap[cat] = arrotonda(categorieMap[cat]);
    for (let p in saldiPersone) saldiPersone[p] = arrotonda(saldiPersone[p]);

    // Salva i dati puliti nella variabile globale
    reportTemporaneo = {
        nome: nomeFile,
        totale: arrotonda(speseTotali),
        transazioni: conteggioSpese,
        categorie: categorieMap,
        saldi: saldiPersone
    };

    disegnaDashboardAnalisi(reportTemporaneo);
    showToast("Report analizzato con successo!", "success");
}

// Funzione che invia i dati al server
function salvaReportDefinitivo(btnElement) {
    if (!reportTemporaneo) return;
    let testoOriginale = btnElement.innerHTML;
    btnElement.innerHTML = "⏳ Salvataggio in corso...";
    btnElement.disabled = true;

    chiamaServer("salvaReportArchivio", [reportTemporaneo.nome, JSON.stringify(reportTemporaneo)]).then(function(risposta) {
        if(risposta) {
          showToast("Report salvato in Archivio!", "success");
          btnElement.innerHTML = "✅ Report Salvato";
          btnElement.style.background = "#10b981";
        } else {
          showToast("Errore durante il salvataggio", "error");
          btnElement.innerHTML = testoOriginale;
          btnElement.disabled = false;
        }
    });
}

function disegnaDashboardAnalisi(dati) {
    let container = document.getElementById("analisiContenuto");

    let catHtml = '';
    for (let [cat, importo] of Object.entries(dati.categorie)) {
        let percentuale = ((importo / dati.totale) * 100).toFixed(1);
        catHtml += `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 13px;">
                <span><b>${cat}</b> (${percentuale}%)</span>
                <span style="font-weight: 600; color: #0f172a;">€ ${importo.toFixed(2)}</span>
            </div>
            <div style="background: #f1f5f9; height: 6px; border-radius: 3px; margin-bottom: 12px; overflow: hidden;">
                <div style="background: #3b82f6; width: ${percentuale}%; height: 100%; border-radius: 3px;"></div>
            </div>`;
    }

    let saldiHtml = '';
    for (let [persona, saldo] of Object.entries(dati.saldi)) {
        let colore = saldo >= 0 ? '#10b981' : '#ef4444';
        let testoSaldo = saldo >= 0 ? `Deve avere: +€ ${saldo.toFixed(2)}` : `Deve dare: -€ ${Math.abs(saldo).toFixed(2)}`;
        saldiHtml += `
            <div style="background: #f8fafc; padding: 12px 15px; border-radius: 10px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-weight: 600; color: #0f172a;">${persona}</span>
                <span style="font-size: 13px; font-weight: 700; color: ${colore};">${testoSaldo}</span>
            </div>`;
    }

    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
            <div style="font-size: 14px; color: #475569;">
                📄 Report in analisi: <b>${dati.nome}</b>
            </div>
            <!-- IL NUOVO BOTTONE DI SALVATAGGIO -->
            <button class="btn-primary" style="width: auto; padding: 8px 16px; font-size: 12px;" onclick="salvaReportDefinitivo(this)">
                💾 SALVA NEL DATABASE
            </button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px; margin-bottom: 25px;">
            <div style="background: #eff6ff; padding: 20px; border-radius: 12px; border: 1px solid #dbeafe;">
                <div style="font-size: 12px; font-weight: 600; color: #1e40af; text-transform: uppercase;">Spesa Totale</div>
                <div style="font-size: 28px; font-weight: 800; color: #1e3a8a; margin-top: 5px;">€ ${dati.totale.toFixed(2)}</div>
            </div>
            <div style="background: #f0fdf4; padding: 20px; border-radius: 12px; border: 1px solid #dcfce7;">
                <div style="font-size: 12px; font-weight: 600; color: #166534; text-transform: uppercase;">Transazioni</div>
                <div style="font-size: 28px; font-weight: 800; color: #14532d; margin-top: 5px;">${dati.transazioni}</div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 25px;">
            <div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
                <h4 style="margin: 0 0 15px 0; font-size: 15px; color: #0f172a;">🏷️ Categorie di Spesa</h4>
                ${catHtml}
            </div>
            <div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
                <h4 style="margin: 0 0 15px 0; font-size: 15px; color: #0f172a;">⚖️ Saldi dei Partecipanti</h4>
                ${saldiHtml}
            </div>
        </div>`;
}

function caricaLibreriaReport() {
    let contenitore = document.getElementById("listaReportArchiviati");
    contenitore.innerHTML = '<div style="font-size: 13px; color: #64748b;">⏳ Caricamento archivio in corso...</div>';

    chiamaServer("getReportStorici").then(function(reports) {
        if (!reports || reports.length === 0) {
            contenitore.innerHTML = '<div style="font-size: 13px; color: #64748b;">Nessun report salvato in archivio.</div>';
            return;
        }
        contenitore.innerHTML = '';
        window.archivioReportGlobale = reports; 
        reports.forEach(function(rep) {
            let btn = document.createElement("div");
            btn.style.cssText = "position: relative; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 15px; cursor: pointer; min-width: 170px; flex-shrink: 0; transition: all 0.2s ease;";
            btn.onmouseover = function() { this.style.background = "#eff6ff"; this.style.borderColor = "#93c5fd"; };
            btn.onmouseout = function() { this.style.background = "#f8fafc"; this.style.borderColor = "#cbd5e1"; };
            btn.innerHTML = `
                <div style="font-weight: 600; font-size: 13px; color: #1e40af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 20px;">📁 ${rep.nome}</div>
                <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Salvato il: ${rep.dataSalvataggio}</div>
                <div style="position: absolute; top: 8px; right: 8px; font-size: 12px; cursor: pointer; opacity: 0.6; transition: opacity 0.2s;" 
                     onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'"
                     onclick="eliminaReportDallArchivio('${rep.nome}', event)" title="Elimina Report">🗑️</div>
            `;
            btn.onclick = function(e) {
                if(e.target.innerText.includes('🗑️')) return; 
                let datiRik = JSON.parse(rep.jsonDati);
                disegnaDashboardAnalisi(datiRik, false); 
            };
            contenitore.appendChild(btn);
        });
    });
}

// Funzione che invia il comando di eliminazione
function eliminaReportDallArchivio(nomeReport, event) {
    event.stopPropagation();
    if(!confirm(`Sei sicuro di voler eliminare per sempre il report "${nomeReport}" dall'archivio?`)) return;
    let contenitore = document.getElementById("listaReportArchiviati");
    contenitore.innerHTML = '<div style="font-size: 13px; color: #ef4444;">⏳ Eliminazione in corso...</div>';
    
    chiamaServer("eliminaReportArchivio", nomeReport).then(function(risposta) {
        if(risposta) {
            showToast("Report eliminato!", "success");
            caricaLibreriaReport();
            document.getElementById("analisiContenuto").innerHTML = '';
        } else {
            showToast("Errore durante l'eliminazione", "error");
            caricaLibreriaReport();
        }
    });
}


function disegnaDashboardAnalisi(dati, mostratastoSalva = true) {
    let container = document.getElementById("analisiContenuto");

    // 1. Genera l'HTML per le Categorie
    let catHtml = '';
    for (let [cat, importo] of Object.entries(dati.categorie)) {
        let percentuale = ((importo / dati.totale) * 100).toFixed(1);
        catHtml += `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 13px;">
                <span><b>${cat}</b> (${percentuale}%)</span>
                <span style="font-weight: 600; color: #0f172a;">€ ${importo.toFixed(2)}</span>
            </div>
            <div style="background: #f1f5f9; height: 6px; border-radius: 3px; margin-bottom: 12px; overflow: hidden;">
                <div style="background: #3b82f6; width: ${percentuale}%; height: 100%; border-radius: 3px;"></div>
            </div>`;
    }

    // 2. Genera l'HTML per i Saldi
    let saldiHtml = '';
    for (let [persona, saldo] of Object.entries(dati.saldi)) {
        let colore = saldo >= 0 ? '#10b981' : '#ef4444';
        let testoSaldo = saldo >= 0 ? `Deve avere: +€ ${saldo.toFixed(2)}` : `Deve dare: -€ ${Math.abs(saldo).toFixed(2)}`;
        saldiHtml += `
            <div style="background: #f8fafc; padding: 12px 15px; border-radius: 10px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-weight: 600; color: #0f172a;">${persona}</span>
                <span style="font-size: 13px; font-weight: 700; color: ${colore};">${testoSaldo}</span>
            </div>`;
    }

    // 3. Gestisce il bottone Salva o il Badge "Archivio"
    let btnSalvataggioHtml = mostratastoSalva ? `
        <button class="btn-primary" style="width: auto; padding: 8px 16px; font-size: 12px;" onclick="salvaReportDefinitivo(this)">
            💾 SALVA NEL DATABASE
        </button>
    ` : `
        <span style="font-size: 12px; background: #dcfce7; color: #166534; padding: 6px 12px; border-radius: 20px; font-weight: 600;">
            ✓ Report d'Archivio
        </span>
    `;

    // 4. Stampa tutta la griglia finale
    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
            <div style="font-size: 14px; color: #475569;">
                📄 Report in analisi: <b>${dati.nome}</b>
            </div>
            ${btnSalvataggioHtml}
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px; margin-bottom: 25px;">
            <div style="background: #eff6ff; padding: 20px; border-radius: 12px; border: 1px solid #dbeafe;">
                <div style="font-size: 12px; font-weight: 600; color: #1e40af; text-transform: uppercase;">Spesa Totale</div>
                <div style="font-size: 28px; font-weight: 800; color: #1e3a8a; margin-top: 5px;">€ ${dati.totale.toFixed(2)}</div>
            </div>
            <div style="background: #f0fdf4; padding: 20px; border-radius: 12px; border: 1px solid #dcfce7;">
                <div style="font-size: 12px; font-weight: 600; color: #166534; text-transform: uppercase;">Transazioni</div>
                <div style="font-size: 28px; font-weight: 800; color: #14532d; margin-top: 5px;">${dati.transazioni}</div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 25px;">
            <div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
                <h4 style="margin: 0 0 15px 0; font-size: 15px; color: #0f172a;">🏷️ Categorie di Spesa</h4>
                ${catHtml}
            </div>
            <div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
                <h4 style="margin: 0 0 15px 0; font-size: 15px; color: #0f172a;">⚖️ Saldi dei Partecipanti</h4>
                ${saldiHtml}
            </div>
        </div>`;
}

// Variabili globali per distruggere i vecchi grafici quando si filtra
let chartTrend = null;
let chartCat = null;

function apriDashboardInterattiva() {
    document.getElementById('modalDashboard').classList.add('show');
    document.getElementById('kpiDashboard').innerHTML = '<div style="padding: 20px; font-weight: bold; color: #3b82f6;">⏳ Sincronizzazione Gruppi Live e Archivio Storico in corso...</div>';

    chiamaServer("getStatisticheGruppiLive").then(function(gruppiLive) {
        window.datiDashboardCombinati = [];
        if (gruppiLive && gruppiLive.length > 0) {
            gruppiLive.forEach(g => {
                window.datiDashboardCombinati.push({
                    nome: "🟢 [LIVE] " + g.nome + " " + g.anno, 
                    dataSalvataggio: "Oggi", 
                    jsonDati: JSON.stringify(g)
                });
            });
        }
        if (window.archivioReportGlobale) {
            window.archivioReportGlobale.forEach(rep => {
                window.datiDashboardCombinati.push(rep);
            });
        }
        disegnaGraficiAvanzati();
    });
}

function chiudiDashboard() {
    document.getElementById('modalDashboard').classList.remove('show');
}

function disegnaGraficiAvanzati() {
    const filtroAnno = document.getElementById('filtroAnnoDash').value;
    const isProCapite = document.getElementById('toggleProCapite').checked;
    const reports = window.datiDashboardCombinati || [];
    
    let eventiFiltrati = [];
    let categorieSommate = {};
    let spesaTotaleGlobale = 0;

    // 1. Estrazione dati e calcolo (Totale vs Pro Capite)
    reports.forEach(rep => {
        let matchAnno = rep.nome.match(/\d{4}/);
        let annoRep = matchAnno ? parseInt(matchAnno[0]) : 0; // Trasformato in numero per ordinamento
        
        if (filtroAnno === 'ALL' || filtroAnno === annoRep.toString()) {
            let datiJson = JSON.parse(rep.jsonDati);
            let nomeClean = datiJson.nome.replace('Esportazione Splitwise per ', '').replace('.csv', '');
            
            // Conta quanti partecipanti c'erano in QUESTO viaggio
            let numPersone = Object.keys(datiJson.saldi).length || 1;
            
            // Se la levetta è attiva, divide il costo del viaggio per i partecipanti
            let costoDaMostrare = isProCapite ? (datiJson.totale / numPersone) : datiJson.totale;

            eventiFiltrati.push({
                nome: nomeClean,
                anno: annoRep,
                totale: costoDaMostrare,
                categorie: datiJson.categorie,
                numPersone: numPersone
            });

            spesaTotaleGlobale += costoDaMostrare;

            for (let [cat, importo] of Object.entries(datiJson.categorie)) {
                let importoCat = isProCapite ? (importo / numPersone) : importo;
                if (!categorieSommate[cat]) categorieSommate[cat] = 0;
                categorieSommate[cat] += importoCat;
            }
        }
    });

    // --- ORDINAMENTO CRONOLOGICO RIGOROSO (Dal più vecchio al più recente) ---
    eventiFiltrati.sort((a, b) => a.anno - b.anno);

    // --- Raggruppamento "Altro" (< 4%) ---
    let categorieRaggruppate = {};
    let totaleAltro = 0;
    const SOGLIA_PERCENTUALE = 0.04;

    for (let [cat, importo] of Object.entries(categorieSommate)) {
        if (importo / spesaTotaleGlobale < SOGLIA_PERCENTUALE) {
            totaleAltro += importo;
        } else {
            categorieRaggruppate[cat] = Math.round(importo * 100) / 100;
        }
    }
    
    if (totaleAltro > 0) {
        categorieRaggruppate['Altro (Sotto 4%)'] = Math.round(totaleAltro * 100) / 100;
    }

    // --- POPOLAMENTO CARD (KPI) IN CIMA ---
    let numViaggi = eventiFiltrati.length;
    let mediaViaggio = numViaggi > 0 ? (spesaTotaleGlobale / numViaggi) : 0;
    
    // Trova la categoria con spesa più alta
    let topCatNome = "-";
    let topCatValore = 0;
    for (let [cat, val] of Object.entries(categorieSommate)) {
        if (val > topCatValore) { topCatValore = val; topCatNome = cat; }
    }

    document.getElementById('kpiDashboard').innerHTML = `
        <div style="background: white; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; border-left: 4px solid #3b82f6; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Spesa ${isProCapite ? 'Pro Capite' : 'Totale'}</div>
            <div style="font-size: 26px; font-weight: 800; color: #0f172a; margin-top: 5px;">€ ${spesaTotaleGlobale.toFixed(2)}</div>
        </div>
        <div style="background: white; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; border-left: 4px solid #10b981; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Media per Viaggio</div>
            <div style="font-size: 26px; font-weight: 800; color: #0f172a; margin-top: 5px;">€ ${mediaViaggio.toFixed(2)}</div>
        </div>
        <div style="background: white; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; border-left: 4px solid #f59e0b; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Categoria Top</div>
            <div style="font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${topCatNome}</div>
        </div>
    `;

    // --- Preparazione array per Chart.js ---
    let etichetteEventi = eventiFiltrati.map(e => e.nome);
    let costiTotaliEventi = eventiFiltrati.map(e => e.totale);
    let etichetteCat = Object.keys(categorieRaggruppate);
    let datiCat = Object.values(categorieRaggruppate);

    if (chartTrend) chartTrend.destroy();
    if (chartCat) chartCat.destroy();

    // GRAFICI (Con filtri incrociati che rispettano il toggle Pro Capite)
    const ctxTrend = document.getElementById('chartTrendEventi').getContext('2d');
    chartTrend = new Chart(ctxTrend, {
        type: 'bar',
        data: {
            labels: etichetteEventi,
            datasets: [{
                label: `Costo ${isProCapite ? 'Pro Capite' : 'Totale'} (€)`,
                data: costiTotaliEventi,
                backgroundColor: 'rgba(99, 102, 241, 0.8)',
                borderRadius: 6,
            }]
        },
        options: { responsive: true, plugins: { legend: { display: true } }, scales: { y: { beginAtZero: true } } }
    });

    const ctxCat = document.getElementById('chartCategorieGlobali').getContext('2d');
    chartCat = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
            labels: etichetteCat,
            datasets: [{
                data: datiCat,
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#94a3b8'],
                borderWidth: 2, borderColor: '#ffffff'
            }]
        },
        options: { 
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { boxWidth: 12 } } },
            onClick: function(event, activeElements) {
                if (activeElements.length > 0) {
                    let indexFetta = activeElements[0].index;
                    let categoriaCliccata = this.data.labels[indexFetta];
                    let coloreFetta = this.data.datasets[0].backgroundColor[indexFetta];
                    
                    let costiFiltrati = eventiFiltrati.map(ev => {
                        let divisore = isProCapite ? ev.numPersone : 1;
                        if (categoriaCliccata === 'Altro (Sotto 4%)') {
                            let costoAltro = 0;
                            for (let [c, imp] of Object.entries(ev.categorie)) {
                                if (!etichetteCat.includes(c)) costoAltro += imp;
                            }
                            return Math.round((costoAltro / divisore) * 100) / 100;
                        } else {
                            return ev.categorie[categoriaCliccata] ? Math.round((ev.categorie[categoriaCliccata] / divisore) * 100) / 100 : 0;
                        }
                    });

                    chartTrend.data.datasets[0].data = costiFiltrati;
                    chartTrend.data.datasets[0].label = `Spesa: ${categoriaCliccata} (€)`;
                    chartTrend.data.datasets[0].backgroundColor = coloreFetta;
                    chartTrend.update();
                } else {
                    chartTrend.data.datasets[0].data = costiTotaliEventi;
                    chartTrend.data.datasets[0].label = `Costo ${isProCapite ? 'Pro Capite' : 'Totale'} (€)`;
                    chartTrend.data.datasets[0].backgroundColor = 'rgba(99, 102, 241, 0.8)';
                    chartTrend.update();
                }
            }
        }
    });
}

// ==========================================
// FUNZIONE PER SCATTARE LA FOTO ALLA DASHBOARD
// ==========================================
function esportaDashboard(btn) {
    let testoOriginale = btn.innerHTML;
    btn.innerHTML = "⏳ Generazione...";
    
    let contenitore = document.getElementById('areaDaEsportare');
    
    // Scatta una "foto" al div usando html2canvas
    html2canvas(contenitore, { scale: 2 }).then(canvas => {
        let urlImmagine = canvas.toDataURL("image/png");
        let link = document.createElement('a');
        link.download = `Dashboard_Spese_Gens.png`;
        link.href = urlImmagine;
        link.click();
        
        btn.innerHTML = testoOriginale;
        showToast("Immagine scaricata con successo!", "success");
    }).catch(err => {
        btn.innerHTML = testoOriginale;
        showToast("Errore durante l'esportazione.", "error");
    });
}

// --- NUOVA GESTIONE ELEZIONI MULTIPLE (ADMIN) ---

function apriModaleCreaElezione() {
    document.getElementById('modalCreaElezione').classList.remove('hidden');
    // Precompila le date per comodità (Oggi fino a domani)
    let oggi = new Date();
    let domani = new Date(oggi.getTime() + (24 * 60 * 60 * 1000));
    // Formattiamo per l'input datetime-local (YYYY-MM-DDThh:mm)
    document.getElementById('nuovaElezioneInizio').value = oggi.toISOString().slice(0, 16);
    document.getElementById('nuovaElezioneFine').value = domani.toISOString().slice(0, 16);
}

function chiudiModaleCreaElezione() {
    document.getElementById('modalCreaElezione').classList.add('hidden');
    document.getElementById('nuovaElezioneTitolo').value = "";
    document.getElementById('nuovaElezioneOpzioni').value = "";
}

function toggleOpzioniElezione() {
    var tipo = document.getElementById('nuovaElezioneTipo').value;
    var bloccoRef = document.getElementById('bloccoOpzioniReferendum');
    var bloccoOdg = document.getElementById('bloccoPuntiOdg');
    var bloccoCand = document.getElementById('bloccoDateCandidature');
    
    // Nascondi tutto prima
    bloccoRef.classList.add('hidden');
    bloccoOdg.classList.add('hidden');
    bloccoCand.classList.add('hidden');
    
    if (tipo === 'REFERENDUM') {
        bloccoRef.classList.remove('hidden');
    } else if (tipo === 'ASSEMBLEA') {
        bloccoOdg.classList.remove('hidden');
    } else {
        bloccoCand.classList.remove('hidden');
    }
}

function salvaNuovaElezione() {
    var dati = {
        adminEmail: curEmail,
        titolo: document.getElementById('nuovaElezioneTitolo').value,
        tipo: document.getElementById('nuovaElezioneTipo').value,
        inizio: document.getElementById('nuovaElezioneInizio').value,
        fine: document.getElementById('nuovaElezioneFine').value,
        maxVoti: parseInt(document.getElementById('nuovaElezioneMax').value) || 1,
        opzioniFisse: document.getElementById('nuovaElezioneOpzioni').value,
        puntiOdg: document.getElementById('nuovaElezioneOdg').value,
        quorumC: parseFloat(document.getElementById('quorumCostitutivo').value) || 50,
        quorumD: parseFloat(document.getElementById('quorumDeliberativo').value) || 51,
        candInizio: document.getElementById('nuovaElezioneCandInizio').value,
        candFine: document.getElementById('nuovaElezioneCandFine').value
    };

    if (!dati.titolo || !dati.inizio || !dati.fine) {
        return showToast("Titolo e Date Votazione sono obbligatori!", "error");
    }

    showToast("Creazione in corso...", "info");

    chiamaServer("adminCreaNuovaElezioneAvanzata", dati).then(function(res) {
        if(res === "OK") {
            showToast("Consultazione creata con successo!", "success");
            chiudiModaleCreaElezione();
            caricaCampagneAdmin();
        } else {
            showToast("Errore: " + res, "error");
        }
    });
}



function caricaCandidatureAdmin() {
    var container = document.getElementById('listaCandidaturePendentiAdmin');
    if (!container) return;
    
    container.innerHTML = '<div class="loader"></div>';

    chiamaServer("adminGetCandidaturePendenti", curEmail).then(function(list) {
        if (!list || list.length === 0) {
            container.innerHTML = "<p style='color:#64748b; font-size:13px; padding:10px;'>Nessuna candidatura in attesa di approvazione.</p>";
            return;
        }

        var html = "";
        list.forEach(c => {
            var dataStr = c.data ? new Date(c.data).toLocaleString('it-IT') : "Data sconosciuta";
            
            html += `
            <div style="border:1px solid #e2e8f0; padding:15px; border-radius:8px; background:#f8fafc; display:flex; justify-content:space-between; align-items:start; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
                <div style="flex:1; min-width:250px;">
                    <div style="font-weight:bold; color:#0f172a; font-size:15px;">${c.nome} <span style="font-size:12px; font-weight:normal; color:#64748b;">(${c.email})</span></div>
                    <div style="font-size:11px; color:#64748b; margin:4px 0;">Ricevuta il: ${dataStr}</div>
                    
                    <div style="font-size:13px; color:#334155; margin:10px 0; padding:10px; background:white; border:1px dashed #cbd5e1; border-radius:6px;">
                        <b>Motivazione/Programma:</b><br>${c.motivazione || "<i>Nessuna motivazione inserita.</i>"}
                    </div>
                    
                    <div style="font-size:11px; background:#e0e7ff; color:#1e40af; padding:3px 8px; border-radius:4px; display:inline-block;">Rif. Consultazione: <b>${c.idElezione}</b></div>
                </div>
                
                <div style="display:flex; gap:8px;">
                    <button style="padding:8px 15px; font-size:12px; background:#16a34a; border:none; color:white; border-radius:6px; font-weight:bold; cursor:pointer;" onclick="processaCandidaturaAdmin(${c.rigaIndex}, 'APPROVA')">✔ APPROVA</button>
                    <button style="padding:8px 15px; font-size:12px; background:#dc2626; border:none; color:white; border-radius:6px; font-weight:bold; cursor:pointer;" onclick="processaCandidaturaAdmin(${c.rigaIndex}, 'RIFIUTA')">✖ RIFIUTA</button>
                </div>
            </div>`;
        });
        
        container.innerHTML = html;
    });
}

// ==========================================
// ADMIN: APPROVA O RIFIUTA CANDIDATURA (SENZA POPUP BRUTTI)
// ==========================================
function processaCandidaturaAdmin(rigaIndex, azione) {
    var testoAzione = azione === 'APPROVA' ? 'approvare' : 'rifiutare';
    
    // Usiamo il nostro nuovo e bellissimo modale di conferma!
    showCustomConfirm("Confermi di voler " + testoAzione + " questa candidatura?", function() {
        
        // Se l'utente clicca Conferma, parte il caricamento:
        showToast("Elaborazione in corso...", "info");
        
        chiamaServer("adminProcessaCandidatura", [curEmail, rigaIndex, azione]).then(function(res){
            if(res === "OK") {
                showToast("Candidatura " + (azione === 'APPROVA' ? 'approvata' : 'rifiutata') + " con successo!", "success");
                caricaCandidatureAdmin(); // Ricarica la lista
            } else {
                showToast("Errore: " + res, "error");
            }
        });
    });
}

// Carica e divide le campagne elettorali
function caricaCampagneAdmin() {
    var container = document.getElementById('listaCampagneAdmin');
    if (!container) return;
    container.innerHTML = '<div class="loader"></div>';

    chiamaServer("adminGetListaElezioni", curEmail).then(function(lista) {
        if (!lista || lista.length === 0) {
            container.innerHTML = '<p style="color:#64748b; font-size:13px; padding:15px;">Nessuna consultazione presente.</p>';
            return;
        }

        var htmlAttive = '<h4 style="margin: 0 0 10px 0; font-size: 14px; color: #16a34a;">Attive e Programmate</h4>';
        var htmlArchivio = '<h4 style="margin: 25px 0 10px 0; font-size: 14px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px;">Archivio Storico</h4>';
        
        var countAttive = 0;
        var countArchivio = 0;

        lista.forEach(function(c) {
            // Se lo stato in colonna H è "CHIUSA", va nell'archivio.
            var isChiusa = (c.statoForzato === "CHIUSA");

            var card = `
            <div style="border:1px solid #e2e8f0; padding:15px; border-radius:8px; background:${isChiusa ? '#f8fafc' : 'white'}; display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; opacity: ${isChiusa ? '0.8' : '1'};">
                <div style="flex:2; min-width:220px;">
                    <div style="font-weight:bold; color:#0f172a; font-size:15px; margin-bottom: 5px;">${c.titolo}</div>
                    <div style="font-size:12px; color:#64748b;">
                        <b>Tipo:</b> ${c.tipo} | <b>Voto:</b> ${c.inizioFmt} ➔ ${c.fineFmt}
                    </div>
                </div>
                
                <div style="display:flex; gap:8px; align-items:center;">`;

            // Bottoni per elezioni ATTIVE
            if (!isChiusa) {
                card += `
                    <button class="btn-primary" style="width:auto; padding:6px 12px; font-size:12px; background:#2563eb;" onclick="apriRisultatiLive('${c.id}')">📊 Risultati Live</button>
                    <button class="btn-primary" style="width:auto; padding:6px 12px; font-size:12px; background:#ca8a04;" onclick="chiudiEGeneraVerbale('${c.id}')">🔒 Chiudi e Stampa</button>
                    <button class="btn-danger" style="width:auto; padding:6px 12px; font-size:12px;" onclick="eliminaElezioneAdmin('${c.id}')">✖ Elimina</button>
                `;
                htmlAttive += card + `</div></div>`;
                countAttive++;
            } 
            // Bottoni per elezioni nell'ARCHIVIO
            else {
                // CONTROLLO NUOVO: Se c'è il link, apre una nuova scheda. Se non c'è, mostra la scritta di errore.
                if (c.urlVerbale) {
                    card += `<button class="btn-primary" style="background:#1e40af; color:white; padding:6px 12px; border-radius:4px; font-size:12px; border:none; font-weight:bold; cursor:pointer;" onclick="window.open('${c.urlVerbale}', '_blank')">📄 Apri Verbale</button>`;
                } else {
                    card += `<span style="font-size: 11px; color: #ef4444;">Verbale non disponibile</span>`;
                }
                
                htmlArchivio += card + `</div></div>`;
                countArchivio++;
            }
        });

        if(countAttive === 0) htmlAttive += '<p style="font-size:12px; color:#94a3b8;">Nessuna consultazione attiva.</p>';
        if(countArchivio === 0) htmlArchivio += '<p style="font-size:12px; color:#94a3b8;">Nessuna consultazione archiviata.</p>';

        container.innerHTML = htmlAttive + htmlArchivio;
    });
}

// Cerca dinamicamente il verbale su Drive e lo apre
function apriVerbale(idConsultazione) {
    showToast("Ricerca verbale in corso...", "info");
    
    chiamaServer("ottieniUrlVerbale", idConsultazione).then(function(risultato) {
        if (risultato === "FILE_NON_TROVATO") {
          showToast("Nessun verbale trovato per questa consultazione.", "error");
        } else if (risultato === "CARTELLA_NON_TROVATA") {
          showToast("La cartella di questa consultazione non esiste.", "error");
        } else if (risultato.startsWith("ERRORE")) {
          showToast("Errore del server: " + risultato, "error");
        } else {
          showToast("Verbale trovato!", "success");
          window.open(risultato, '_blank');
        }
      }); 
}

// Funzione che lancia la chiusura
function chiudiEGeneraVerbale(idElezione) {
    showCustomConfirm("Sei sicuro di voler chiudere l'elezione e generare il verbale PDF definitivo? L'azione è irreversibile.", function() {
        showToast("Generazione PDF in corso...", "info");
        chiamaServer("adminChiudiEGeneraVerbale", [curEmail, idElezione]).then(function(res) {
            if(res === "OK") {
                showToast("Elezione chiusa e verbale salvato!", "success");
                caricaCampagneAdmin(); // Ricarica la lista per spostarla in archivio
            } else {
                showToast(res, "error");
            }
        });
    });
}

// Funzione per eliminare una consultazione
function eliminaElezioneAdmin(idElezione) {
    if(!confirm("Sei sicuro di voler eliminare questa consultazione?")) return;
    showToast("Eliminazione in corso...", "info");
    chiamaServer("adminEliminaElezione", [curEmail, idElezione]).then(function(res){
        if(res === "OK") {
            showToast("Consultazione eliminata.", "success");
            caricaCampagneAdmin();
        } else {
            showToast("Errore: " + res, "error");
        }
    });
}

// Carica la schermata del Centro Elettorale per il socio
function caricaCentroElettorale() {
    var divAttive = document.getElementById('elencoAttive');
    var divProgrammate = document.getElementById('elencoProgrammate');
    var divArchivio = document.getElementById('elencoArchivio');
    var areaCand = document.getElementById('areaCandContent');
    
    // Mostriamo un loader visivo nei tre contenitori
    if (divAttive) divAttive.innerHTML = '<div class="loader"></div>';
    if (divProgrammate) divProgrammate.innerHTML = '<p style="color:#64748b; font-size:12px;">Caricamento...</p>';
    if (divArchivio) divArchivio.innerHTML = '<p style="color:#64748b; font-size:12px;">Caricamento...</p>';
    if (areaCand) areaCand.innerHTML = '<p style="color: #64748b; font-size: 13px; text-align: center; padding: 10px;">Caricamento candidature...</p>';

    // 1. Carica le consultazioni dal server
    chiamaServer("getConsultazioniAttiveUtente", curEmail).then(function(lista) {
        
        var htmlAttive = '';
        var htmlProgrammate = '';
        var htmlArchivio = '';
        
        var countAttive = 0, countProgrammate = 0, countArchivio = 0;

        // Se non ci sono dati in assoluto dal DB
        if (!lista || lista.length === 0) {
            if(divAttive) divAttive.innerHTML = '<p style="color: #64748b; font-size: 13px;">Nessuna consultazione presente.</p>';
            if(divProgrammate) divProgrammate.innerHTML = '<p style="color: #64748b; font-size: 13px;">Nessuna assemblea futura in programma.</p>';
            if(divArchivio) divArchivio.innerHTML = '<p style="color: #64748b; font-size: 13px;">Archivio vuoto.</p>';
            return;
        }

        // Smistamento logico
        lista.forEach(function(item) {
            
            // ARCHIVIO STORICO
            if (item.categoria === "ARCHIVIO") {
                var btnVerbale = item.urlVerbale 
                    ? `<button class="btn-primary" style="background:#1e40af; color:white; padding:6px 12px; border-radius:4px; font-size:12px; border:none; font-weight:bold; cursor:pointer;" onclick="window.open('${item.urlVerbale}', '_blank')">📄 Apri Verbale</button>`
                    : `<span style="font-size: 11px; color: #ef4444;">Verbale non disponibile</span>`;

                htmlArchivio += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
                        <div>
                            <div style="font-weight: bold; font-size: 14px; color: #0f172a;">${item.titolo}</div>
                            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Tipo: <b>${item.tipo}</b> | Chiusa il: ${item.fineFmt}</div>
                        </div>
                        <div>${btnVerbale}</div>
                    </div>
                `;
                countArchivio++;
            } 
            
            // PROGRAMMATE (Future)
            else if (item.categoria === "PROGRAMMATE") {
                htmlProgrammate += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px dashed #cbd5e1; border-radius: 8px; background: #fffbeb;">
                        <div>
                            <div style="font-weight: bold; font-size: 14px; color: #b45309;">${item.titolo}</div>
                            <div style="font-size: 11px; color: #92400e; margin-top: 2px;">Inizio previsto: <b>${item.inizioFmt}</b></div>
                        </div>
                        <div><span style="font-size:11px; font-weight:bold; color:#b45309; background:#fef3c7; padding:4px 8px; border-radius:4px;">IN ARRIVO</span></div>
                    </div>
                `;
                countProgrammate++;
            }
            
            // ATTIVE (Ora in corso o da votare)
            else {
                var btnAzione = '';
                if (item.statoVoto === 'APERTA') {
                    btnAzione += `<button class="btn-primary" style="padding: 6px 12px; font-size: 12px; width:auto; background:#2563eb;" onclick="apriCabinaElettorale('${item.id}', '${item.titolo}')">ENTRA IN CABINA</button>`;
                    
                    if (item.tipo === "ASSEMBLEA") {
                        btnAzione += `<button class="btn-secondary" style="margin-left: 8px; background: #f59e0b; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;" onclick="apriModaleOdG('${item.id}')">✍️ Proponi OdG</button>`;
                    }
                } else {
                    btnAzione = `<span style="font-size: 11px; font-weight: bold; color: #64748b; background:#f1f5f9; padding:4px 8px; border-radius:4px;">${item.statoVoto}</span>`;
                }

                htmlAttive += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid #10b981; border-radius: 8px; background: #f0fdf4;">
                        <div>
                            <div style="font-weight: bold; font-size: 14px; color: #065f46;">${item.titolo}</div>
                            <div style="font-size: 11px; color: #047857; margin-top: 2px;">Scadenza: <b>${item.fineFmt}</b></div>
                        </div>
                        <div>${btnAzione}</div>
                    </div>
                `;
                countAttive++;
            }
        });

        // Controlli di sicurezza se una categoria è vuota
        if(countAttive === 0) htmlAttive = '<p style="font-size:12px; color:#64748b;">Nessuna votazione in corso al momento.</p>';
        if(countProgrammate === 0) htmlProgrammate = '<p style="font-size:12px; color:#64748b;">Nessuna assemblea futura programmata.</p>';
        if(countArchivio === 0) htmlArchivio = '<p style="font-size:12px; color:#64748b;">Nessun verbale archiviato.</p>';

        // Stampa a schermo nei 3 div separati
        if(divAttive) divAttive.innerHTML = htmlAttive;
        if(divProgrammate) divProgrammate.innerHTML = htmlProgrammate;
        if(divArchivio) divArchivio.innerHTML = htmlArchivio;

    });

    // 2. Carica il box per inviare la propria candidatura (Invariato)
    chiamaServer("getElezioniPerCandidatura", curEmail).then(function(elezioni) {
        if (!elezioni || elezioni.length === 0) {
            if(areaCand) areaCand.innerHTML = '<p style="color: #64748b; font-size: 13px; text-align: center; padding: 10px;">Nessuna candidatura aperta in questo momento.</p>';
            return;
        }

        var opts = '<option value="">-- Seleziona elezione --</option>';
        elezioni.forEach(function(e) {
            opts += `<option value="${e.id}">${e.titolo}</option>`;
        });

        if(areaCand) areaCand.innerHTML = `
            <div class="input-group">
                <label class="form-label">Seleziona Elezione</label>
                <select id="candElezioneSelect" class="form-input">${opts}</select>
            </div>
            <div class="input-group">
                <label class="form-label">Motivazione / Programma</label>
                <textarea id="candMotivazione" class="form-input" placeholder="Perché ti candidi?" style="height: 80px; resize:vertical;"></textarea>
            </div>
            <button class="btn-primary" onclick="inviaCandidaturaUtente()" style="width: 100%; margin-top: 5px;">INVIA CANDIDATURA</button>
        `;
    });
    
    // 3. Carica anche la lista dei soci per il blocco sponsor (Invariato)
    chiamaServer("getListaSociPerSponsor").then(function(soci) {
        var select = document.getElementById('candSponsor2');
        if(!select) return;
        var opts = '<option value="">-- Seleziona socio garante --</option>';
        soci.forEach(function(s) {
            opts += `<option value="${s.email}">${s.nomeCompleto}</option>`;
        });
        select.innerHTML = opts;
    });
}

var elezioneCorrenteId = null;
var tipoElezioneCorrente = null;

// Entra nella cabina elettorale (Modale con supporto Tabella OdG per Assemblee)
function apriCabinaElettorale(idElezione, titolo) {
    elezioneCorrenteId = idElezione;
    
    var modal = document.getElementById('modalCabinaElettorale');
    if (!modal) {
        // ... (il codice di creazione del modale rimane identico) ...
        var divModale = document.createElement('div');
        divModale.id = 'modalCabinaElettorale';
        divModale.className = 'fullscreen-view hidden';
        divModale.style.cssText = 'background: rgba(15, 23, 42, 0.8); z-index: 9500; position: fixed; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center;';
        divModale.innerHTML = `
            <div class="auth-card" style="max-width: 700px; width:90%; background:white; padding:25px; border-radius:12px; text-align: left; max-height: 90vh; overflow-y: auto;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px;">
                    <div>
                        <h3 id="cabinaTitoloElezione" style="margin:0; font-size:18px; color:#0f172a;">Cabina Elettorale</h3>
                        <span id="cabinaTipoElezione" style="font-size:11px; background:#eff6ff; color:#1d4ed8; padding:2px 8px; border-radius:4px; font-weight:bold;">TIPO</span>
                    </div>
                    <span style="cursor:pointer; font-size:20px; color:#64748b;" onclick="chiudiCabinaElettorale()">✖</span>
                </div>
                <div id="cabinaContenutoDinamico" style="margin-bottom: 20px;">
                    <div class="loader"></div>
                </div>
                <div style="margin-top:25px; display:flex; gap:10px; justify-content:flex-end; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                    <button class="btn-secondary" style="width:auto; padding:10px 20px;" onclick="chiudiCabinaElettorale()">Annulla</button>
                    <button class="btn-primary" style="width:auto; padding:10px 20px; background:#16a34a;" onclick="confermaInvioVoto()">CONFERMA E INVIA VOTO</button>
                </div>
            </div>
        `;
        document.body.appendChild(divModale);
        modal = divModale;
    }

    modal.classList.remove('hidden');
    document.getElementById('cabinaTitoloElezione').innerText = titolo;
    document.getElementById('cabinaContenutoDinamico').innerHTML = '<div class="loader"></div>';

    chiamaServer("checkStatoVotoCampagna", [curEmail, idElezione]).then(function(res) {
        if (typeof res === 'string') {
            showToast(res, "error"); // SOSTITUITO ALERT
            chiudiCabinaElettorale();
            return;
        }

        tipoElezioneCorrente = res.tipo;
        document.getElementById('cabinaTipoElezione').innerText = res.tipo;
        document.getElementById('cabinaTitoloElezione').innerText = res.titolo;

        var container = document.getElementById('cabinaContenutoDinamico');
        var html = '';

        if (res.tipo === 'CANDIDATI' || res.tipo === 'REFERENDUM') {
            html += `<p style="font-size: 13px; color: #475569; margin-bottom: 15px;">Esprimi fino a <b>${res.maxVoti}</b> preferenze:</p>`;
            res.opzioni.forEach(function(opz) {
                var inputType = res.maxVoti > 1 ? 'checkbox' : 'radio';
                html += `
                    <label style="display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 8px; cursor: pointer; background: #f8fafc;">
                        <input type="${inputType}" name="sceltaVoto" value="${opz}" style="width: 18px; height: 18px;">
                        <span style="font-size: 14px; font-weight: 500; color: #0f172a;">${opz}</span>
                    </label>
                `;
            });
        } else if (res.tipo === 'ASSEMBLEA') {
            html += `<p style="font-size: 13px; color: #475569; margin-bottom: 15px;">Esprimi il tuo voto punto per punto all'Ordine del Giorno:</p>`;
            html += `
                <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; font-size: 13px;">
                    <tr style="background: #f1f5f9;">
                        <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">Punto all'Ordine del Giorno</th>
                        <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; width: 240px;">Esprimi Voto</th>
                    </tr>
            `;
            res.opzioni.forEach(function(punto, index) {
                html += `
                    <tr class="riga-odg" data-punto="${punto}">
                        <td style="padding: 12px; border: 1px solid #e2e8f0; color: #0f172a; font-weight: 500;">${punto}</td>
                        <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: center;">
                            <div style="display: flex; gap: 4px; justify-content: center;">
                                <label style="font-size:11px; cursor:pointer; background:#dcfce7; padding:4px 6px; border-radius:4px; color:#166534;"><input type="radio" name="punto_${index}" value="Favorevole" checked> Fav.</label>
                                <label style="font-size:11px; cursor:pointer; background:#fee2e2; padding:4px 6px; border-radius:4px; color:#991b1b;"><input type="radio" name="punto_${index}" value="Contrario"> Contr.</label>
                                <label style="font-size:11px; cursor:pointer; background:#f1f5f9; padding:4px 6px; border-radius:4px; color:#475569;"><input type="radio" name="punto_${index}" value="Astenuto"> Ast.</label>
                            </div>
                        </td>
                    </tr>
                `;
            });
            html += `</table>`;
        }

        container.innerHTML = html;
    });
}

function chiudiCabinaElettorale() {
    var modal = document.getElementById('modalCabinaElettorale');
    if (modal) modal.classList.add('hidden');
    elezioneCorrenteId = null;
}

// Conferma e invia il voto
function confermaInvioVoto() {
    var scelte = [];

    if (tipoElezioneCorrente === 'ASSEMBLEA') {
        var righe = document.querySelectorAll('.riga-odg');
        righe.forEach(function(riga, index) {
            var punto = riga.getAttribute('data-punto');
            var selezionato = riga.querySelector(`input[name="punto_${index}"]:checked`);
            if (selezionato) {
                scelte.push(punto + " [" + selezionato.value + "]");
            }
        });
    } else {
        var checked = document.querySelectorAll('input[name="sceltaVoto"]:checked');
        checked.forEach(function(el) {
            scelte.push(el.value);
        });
    }

    if (scelte.length === 0) {
        showToast("Seleziona almeno una preferenza o esprimi il voto sui punti dell'ordine del giorno.", "warning"); // SOSTITUITO ALERT
        return;
    }

    var datiVoto = {
        email: curEmail,
        password: curPass,
        idElezione: elezioneCorrenteId,
        scelte: scelte
    };

    chiamaServer("riceviVotoCampagna", datiVoto).then(function(res) {
        if (res === "SUCCESS") {
            showToast("Voto registrato con successo!", "success"); // SOSTITUITO ALERT
            chiudiCabinaElettorale();
            caricaCentroElettorale();
        } else if (res === "GIA_VOTATO") {
            showToast("Hai già votato per questa consultazione!", "warning");
        } else {
            showToast("Errore: " + res, "error"); // SOSTITUITO ALERT
        }
    });
}

function inviaCandidaturaUtente() {
    var selectEl = document.getElementById('candElezioneSelect');
    var motivazioneEl = document.getElementById('candMotivazione');
    
    if(!selectEl || !motivazioneEl) return;
    
    var idElezione = selectEl.value;
    var motivazione = motivazioneEl.value;

    if (!idElezione || !motivazione) {
        showToast("Seleziona un'elezione e inserisci una motivazione.", "warning"); // SOSTITUITO ALERT
        return;
    }

    chiamaServer("inviaCandidatura", { email: curEmail, idElezione: idElezione, motivazione: motivazione }).then(function(res) {
        if (res === "OK") {
            showToast("Candidatura inviata in attesa di approvazione!", "success"); // SOSTITUITO ALERT
            motivazioneEl.value = '';
            caricaCentroElettorale();
        } else if (res === "GIA_FATTO") {
            showToast("Ti sei già candidato per questa elezione!", "warning"); // GESTIONE SPECIFICA GIA FATTO
        } else {
            showToast("Errore: " + res, "error"); // SOSTITUITO ALERT
        }
    });
}

// Gestione del popup di conferma personalizzato
var confirmCallback = null;

function showCustomConfirm(messaggio, callback) {
    document.getElementById('customConfirmMessage').innerText = messaggio;
    confirmCallback = callback;
    document.getElementById('customConfirmModal').classList.remove('hidden');
}

function closeCustomConfirm() {
    document.getElementById('customConfirmModal').classList.add('hidden');
    confirmCallback = null;
}

// Azione sul bottone "Conferma"
document.getElementById('customConfirmBtn').addEventListener('click', function() {
    if (confirmCallback) confirmCallback();
    closeCustomConfirm();
})

// Variabile globale per far funzionare la barra di ricerca
var listaSociGlobale = []; 

// 1. Chiama il server e scarica i soci
function caricaDatiGestioneSoci() {
    var tbody = document.getElementById('tabellaSociAdmin');
    if(tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;"><div class="loader"></div></td></tr>';

    chiamaServer("getDashboardAdmin", curEmail).then(function(res) {
        if (res && res.listaSoci) {
            listaSociGlobale = res.listaSoci; // Salva in memoria per la ricerca
            disegnaTabellaSoci(listaSociGlobale);
        }
    });
}

// 2. Disegna la tabella fisicamente sullo schermo
function disegnaTabellaSoci(lista) {
    var tbody = document.getElementById('tabellaSociAdmin'); 
    if (!tbody) return; 
    
    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#64748b;">Nessun socio trovato.</td></tr>';
        return;
    }

    var html = '';
    lista.forEach(function(s) {
        var badgeStato = s.stato === 'attivo' ? 
            '<span style="background:#dcfce7; color:#166534; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:bold;">ATTIVO</span>' : 
            '<span style="background:#fee2e2; color:#991b1b; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:bold;">NON ATTIVO</span>';

        html += `
        <tr style="border-bottom: 1px solid #e2e8f0; background: white;">
            <td style="padding:12px;">
                <div style="font-weight:bold; color:#0f172a;">${s.nome} ${s.cognome}</div>
                <div style="font-size:11px; color:#64748b;">${s.email}</div>
            </td>
            <td style="padding:12px; font-family:monospace; color:#475569; font-weight:bold;">${s.tessera}</td>
            <td style="padding:12px;">${badgeStato}</td>
            <td style="padding:12px; color:#475569;">${s.ruolo}</td>
            <td style="padding:12px; text-align:right;">
                <button class="btn-primary" style="padding:6px 12px; font-size:11px; width:auto; background:#2563eb;" onclick="apriModificaSocio('${s.tessera}')">Modifica</button>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

// 3. Il motore della barra di ricerca
function filtraSoci(testo) {
    var query = testo.toLowerCase().trim();
    if (query === "") {
        disegnaTabellaSoci(listaSociGlobale); // Se cancelli il testo, mostra tutti
        return;
    }
    
    var filtrati = listaSociGlobale.filter(function(s) {
        var nomeCompleto = (s.nome + " " + s.cognome).toLowerCase();
        var email = s.email.toLowerCase();
        return nomeCompleto.includes(query) || email.includes(query);
    });
    
    disegnaTabellaSoci(filtrati);
}

function apriRisultatiLive(idElezione) {
    document.getElementById('modalRisultatiLive').classList.remove('hidden');
    document.getElementById('risultatiBars').innerHTML = '<div class="loader"></div>';
    document.getElementById('risultatiStats').innerHTML = '';
    document.getElementById('risultatiTitolo').innerText = 'Recupero dati in corso...';
    document.getElementById('risultatiSottotitolo').innerText = '';

    chiamaServer("adminGetRisultatiLive", [curEmail, idElezione]).then(function(data) {
        if(typeof data === 'string') {
            showToast(data, "error");
            chiudiRisultatiLive();
            return;
        }

        document.getElementById('risultatiTitolo').innerText = data.titolo;
        document.getElementById('risultatiSottotitolo').innerText = "Voto in diretta - Tipo: " + data.tipo;

        // 1. Box Statistiche Quorum & Affluenza
        var bgQuorum = data.quorumRaggiunto ? '#dcfce7' : '#fee2e2';
        var colorQuorum = data.quorumRaggiunto ? '#16a34a' : '#dc2626';
        var testoQuorum = data.quorumRaggiunto ? 'RAGGIUNTO' : 'NON RAGGIUNTO';

        document.getElementById('risultatiStats').innerHTML = `
            <div style="flex: 1; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #0f172a;">${data.votanti} <span style="font-size: 14px; color: #64748b; font-weight: normal;">/ ${data.aventiDiritto}</span></div>
                <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Affluenza Votanti</div>
            </div>
            <div style="flex: 1; background: ${bgQuorum}; padding: 15px; border-radius: 8px; border: 1px solid ${colorQuorum}; text-align: center;">
                <div style="font-size: 18px; font-weight: bold; color: ${colorQuorum}; margin-top: 5px;">${testoQuorum}</div>
                <div style="font-size: 11px; color: ${colorQuorum}; text-transform: uppercase; margin-top: 2px;">Quorum (${data.quorumNecessario} richiesti)</div>
            </div>
        `;

        // 2. Disegna le Barre di Progresso
        var htmlBars = '';
        if (data.risultati.length === 0) {
            htmlBars = '<p style="text-align:center; color:#64748b; padding: 20px; border: 1px dashed #cbd5e1; border-radius: 8px;">Nessun voto espresso finora.</p>';
        } else {
            // Usa il voto più alto come 100% per proporzionare le barre visivamente
            var maxVoti = Math.max(...data.risultati.map(r => r.voti));

            data.risultati.forEach(function(r) {
                var percAssoluta = (r.voti / data.votanti * 100).toFixed(1);
                var widthBarra = (r.voti / maxVoti * 100).toFixed(1); // Per la larghezza CSS

                htmlBars += `
                <div>
                    <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; color: #334155; margin-bottom: 5px;">
                        <span style="flex: 1; padding-right: 10px;">${r.opzione}</span>
                        <span>${r.voti} voti <span style="color:#64748b; font-weight:normal;">(${percAssoluta}%)</span></span>
                    </div>
                    <div style="background: #e2e8f0; height: 10px; border-radius: 5px; overflow: hidden;">
                        <div style="background: #3b82f6; height: 100%; width: ${widthBarra}%; border-radius: 5px;"></div>
                    </div>
                </div>
                `;
            });
        }
        document.getElementById('risultatiBars').innerHTML = htmlBars;

    });
}

function chiudiRisultatiLive() {
    document.getElementById('modalRisultatiLive').classList.add('hidden');
}

// Apre il modale per l'OdG
function apriModaleOdG(idElezione) {
    document.getElementById('odgIdElezione').value = idElezione;
    document.getElementById('odgTitolo').value = "";
    document.getElementById('odgDettaglio').value = "";
    document.getElementById('modalProponiOdG').classList.remove('hidden');
}

function chiudiModaleOdG() {
    document.getElementById('modalProponiOdG').classList.add('hidden');
}

// Manda i dati al server
function inviaPropostaOdG() {
    var titolo = document.getElementById('odgTitolo').value.trim();
    var dettaglio = document.getElementById('odgDettaglio').value.trim();
    var idElezione = document.getElementById('odgIdElezione').value;
    
    if (titolo === "" || dettaglio === "") {
        showToast("Compila sia il titolo che i dettagli della proposta.", "error");
        return;
    }
    
    showToast("Invio proposta in corso...", "info");
    
    var dati = {
        email: curEmail,
        idElezione: idElezione,
        titoloProposta: titolo,
        dettaglioProposta: dettaglio
    };
    
    chiamaServer("utenteAggiungeOdG", dati).then(function(res) {
        if (res === "OK") {
            showToast("Proposta aggiunta all'Ordine del Giorno!", "success");
            chiudiModaleOdG();
        } else {
            showToast(res, "error");
        }
    });
}

// --- NAVIGAZIONE CABINA ELETTORALE ---
function mostraCabinaElettorale() {
    // 1. Nascondiamo la dashboard principale
    var dashboard = document.getElementById('vistaDashboard');
    if (dashboard) {
        dashboard.style.display = 'none';
    }
    
    // 2. Mostriamo la cabina elettorale
    var cabina = document.getElementById('vistaCabina');
    if (cabina) {
        cabina.style.display = 'block'; // È questa riga che la fa comparire!
    }
    
    // Opzionale: riporta la visuale in alto
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function tornaAllaDashboard() {
    // Nasconde la Cabina
    document.getElementById('vistaCabina').style.display = 'none';
    
    // Rimostra Dashboard e Candidatura
    document.getElementById('vistaDashboard').style.display = 'block';
    document.getElementById('colonnaCandidatura').style.display = 'block';
}

// Variabile globale per non dover ricaricare i dati quando si entra nel dettaglio
var cacheDatiBilancio = null; 

function caricaGraficoOverview() {
    chiamaServer("getDatiBilancioCompleto").then(function(dati){
        if(!dati) {
            document.getElementById('boxOverviewBilancio').innerHTML = "<p style='font-size:12px; color:#94a3b8;'>Nessun dato registrato</p>";
            return;
        }
        cacheDatiBilancio = dati; // Salviamo i dati per la schermata di dettaglio

        // Grafico a BARRE Orizzontali (Sintesi)
        var config = {
            type: 'horizontalBar',
            data: {
                labels: ['Flussi €'],
                datasets: [
                    { label: 'Entrate', data: [dati.totEntrate], backgroundColor: '#16a34a' },
                    { label: 'Uscite', data: [dati.totUscite], backgroundColor: '#dc2626' }
                ]
            },
            options: {
                legend: { position: 'bottom', labels: { boxWidth: 10, fontSize: 11 } },
                scales: { xAxes: [{ ticks: { beginAtZero: true, display: false }, gridLines: { display: false } }] },
                plugins: { datalabels: { display: true, color: 'white', font: { weight: 'bold' } } }
            }
        };
        var url = "https://quickchart.io/chart?c=" + encodeURIComponent(JSON.stringify(config)) + "&h=120";
        document.getElementById('boxOverviewBilancio').innerHTML = `<img src="${url}" style="width:100%; max-height:120px; object-fit:contain;">`;
    });
}

// Funzione per APRIRE il dettaglio del bilancio
function apriDettaglioBilancio() {
    // Nasconde tutte le sezioni
    document.querySelectorAll('.page-section').forEach(function(sez) {
        sez.classList.add('hidden');
    });

    // Mostra la sezione bilancio
    var dettaglio = document.getElementById('viewBilancioDettaglio');
    if (dettaglio) {
        dettaglio.classList.remove('hidden');
    }

    // Spegne il colore "active" dal menu laterale
    document.querySelectorAll('.nav-item').forEach(function(item) {
        item.classList.remove('active');
    });

    // Disegna i grafici se i dati sono pronti
    if(cacheDatiBilancio) {
        disegnaTorta('chartDettaglioEntrate', cacheDatiBilancio.dettEntrate, ['#16a34a', '#22c55e', '#4ade80', '#86efac']);
        disegnaTorta('chartDettaglioUscite', cacheDatiBilancio.dettUscite, ['#dc2626', '#ef4444', '#f87171', '#fca5a5']);
    }
}

// Funzione per TORNARE ALLA HOME in sicurezza
function chiudiDettaglioBilancio() {
    // Nasconde tutte le sezioni
    document.querySelectorAll('.page-section').forEach(function(sez) {
        sez.classList.add('hidden');
    });

    // Mostra la Dashboard
    var dash = document.getElementById('viewDash');
    if (dash) {
        dash.classList.remove('hidden');
    }

    // Riaccende il colore "active" sul primo tasto del menu laterale (Home)
    var menuItems = document.querySelectorAll('.nav-item');
    if(menuItems.length > 0) {
        menuItems.forEach(function(item) { item.classList.remove('active'); });
        menuItems[0].classList.add('active'); 
    }
}

// Funzione helper per disegnare le torte in QuickChart
function disegnaTorta(idContenitore, oggettoDati, colori) {
    var etichette = Object.keys(oggettoDati);
    var valori = Object.values(oggettoDati);
    
    if(etichette.length === 0) {
        document.getElementById(idContenitore).innerHTML = "<p style='color:#94a3b8; font-size:12px;'>Nessun movimento.</p>";
        return;
    }

    var config = {
        type: 'doughnut',
        data: { labels: etichette, datasets: [{ data: valori, backgroundColor: colori }] },
        options: {
            legend: { position: 'right', labels: { fontSize: 10, boxWidth: 10 } },
            plugins: { datalabels: { display: false } }
        }
    };
    var url = "https://quickchart.io/chart?c=" + encodeURIComponent(JSON.stringify(config)) + "&h=200";
    document.getElementById(idContenitore).innerHTML = `<img src="${url}" style="width:100%; height:auto;">`;
}


function salvaMovimentoComposto() {
    var data = document.getElementById('pdData') ? document.getElementById('pdData').value : '';
    var doc = document.getElementById('pdDoc') ? document.getElementById('pdDoc').value : '';
    var tipoAtt = document.getElementById('pdTipoAtt') ? document.getElementById('pdTipoAtt').value : '';
    
    var descInput = document.getElementById('pdDesc') || document.querySelector('input[placeholder*="Descrizione"]');
    var desc = descInput ? descInput.value : '';

    var controparteInput = document.getElementById('pdContro') || document.querySelector('input[placeholder*="Fornitore"]');
    var controparte = controparteInput ? controparteInput.value : '';

    var pivaInput = document.getElementById('pdCF');
    var piva = pivaInput ? pivaInput.value : '';

    var righe = [];
    var totDare = 0;
    var totAvere = 0;

    // Lettura dinamica reale dai campi presenti nella pagina
    var righeForm = document.querySelectorAll('#contenitoreRighePD > div');
    
    if (righeForm.length === 0) {
        // Seleziona i campi in base alla struttura effettiva delle righe contabili
        righeForm = document.querySelectorAll('.riga-movimento-pd, div[style*="display: flex"], div[style*="display:flex"]');
    }

    righeForm.forEach(function(riga) {
        var selectConto = riga.querySelector('select, input[type="text"]');
        var selectSezione = riga.querySelector('select:nth-of-type(2)') || riga.querySelector('.sezione');
        var inputImporto = riga.querySelector('input[type="number"], input[type="text"]:not([id])');

        // Se troviamo un conto e un importo valido in questa riga
        if (selectConto && inputImporto) {
            var conto = selectConto.value;
            // Legge se è DARE o AVERE dal selettore o dal testo visivo
            var sezione = selectSezione ? selectSezione.value.toUpperCase() : (riga.innerText.includes('DARE') ? 'DARE' : 'AVERE');
            var importo = parseFloat(inputImporto.value) || 0;

            if (conto && importo > 0) {
                righe.push({ conto: conto, sezione: sezione, importo: importo });
                if (sezione === 'DARE') totDare += importo;
                if (sezione === 'AVERE') totAvere += importo;
            }
        }
    });

    // Se per qualsiasi motivo la lettura automatica non aggancia le righe, leggiamo dai campi attivi del form
    if (righe.length === 0) {
        var contiSelezionati = document.querySelectorAll('.select-conto');
        var sezioniSelezionate = document.querySelectorAll('.select-sezione, select:not(.select-conto)');
        var importiInseriti = document.querySelectorAll('.input-importo, input[type="number"]');

        for (var i = 0; i < contiSelezionati.length; i++) {
            var c = contiSelezionati[i] ? contiSelezionati[i].value : '';
            var s = sezioniSelezionate[i] ? sezioniSelezionate[i].value.toUpperCase() : 'DARE';
            var imp = importiInseriti[i] ? parseFloat(importiInseriti[i].value) || 0 : 0;

            if (c && imp > 0) {
                righe.push({ conto: c, sezione: s, importo: imp });
                if (s === 'DARE') totDare += imp;
                if (s === 'AVERE') totAvere += imp;
            }
        }
    }

    if (!desc) {
        alert("Inserisci una descrizione generale.");
        return;
    }

    if (righe.length === 0) {
        alert("Aggiungi almeno una riga contabile valida.");
        return;
    }

    if (Math.abs(totDare - totAvere) > 0.01) {
        alert("Il movimento non quadra! Totale DARE e Totale AVERE devono coincidere.");
        return;
    }

    var btn = document.getElementById('btnSalvaPD');
    if(btn) { btn.disabled = true; btn.innerText = "Salvataggio in corso..."; }

    chiamaServer("registraMovimentoCompostoServer", { data: data, doc: doc, tipoAtt: tipoAtt, desc: desc, controparte: controparte, piva: piva, righe: righe }).then(function(risultato) {
        if(risultato) {
            alert("Registrazione completata con successo!");
            if(typeof aggiornaListaMovimentiPD === 'function') aggiornaListaMovimentiPD();
        } else {
            alert("Errore di salvataggio");
        }
        if(btn) { btn.disabled = false; btn.innerText = "Salva Movimento Quadrato"; }
    });
}


