// ==========================================
// 1. INIZIALIZZAZIONE E UTILITÀ
// ==========================================

function doGet(e) {
  // Il backend ora funge solo da API invisibile. Nessuna interfaccia HTML viene generata.
  return ContentService.createTextOutput("Gens Ssshhh Backend API - Attivo e funzionante");
}

function autorizzaDriveVerbali() {
  var folderId = "1B40jXYlF9nXvR7rKGtIjpWYl4SMgGrXH";
  var folder = DriveApp.getFolderById(folderId);
  return "DRIVE_OK: " + folder.getName();
}


var SECRET_SALT = "INCULATI-BRUTTO-GAYNEU37Y"; 

function creaHash(input) {
  // 1. Assicurati che input sia una stringa (evita errori se è null/undefined)
  var text = (input || "").toString();
  
  // 2. Aggiunge il SALT (la tua frase segreta definita sopra)
  var textSalted = text + SECRET_SALT;
  
  // 3. Calcola l'hash SHA-256 (restituisce un array di byte con segno)
  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, textSalted);
  
  // 4. Converte i byte in una stringa esadecimale pulita
  var txtHash = "";
  for (var i = 0; i < rawHash.length; i++) {
    var hashVal = rawHash[i];
    if (hashVal < 0) {
      hashVal += 256; // Correzione per i byte negativi
    }
    if (hashVal.toString(16).length == 1) {
      txtHash += '0'; // Aggiunge lo zero iniziale se serve (padding)
    }
    txtHash += hashVal.toString(16);
  }
  
  return txtHash;
}

