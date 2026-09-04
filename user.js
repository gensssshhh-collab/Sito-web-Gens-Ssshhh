function getHomeSummary(email) {
  var user = getDatiUtente(email);
  if(!user) return null;
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Calcoliamo quante votazioni sono aperte e disponibili per questo utente
  var votiAttivi = 0;
  try {
    var foglioDb = ss.getSheetByName("Database_Elezioni");
    var foglioVoti = ss.getSheetByName("archivio votazioni") || ss.getSheetByName("voti");
    
    if (foglioDb && foglioDb.getLastRow() >= 2) {
      var campagne = foglioDb.getDataRange().getValues();
      var votiRegistrati = foglioVoti ? foglioVoti.getDataRange().getValues() : [];
      var adesso = new Date();
      
      // Raccogliamo gli ID delle elezioni a cui l'utente ha già votato (tramite il suo hash)
      var hashUtente = getHashUnivoco(email);
      var elezioniVotate = [];
      for (var v = 1; v < votiRegistrati.length; v++) {
        if (votiRegistrati[v][1] === hashUtente) {
          elezioniVotate.push(votiRegistrati[v][3]); // Colonna dell'ID elezione nel registro voti
        }
      }
      
      // Controlliamo quante campagne sono attualmente in corso e non ancora votate
      for (var i = 1; i < campagne.length; i++) {
        var idElezione = campagne[i][0];
        var inizio = new Date(campagne[i][3]);
        var fine = new Date(campagne[i][4]);
        
        // Se la consultazione è attiva nel periodo corrente e l'utente non ha ancora votato
        if (adesso >= inizio && adesso <= fine && !elezioniVotate.includes(idElezione)) {
          votiAttivi++;
        }
      }
    }
  } catch(e) {
    votiAttivi = 0; // Fallback di sicurezza
  }

  var filesPub = getListaDocumenti("PUBBLICO", email).length;
  var filesPriv = getListaDocumenti("PRIVATO", email).length;
  
  // --- LOGICA RUOLI ---
  var ruoliAdmin = ["PRESIDENTE", "SEGRETARIO", "TESORIERE"];
  var ruoloUtente = user.ruolo ? user.ruolo.toUpperCase() : "";
  var isAdmin = ruoliAdmin.includes(ruoloUtente);

  return {
    nome: user.nome,
    cognome: user.cognome, 
    tessera: user.tessera, 
    scadenza: user.scadenza,
    votiAttivi: votiAttivi, // Mostra il numero reale di voti/assemblee in sospeso
    numFiles: filesPub + filesPriv,
    isAdmin: isAdmin, 
    ruolo: user.ruolo,
  };
}


function inviaCandidatura(dati) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var foglioCand = ss.getSheetByName("candidature"); 
    if (!foglioCand) return "Foglio 'candidature' non trovato.";
    
    var foglioSoci = ss.getSheetByName("soci"); 
    var nomeCompleto = dati.email; // Fallback se non trovato
    
    if (foglioSoci) {
        var datiSoci = foglioSoci.getDataRange().getValues();
        for (var i = 1; i < datiSoci.length; i++) {
          // Colonna C del foglio soci è l'indice 2 (Email)
          var emailNelDb = datiSoci[i][2] ? datiSoci[i][2].toString().trim() : "";
          
          if (emailNelDb.toLowerCase() === dati.email.toLowerCase()) {
            var nome = datiSoci[i][0] || "";     // Colonna A: Nome
            var cognome = datiSoci[i][4] || "";  // Colonna E: Cognome
            nomeCompleto = (nome + " " + cognome).trim();
            break;
          }
        }
    }

    // Controllo doppioni sulla colonna B (Email) e E (ID Elezione)
    var datiEsistenti = foglioCand.getDataRange().getValues();
    for (var r = 1; r < datiEsistenti.length; r++) {
      if (datiEsistenti[r][1] === dati.email && datiEsistenti[r][4] === dati.idElezione) {
        return "GIA_FATTO";
      }
    }

    // Registra la candidatura con l'ordine esatto:
    // A: Data | B: Email | C: Nome e Cognome | D: Motivazione | E: ID Elezione | F: Esito | G: Da chi
    foglioCand.appendRow([
      new Date(),          // A: Data
      dati.email,          // B: Email
      nomeCompleto,        // C: Nome e Cognome presi dal foglio soci (Col A + Col E)
      dati.motivazione,    // D: Motivazione/programma
      dati.idElezione,     // E: ID Elezione
      "IN ATTESA",         // F: Esito
      dati.email           // G: Da chi
    ]);
    
    return "OK";
  } catch (e) {
    return e.toString5 ? e.toString() : e;
  }
}

