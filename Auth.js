/// SEZIONE AUTENTICAZIONE  (Autenticazione e Profilo)

function verificaLogin(dati) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioSoci = ss.getSheetByName("soci");
  var emailInput = dati.email.trim().toLowerCase();
  
  // --- 1. CONTROLLO BRUTE FORCE (Novità) ---
  var cache = CacheService.getScriptCache();
  var lockKey = "block_login_" + Utilities.base64Encode(emailInput);
  var tentativi = Number(cache.get(lockKey)) || 0;
  
  // Se ha fallito 5 volte, blocca e restituisce codice speciale
  if (tentativi >= 5) {
    scriviLog(emailInput, "LOGIN_BLOCCATO", "Troppi tentativi");
    return "BLOCKED";
  }

  // --- 2. VERIFICA CREDENZIALI ---
  var passwordHash = creaHash(dati.password.trim()); // Usa il nuovo hash con SALT
  var datiSoci = foglioSoci.getDataRange().getValues();
  
  for (var i = 1; i < datiSoci.length; i++) {
    if (datiSoci[i][2].toString().trim().toLowerCase() === emailInput) {
      if (datiSoci[i][1].toString() === passwordHash) {
        // SUCCESSO: Resetta il contatore e logga (CON INFO BROWSER)
        cache.remove(lockKey);
        
        // *** QUESTA È LA RIGA MODIFICATA ***
        scriviLog(emailInput, "LOGIN_OK", dati.info);
        
        return "OK_LOGIN";
      } else {
        // ERRORE: Incrementa contatore e blocca per 5 min (300 sec)
        tentativi++;
        cache.put(lockKey, String(tentativi), 300);
        scriviLog(emailInput, "LOGIN_FALLITO", "Tentativo " + tentativi + "/5");
        return "ERR_CREDENZIALI";
      }
    }
  }
  
  scriviLog(emailInput, "LOGIN_FALLITO_NO_USER");
  return "ERR_CREDENZIALI";
}

function getHashUnivoco(email) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("soci");
  var dati = sheet.getDataRange().getValues();
  var target = email.trim().toLowerCase();
  
  for (var i = 1; i < dati.length; i++) {
    // Colonna C (indice 2) è l'email
    if (dati[i][2].toString().trim().toLowerCase() === target) {
      var uuid = dati[i][14]; // Colonna O (indice 14) è ID_Univoco
      
      // SICUREZZA: Se per caso manca l'UUID (nuovo socio inserito a mano male), lo creiamo al volo
      if (!uuid || uuid === "") {
        uuid = Utilities.getUuid();
        sheet.getRange(i + 1, 15).setValue(uuid); // Lo salviamo per il futuro
      }
      
      // L'Hash ora si basa sull'UUID, non sull'email!
      return creaHash(uuid);
    }
  }
  return null; // Socio non trovato
}

function scriviLog(email, azione, infoExtra) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var foglioLog = ss.getSheetByName("Log");
    // Se non passi infoExtra, mette un trattino
    var extra = infoExtra || "-"; 
    
    if (foglioLog) {
      // Aggiunge riga: Data | Email | Azione | Info Extra
      foglioLog.appendRow([new Date(), email, azione, extra]);
    }
  } catch(e) { console.log("Log Error: " + e); }
}

function cambiaPassword(dati) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioSoci = ss.getSheetByName("soci");
  var datiSoci = foglioSoci.getDataRange().getValues();
  var emailInput = dati.email.trim().toLowerCase();
  var oldPassHash = creaHash(dati.oldPass.trim());
  for (var i = 1; i < datiSoci.length; i++) {
    if (datiSoci[i][2].toString().trim().toLowerCase() === emailInput && datiSoci[i][1].toString() === oldPassHash) {
      foglioSoci.getRange(i + 1, 2).setValue(creaHash(dati.newPass.trim()));
      return "CAMBIO_OK";
    }
  }
  return "ERRORE_CREDENZIALI";
}

