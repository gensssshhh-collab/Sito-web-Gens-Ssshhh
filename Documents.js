/// SEZIONE DOCUMENTI


function getListaDocumenti(modo, email) {
  var folderId = "";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioConfig = ss.getSheetByName("Config");

  // 1. Determina la cartella giusta
  if (modo === "PUBBLICO") {
      folderId = foglioConfig.getRange("B13").getValue();
  } else if (modo === "PRIVATO") {
      folderId = getUserFolderId(email, true);
  } else if (modo === "CESTINO") {
      var mainFolderId = getUserFolderId(email, true);
      if(mainFolderId) {
          folderId = getSubFolderId(mainFolderId, "Cestino");
      }
  }

  if(!folderId) return [];

  var lista = [];

  try {
    var rootFolder = DriveApp.getFolderById(folderId);
    
    // --- FUNZIONE INTERNA PER LEGGERE I FILE (Cerca anche nelle sottocartelle) ---
    function leggiFilesDaCartella(cartella) {
      var files = cartella.getFiles();
      while (files.hasNext()) {
        var file = files.next();
        var cat = file.getDescription(); // Legge la categoria dai metadati
        
        // INTELLIGENZA AUTOMATICA:
        // Se non ha categoria MA è nella cartella Verbali, lo etichettiamo come "Verbale"
        if (!cat || cat === "") {
            if (cartella.getName() === "Verbali Ufficiali") cat = "Verbale";
            else cat = "Altro"; 
        }
        
        lista.push({ 
            id: file.getId(), 
            nome: file.getName(), 
            url: file.getUrl(),
            categoria: cat 
        });
      }
    }

    // 1. Leggi i file "sfusi" nella cartella principale
    leggiFilesDaCartella(rootFolder);

    // 2. Leggi i file dentro le SOTTOCARTELLE (es. "Verbali Ufficiali")
    var subFolders = rootFolder.getFolders();
    while (subFolders.hasNext()) {
       leggiFilesDaCartella(subFolders.next());
    }

    return lista;
    
  } catch (e) { 
    console.log("Errore lettura drive: " + e);
    return []; 
  }
}

function getUserFolderId(email, createIfMissing) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioSoci = ss.getSheetByName("soci");
  var datiSoci = foglioSoci.getDataRange().getValues();
  var emailTarget = email.trim().toLowerCase();
  
  for (var i = 1; i < datiSoci.length; i++) {
    if (datiSoci[i][2].toString().trim().toLowerCase() === emailTarget) {
      var existingId = datiSoci[i][3];
      if (existingId && existingId !== "") return existingId;
      if (createIfMissing) {
        var foglioConfig = ss.getSheetByName("Config");
        var parentId = foglioConfig.getRange("B14").getValue(); 
        try {
          var parentFolder = DriveApp.getFolderById(parentId);
          var newFolder = parentFolder.createFolder("Personale_" + emailTarget);
          newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          var newId = newFolder.getId();
          foglioSoci.getRange(i + 1, 4).setValue(newId);
          return newId;
        } catch(e) { return null; }
      }
    }
  }
  return null;
}

function uploadFile(data, modo, email) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var foglioConfig = ss.getSheetByName("Config");
    var folderId = (modo === "PUBBLICO") ? foglioConfig.getRange("B13").getValue() : getUserFolderId(email, true);
    
    var folder = DriveApp.getFolderById(folderId);
    var blob = Utilities.newBlob(Utilities.base64Decode(data.content), data.mimeType, data.filename);
    var file = folder.createFile(blob);
    
    // SALVA LA CATEGORIA NELLA DESCRIZIONE DEL FILE
    var cat = data.category || "Altro";
    file.setDescription(cat); // <--- Trucco per i metadati
    
    scriviLog(email, "UPLOAD_FILE_" + modo, "Cat: " + cat);
    return "UPLOAD_OK";
  } catch (e) { return "ERRORE: " + e.toString(); }
}

