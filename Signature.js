/// SEZIONE FIRMA

// 1. Processo di Firma e OTP (Socio)

function requestSignOTP(email, docId) {
  var user = getDatiUtente(email);
  if (!user) return "ERR_USER";

  // Genera OTP 6 cifre
  var otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Salva OTP in Cache (dura 5 minuti = 300 sec)
  var cache = CacheService.getScriptCache();
  cache.put("SIGN_OTP_" + email, otp, 300);
  cache.put("SIGN_DOC_" + email, docId, 300); // Leghiamo l'OTP a QUESTO documento specifico

  // Invia Mail
  MailApp.sendEmail({
    to: email,
    subject: "🔐 Codice di Sicurezza per Firma",
    htmlBody: "<h3>Codice OTP: <span style='font-size:20px; background:#eee; padding:5px;'>" + otp + "</span></h3>" +
              "<p>Inserisci questo codice per firmare digitalmente il documento.</p>" +
              "<p><small>Il codice scade tra 5 minuti.</small></p>"
  });

  return "OTP_SENT";
}

function verifyAndSign(email, inputOtp, browserInfo) {
  var cache = CacheService.getScriptCache();
  var storedOtp = cache.get("SIGN_OTP_" + email);
  var storedDocId = cache.get("SIGN_DOC_" + email);

  if (!storedOtp || storedOtp !== inputOtp) return "ERR_OTP";

  // --- INIZIO PROCESSO CRITTOGRAFICO ---
  
  // 1. Recupera il File Originale
  var file = DriveApp.getFileById(storedDocId);
  var blob = file.getBlob();
  var bytes = blob.getBytes();
  
  // 2. Calcola Hash del Documento (L'impronta digitale del file)
  var docHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  var docHashHex = bytesToHex(docHash); // Funzione helper sotto

  // 3. Crea il "Sigillo di Firma"
  var timestamp = new Date();
  var idTransazione = Utilities.getUuid();
  
  // Stringa che lega indissolubilmente Utente + Documento + Tempo
  var rawSignature = email + "|" + docHashHex + "|" + timestamp.getTime() + "|" + SECRET_SALT;
  
  // Firma finale (Hash della stringa sopra)
  var signatureHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, rawSignature);
  var signatureHex = bytesToHex(signatureHash);

  // 4. Scrivi nell'Audit Trail (Immutabile)
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("AuditFirme");
  sheet.appendRow([
    timestamp,
    idTransazione,
    email,
    file.getName(),
    docHashHex,
    signatureHex,
    browserInfo
  ]);

  // 5. Genera il "Certificato di Firma" (PDF Ricevuta)
  var certificatoBlob = generaCertificatoFirma(email, file.getName(), docHashHex, signatureHex, idTransazione, timestamp);
  
  // Invia il certificato via mail
  MailApp.sendEmail({
    to: email,
    subject: "✅ Documento Firmato: " + file.getName(),
    htmlBody: "Hai firmato correttamente. In allegato trovi il certificato di firma con i dati crittografici.",
    attachments: [certificatoBlob]
  });

  // Pulisce la cache (OTP bruciato)
  cache.remove("SIGN_OTP_" + email);

  return "SIGN_OK";
}

function finalizzaFirmaRichiesta(idRichiesta, otp, email, browserInfo) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("RichiesteFirma");
  var dati = sheet.getDataRange().getValues();
  var rigaTarget = -1;
  var idFileDrive = "";
  var serveControfirma = "NO";

  // 1. Trova Richiesta
  for (var i = 1; i < dati.length; i++) {
    if (dati[i][0] === idRichiesta && dati[i][2].toLowerCase() === email.toLowerCase()) {
       rigaTarget = i + 1;
       idFileDrive = dati[i][4];
       serveControfirma = dati[i][8]; // Colonna I
       break;
    }
  }
  if (rigaTarget === -1) return "RICHIESTA_NON_TROVATA";

  // 2. Verifica OTP (Logica identica a prima)
  var cache = CacheService.getScriptCache();
  var storedOtp = cache.get("SIGN_OTP_" + email);
  if (!storedOtp || storedOtp !== otp) return "ERR_OTP";

  try {
     var file = DriveApp.getFileById(idFileDrive);
     var blob = file.getBlob();
     var docHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, blob.getBytes());
     var docHashHex = bytesToHex(docHash);
     var txId = Utilities.getUuid();
     var timestamp = new Date();
     
     // 3. LOGICA DI STATO (Idea 10)
     var nuovoStato = (serveControfirma === "SI") ? "DA_CONTROFIRMARE" : "FIRMATO";
     
     // Aggiorna DB
     sheet.getRange(rigaTarget, 6).setValue(nuovoStato);
     sheet.getRange(rigaTarget, 7).setValue(timestamp); // Data firma socio
     sheet.getRange(rigaTarget, 8).setValue(txId);

     // Audit Trail
     var auditSheet = ss.getSheetByName("AuditFirme");
     if(auditSheet) {
        var rawSig = email + "|" + docHashHex + "|" + timestamp.getTime() + "|" + SECRET_SALT;
        var sigHash = bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, rawSig));
        auditSheet.appendRow([timestamp, txId, email, file.getName(), docHashHex, sigHash, browserInfo, "SOCIO_FIRMATO"]);
     }
     
     cache.remove("SIGN_OTP_" + email);
     
     // Messaggio diverso all'utente
     if (nuovoStato === "DA_CONTROFIRMARE") return "OK_WAIT_ADMIN";
     return "OK";

  } catch(e) { return "ERRORE: " + e.toString(); }
}


