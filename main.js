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
    // 1. Legge la richiesta in arrivo dall'app Android / Vercel
    var richiesta = JSON.parse(e.postData.contents);
    var azione = richiesta.azione;
    
    // 2. Smista la richiesta in base all'azione richiesta
    switch (azione) {
      
      case "login":
        var email = richiesta.email;
        var password = richiesta.password;
        var esito = verificaLogin({email: email, password: password, info: "Accesso da App Mobile"});
        
        if (esito === "OK_LOGIN") {
          var utente = getDatiUtente(email);
          return ContentService.createTextOutput(JSON.stringify({
            status: "SUCCESS",
            messaggio: "Login effettuato",
            dati: utente
          })).setMimeType(ContentService.MimeType.JSON);
        } else {
          return ContentService.createTextOutput(JSON.stringify({
            status: "ERROR",
            messaggio: "Credenziali errate o account bloccato."
          })).setMimeType(ContentService.MimeType.JSON);
        }
        
      // Aggiungi le prossime azioni qui sotto (es. recuperare i dati del profilo, le consultazioni, ecc.)
      /*
      case "getConsultazioni":
        // Logica per le consultazioni...
      */

      default:
        // Se l'app invia un'azione che non esiste
        return ContentService.createTextOutput(JSON.stringify({
          status: "ERROR",
          messaggio: "Azione non riconosciuta dal server."
        })).setMimeType(ContentService.MimeType.JSON);
    }

  } catch (err) {
    // Rete di sicurezza globale esattamente come l'avevi impostata tu
    return ContentService.createTextOutput(JSON.stringify({
      status: "FATAL_ERROR", 
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