function eseguiResetPassword(emailInput) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioSoci = ss.getSheetByName("soci");
  var datiSoci = foglioSoci.getDataRange().getValues();
  var emailTarget = emailInput.trim().toLowerCase();
  for (var i = 1; i < datiSoci.length; i++) {
    if (datiSoci[i][2].toString().trim().toLowerCase() === emailTarget) {
      var passTemp = Math.random().toString(36).slice(-8);
      foglioSoci.getRange(i + 1, 2).setValue(creaHash(passTemp));
      try { MailApp.sendEmail(emailTarget, "Nuova Password", "Password: " + passTemp); return "RESET_OK"; } catch(e) {}
    }
  }
  return "EMAIL_NON_TROVATA";
}

function inviaLinkReset(email) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioSoci = ss.getSheetByName("soci");
  var dati = foglioSoci.getDataRange().getValues();
  var emailTarget = email.trim().toLowerCase();
  
  for (var i = 1; i < dati.length; i++) {
    if (dati[i][2].toString().trim().toLowerCase() === emailTarget) {
      
      // 1. Genera un Token unico (basato su tempo e random)
      var token = Utilities.getUuid();
      var ora = new Date().getTime(); // Timestamp attuale
      
      // 2. Salva Token e Orario nel foglio (Assumiamo Colonne H=7 e I=8, indici partono da 0)
      // Se le tue colonne sono diverse, adatta gli indici (7 e 8)
      foglioSoci.getRange(i + 1, 8).setValue(token); // Colonna H
      foglioSoci.getRange(i + 1, 9).setValue(ora);   // Colonna I
      
      // 3. Crea il Link
      // Nota: ScriptApp.getService().getUrl() ti dà l'indirizzo della tua Web App
      var link = ScriptApp.getService().getUrl() + "?token=" + token;
      
      // 4. Invia Mail
      try {
        MailApp.sendEmail({
          to: emailTarget,
          subject: "🔐 Reimposta la tua Password",
          htmlBody: "<h3>Richiesta di cambio password</h3>" +
                    "<p>Hai richiesto di reimpostare la password. Clicca sul link qui sotto per sceglierne una nuova:</p>" +
                    "<p><a href='" + link + "' style='background:#3b82f6; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;'>IMPOSTA NUOVA PASSWORD</a></p>" +
                    "<p><small>Se non sei stato tu, ignora questa mail. Il link scade tra 1 ora.</small></p>"
        });
        return "LINK_INVIATO";
      } catch(e) { return "ERRORE_MAIL"; }
    }
  }
  // Per sicurezza non diciamo se l'email non esiste
  return "LINK_INVIATO"; 
}

function completaResetPassword(token, nuovaPass) {
  if(!token) return "ERR_TOKEN";
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioSoci = ss.getSheetByName("soci");
  var dati = foglioSoci.getDataRange().getValues();
  var oraAttuale = new Date().getTime();
  
  for (var i = 1; i < dati.length; i++) {
    // Controlla Colonna H (ResetToken)
    if (dati[i][7] == token) {
      var timestamp = dati[i][8]; // Colonna I (ResetTime)
      
      // Controlla scadenza (1 ora = 3600000 ms)
      if (oraAttuale - timestamp > 3600000) return "SCADUTO";
      
      // Salva nuova password (Hashata)
      foglioSoci.getRange(i + 1, 2).setValue(creaHash(nuovaPass));
      
      // Cancella il token usato per sicurezza
      foglioSoci.getRange(i + 1, 8).setValue("");
      foglioSoci.getRange(i + 1, 9).setValue("");
      
      return "SUCCESS";
    }
  }
  return "ERR_TOKEN";
}