// ==========================================
// ADMIN: LEGGI CANDIDATURE IN ATTESA
// ==========================================
function getNomiSociAttivi() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglio = ss.getSheetByName("soci"); 
  if (!foglio) return [];
  
  var dati = foglio.getDataRange().getValues();
  var tempLista = [];
  
  var intestazioni = dati[0].map(function(h) { return h.toString().toLowerCase().trim(); });
  var colNome = intestazioni.indexOf("nome");
  var colCognome = intestazioni.indexOf("cognome");
  var colStato = intestazioni.findIndex(function(h) { return h.indexOf("stato") > -1; });

  for (var i = 1; i < dati.length; i++) {
    var stato = colStato >= 0 ? dati[i][colStato].toString().toLowerCase().trim() : "attivo";
    
    // CORREZIONE: Controllo rigoroso. "non attivo" viene scartato automaticamente.
    if (stato === "attivo") {
      var n = colNome >= 0 ? dati[i][colNome].toString().trim() : "";
      var c = colCognome >= 0 ? dati[i][colCognome].toString().trim() : "";
      
      if (n !== "" || c !== "") {
        tempLista.push({
          nome: n,
          cognome: c,
          etichetta: (c + " " + n).trim() 
        });
      }
    }
  }
  
  tempLista.sort(function(a, b) { 
      var cmp = a.cognome.localeCompare(b.cognome);
      if(cmp === 0) return a.nome.localeCompare(b.nome);
      return cmp;
  });
  
  return tempLista.map(function(x) { return x.etichetta; });
}


// Estrae Nome, Cognome ed Email dei soli soci ATTIVI (usata per Garanti Ammissioni)
function getListaSociPerSponsor() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglio = ss.getSheetByName("soci");
  if (!foglio) return [];
  
  var dati = foglio.getDataRange().getValues();
  var lista = [];
  
  var intestazioni = dati[0].map(function(h) { return h.toString().toLowerCase().trim(); });
  var colNome = intestazioni.indexOf("nome");
  var colCognome = intestazioni.indexOf("cognome");
  var colEmail = intestazioni.indexOf("email");
  var colStato = intestazioni.findIndex(function(h) { return h.indexOf("stato") > -1; });

  for (var i = 1; i < dati.length; i++) {
    var stato = colStato >= 0 ? dati[i][colStato].toString().toLowerCase().trim() : "attivo";
    
    // CORREZIONE: Controllo rigoroso anche qui.
    if (stato === "attivo") {
      var n = colNome >= 0 ? dati[i][colNome].toString().trim() : "";
      var c = colCognome >= 0 ? dati[i][colCognome].toString().trim() : "";
      var e = colEmail >= 0 ? dati[i][colEmail].toString().trim() : "";
      
      if (e !== "") {
         lista.push({
            nome: n,
            cognome: c,
            nomeCompleto: (c + " " + n).trim(), 
            email: e
         });
      }
    }
  }
  
  return lista.sort(function(a, b) { 
      var cmp = a.cognome.localeCompare(b.cognome);
      if(cmp === 0) return a.nome.localeCompare(b.nome);
      return cmp;
  });
}

