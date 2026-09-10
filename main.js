// ==========================================
// 1. INIZIALIZZAZIONE E UTILITÀ
// ==========================================

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('index');
  
  // Controlla se c'è un "token" nel link
  var token = (e && e.parameter && e.parameter.token) ? e.parameter.token : "";
  
  // Passa il token alla pagina HTML (se vuoto, entra normale)
  template.serverToken = token;
  
  return template.evaluate()
      .setTitle('Area Riservata Soci')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
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

    // 2. PONTE UNIVERSALE DINAMICO
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

    // 3. SE LA FUNZIONE NON ESISTE
    return ContentService.createTextOutput(JSON.stringify({
      status: "ERROR",
      messaggio: "Azione (" + azione + ") non trovata sul server."
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "FATAL_ERROR", error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
