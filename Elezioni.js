/// GESTIONALE ELETTORALE

function checkStatoVotoCampagna(email, idElezione) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioDb = ss.getSheetByName("Database_Elezioni");
  if (!foglioDb) return "ERR_DB";

  // 1. Trova la consultazione
  var datiElezioni = foglioDb.getDataRange().getValues();
  var campagna = null;
  for (var i = 1; i < datiElezioni.length; i++) {
    if (datiElezioni[i][0] === idElezione) {
      campagna = {
        id: datiElezioni[i][0],
        titolo: datiElezioni[i][1],
        tipo: datiElezioni[i][2], // CANDIDATI, REFERENDUM, ASSEMBLEA
        inizio: new Date(datiElezioni[i][3]),
        fine: new Date(datiElezioni[i][4]),
        maxVoti: datiElezioni[i][5] || 1,
        opzioni: datiElezioni[i][6] // Opzioni fisse o punti OdG
      };
      break;
    }
  }

  if (!campagna) return "NON_TROVATA";

  // 2. Controllo finestre temporali
  var adesso = new Date();
  if (adesso < campagna.inizio) return "NON_INIZIATA";
  if (adesso > campagna.fine) return "CHIUSE";

  // 3. Controllo se ha già votato usando l'Hash Univoco e l'ID Elezione
  var hashUtente = getHashUnivoco(email);
  if (!hashUtente) return "ERR_USER";

  var foglioVoti = ss.getSheetByName("voti");
  if (foglioVoti && foglioVoti.getLastRow() >= 2) {
    var datiVoti = foglioVoti.getDataRange().getValues();
    for (var j = 1; j < datiVoti.length; j++) {
      var votoHash = datiVoti[j][1];
      var votoIdElezione = datiVoti[j][3]; // Colonna D: ID Elezione
      if (votoHash === hashUtente && votoIdElezione === idElezione) {
        return "GIA_VOTATO";
      }
    }
  }

  // 4. Estrazione opzioni / candidati disponibili per questa consultazione
  var listaScelte = [];
  if (campagna.tipo === "REFERENDUM") {
    listaScelte = campagna.opzioni ? campagna.opzioni.split(",").map(function(s) { return s.trim(); }) : ["SI", "NO"];
  } else if (campagna.tipo === "ASSEMBLEA") {
    listaScelte = campagna.opzioni ? campagna.opzioni.split("\n").map(function(s) { return s.trim(); }).filter(Boolean) : [];
  } else if (campagna.tipo === "CANDIDATI") {
    // Pescati dal foglio candidature approvate per QUESTA elezione
    var foglioCand = ss.getSheetByName("candidature");
    if (foglioCand && foglioCand.getLastRow() >= 2) {
      var datiCand = foglioCand.getDataRange().getValues();
      for (var c = 1; c < datiCand.length; c++) {
        // Colonna E (indice 4) = ID Elezione, Colonna F (indice 5) = Esito APPROVATA
        if (datiCand[c][4] === idElezione && datiCand[c][5] && datiCand[c][5].toString().trim().toUpperCase() === "APPROVATA") {
          listaScelte.push(datiCand[c][2]); // Nome e Cognome del candidato (Colonna C)
        }
      }
    }
  }

  return {
    status: "PUO_VOTARE",
    titolo: campagna.titolo,
    tipo: campagna.tipo,
    maxVoti: campagna.maxVoti,
    opzioni: listaScelte
  };
}


function riceviVotoCampagna(datiVoto) {
  // 1. Verifica Credenziali
  if (verificaLogin({email: datiVoto.email, password: datiVoto.password}) !== "OK_LOGIN") {
    return "ERR_CREDENZIALI";
  }

  // 2. Acquisizione Lock (Semaforo per concorrenza)
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); 
  } catch (e) {
    return "ERRORE_SERVER_BUSY"; 
  }

  var esito = "SUCCESS";
  var emailChiara = datiVoto.email.trim().toLowerCase();
  var idElezione = datiVoto.idElezione;
  var preferenze = datiVoto.scelte; // Può essere una stringa o un array di scelte

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var foglioVoti = ss.getSheetByName("voti");
    if (!foglioVoti) {
      foglioVoti = ss.insertSheet("voti");
      foglioVoti.appendRow(["Data e ora", "Codice socio", "Voto", "Elezione"]);
    }

    var hashUtente = getHashUnivoco(emailChiara);
    
    // 3. Doppio controllo anti-furbi protetto dal lock (controlla la colonna D/indice 3 per l'ID elezione)
    var datiVoti = foglioVoti.getDataRange().getValues();
    for (var j = 1; j < datiVoti.length; j++) {
      if (datiVoti[j][1] == hashUtente && datiVoti[j][3] == idElezione) {
        lock.releaseLock();
        return "GIA_VOTATO";
      }
    }

    // Normalizzazione preferenze in array
    if (!Array.isArray(preferenze)) preferenze = [preferenze];

    // 4. Scrittura nel foglio voti: [Data, Hash, Preferenza, ID_Elezione]
    preferenze.forEach(function(pref) {
      foglioVoti.appendRow([
        new Date(),       // A: Data e ora
        hashUtente,       // B: Codice socio (Hash univoco)
        pref,             // C: Voto / Preferenza espressa
        idElezione        // D: Elezione (ID univoco della consultazione)
      ]);
    });

    scriviLog(emailChiara, "VOTO_REGISTRATO", "Consultazione: " + idElezione);
    esito = "SUCCESS";

  } catch (error) {
    esito = "ERRORE: " + error.toString();
  } finally {
    lock.releaseLock();
  }

  // 5. Invio email di conferma (fuori dal lock per velocità)
  if (esito === "SUCCESS") {
    try {
      MailApp.sendEmail({
        to: emailChiara,
        subject: "✅ Conferma Registrazione Voto",
        htmlBody: "<h3>Voto Registrato con Successo</h3><p>La tua preferenza è stata registrata in modo sicuro ed anonimo nel registro dei voti.</p>"
      });
    } catch (e) {
      console.log("Errore invio mail conferma voto: " + e);
    }
  }

  return esito;
}