// ==========================================
// MODULO AMMISSIONE NUOVI SOCI (Art. 7 Statuto)
// ==========================================

function proponiNuovoSocio(dati) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioAmmissioni = ss.getSheetByName("Ammissioni");

  if (!foglioAmmissioni) {
    foglioAmmissioni = ss.insertSheet("Ammissioni");
    // Ho aggiunto "Cognome Candidato" nell'intestazione
    foglioAmmissioni.appendRow(["Data Richiesta", "Nome Candidato", "Cognome Candidato", "Email Candidato", "Telefono", "Sponsor 1 (Proponente)", "Sponsor 2 (Richiesto)", "Stato Sostegno", "Esito Assemblea"]);
  }

  // Aggiunge la riga con la colonna in più
  foglioAmmissioni.appendRow([
    new Date(),
    dati.nomeCandidato,
    dati.cognomeCandidato, // NUOVO DATO
    dati.emailCandidato,
    dati.telefono,
    dati.sponsor1,
    dati.sponsor2,
    "ATTESA 2° SPONSOR", // Stato iniziale
    "DA VOTARE"
  ]);

  // Opzionale: Invia una mail allo Sponsor 2 per avvisarlo
  try {
    MailApp.sendEmail({
      to: dati.emailSponsor2,
      subject: "Richiesta Sostegno Candidatura - Gens Ssshhh",
      // Aggiornato il corpo della mail per mostrare Nome e Cognome insieme
      htmlBody: "<p>Ciao, <b>" + dati.sponsor1 + "</b> ti ha indicato come secondo garante per l'ammissione di <b>" + dati.nomeCandidato + " " + dati.cognomeCandidato + "</b>.</p><p>Accedi al portale per confermare il tuo sostegno, in modo da poter portare la candidatura al voto in assemblea.</p>"
    });
  } catch(e) {}
  
  return "OK";
}

// Funzione che lo Sponsor 2 richiama per dare il suo appoggio
function getCandidatureAttive(emailUtente) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioAmmissioni = ss.getSheetByName("Ammissioni");
  if(!foglioAmmissioni) return { daSostenere: [], inAssemblea: [] };
  
  var dati = foglioAmmissioni.getDataRange().getValues();
  var daSostenere = [];
  var inAssemblea = [];
  
  for(var i = 1; i < dati.length; i++) {
     // Uniamo Nome (colonna 1) e Cognome (colonna 2) per un'visualizzazione pulita
     var nomeCompleto = (dati[i][1] || "") + " " + (dati[i][2] || "");
     
     var candidato = {
         nome: nomeCompleto.trim(),
         email: dati[i][3],     // Email Candidato (Colonna D)
         sponsor1: dati[i][5],  // Sponsor 1 (Colonna F)
         stato: dati[i][7]      // Stato Sostegno (Colonna H)
     };
     
     // Se l'utente loggato è lo Sponsor 2 (Colonna G, indice 6) e lo stato è in attesa (Colonna H, indice 7)
     if(dati[i][7] === "ATTESA 2° SPONSOR" && dati[i][6].toString().toLowerCase() === emailUtente.toLowerCase()) {
         daSostenere.push(candidato);
     }
     
     // Tutte le candidature pronte per essere votate in assemblea (Stato in Colonna H, Esito in Colonna I)
     if(dati[i][7] === "SOSTENUTO (PRONTO PER ASSEMBLEA)" && dati[i][8] === "DA VOTARE") {
         inAssemblea.push(candidato);
     }
  }
  return { daSostenere: daSostenere, inAssemblea: inAssemblea };
}