function doPost(e) {
  try {
    var richiesta = JSON.parse(e.postData.contents);
    var azione = richiesta.azione;

    // 1. GESTIONE LOGIN (Esistente)
    if (azione === "login") {
       var esito = verificaLogin({email: richiesta.email, password: richiesta.password, info: "Accesso Mobile"});
       if (esito === "OK_LOGIN") {
         return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", dati: getDatiUtente(richiesta.email) })).setMimeType(ContentService.MimeType.JSON);
       } else {
         return ContentService.createTextOutput(JSON.stringify({ status: "ERROR", messaggio: "Credenziali errate." })).setMimeType(ContentService.MimeType.JSON);
       }
    }

    // 2. BACKEND COMPATIBILITÀ EVENTI: gestione diretta delle azioni di calendario
    if (azione === "getProposteEventi") {
      var emailProposte = Array.isArray(richiesta.payload) ? richiesta.payload[0] : (richiesta.email || richiesta.payload || "");
      var sheetEventi = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ProposteEventi');
      if (!sheetEventi) {
        return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", data: [] })).setMimeType(ContentService.MimeType.JSON);
      }

      var values = sheetEventi.getDataRange().getValues();
      var dati = values.slice(1).filter(function (row) {
        return String(row[7] || 'ATTIVA') === 'ATTIVA';
      }).map(function (row) {
        var opzioni = [];
        var voti = {};
        try { opzioni = JSON.parse(row[5] || '[]'); } catch (e) { }
        try { voti = JSON.parse(row[6] || '{}'); } catch (e) { }
        delete voti._votanti;
        return {
          id: String(row[0]),
          titolo: String(row[3] || ''),
          descrizione: String(row[4] || ''),
          opzioni: opzioni,
          voti: voti
        };
      });

      return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", data: dati })).setMimeType(ContentService.MimeType.JSON);
    }

    if (azione === "creaPropostaEvento") {
      var payloadEvento = richiesta.payload;
      if (Array.isArray(payloadEvento)) {
        payloadEvento = { email: payloadEvento[0], proposta: payloadEvento[1] || {} };
      }
      var emailEvento = payloadEvento.email || payloadEvento && payloadEvento[0] || richiesta.email || "";
      var propostaEvento = payloadEvento.proposta || payloadEvento || {};
      var titolo = String(propostaEvento.titolo || '').trim();
      var descrizione = String(propostaEvento.descrizione || '').trim();
      var opzioni = Array.isArray(propostaEvento.opzioni) ? propostaEvento.opzioni.map(function (opzione) {
        return {
          data: String(opzione.data || '').trim(),
          ora: String(opzione.ora || '').trim(),
          luogo: String(opzione.luogo || '').trim()
        };
      }).filter(function (opzione) {
        return opzione.data || opzione.ora || opzione.luogo;
      }) : [];

      if (!titolo || !descrizione || !opzioni.length) {
        return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", data: { ok: false, messaggio: 'Titolo, descrizione e almeno una opzione sono obbligatori.' } })).setMimeType(ContentService.MimeType.JSON);
      }

      var ssEvento = SpreadsheetApp.getActiveSpreadsheet();
      var sheetEvento = ssEvento.getSheetByName('ProposteEventi');
      if (!sheetEvento) {
        sheetEvento = ssEvento.insertSheet('ProposteEventi');
        sheetEvento.appendRow(['ID', 'CreatoIl', 'CreatoreEmail', 'Titolo', 'Descrizione', 'OpzioniJson', 'VotiJson', 'Stato']);
      }

      var idEvento = Utilities.getUuid();
      sheetEvento.appendRow([idEvento, new Date(), String(emailEvento).trim().toLowerCase(), titolo, descrizione, JSON.stringify(opzioni), JSON.stringify({}), 'ATTIVA']);

      return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", data: { ok: true, proposta: { id: idEvento, titolo: titolo, descrizione: descrizione, opzioni: opzioni, voti: {} } } })).setMimeType(ContentService.MimeType.JSON);
    }

    if (azione === "votaPropostaEvento") {
      var payloadVoto = richiesta.payload;
      if (Array.isArray(payloadVoto)) {
        payloadVoto = { email: payloadVoto[0], propostaId: payloadVoto[1], optionIndex: payloadVoto[2] };
      }
      var emailVoto = String(payloadVoto.email || richiesta.email || '').trim().toLowerCase();
      var propostaId = String(payloadVoto.propostaId || payloadVoto.id || '');
      var indice = Number(payloadVoto.optionIndex);

      var sheetVoto = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ProposteEventi');
      if (!sheetVoto) {
        return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", data: { ok: false, messaggio: 'Proposta non trovata.' } })).setMimeType(ContentService.MimeType.JSON);
      }

      var rowsVoto = sheetVoto.getDataRange().getValues();
      var rowIndex = rowsVoto.findIndex(function (row, index) {
        return index > 0 && String(row[0]) === String(propostaId);
      });
      if (rowIndex < 1) {
        return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", data: { ok: false, messaggio: 'Proposta non trovata.' } })).setMimeType(ContentService.MimeType.JSON);
      }

      var rigaVoto = rowsVoto[rowIndex];
      var opzioniVoto = JSON.parse(rigaVoto[5] || '[]');
      if (!Number.isInteger(indice) || indice < 0 || indice >= opzioniVoto.length) {
        return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", data: { ok: false, messaggio: 'Opzione non valida.' } })).setMimeType(ContentService.MimeType.JSON);
      }

      var voti = {};
      try { voti = JSON.parse(rigaVoto[6] || '{}'); } catch (e) { }
      var votanti = voti._votanti || {};
      if (votanti[emailVoto] !== undefined) {
        return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", data: { ok: false, messaggio: 'Hai già votato questa proposta.' } })).setMimeType(ContentService.MimeType.JSON);
      }

      voti[indice] = Number(voti[indice] || 0) + 1;
      votanti[emailVoto] = indice;
      voti._votanti = votanti;
      sheetVoto.getRange(rowIndex + 1, 7).setValue(JSON.stringify(voti));
      delete voti._votanti;
      return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", data: { ok: true, voti: voti } })).setMimeType(ContentService.MimeType.JSON);
    }

    // 3. PONTE UNIVERSALE DINAMICO
    // Cerca una funzione nel backend che si chiami esattamente come l'azione richiesta
    if (typeof this[azione] === 'function') {
       // Estrae i parametri in modo flessibile a seconda di come li invia l'app
       var param = richiesta.payload !== undefined ? richiesta.payload :
                   richiesta.email !== undefined ? richiesta.email :
                   richiesta.dati !== undefined ? richiesta.dati : richiesta;

       var risultato;
           if (Array.isArray(param)) {
               risultato = this[azione].apply(this, param); // Spacchetta l'array nei vari argomenti
           } else {
               risultato = this[azione](param);
           }

       return ContentService.createTextOutput(JSON.stringify({
         status: "SUCCESS",
         data: risultato
       })).setMimeType(ContentService.MimeType.JSON);
    }

    // 4. SE LA FUNZIONE NON ESISTE
    return ContentService.createTextOutput(JSON.stringify({
      status: "ERROR",
      messaggio: "Azione (" + azione + ") non trovata sul server."
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "FATAL_ERROR", error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