function approvazioneAutomaticaCandidature() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioCand = ss.getSheetByName("candidature"); // Nome esatto del foglio dallo screenshot
  if (!foglioCand) return;

  var dati = foglioCand.getDataRange().getValues();
  var dataOggi = new Date();
  var modificate = 0;

  // Partiamo da i=1 per saltare l'intestazione
  for (var i = 1; i < dati.length; i++) {
    var valoreData = dati[i][0]; // Colonna A (Indice 0)
    var stato = dati[i][5] ? dati[i][5].toString().trim().toUpperCase() : ""; // Colonna F (Indice 5)
    
    // Controlliamo se è in attesa (inserisci qui la parola esatta che usi quando arriva una nuova candidatura)
    if (stato === "IN ATTESA" || stato === "") { 
      
      var dataCandidatura = new Date(valoreData);
      
      // Verifichiamo che la data sia valida
      if (!isNaN(dataCandidatura.getTime())) {
        
        // Calcola i giorni passati
        var differenzaMillisecondi = dataOggi.getTime() - dataCandidatura.getTime();
        var giorniPassati = differenzaMillisecondi / (1000 * 3600 * 24);
        
        // Se sono passate 72 ore (3 giorni)
        if (giorniPassati >= 3) {
          
          // Scrive "APPROVATA" nella Colonna F (che per getRange è la 6)
          foglioCand.getRange(i + 1, 6).setValue("APPROVATA");
          
          // Scrive l'autore nella Colonna G (che per getRange è la 7)
          foglioCand.getRange(i + 1, 7).setValue("SISTEMA (dopo 72h)");
          
          // Registra nel log (se usi la funzione scriviLog)
          try {
            scriviLog("SISTEMA", "APPROVAZIONE_AUTOMATICA", "Candidato: " + dati[i][2]);
          } catch(e) {}
          
          modificate++;
        }
      }
    }
  }
  return modificate + " candidature approvate in automatico.";
}

function getElezioniPerCandidatura(emailUtente) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var foglioElezioni = ss.getSheetByName("Database_Elezioni");
    if (!foglioElezioni) return [];
    
    var dati = foglioElezioni.getDataRange().getValues();
    var aperte = [];
    var adesso = new Date().getTime(); 
    
    for (var i = 1; i < dati.length; i++) {
      var riga = dati[i];
      var id = riga[0];
      var titolo = riga[1];
      var tipo = riga[2];
      
      // I: Inizio Candidature (Indice 8) | J: Fine Candidature (Indice 9)
      if (tipo === "CANDIDATI" && riga[8] && riga[9]) {
        var inizioC = new Date(riga[8]).getTime();
        var fineC = new Date(riga[9]).getTime();
        
        // Se le date sono valide e ci troviamo in mezzo al periodo
        if (inizioC && fineC && adesso >= inizioC && adesso <= fineC) {
          aperte.push({
            id: id,
            titolo: titolo
          });
        }
      }
    }
    return aperte;
  } catch(e) {
    return [];
  }
}


function parseDataItaliana(raw) {
  if (typeof raw === 'string') {
    var pezzi = raw.split(/[\/\s:]/); // Divide per barra, spazio o due punti
    // Costruisce data: new Date(anno, mese-1, giorno, ore, minuti)
    if(pezzi.length >= 3) {
      return new Date(pezzi[2], pezzi[1]-1, pezzi[0], pezzi[3]||0, pezzi[4]||0);
    }
  }
  // Se Excel passa già un oggetto data
  return new Date(raw);
}

function inviaPromemoriaElezioniAutomatizzati() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioElezioni = ss.getSheetByName("Database_Elezioni");
  var foglioSoci = ss.getSheetByName("Soci") || ss.getSheetByName("soci");
  var foglioVoti = ss.getSheetByName("voti");
  var foglioCand = ss.getSheetByName("candidature") || ss.getSheetByName("Candidature");

  if (!foglioElezioni || !foglioSoci) return;

  var datiElezioni = foglioElezioni.getDataRange().getValues();
  var datiSoci = foglioSoci.getDataRange().getValues();
  var datiVoti = foglioVoti ? foglioVoti.getDataRange().getValues() : [];
  var datiCand = foglioCand ? foglioCand.getDataRange().getValues() : [];

  // Calcoliamo la mezzanotte di oggi per avere un confronto pulito dei giorni
  var oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  
  var urlWebApp = ScriptApp.getService().getUrl();

  // 1. CREIAMO LA LISTA DEI SOCI ATTIVI E DEI LORO HASH
  var sociAttivi = [];
  for (var i = 1; i < datiSoci.length; i++) {
    var email = datiSoci[i][2] ? datiSoci[i][2].toString().trim().toLowerCase() : "";
    var stato = datiSoci[i][11] ? datiSoci[i][11].toString().toLowerCase() : "";
    
    if (stato === "attivo" && email.indexOf("@") > -1) {
      sociAttivi.push({
        email: email,
        hash: getHashUnivoco(email) // Serve per capire se ha già votato
      });
    }
  }

  // 2. ANALIZZIAMO LE ELEZIONI UNA PER UNA
  for (var e = 1; e < datiElezioni.length; e++) {
    var riga = datiElezioni[e];
    if (!riga[0]) continue; // Salta righe vuote

    var idElezione = riga[0];
    var titolo = riga[1];
    var tipo = riga[2];
    
    // --- CONTROLLO SCADENZA VOTAZIONI (3 GIORNI PRIMA) ---
    if (riga[4]) {
      var fineVoto = new Date(riga[4]);
      fineVoto.setHours(0, 0, 0, 0);
      var diffVoto = Math.round((fineVoto.getTime() - oggi.getTime()) / (1000 * 3600 * 24));
      
      if (diffVoto === 3) {
        // Estraiamo gli hash di chi HA GIA' VOTATO per questa elezione
        var hashVotanti = datiVoti.filter(v => v[3] === idElezione).map(v => v[1]);
        
        // Prepariamo la lista di chi DEVE ANCORA VOTARE
        var bccVoto = sociAttivi.filter(socio => !hashVotanti.includes(socio.hash)).map(socio => socio.email);

        if (bccVoto.length > 0) {
          _inviaBatchEmailElettorali(
            bccVoto, 
            "⏳ Scadenza Votazione: " + titolo, 
            "Ti ricordiamo che mancano solo <b>3 giorni</b> alla chiusura delle votazioni per l'evento: <br><br><span style='font-size:16px; color:#1e40af;'><b>" + titolo + "</b></span><br><br>Ad oggi non risulta ancora acquisita la tua preferenza. Accedi alla Cabina Elettorale per esprimere il tuo voto in modo totalmente anonimo e sicuro.", 
            urlWebApp
          );
        }
      }
    }

    // --- CONTROLLO SCADENZA CANDIDATURE (3 GIORNI PRIMA) ---
    if (tipo === "CANDIDATI" && riga[9]) {
      var fineCand = new Date(riga[9]);
      fineCand.setHours(0, 0, 0, 0);
      var diffCand = Math.round((fineCand.getTime() - oggi.getTime()) / (1000 * 3600 * 24));
      
      if (diffCand === 3) {
        // Estraiamo le email di chi SI E' GIA' CANDIDATO per questa elezione
        var emailCandidati = datiCand.filter(c => c[4] === idElezione).map(c => c[1].toString().toLowerCase());
        
        // Prepariamo la lista di chi NON si è candidato
        var bccCand = sociAttivi.filter(socio => !emailCandidati.includes(socio.email)).map(socio => socio.email);

        if (bccCand.length > 0) {
          _inviaBatchEmailElettorali(
            bccCand, 
            "🙋 Ultime ore per candidarsi: " + titolo, 
            "Ti informiamo che restano <b>3 giorni</b> di tempo per presentare la tua candidatura ufficiale relativa all'elezione:<br><br><span style='font-size:16px; color:#c2410c;'><b>" + titolo + "</b></span><br><br>Se desideri proporti per il ruolo, accedi all'Area Riservata e invia il tuo programma nella sezione 'La tua Candidatura'.", 
            urlWebApp
          );
        }
      }
    }
  }
}