function getDatiUtente(email) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioSoci = ss.getSheetByName("soci");
  var dati = foglioSoci.getDataRange().getValues();
  var target = email.trim().toLowerCase();
  
  for (var i = 1; i < dati.length; i++) {
    // Colonna C (Indice 2) contiene l'email
    if (dati[i][2].toString().trim().toLowerCase() === target) {
      
      // --- RECUPERO DATI ---
      var rawTessera = dati[i][9];   // Colonna J
      var rawScadenza = dati[i][10]; // Colonna K
      var rawStato = dati[i][11];    // Colonna L
      var rawCarica = dati[i][12];   // Colonna M (Carica Sociale) [CITE: image_dd1145.jpg]

      // Formatta la data
      var scadenzaFmt = "";
      if (rawScadenza instanceof Date) {
        scadenzaFmt = Utilities.formatDate(rawScadenza, "Europe/Rome", "dd/MM/yyyy");
      } else {
        scadenzaFmt = rawScadenza ? rawScadenza.toString() : "N/D";
      }

      // --- CALCOLO HASH PERSONALE DA MOSTRARE ALL'UTENTE ---
      var mioHash = getHashUnivoco(target);

      return {
        nome: dati[i][0],      
        cognome: dati[i][4],   
        email: dati[i][2],
        telefono: dati[i][5],  
        indirizzo: dati[i][6], 
        tessera: rawTessera ? rawTessera.toString() : "N/D",
        scadenza: scadenzaFmt,
        stato: rawStato ? rawStato.toString().toUpperCase() : "NON ATTIVO",
        // Leggiamo la carica. Se vuota, mettiamo "Socio semplice"
        ruolo: rawCarica ? rawCarica.toString().trim() : "Socio semplice", 
        hash: mioHash
      };
    }
  }
  return null;
}

function salvaDatiUtente(datiForm) {
  if (verificaLogin({email: datiForm.email, password: datiForm.password}) !== "OK_LOGIN") return "ERR_AUTH";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioSoci = ss.getSheetByName("soci");
  var dati = foglioSoci.getDataRange().getValues();
  var target = datiForm.email.trim().toLowerCase();
  
  for (var i = 1; i < dati.length; i++) {
    if (dati[i][2].toString().trim().toLowerCase() === target) {
      foglioSoci.getRange(i+1, 5).setValue(datiForm.cognome);
      foglioSoci.getRange(i+1, 6).setValue(datiForm.telefono);
      foglioSoci.getRange(i+1, 7).setValue(datiForm.indirizzo);
      scriviLog(target, "PROFILO_AGGIORNATO");
      return "SALVATAGGIO_OK";
    }
  }
  return "ERR_GENERICO";
}

function inviaRichiestaDimissioni(dati) {
  if(verificaLogin(dati) !== "OK_LOGIN") return "ERR_AUTH";
  var emailUtente = dati.email.trim().toLowerCase();
  var info = getDatiUtente(emailUtente);
  var nomeCompleto = info ? (info.nome + " " + info.cognome) : emailUtente;
  scriviLog(emailUtente, "RICHIESTA_DIMISSIONI");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var emailAdmin = ss.getSheetByName("Config").getRange("B19").getValue() || "gens.ssshhh@gmail.com";
  try {
    MailApp.sendEmail(emailAdmin, "⚠️ Richiesta Dimissioni", "Il socio " + nomeCompleto + " (" + emailUtente + ") ha richiesto le dimissioni.");
    return "DIMISSIONI_OK";
  } catch(e) { return "ERRORE_MAIL"; }
}



function getStartData(email) {
  // Eseguiamo tutte le letture insieme lato server (molto più veloce)
  // Recupera i dati utente di base
  var user = getHomeSummary(email); 
  
  // Recupera le news (se la funzione esiste, altrimenti array vuoto)
  var news = [];
  try { news = getAvvisiPubblici(); } catch(e) {}

  // Recupera stato voto
  var voto = { status: "CHIUSE" };
  try { voto = checkStatoVoto(email); } catch(e) {}
  
  // Restituiamo un pacchetto unico al sito
  return {
    utente: user,
    avvisi: news,
    statoVoto: voto
  };
}