function sostieniCandidato(emailCandidato, emailSponsor2) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioAmmissioni = ss.getSheetByName("Ammissioni");
  var dati = foglioAmmissioni.getDataRange().getValues();

  for (var i = 1; i < dati.length; i++) {
    // Con la colonna Cognome in mezzo, l'email del candidato ora è alla colonna D (indice 3)
    // Lo Sponsor 1 è alla colonna F (indice 5)
    // Lo Sponsor 2 è alla colonna G (indice 6)
    // Lo Stato Sostegno è alla colonna H (indice 7)
    
    if (dati[i][3].toString().toLowerCase() === emailCandidato.toLowerCase() &&
        dati[i][6].toString().toLowerCase() === emailSponsor2.toLowerCase() &&
        dati[i][7] === "ATTESA 2° SPONSOR") {
      
      // Aggiorna lo stato: ora ha i due sostegni ed è pronto per l'assemblea (Colonna H, indice 7)
      foglioAmmissioni.getRange(i + 1, 8).setValue("SOSTENUTO (PRONTO PER ASSEMBLEA)");
      return "OK";
    }
  }
  return "ERRORE";
}

// ==========================================
// VOTAZIONI ASSEMBLEARI PER AMMISSIONE (Art. 7)
// ==========================================

// 1. L'utente richiede le ammissioni attualmente aperte al voto
function getAmmissioniInVoto(emailSocio) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioAmm = ss.getSheetByName("Ammissioni");
  var foglioVotiAmm = ss.getSheetByName("VotiAmmissioni");

  // Se non c'è, crea il foglio per lo spoglio segreto
  if (!foglioVotiAmm) {
      foglioVotiAmm = ss.insertSheet("VotiAmmissioni");
      foglioVotiAmm.appendRow(["Timestamp", "HashSocio", "CandidatoEmail", "Voto"]);
  }

  var hashUtente = getHashUnivoco(emailSocio);
  if(!hashUtente) return [];

  var datiAmm = foglioAmm.getDataRange().getValues();
  var datiVoti = foglioVotiAmm.getDataRange().getValues();
  var daVotare = [];

  for (var i = 1; i < datiAmm.length; i++) {
      // Lo stato ora si trova alla colonna H (indice 7)
      if (datiAmm[i][7] === "IN VOTAZIONE") {
          
          // L'email del candidato ora è alla colonna D (indice 3)
          var emailCand = datiAmm[i][3]; 
          
          // Uniamo Nome (colonna B, indice 1) e Cognome (colonna C, indice 2)
          var nomeCompleto = (datiAmm[i][1] || "") + " " + (datiAmm[i][2] || "");
          var nomeCand = nomeCompleto.trim();
          
          // Controlla se questo socio ha già votato per questo specifico candidato
          var giaVotato = false;
          for (var v = 1; v < datiVoti.length; v++) {
              if (datiVoti[v][1] === hashUtente && datiVoti[v][2] === emailCand) {
                  giaVotato = true;
                  break;
              }
          }
          if (!giaVotato) {
              daVotare.push({ nome: nomeCand, email: emailCand });
          }
      }
  }
  return daVotare;
}

function votaAmmissioneSocio(dati) {
  if (verificaLogin({email: dati.email, password: dati.password}) !== "OK_LOGIN") return "ERR_AUTH";
  
  var hashUtente = getHashUnivoco(dati.email);
  if(!hashUtente) return "ERR_USER";

  var lock = LockService.getScriptLock();
  try {
      lock.waitLock(10000);
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var foglioVoti = ss.getSheetByName("VotiAmmissioni");

      // Doppio controllo anti-frode
      var datiVoti = foglioVoti.getDataRange().getValues();
      for(var i=1; i<datiVoti.length; i++){
          if(datiVoti[i][1] === hashUtente && datiVoti[i][3] === dati.emailCandidato) {
              return "GIA_VOTATO";
          }
      }

      foglioVoti.appendRow([new Date(), hashUtente, dati.emailCandidato, dati.voto]);
      scriviLog(dati.email, "VOTO_AMMISSIONE", "Espresso voto per: " + dati.emailCandidato);
      return "OK";
  } catch(e) {
      return "ERRORE";
  } finally {
      lock.releaseLock();
  }
}