function _inviaBatchEmailElettorali(bccList, subject, testoMessaggio, urlWebApp, allegatoPdf) {
  var htmlBody = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #334155; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background: #1e40af; padding: 20px; text-align: center;">
            <h2 style="color: white; margin: 0; font-size: 20px;">🔔 Promemoria Partecipazione</h2>
        </div>
        <div style="padding: 30px; background: #ffffff;">
            <p style="font-size: 15px; line-height: 1.6;">Caro Socio,</p>
            <p style="font-size: 15px; line-height: 1.6;">${testoMessaggio}</p>
            <div style="text-align: center; margin: 40px 0 20px 0;">
                <a href="${urlWebApp}" style="background: #f59e0b; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px;">ACCEDI AL CENTRO ELETTORALE</a>
            </div>
            <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 30px 0 15px 0;">
            <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
                Associazione Gens Ssshhh<br>
                Questa è una comunicazione generata automaticamente dal sistema gestionale.
            </p>
        </div>
    </div>`;

  var adminEmail = Session.getActiveUser().getEmail(); // Recupera la tua email di amministratore
  var inviatiConSuccesso = []; // Contenitore per la ricevuta
  var batchSize = 40;

  // 1. CICLO DI INVIO AI SOCI
  for (var k = 0; k < bccList.length; k += batchSize) {
    var batch = bccList.slice(k, k + batchSize);
    
    var opzioniMail = {
      to: "undisclosed-recipients@gmail.com", 
      bcc: batch.join(","),                 
      subject: subject,
      htmlBody: htmlBody,
      name: "Consultazioni Elettorali Gens Ssshhh"
    };
    
    if (allegatoPdf) {
      opzioniMail.attachments = [allegatoPdf];
    }

    try {
      MailApp.sendEmail(opzioniMail);
      inviatiConSuccesso = inviatiConSuccesso.concat(batch); // Salva i nomi per la ricevuta
      Utilities.sleep(1000); 
    } catch (e) {
      console.log("Errore invio batch promemoria: " + e.toString());
    }
  }

  // 2. INVIO DELLA RICEVUTA DI SICUREZZA ALL'AMMINISTRATORE
  if (inviatiConSuccesso.length > 0) {
    var subjectRicevuta = "✅ LOG INVIO: " + subject;
    var testoRicevuta = `
      <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc;">
        <h3 style="color: #16a34a; margin-top:0;">Report Invio Automatico Completato</h3>
        <p>Il sistema ha terminato l'invio delle comunicazioni elettorali.</p>
        <p><b>Consultazione:</b> ${subject}</p>
        <p><b>Totale email recapitate:</b> ${inviatiConSuccesso.length}</p>
        <hr style="border-top: 1px solid #cbd5e1; margin: 20px 0;">
        <p><b>Elenco esatto dei destinatari (BCC):</b></p>
        <div style="background: white; padding: 15px; border-radius: 4px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 13px;">
          ${inviatiConSuccesso.join("<br>")}
        </div>
      </div>
    `;
    
    try {
      MailApp.sendEmail({
        to: adminEmail,
        subject: subjectRicevuta,
        htmlBody: testoRicevuta,
        name: "Sistema Gestionale Gens Ssshhh"
      });
    } catch (e) {
      console.log("Errore invio ricevuta log: " + e.toString());
    }
  }
}


// ==========================================
// UTENTE: LISTA CONSULTAZIONI ATTIVE E ARCHIVIATE
// ==========================================
function getConsultazioniAttiveUtente(email) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioDb = ss.getSheetByName("Database_Elezioni");
  var foglioVoti = ss.getSheetByName("voti") || ss.getSheetByName("Voti");
  if (!foglioDb) return [];

  var dati = foglioDb.getDataRange().getValues();
  var votiRegistrati = foglioVoti ? foglioVoti.getDataRange().getValues() : [];
  var hashUtente = getHashUnivoco(email);
  var adesso = new Date().getTime();
  
  // Raccogliamo gli ID delle elezioni a cui l'utente ha già votato
  var elezioniVotate = [];
  for (var v = 1; v < votiRegistrati.length; v++) {
    if (votiRegistrati[v][1] === hashUtente) {
      elezioniVotate.push(votiRegistrati[v][3]);
    }
  }

  var lista = [];

  for (var i = 1; i < dati.length; i++) {
    var r = dati[i];
    if (!r[0]) continue;
    
    var id = r[0];
    var titolo = r[1];
    var tipo = r[2];
    var inizio = r[3] ? new Date(r[3]).getTime() : 0;
    var fine = r[4] ? new Date(r[4]).getTime() : 0;
    var statoForzato = r[7] ? r[7].toString().trim().toUpperCase() : ""; 
    var urlVerbale = r[13] ? r[13].toString().trim() : ""; 
    
    var inCorso = (adesso >= inizio && adesso <= fine);
    var giaVotato = elezioniVotate.includes(id);

    // SMISTAMENTO AUTOMATICO NELLE 3 CATEGORIE
    var categoria = "";
    if (statoForzato === "CHIUSA" || (fine > 0 && adesso > fine)) {
        categoria = "ARCHIVIO";
    } else if (inizio > 0 && adesso < inizio) {
        categoria = "PROGRAMMATE";
    } else {
        categoria = "ATTIVE";
    }

    lista.push({
      id: id,
      titolo: titolo,
      tipo: tipo,
      inizioFmt: r[3] ? new Date(r[3]).toLocaleString([], {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit'}) : "",
      fineFmt: r[4] ? new Date(r[4]).toLocaleString([], {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit'}) : "",
      statoVoto: giaVotato ? "GIÀ VOTATO" : (inCorso ? "APERTA" : "NON DISPONIBILE"),
      isChiusa: (statoForzato === "CHIUSA"),
      urlVerbale: urlVerbale,
      categoria: categoria // NUOVO DATO INVIATO AL FRONTEND
    });
  }
  
  return lista;
}



// ==========================================
// ADMIN: CHIUSURA ELEZIONE E GENERAZIONE VERBALE PDF (FORMATO CLASSICO)
// ==========================================
function adminChiudiEGeneraVerbale(adminEmail, idElezione) {
  try {
    var user = getDatiUtente(adminEmail);
    var ruoliAdmin = ["PRESIDENTE", "SEGRETARIO", "TESORIERE", "VICEPRESIDENTE"];
    if (!user || !ruoliAdmin.includes(user.ruolo.toUpperCase())) return "NO_AUTH";

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. Recupera i dati della consultazione
    var foglioDb = ss.getSheetByName("Database_Elezioni");
    var datiDb = foglioDb.getDataRange().getValues();
    var rigaElezione = -1;
    var campagna = null;
    var dataInizioElezione = null;

    for (var i = 1; i < datiDb.length; i++) {
      if (datiDb[i][0] === idElezione) {
        rigaElezione = i + 1;
        dataInizioElezione = datiDb[i][3] ? new Date(datiDb[i][3]) : new Date();
        campagna = {
          titolo: datiDb[i][1],
          qCostitutivo: parseFloat(datiDb[i][10]) || 0.5 
        };
        break;
      }
    }
    if (rigaElezione === -1) return "ERRORE: Consultazione non trovata.";

    // 2. Ottieni i risultati aggregati
    var risultati = adminGetRisultatiLive(adminEmail, idElezione);
    if (typeof risultati === 'string') return risultati;

    // 3. Recupera gli Hash Univoci per l'Allegato 1
    var foglioVoti = ss.getSheetByName("voti");
    var datiVoti = foglioVoti ? foglioVoti.getDataRange().getValues() : [];
    var hashVotanti = [];
    var hashUnici = {};
    
    for (var v = 1; v < datiVoti.length; v++) {
      if (datiVoti[v][3] === idElezione) {
        var h = datiVoti[v][1];
        if (!hashUnici[h]) {
          hashUnici[h] = true;
          hashVotanti.push(h);
        }
      }
    }

    // 4. Determina il vincitore
    var vincitore = risultati.risultati.length > 0 ? risultati.risultati[0].opzione.toUpperCase() : "NESSUNO";
    var votiVincitore = risultati.risultati.length > 0 ? risultati.risultati[0].voti : 0;
    
    var qCostPerc = Math.round((campagna.qCostitutivo > 1 ? campagna.qCostitutivo / 100 : campagna.qCostitutivo) * 100);
    var qDelPerc = 50; 
    var dataChiusura = Utilities.formatDate(new Date(), "Europe/Rome", "dd/MM/yyyy, HH:mm:ss");

    // 5. CERCA EVENTUALE REGISTRAZIONE MEET ASSOCIATA
    var infoMeet = trovaRegistrazioneMeet(campagna.titolo, dataInizioElezione);
    var sezioneRegistrazione = "";
    if (infoMeet) {
      sezioneRegistrazione = `
        <div style="margin-top: 25px; padding: 15px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 11pt;">
          <b>Tracciabilità Audiovisiva:</b> La seduta si è svolta in modalità telematica tramite Google Meet. La registrazione integrale della videoconferenza è archiviata e consultabile al seguente collegamento autorizzato: <br>
          <a href="${infoMeet.url}" style="color: #1e40af;">${infoMeet.url}</a>
        </div>
      `;
    }

    // ==========================================
    // 6. GENERAZIONE HTML DEL VERBALE
    // ==========================================
    var htmlPDF = "<html><body style='font-family: \"Times New Roman\", Times, serif; font-size: 12pt; color: #000; padding: 40px;'>";
    
    // --- INTESTAZIONE (Titolo formattato con iniziali maiuscole, non tutto maiuscolo) ---
    var titoloPulito = campagna.titolo.charAt(0).toUpperCase() + campagna.titolo.slice(1).toLowerCase();
    
    htmlPDF += "<div style='text-align:center; margin-bottom: 40px;'>";
    htmlPDF += "<h1 style='font-size: 16pt; font-weight: bold; margin: 0; text-transform: uppercase;'>VERBALE DI CHIUSURA CONSULTAZIONI</h1>";
    htmlPDF += "<h2 style='font-size: 14pt; font-weight: normal; margin: 10px 0;'>" + titoloPulito + "</h2>";
    htmlPDF += "<p style='font-size: 11pt; margin: 0;'>Data chiusura: " + dataChiusura + "</p></div>";

    // --- SEZIONE 1 ---
    htmlPDF += "<div style='margin-bottom: 30px;'>";
    htmlPDF += "<h3 style='font-size: 12pt; font-weight: bold; text-transform: uppercase; margin-bottom: 10px;'>1. VERIFICA QUORUM COSTITUTIVO</h3>";
    htmlPDF += "<p style='margin: 5px 0;'>Aventi Diritto: " + risultati.aventiDiritto + "</p>";
    htmlPDF += "<p style='margin: 5px 0;'>Votanti: " + risultati.votanti + "</p>";
    htmlPDF += "<p style='margin: 5px 0;'>Quorum richiesto (" + qCostPerc + "%): " + risultati.quorumNecessario + "</p>";
    htmlPDF += risultati.quorumRaggiunto 
        ? "<p style='margin-top: 15px; font-weight: bold; text-transform: uppercase;'>ESITO: L'ASSEMBLEA È VALIDAMENTE COSTITUITA.</p>" 
        : "<p style='margin-top: 15px; font-weight: bold; text-transform: uppercase;'>ESITO: L'ASSEMBLEA NON È VALIDAMENTE COSTITUITA.</p>";
    htmlPDF += "</div>";

    // --- SEZIONE 2 ---
    htmlPDF += "<div style='margin-bottom: 30px;'>";
    htmlPDF += "<h3 style='font-size: 12pt; font-weight: bold; text-transform: uppercase; margin-bottom: 15px;'>2. RISULTATI SPOGLIO</h3>";
    htmlPDF += "<table border='1' cellspacing='0' cellpadding='6' style='width: 100%; border-collapse: collapse; border: 1px solid black;'>";
    htmlPDF += "<tr style='background-color: #f2f2f2;'><th style='text-align: left;'>Candidato</th><th style='text-align: center; width: 80px;'>Voti</th><th style='text-align: center; width: 80px;'>%</th></tr>";
    
    if (risultati.risultati.length > 0) {
      risultati.risultati.forEach(function(r) {
        var perc = ((r.voti / risultati.votanti) * 100).toFixed(1);
        htmlPDF += "<tr><td>" + r.opzione + "</td><td style='text-align: center;'>" + r.voti + "</td><td style='text-align: center;'>" + perc + "%</td></tr>";
      });
    } else {
      htmlPDF += "<tr><td colspan='3' style='text-align: center;'>Nessun voto espresso.</td></tr>";
    }
    htmlPDF += "</table></div>";

    // --- SEZIONE 3 ---
    htmlPDF += "<div style='margin-bottom: 30px;'>";
    htmlPDF += "<h3 style='font-size: 12pt; font-weight: bold; text-transform: uppercase; margin-bottom: 10px;'>3. PROCLAMAZIONE</h3>";
    
    if (risultati.quorumRaggiunto) {
        htmlPDF += "<p>Visto l'esito dello spoglio, viene dichiarato eletto il candidato:</p>";
        htmlPDF += "<h2 style='text-align: center; font-size: 16pt; margin: 20px 0;'>" + vincitore + "</h2>";
        htmlPDF += "<p style='text-align: center; font-size: 10pt;'>(Quorum deliberativo del " + qDelPerc + "% superato con " + votiVincitore + " voti).</p>";
    } else {
        htmlPDF += "<p><b>NESSUN CANDIDATO ELETTO.</b> L'assemblea non è validamente costituita.</p>";
    }
    htmlPDF += "</div>";

    // Inserisce la tracciabilità Meet se trovata
    htmlPDF += sezioneRegistrazione;

    // --- FIRME ---
    htmlPDF += "<table style='width: 100%; margin-top: 50px;'><tr><td style='width: 40%; text-align: center; border-top: 1px solid black; padding-top: 10px;'>Il Presidente</td><td style='width: 20%;'></td><td style='width: 40%; text-align: center; border-top: 1px solid black; padding-top: 10px;'>Il Segretario</td></tr></table>";

    // --- ALLEGATO 1 (Stile classico con griglia e testi centrati) ---
    htmlPDF += "<div style='page-break-before: always;'></div>";
    
    // Titoli centrati come nel vecchio verbale
    htmlPDF += "<div style='text-align: center; margin-bottom: 30px; padding-top:20px;'>";
    htmlPDF += "<h3 style='font-size: 14pt; font-weight: bold; margin-bottom:10px;'>ALLEGATO 1: TABELLA DI VERIFICA VOTO</h3>";
    htmlPDF += "<p style='font-size: 11pt; margin: 0;'>Registro pubblico degli identificativi univoci (Hash SHA-256)</p>";
    htmlPDF += "</div>";

    // Tabella con bordi neri, margini e testo allineato
    htmlPDF += "<table border='1' cellspacing='0' cellpadding='8' style='width: 100%; border-collapse: collapse; font-size: 11pt; border: 1px solid black;'>";
    htmlPDF += "<tr>";
    htmlPDF += "<th style='width: 40px; text-align: center; border: 1px solid black; background-color: #f8f9fa;'>N.</th>";
    htmlPDF += "<th style='text-align: left; border: 1px solid black; background-color: #f8f9fa;'>Hash Univoco Votante</th>";
    htmlPDF += "</tr>";

    if (hashVotanti.length > 0) {
        for (var j = 0; j < hashVotanti.length; j++) {
            htmlPDF += "<tr>";
            htmlPDF += "<td style='text-align: center; border: 1px solid black;'>" + (j + 1) + "</td>";
            htmlPDF += "<td style='font-family: monospace; border: 1px solid black; word-break: break-all;'>" + hashVotanti[j] + "</td>";
            htmlPDF += "</tr>";
        }
    } else {
        htmlPDF += "<tr><td colspan='2' style='text-align: center; padding: 20px; border: 1px solid black;'>Nessun partecipante registrato.</td></tr>";
    }
    htmlPDF += "</table>";
    
    // Fine documento allineato a destra
    htmlPDF += "<div style='text-align: right; margin-top: 30px; font-size: 10pt; color: #555;'>Fine Documento</div>";
    htmlPDF += "</body></html>";

    // ==========================================
    // 7. SALVATAGGIO IN GOOGLE DRIVE
    // ==========================================
    var folderId = "1B40jXYlF9nXvR7rKGtIjpWYl4SMgGrXH"; 
    var folder = DriveApp.getFolderById(folderId);
    var subfolders = folder.getFoldersByName("Verbali Ufficiali");
    var verbaleFolder = subfolders.hasNext() ? subfolders.next() : folder.createFolder("Verbali Ufficiali");

    var blob = Utilities.newBlob(htmlPDF, "text/html", "Temp.html").getAs("application/pdf");
    blob.setName("Verbale_" + idElezione + ".pdf");
    var fileFisico = verbaleFolder.createFile(blob);
    fileFisico.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    var urlPdf = fileFisico.getUrl();

    // Aggiorna lo stato nel foglio
    foglioDb.getRange(rigaElezione, 8).setValue("CHIUSA");
    foglioDb.getRange(rigaElezione, 14).setValue(urlPdf);

    return "OK";
  } catch (e) {
    return "ERRORE SERVER: " + e.toString();
  }
}

function ottieniUrlVerbale(identificativoConsultazione) {
  try {
    // Cerca la cartella (puoi cambiare la logica di ricerca a seconda di come si chiamano le tue cartelle)
    var cartelle = DriveApp.getFoldersByName(identificativoConsultazione);
    
    if (cartelle.hasNext()) {
      var cartella = cartelle.next();
      
      // Cerca il file all'interno della cartella. 
      // Qui cerchiamo un file che contiene la parola "Verbale" nel titolo.
      var files = cartella.searchFiles("title contains 'Verbale'");
      
      if (files.hasNext()) {
        var file = files.next();
        return file.getUrl(); // Restituisce il link per aprire il file
      } else {
        return "FILE_NON_TROVATO";
      }
    } else {
      return "CARTELLA_NON_TROVATA";
    }
  } catch (e) {
    return "ERRORE: " + e.toString();
  }
}

// ==========================================
// AUTOMATISMO: 30 GIORNI PRIMA PER ORDINE DEL GIORNO (ASSEMBLEE)
// ==========================================
function inviaRichiesteOdGAutomatizzate() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioDb = ss.getSheetByName("Database_Elezioni");
  var foglioSoci = ss.getSheetByName("soci") || ss.getSheetByName("Soci");
  if (!foglioDb || !foglioSoci) return;

  var datiDb = foglioDb.getDataRange().getValues();
  var datiSoci = foglioSoci.getDataRange().getValues();
  
  var oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  var urlWebApp = "https://sites.google.com/view/gens-ssshhh/area-riservata";

  // Estrai soci attivi
  var bccList = [];
  for (var s = 1; s < datiSoci.length; s++) {
    var stato = datiSoci[s][11] ? datiSoci[s][11].toString().toLowerCase().trim() : "";
    var email = datiSoci[s][2] ? datiSoci[s][2].toString().trim().toLowerCase() : "";
    if (stato === "attivo" && email.indexOf("@") > -1) bccList.push(email);
  }
  if (bccList.length === 0) return;

  for (var i = 1; i < datiDb.length; i++) {
    var riga = datiDb[i];
    if (!riga[0]) continue;
    
    var idElezione = riga[0];
    var titolo = riga[1];
    var tipo = riga[2];
    var dataInizio = riga[3] ? new Date(riga[3]) : null;

    if (tipo === "ASSEMBLEA" && dataInizio) {
      dataInizio.setHours(0, 0, 0, 0);
      var diffGiorni = Math.round((dataInizio.getTime() - oggi.getTime()) / (1000 * 3600 * 24));

      if (diffGiorni === 30) {
        var subject = "📢 Costruzione Ordine del Giorno: " + titolo;
        var testoMessaggio = "Tra esattamente 30 giorni si terrà la consultazione: <b>" + titolo + "</b>.<br><br>Prima di inviare la convocazione ufficiale, apriamo la raccolta dei punti all'Ordine del Giorno.<br><br>Vuoi discutere di un tema specifico? Hai una proposta per l'associazione? Accedi alla tua area riservata (sezione Consultazioni) e invia la tua proposta. Verrà aggiunta automaticamente all'OdG dell'Amministratore.";
        
        // Sfruttiamo la funzione mail grafica che avevamo già creato!
        if (typeof _inviaBatchEmailElettorali === "function") {
          _inviaBatchEmailElettorali(bccList, subject, testoMessaggio, urlWebApp);
        }
      }
    }
  }
}

// ==========================================
// SOCIO: AGGIUNGE UN PUNTO ALL'ODG
// ==========================================
function utenteAggiungeOdG(dati) {
  try {
    var utente = getDatiUtente(dati.email);
    if (!utente || utente.stato !== "ATTIVO") return "NO_AUTH";

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var foglioDb = ss.getSheetByName("Database_Elezioni");
    var datiDb = foglioDb.getDataRange().getValues();

    for (var i = 1; i < datiDb.length; i++) {
      if (datiDb[i][0] === dati.idElezione) {
        
        var odgAttuale = foglioDb.getRange(i + 1, 13).getValue(); // Colonna M (13)
        var nuovoPunto = "\n\n🔸 Proposta da " + utente.nome + " " + utente.cognome + ": " + dati.titoloProposta + "\n   Dettagli: " + dati.dettaglioProposta;
        
        // Unisce il vecchio OdG con il nuovo (se era vuoto, mette solo il nuovo)
        var odgAggiornato = odgAttuale ? (odgAttuale + nuovoPunto) : nuovoPunto.trim();
        
        foglioDb.getRange(i + 1, 13).setValue(odgAggiornato); 
        scriviLog(dati.email, "NUOVO_ODG", dati.idElezione);
        return "OK";
      }
    }
    return "ERRORE: Assemblea non trovata";
  } catch(e) {
    return "ERRORE SERVER: " + e.toString();
  }
}

// ==========================================
// AUTOMATISMO: 14 GIORNI PRIMA (CONVOCAZIONE UFFICIALE)
// ==========================================
function inviaConvocazioneUfficialeAutomatizzata() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioDb = ss.getSheetByName("Database_Elezioni");
  var foglioSoci = ss.getSheetByName("Soci") || ss.getSheetByName("soci");
  if (!foglioDb || !foglioSoci) return;

  var datiDb = foglioDb.getDataRange().getValues();
  var datiSoci = foglioSoci.getDataRange().getValues();
  
  var oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  var urlWebApp = "https://sites.google.com/view/gens-ssshhh/area-riservata";

  // Estrai soci attivi
  var bccList = [];
  for (var s = 1; s < datiSoci.length; s++) {
    var stato = datiSoci[s][11] ? datiSoci[s][11].toString().toLowerCase().trim() : "";
    var email = datiSoci[s][2] ? datiSoci[s][2].toString().trim().toLowerCase() : "";
    if (stato === "attivo" && email.indexOf("@") > -1) bccList.push(email);
  }
  if (bccList.length === 0) return;

  for (var i = 1; i < datiDb.length; i++) {
    var riga = datiDb[i];
    if (!riga[0]) continue;
    
    var idElezione = riga[0];
    var titolo = riga[1];
    var tipo = riga[2];
    var dataInizio = riga[3] ? new Date(riga[3]) : null;
    var dataFine = riga[4] ? new Date(riga[4]) : null; // Aggiunto per il Calendario
    
    var testoColonnaM = riga[12] ? riga[12].toString().trim() : "";
    var testoColonnaG = riga[6] ? riga[6].toString().trim() : "";
    var odgText = testoColonnaM || testoColonnaG || "Nessun punto all'ordine del giorno specificato.";

    // Se manca la data di fine, calcoliamo in automatico 2 ore dopo l'inizio per l'evento
    if (dataInizio && !dataFine) {
      dataFine = new Date(dataInizio.getTime() + (2 * 60 * 60 * 1000));
    }

    if (dataInizio) {
      var dataInizioGiorno = new Date(dataInizio);
      dataInizioGiorno.setHours(0, 0, 0, 0);
      var diffGiorni = Math.round((dataInizioGiorno.getTime() - oggi.getTime()) / (1000 * 3600 * 24));

      // SE MANCANO ESATTAMENTE 14 GIORNI
      if (diffGiorni === 14) {
        var subject = "Convocazione Ufficiale: " + titolo;
        var testoMessaggio = "Ti informiamo che tra 14 giorni si aprirà ufficialmente la consultazione per: <b>" + titolo + "</b>.<br><br>";
        
        var allegatoPdf = null;

        // Se è un'assemblea, CREIAMO IL PDF E L'EVENTO A CALENDARIO
        if (tipo === "ASSEMBLEA") {
           testoMessaggio += "Di seguito l'Ordine del Giorno definitivo con i punti proposti:<br><br><div style='background:#f8fafc; padding:15px; border-left: 4px solid #1e40af; border-radius:4px; white-space:pre-wrap; font-size:13px;'>" + odgText + "</div><br><br>";
           testoMessaggio += "In allegato alla presente mail troverai la lettera di <b>Convocazione Ufficiale</b> formale e il modulo di Delega.<br><br>";

           var opzioniData = { year: 'numeric', month: 'long', day: 'numeric' };
           var dataOdiernaFmt = new Date().toLocaleDateString('it-IT', opzioniData);
           var dataInizioFmt = dataInizio.toLocaleDateString('it-IT', opzioniData);
           var oraInizioFmt = dataInizio.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

           var htmlLettera = `
           <html><head><style>
             body { font-family: "Times New Roman", Times, serif; font-size: 11.5pt; color: black; line-height: 1.3; padding: 25px; }
             .header-destra { text-align: right; margin-bottom: 30px; }
             .titolo-centrale { text-align: center; font-weight: bold; font-size: 14pt; text-decoration: underline; margin-bottom: 20px; }
             .odg-box { margin-left: 20px; margin-bottom: 20px; white-space: pre-wrap; text-align: justify; }
             .firma { text-align: right; margin-top: 30px; margin-bottom: 30px; }
             .linea-taglio { border-top: 1px dashed black; margin: 30px 0; }
             .delega-titolo { text-align: center; font-weight: bold; margin-bottom: 15px; font-size: 13pt; }
           </style></head><body>
             <div class="header-destra">
               Pianoro (BO), ${dataOdiernaFmt}<br><br>
               <b>Ai Soci dell'Associazione "Gens Ssshhh"</b><br>
               <i>Trasmissione a mezzo Piattaforma Elettronica</i>
             </div>
             <div class="titolo-centrale">CONVOCAZIONE ASSEMBLEA ORDINARIA</div>
             <div style="text-align: justify;">
               I Sigg. Soci dell'Associazione "Gens Ssshhh" sono convocati in assemblea ordinaria per il giorno <b>${dataInizioFmt}</b> alle ore <b>${oraInizioFmt}</b> in modalità telematica, per discutere e deliberare sul seguente:
             </div>
             <div style="text-align: center; font-weight: bold; margin: 20px 0;">ORDINE DEL GIORNO</div>
             <div class="odg-box">${odgText}</div>
             <div style="text-align: justify;">
               Se in tale seduta il numero dei presenti e dei voti non raggiungessero il quorum previsto, la riunione sarà rinviata in seconda convocazione per il giorno successivo, alla medesima ora e modalità.<br><br>
               Nell’interesse dell'Associazione si prega di intervenire o, in caso di impossibilità, di delegare persona di fiducia a rappresentarLa per rato e valido in seno all’assemblea compilando il modulo sottostante.
             </div>
             <div class="firma">
               IL SEGRETARIO<br>
               <i>Luca Guermandi</i>
             </div>
             <div class="linea-taglio"></div>
             <div class="delega-titolo">DELEGA</div>
             <div style="text-align: justify; line-height: 1.5;">
               Il/La sottoscritto/a .................................................................................................... socio/a dell'Associazione "Gens Ssshhh", delega il socio .................................................................................................... a rappresentarlo/a per rato e valido in seno all’assemblea indetta per il giorno ${dataInizioFmt}.
             </div>
             <table style="width: 100%; margin-top: 30px;">
               <tr>
                 <td style="text-align: left;">Data .........................................</td>
                 <td style="text-align: right;">Firma .........................................................</td>
               </tr>
             </table>
           </body></html>`;

           allegatoPdf = Utilities.newBlob(htmlLettera, 'text/html', 'Convocazione_' + titolo + '.pdf'); // Creato come PDF

           // 1. Salva il file PDF in Google Drive per poterlo allegare al Calendario
           var fileDrive = DriveApp.createFile(allegatoPdf);
           
           // 2. CREA L'EVENTO GOOGLE CALENDAR
           var evento = creaEventoAssembleaConMeet(titolo, dataInizio, dataFine, odgText, fileDrive.getId(), bccList);
           
           // 3. Aggiunge il link di Google Meet all'email blu
           if (evento && evento.hangoutLink) {
             testoMessaggio += "<div style='text-align:center; padding:10px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:4px; margin-bottom:15px;'><b>🔗 Link Videoconferenza (Google Meet):</b><br><a href='" + evento.hangoutLink + "' style='color:#16a34a; font-weight:bold;'>" + evento.hangoutLink + "</a></div>";
           }
        }
        
        testoMessaggio += "Accedi alla tua area riservata per visualizzare i dettagli completi.";
        
        if (typeof _inviaBatchEmailElettorali === "function") {
          _inviaBatchEmailElettorali(bccList, subject, testoMessaggio, urlWebApp, allegatoPdf.getAs('application/pdf'));
        }
      }
    }
  }
}

// ==========================================
// AUTOMATISMO: CONTROLLO SCADENZA ELEZIONI
// ==========================================
function controllaScadenzaElezioni() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioDb = ss.getSheetByName("Database_Elezioni");
  // Cerca il foglio dei soci (gestisce sia la S maiuscola che minuscola)
  var foglioSoci = ss.getSheetByName("Soci") || ss.getSheetByName("soci");
  if (!foglioDb || !foglioSoci) return;

  var datiDb = foglioDb.getDataRange().getValues();
  var datiSoci = foglioSoci.getDataRange().getValues();
  
  var oggi = new Date();
  var urlWebApp = "https://sites.google.com/view/gens-ssshhh/area-riservata";

  // 1. Trova le email di Presidente e Segretario per avvisarli
  var emailAdmins = [];
  for (var s = 1; s < datiSoci.length; s++) {
    var ruolo = datiSoci[s][3] ? datiSoci[s][3].toString().toUpperCase().trim() : "";
    var email = datiSoci[s][2] ? datiSoci[s][2].toString().toLowerCase().trim() : "";
    if ((ruolo === "PRESIDENTE" || ruolo === "SEGRETARIO") && email.indexOf("@") > -1) {
      emailAdmins.push(email);
    }
  }

  // 2. Controlla le date di tutte le elezioni
  for (var i = 1; i < datiDb.length; i++) {
    var riga = datiDb[i];
    if (!riga[0]) continue;
    
    var titolo = riga[1];
    var dataFine = riga[4] ? new Date(riga[4]) : null;
    var stato = riga[7] ? riga[7].toString().toUpperCase().trim() : ""; // Colonna H
    
    // Se c'è una data di fine e l'elezione NON è ancora stata archiviata
    if (dataFine && stato !== "CHIUSA") {
      
      // Calcola la differenza in ore tra adesso e la scadenza
      var diffOre = (oggi.getTime() - dataFine.getTime()) / (1000 * 3600);
      
      // Se l'elezione è scaduta da meno di 24 ore (invia l'avviso una sola volta il giorno dopo)
      if (diffOre > 0 && diffOre <= 24) {
        var subject = "⚠️ Promemoria: Consultazione conclusa - " + titolo;
        var testoMessaggio = "Le votazioni per <b>" + titolo + "</b> si sono concluse (tempo massimo scaduto).<br><br>";
        testoMessaggio += "I soci non possono più esprimere preferenze.<br>Accedi all'Area Riservata, vai nella sezione <b>Amministrazione</b> e clicca su <b>'Chiudi e Stampa'</b> per calcolare il Quorum, generare il Verbale Ufficiale in PDF e archiviare definitivamente la consultazione.<br><br>";
        
        if (emailAdmins.length > 0 && typeof _inviaBatchEmailElettorali === "function") {
          _inviaBatchEmailElettorali(emailAdmins, subject, testoMessaggio, urlWebApp);
        }
      }
    }
  }
}

function inviaAvvisoAperturaCandidatureAutomatizzato() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioDb = ss.getSheetByName("Database_Elezioni");
  var foglioSoci = ss.getSheetByName("soci") || ss.getSheetByName("Soci");
  
  if (!foglioDb || !foglioSoci) return;

  var datiDb = foglioDb.getDataRange().getValues();
  var datiSoci = foglioSoci.getDataRange().getValues();
  
  // Data di oggi azzerata alla mezzanotte
  var oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  
  var urlWebApp = "https://sites.google.com/view/gens-ssshhh/area-riservata";

  // 1. Estrai soci attivi (come fai già nelle altre funzioni)
  var bccList = [];
  for (var s = 1; s < datiSoci.length; s++) {
    var stato = datiSoci[s][11] ? datiSoci[s][11].toString().toLowerCase().trim() : "";
    var email = datiSoci[s][2] ? datiSoci[s][2].toString().trim().toLowerCase() : "";
    if (stato === "attivo" && email.indexOf("@") > -1) bccList.push(email);
  }
  if (bccList.length === 0) return;

  // 2. Controlla le date delle candidature
  for (var i = 1; i < datiDb.length; i++) {
    var riga = datiDb[i];
    if (!riga[0]) continue;
    
    // Mappatura esatta basata sulla tua intestazione (image_acf1bc.jpg):
    // Titolo = Colonna B (1), Tipo = Colonna C (2)
    // Inizio Candidature = Colonna I (8), Fine Candidature = Colonna J (9)
    // Avviso Inviato (da creare) = Colonna O (14)
    var titolo = riga[1];
    var tipo = riga[2];
    var dataInizioCand = riga[8] ? new Date(riga[8]) : null;
    var dataFineCand = riga[9] ? new Date(riga[9]) : null;
    var avvisoInviato = riga[14] ? riga[14].toString().trim().toUpperCase() : "";

    // Se è un'elezione di tipo CANDIDATI e la data di inizio esiste
    if (tipo === "CANDIDATI" && dataInizioCand instanceof Date && !isNaN(dataInizioCand)) {
      
      // Azzeriamo le ore per fare il confronto sui giorni
      dataInizioCand.setHours(0, 0, 0, 0);
      
      // Se OGGI corrisponde al giorno di inizio E non abbiamo ancora mandato l'avviso
      if (dataInizioCand.getTime() === oggi.getTime() && avvisoInviato !== "SI") {
        
        var dataFineFormattata = dataFineCand ? dataFineCand.toLocaleDateString('it-IT') : "scadenza non definita";
        var subject = "📢 Apertura Candidature: " + titolo;
        var testoMessaggio = "Ti informiamo che da questo momento sono ufficialmente <b>APERTE</b> le candidature per l'evento: <br><br><span style='font-size:16px; color:#16a34a;'><b>" + titolo + "</b></span><br><br>" +
                             "Hai tempo fino al <b>" + dataFineFormattata + "</b> per presentare il tuo profilo e il tuo programma ufficiale.<br><br>" +
                             "Accedi al Centro Elettorale (sezione 'La tua Candidatura') per proporti per il ruolo. Ti ricordiamo che la tua candidatura dovrà raccogliere i sostegni necessari nei tempi previsti dal regolamento.";
        
        // Sfruttiamo la tua ottima funzione grafica già esistente
        if (typeof _inviaBatchEmailElettorali === "function") {
          _inviaBatchEmailElettorali(bccList, subject, testoMessaggio, urlWebApp);
          
          // Scrive "SI" nella colonna O (Indice 15 per set/getValue)
          foglioDb.getRange(i + 1, 15).setValue("SI"); 
        }
      }
    }
  }
}

function ESEGUI_CONTROLLI_GIORNALIERI() {
  console.log("Inizio controlli giornalieri...");

  try { controllaScadenzaElezioni(); } catch(e) { console.log(e.stack); }
  try { inviaRichiesteOdGAutomatizzate(); } catch(e) { console.log(e.stack); }
  try { inviaConvocazioneUfficialeAutomatizzata(); } catch(e) { console.log(e.stack); }
  
  // Aggiungi la nuova funzione qui:
  try { inviaAvvisoAperturaCandidatureAutomatizzato(); } catch(e) { console.log(e.stack); }

  console.log("Controlli terminati.");
}

// Funzione di supporto per cercare la registrazione Meet associata all'assemblea
function trovaRegistrazioneMeet(titoloAssemblea, dataAssemblea) {
  try {
    // Cerca su Drive i file video recenti che contengono il titolo dell'assemblea
    var query = "title contains '" + titoloAssemblea + "' and mimeType = 'video/mp4'";
    var files = DriveApp.searchFiles(query);
    
    if (files.hasNext()) {
      var fileTrovato = files.next();
      return {
        nome: fileTrovato.getName(),
        url: fileTrovato.getUrl()
      };
    }
  } catch (e) {
    console.log("Errore ricerca registrazione Meet: " + e.toString());
  }
  return null;
}