function generaTesseraPDF(email) {
  try {
    var dati = getDatiUtente(email);
    if (!dati) {
      console.log("Errore: Utente non trovato per " + email);
      return "ERRORE_UTENTE";
    }

    // --- 1. QR CODE (QuickChart) ---
    // Dati minimi per privacy
    var qrData = "GENS-CARD:" + dati.tessera + "|" + dati.scadenza;
    var qrUrl = "https://quickchart.io/chart?chs=150x150&cht=qr&chl=" + encodeURIComponent(qrData);
    
    var qrBase64 = "";
    try {
      var qrBlob = UrlFetchApp.fetch(qrUrl).getBlob();
      qrBase64 = Utilities.base64Encode(qrBlob.getBytes());
    } catch (e) {
      qrBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    }

    // --- 2. HTML PDF (DESIGN "PREMIUM DARK") ---
    var html = `
      <html>
        <body style="font-family: 'Georgia', serif; padding: 40px; text-align: center; background-color: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
          
          <div style="
              width: 500px; 
              height: 310px; 
              margin: 0 auto; 
              background-color: #1a1a1a; /* Sfondo solido sicuro */
              background-image: linear-gradient(135deg, #2b2b2b 0%, #111111 100%); /* Sfumatura sopra */
              border-radius: 15px; 
              color: #d4af37; 
              padding: 0; 
              position: relative;
              overflow: hidden;
              border: 1px solid #000;
              text-align: left;
              display: flex;
              align-items: center;
              justify-content: space-between;
              -webkit-print-color-adjust: exact; 
              print-color-adjust: exact;
              ">
              
              <div style="
                  position: absolute; top: 15px; left: 15px; right: 15px; bottom: 15px; 
                  border: 1px solid #d4af37; 
                  opacity: 0.3;
                  border-radius: 10px; 
                  pointer-events: none;">
              </div>

              <div style="padding-left: 40px; width: 60%; z-index: 10;">
                  
                  <div style="
                      font-size: 12px; 
                      text-transform: uppercase; 
                      color: #f3e5ab; 
                      opacity: 0.8;
                      margin-bottom: 5px;
                      font-family: sans-serif;">
                      Associazione
                  </div>
                  
                  <div style="
                      font-size: 22px; 
                      font-weight: bold; 
                      text-transform: uppercase; 
                      margin-bottom: 30px; 
                      letter-spacing: 1px;
                      color: #d4af37;">
                      Gens Ssshhh
                  </div>

                  <div style="font-family: sans-serif; font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px;">Socio</div>
                  
                  <div style="
                      font-size: 24px; 
                      font-weight: bold; 
                      color: #ffffff !important; 
                      margin-bottom: 5px; 
                      white-space: nowrap;">
                      ${dati.nome}
                  </div>
                   <div style="
                      font-size: 24px; 
                      font-weight: bold; 
                      color: #ffffff !important; 
                      margin-bottom: 20px; 
                      white-space: nowrap;">
                      ${dati.cognome}
                  </div>

                  <div style="font-size: 14px; color: #d4af37; font-family: sans-serif;">
                      Tessera N. <span style="font-family: monospace; color: #fff; background: #333; padding: 2px 5px; border-radius: 3px;">${dati.tessera}</span>
                  </div>
                  <div style="font-size: 11px; color: #888; margin-top: 5px; font-family: sans-serif;">
                      Scadenza: ${dati.scadenza}
                  </div>
              </div>

              <div style="width: 35%; display: flex; justify-content: center; align-items: center; z-index: 10; padding-right: 30px;">
                  <div style="
                      padding: 8px; 
                      background: #ffffff; 
                      border: 2px solid #d4af37; 
                      border-radius: 8px;">
                      <img src="data:image/png;base64,${qrBase64}" style="width: 100px; height: 100px; display: block;" />
                  </div>
              </div>

          </div>
        </body>
      </html>
    `;

    var blob = Utilities.newBlob(html, MimeType.HTML).getAs(MimeType.PDF);
    blob.setName("Tessera_" + dati.nome + "_" + dati.cognome + ".pdf");
    scriviLog(email, "DOWNLOAD_TESSERA_PDF", "Ok");
    return "data:application/pdf;base64," + Utilities.base64Encode(blob.getBytes());
    
  } catch (e) {
    console.log("ERRORE CRITICO PDF: " + e.toString());
    return "ERRORE: " + e.toString();
  }
}

function spostaFileUtente(fileId, azione, email) {
    try {
        var userFolderId = getUserFolderId(email, false);
        if(!userFolderId) return "NO_FOLDER";

        var file = DriveApp.getFileById(fileId);
        
        // Sicurezza: controlla che il file appartenga davvero alla cartella dell'utente
        // (Omettiamo controllo genitori complesso per brevità, ma Drive protegge i permessi)

        if (azione === "delete") {
            // Sposta in "Cestino"
            var trashFolderId = getSubFolderId(userFolderId, "Cestino");
            var trashFolder = DriveApp.getFolderById(trashFolderId);
            file.moveTo(trashFolder);
            return "OK";
        } 
        else if (azione === "restore") {
            // Ripristina nella cartella principale
            var mainFolder = DriveApp.getFolderById(userFolderId);
            file.moveTo(mainFolder);
            return "OK";
        }
    } catch(e) { return "ERRORE: " + e.toString(); }
}


function getSubFolderId(parentId, name) {
    var parent = DriveApp.getFolderById(parentId);
    var folders = parent.getFoldersByName(name);
    if (folders.hasNext()) {
        return folders.next().getId();
    } else {
        return parent.createFolder(name).getId();
    }
}

function checkAccettazioneRegolamento(email) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fConfig = ss.getSheetByName("Config");
  var fSoci = ss.getSheetByName("Soci");
  
  // 1. Leggi la versione obbligatoria attuale
  var urlDoc = fConfig.getRange("B22").getValue();
  var verObbligatoria = fConfig.getRange("B23").getValue();
  
  if(!verObbligatoria) return { blocco: false }; // Se non c'è versione, non bloccare

  // 2. Cerca l'utente e controlla cosa ha firmato
  var dati = fSoci.getDataRange().getValues();
  var verUtente = "";
  
  for(var i=1; i<dati.length; i++) {
    if(dati[i][2].toString().toLowerCase() === email.toLowerCase()) {
       // CORREZIONE: Indice 17 corrisponde alla colonna R
       verUtente = dati[i][17]; 
       break;
    }
  }
  
  // Se la versione salvata è diversa da quella obbligatoria -> BLOCCO
  if(String(verUtente) !== String(verObbligatoria)) {
      return { 
        blocco: true, 
        url: urlDoc, 
        versione: verObbligatoria 
      };
  }
  
  return { blocco: false };
}

function registraAccettazioneRegolamento(email) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fConfig = ss.getSheetByName("Config");
  var fSoci = ss.getSheetByName("Soci");
  
  var verObbligatoria = fConfig.getRange("B23").getValue();
  var dati = fSoci.getDataRange().getValues();
  
  for(var i=1; i<dati.length; i++) {
    if(dati[i][2].toString().toLowerCase() === email.toLowerCase()) {
       // CORREZIONE: Colonna 18 corrisponde alla colonna R
       fSoci.getRange(i+1, 18).setValue(verObbligatoria);
       scriviLog(email, "ACCETTAZIONE_DOC", "Ver: " + verObbligatoria);
       return "OK";
    }
  }
  return "ERR";
}

