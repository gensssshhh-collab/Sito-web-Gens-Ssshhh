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
      var esito = verificaLogin({ email: richiesta.email, password: richiesta.password, info: "Accesso Mobile" });
      if (esito === "OK_LOGIN") {
        return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", dati: getDatiUtente(richiesta.email) })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({ status: "ERROR", messaggio: "Credenziali errate." })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // 2. PROPOSTE EVENTI: i risultati pubblici contengono solo conteggi aggregati.
    if (azione === "getProposteEventi") {
      var payloadProposte = richiesta.payload;
      var emailProposte = Array.isArray(payloadProposte) ? payloadProposte[0] : (typeof payloadProposte === "string" ? payloadProposte : payloadProposte && payloadProposte.email);
      return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", data: getProposteEventi(emailProposte || richiesta.email || "") })).setMimeType(ContentService.MimeType.JSON);
    }

    if (azione === "getPropostaEventoPubblica") {
      return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", data: getPropostaEventoPubblica(richiesta.payload) })).setMimeType(ContentService.MimeType.JSON);
    }

    if (azione === "creaPropostaEvento") {
      var payloadEvento = richiesta.payload;
      if (Array.isArray(payloadEvento)) {
        var risultatoCreazione = creaPropostaEvento(payloadEvento[0], payloadEvento[1] || {});
      } else {
        var risultatoCreazione = creaPropostaEvento(payloadEvento.email || richiesta.email || "", payloadEvento.proposta || payloadEvento);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", data: risultatoCreazione })).setMimeType(ContentService.MimeType.JSON);
    }

    if (azione === "votaPropostaEvento") {
      var payloadVoto = richiesta.payload;
      if (Array.isArray(payloadVoto)) {
        var risultatoVoto = votaPropostaEvento(payloadVoto[0], payloadVoto[1], payloadVoto[2]);
      } else {
        var risultatoVoto = votaPropostaEvento(payloadVoto.email || richiesta.email || "", payloadVoto.propostaId || payloadVoto.id, payloadVoto.risposta || payloadVoto.voto || payloadVoto);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", data: risultatoVoto })).setMimeType(ContentService.MimeType.JSON);
    }

    if (azione === "processaScadenzeAmmissioni") {
      return ContentService.createTextOutput(JSON.stringify({ status: "ERROR", messaggio: "Azione interna non invocabile via API." })).setMimeType(ContentService.MimeType.JSON);
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