// 2. Generazione Certificati e Crittografia

function bytesToHex(bytes) {
  var txt = "";
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b < 0) b += 256;
    var h = b.toString(16);
    if (h.length == 1) txt += "0";
    txt += h;
  }
  return txt;
}

function generaCertificatoFirma(email, docName, docHash, signHash, txId, data) {
  
  // --- NOVITÀ: Formattazione data italiana ---
  var dataFormattata = Utilities.formatDate(data, "Europe/Rome", "dd/MM/yyyy HH:mm:ss");

  var html = `
    <div style="font-family:Helvetica; padding:40px; border:5px solid #0f172a;">
      <h1 style="color:#0f172a; text-transform:uppercase;">Certificato di Firma Elettronica</h1>
      <p>Il presente documento certifica l'apposizione di firma elettronica tramite processo OTP con validazione temporale.</p>
      
      <hr>
      <h3>Dati Firmatario</h3>
      <p><b>Utente:</b> ${email}</p>
      <p><b>Data e Ora:</b> ${dataFormattata} (Fuso Orario: Europe/Rome)</p>
      <p><b>ID Transazione:</b> ${txId}</p>

      <h3>Impronta Documento (SHA-256)</h3>
      <p>Documento: ${docName}</p>
      <code style="background:#eee; display:block; padding:10px; word-break:break-all; font-size:10px;">${docHash}</code>

      <h3>Sigillo Crittografico (Firma)</h3>
      <code style="background:#e0f2fe; display:block; padding:10px; word-break:break-all; font-size:10px;">${signHash}</code>
      
      <div style="margin-top:50px; text-align:center; font-size:10px; color:#888;">
        Generato da Sistema Sicuro Gens Ssshhh - Validazione SHA-256
      </div>
    </div>
  `;
  
  var blob = Utilities.newBlob(html, MimeType.HTML).getAs(MimeType.PDF);
  blob.setName("Certificato_Firma_" + txId + ".pdf");
  return blob;
}

// 3. Schermate e Storico (Socio)

function getRichiesteFirmaUtente(email) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("RichiesteFirma");
  var dati = sheet.getDataRange().getValues();
  var lista = [];

  for (var i = 1; i < dati.length; i++) {
    // Filtra per email e stato PENDENTE
    if (dati[i][2].toString().toLowerCase() === email.toLowerCase() && dati[i][5] === "PENDENTE") {
       lista.push({
         idRichiesta: dati[i][0],
         data: Utilities.formatDate(new Date(dati[i][1]), "Europe/Rome", "dd/MM/yyyy"),
         nomeFile: dati[i][3],
         urlFile: "https://drive.google.com/file/d/" + dati[i][4] + "/view?usp=sharing",
         idFileDrive: dati[i][4] // Serve per il calcolo Hash
       });
    }
  }
  return lista;
}

function getStoricoFirmeUtente(email) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("RichiesteFirma");
  var dati = sheet.getDataRange().getValues();
  var storico = [];

  for (var i = 1; i < dati.length; i++) {
    // Cerca le righe dell'utente che NON sono "PENDENTE"
    if (dati[i][2].toString().toLowerCase() === email.toLowerCase() && dati[i][5] !== "PENDENTE") {
       
       var dataFirma = dati[i][6]; // Colonna G (Timestamp firma)
       var dataFmt = (dataFirma instanceof Date) ? Utilities.formatDate(dataFirma, "Europe/Rome", "dd/MM/yyyy HH:mm") : "N/D";
       
       storico.push({
         idRichiesta: dati[i][0],
         dataFirma: dataFmt,
         nomeFile: dati[i][3],
         urlFile: "https://drive.google.com/file/d/" + dati[i][4] + "/view?usp=sharing",
         stato: dati[i][5],
         txId: dati[i][7] // Colonna H (Transaction ID)
       });
    }
  }
  return storico.reverse(); // Ordina dai più recenti ai più vecchi
}

function rigeneraCertificatoUtente(txId, email) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var auditSheet = ss.getSheetByName("AuditFirme");
    var auditData = auditSheet.getDataRange().getValues();
    
    // Cerca la transazione esatta nel registro incrudibile di Audit
    for(var i = 1; i < auditData.length; i++) {
        if(auditData[i][1] === txId && auditData[i][2].toString().toLowerCase() === email.toLowerCase()) {
            var data = new Date(auditData[i][0]);
            var docName = auditData[i][3];
            var docHash = auditData[i][4];
            var signHash = auditData[i][5];
            
            // Usa la funzione esistente per generare il PDF
            var blob = generaCertificatoFirma(email, docName, docHash, signHash, txId, data);
            
            // Converte in Base64 per passarlo al browser e farlo scaricare
            return "data:application/pdf;base64," + Utilities.base64Encode(blob.getBytes());
        }
    }
    return "ERR_NOT_FOUND";
}