/// SEZIONE ADMIN
// 1. Dashboard e Gestione Soci



// ADMIN: RECUPERO DATI DASHBOARD E LISTA SOCI

function getDashboardAdmin(email) {
  try {
    var user = getDatiUtente(email);
    var ruoliAdmin = ["PRESIDENTE", "SEGRETARIO", "TESORIERE", "VICEPRESIDENTE"];
    if (!user || !ruoliAdmin.includes(user.ruolo.toUpperCase())) return null;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Cerca esplicitamente il foglio con la "s" minuscola (con fallback maiuscolo per sicurezza)
    var fSoci = ss.getSheetByName("soci") || ss.getSheetByName("Soci");
    if (!fSoci) return { totSoci: 0, aventiDiritto: 0, listaSoci: [] };

    var datiSoci = fSoci.getDataRange().getValues();
    var listaSoci = [];
    var aventiDiritto = 0;
    
    // Salta l'intestazione (riga 0)
    for(var i=1; i < datiSoci.length; i++) {
       var emailSocio = datiSoci[i][2];
       if (!emailSocio) continue; // Salta le righe vuote

       // Legge la colonna L (indice 11) per lo stato
       var stato = datiSoci[i][11] ? datiSoci[i][11].toString().toLowerCase().trim() : "non attivo";
       if(stato === 'attivo') aventiDiritto++;
       
       listaSoci.push({
           nome: datiSoci[i][0] || "",               // Colonna A
           cognome: datiSoci[i][4] || "",            // Colonna E
           email: emailSocio,                        // Colonna C
           telefono: datiSoci[i][5] || "",           // Colonna F
           tessera: datiSoci[i][9] || "In attesa",   // Colonna J
           stato: stato,                             // Colonna L
           ruolo: datiSoci[i][12] || "Socio"         // Colonna M
       });
    }

    return {
       totSoci: listaSoci.length,
       aventiDiritto: aventiDiritto,
       listaSoci: listaSoci
    };
  } catch (e) {
    console.log("Errore getDashboardAdmin: " + e.toString());
    return null;
  }
}

function adminUpdateSocio(dati) {
  // 1. Controllo: Sei un admin?
  var adminUser = getDatiUtente(dati.adminEmail);
  var ruoliAdmin = ["PRESIDENTE", "SEGRETARIO", "TESORIERE"];
  if (!adminUser || !ruoliAdmin.includes(adminUser.ruolo.toUpperCase())) {
     return "NO_AUTH";
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioSoci = ss.getSheetByName("soci");
  var grid = foglioSoci.getDataRange().getValues();

  // 2. Cerca la riga giusta usando la tessera (Colonna J)
  for(var i=1; i<grid.length; i++) {
     if(grid[i][9].toString() === dati.tesseraTarget.toString()) {
        
        // 3. Scrive i nuovi dati
        foglioSoci.getRange(i+1, 3).setValue(dati.email);    // Col C (Email)
        foglioSoci.getRange(i+1, 6).setValue(dati.telefono); // Col F (Tel)
        foglioSoci.getRange(i+1, 12).setValue(dati.stato.toLowerCase()); // Col L (Stato)
        
        // NOVITÀ: Aggiorna la Carica Sociale nella Colonna M (13)
        if(dati.ruolo) {
            foglioSoci.getRange(i+1, 13).setValue(dati.ruolo); 
        }

        scriviLog(dati.adminEmail, "ADMIN_EDIT", "Modificato socio tessera " + dati.tesseraTarget);
        return "OK";
     }
  }
  return "ERRORE";
}

function adminGetListaPagamenti(adminEmail) {
  // 1. Sicurezza: Solo Admin/Tesoriere
  var user = getDatiUtente(adminEmail);
  var ruoliAmmessi = ["PRESIDENTE", "SEGRETARIO", "TESORIERE"];
  if (!user || !ruoliAmmessi.includes(user.ruolo.toUpperCase())) return [];

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fSoci = ss.getSheetByName("soci");
  var dati = fSoci.getDataRange().getValues();
  var lista = [];

  // Salta intestazione
  for (var i = 1; i < dati.length; i++) {
    var dataScad = dati[i][10]; // Colonna K (Scadenza)
    
    // Formattazione data per JS
    var scadObj = (dataScad instanceof Date) ? dataScad : new Date(dataScad);
    var scadFmt = Utilities.formatDate(scadObj, "Europe/Rome", "dd/MM/yyyy");

    lista.push({
      nome: dati[i][0],
      cognome: dati[i][4],
      email: dati[i][2],
      tessera: dati[i][9],
      scadenzaRaw: scadObj.getTime(), // Per ordinamento e calcoli JS
      scadenzaFmt: scadFmt
    });
  }

  // Ordina: Prima i scaduti, poi quelli in scadenza
  lista.sort((a, b) => a.scadenzaRaw - b.scadenzaRaw);
  
  return lista;
}

function adminRegistraRinnovo(adminEmail, targetEmail, metodo) {
  // 1. Sicurezza
  var user = getDatiUtente(adminEmail);
  var ruoliAmmessi = ["PRESIDENTE", "SEGRETARIO", "TESORIERE"];
  if (!user || !ruoliAmmessi.includes(user.ruolo.toUpperCase())) return "NO_AUTH";

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fSoci = ss.getSheetByName("Soci");
  var dati = fSoci.getDataRange().getValues();
  var oggi = new Date();

  for (var i = 1; i < dati.length; i++) {
    if (dati[i][2].toString().trim().toLowerCase() === targetEmail.trim().toLowerCase()) {
      
      // 2. Calcolo Nuova Scadenza
      var vecchiaScadenza = dati[i][10];
      var nuovaScadenza;
      
      if (vecchiaScadenza instanceof Date && vecchiaScadenza > oggi) {
        // Se è ancora valido, aggiungo 1 anno alla vecchia scadenza
        nuovaScadenza = new Date(vecchiaScadenza);
        nuovaScadenza.setFullYear(nuovaScadenza.getFullYear() + 1);
      } else {
        // Se è già scaduto (o data invalida), riparte da OGGI + 1 anno
        nuovaScadenza = new Date();
        nuovaScadenza.setFullYear(nuovaScadenza.getFullYear() + 1);
      }

      // 3. Aggiorna Excel (Colonna K = 11esima colonna -> indice 11 se parti da 1)
      // Indice 10 in array js = Colonna K in sheet (11)
      fSoci.getRange(i + 1, 11).setValue(nuovaScadenza);
      
      // Se lo stato era "NON ATTIVO", mettilo "ATTIVO"
      fSoci.getRange(i + 1, 12).setValue("attivo");

      // 4. Logga il pagamento (Importante per il bilancio!)
      scriviLog(adminEmail, "RINNOVO_" + metodo, "Socio: " + targetEmail + " | Nuova Scad: " + Utilities.formatDate(nuovaScadenza, "Europe/Rome", "dd/MM/yyyy"));
      
      return "OK";
    }
  }
  return "SOCIO_NON_TROVATO";
}

function adminCifraPasswordInserite() {
  var ui = SpreadsheetApp.getUi();
  var risposta = ui.alert(
    'CONFERMA CIFRATURA',
    'Hai scritto le password in chiaro nella colonna B e vuoi trasformarle in HASH?\n\nAttenzione: Esegui questa funzione una sola volta! Se la esegui su password già cifrate, smetteranno di funzionare.',
    ui.ButtonSet.YES_NO
  );

  if (risposta !== ui.Button.YES) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioSoci = ss.getSheetByName("soci");
  var dati = foglioSoci.getDataRange().getValues();
  var contatore = 0;

  // Parte dalla riga 1 (salta l'intestazione)
  for (var i = 1; i < dati.length; i++) {
    var passwordInChiaro = dati[i][1]; // Colonna B (Indice 1)
    
    // Se la cella non è vuota e non sembra già un hash (gli hash SHA-256 sono lunghi 64 caratteri)
    if (passwordInChiaro && passwordInChiaro.toString().length !== 64) {
      
      // Crea l'hash usando la tua funzione sicura (con il SALT)
      var passwordCifrata = creaHash(passwordInChiaro);
      
      // Sovrascrive la password in chiaro con quella cifrata
      foglioSoci.getRange(i + 1, 2).setValue(passwordCifrata);
      contatore++;
    }
  }
  
  ui.alert("Fatto!", "Password cifrate: " + contatore, ui.ButtonSet.OK);
}


// 2. Gestione Consultazioni e Candidature


function adminGetListaElezioni(emailAdmin) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var foglio = ss.getSheetByName("Database_Elezioni");
    if (!foglio || foglio.getLastRow() < 2) return [];
    
    var dati = foglio.getDataRange().getValues();
    var lista = [];
    
    for (var i = 1; i < dati.length; i++) {
      var r = dati[i];
      if (!r[0]) continue; // Salta righe vuote
      
      lista.push({
        id: r[0],
        titolo: r[1],
        tipo: r[2],
        inizioFmt: r[3] ? new Date(r[3]).toLocaleString() : "",
        fineFmt: r[4] ? new Date(r[4]).toLocaleString() : "",
        maxVoti: r[5],
        opzioni: r[6],
        statoForzato: r[7] ? r[7].toString().trim() : "", // Legge se è CHIUSA
        urlVerbale: r[13] ? r[13].toString().trim() : ""  // Legge il link del PDF
      });
    }
    return lista;
  } catch(e) {
    return [];
  }
}

function adminCreaNuovaElezioneAvanzata(dati) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var foglio = ss.getSheetByName("Database_Elezioni");
    if (!foglio) return "Foglio 'Database_Elezioni' non trovato!";
    
    var idElezione = "ELEC_" + new Date().getTime();
    var statoForzato = ""; 
    
    var cInizio = dati.tipo === 'CANDIDATI' ? dati.candInizio : "";
    var cFine = dati.tipo === 'CANDIDATI' ? dati.candFine : "";
    var opzioni = dati.tipo === 'REFERENDUM' ? dati.opzioniFisse : (dati.tipo === 'ASSEMBLEA' ? dati.puntiOdg : "");
    
    // Inserimento riga (A -> N)
    foglio.appendRow([
      idElezione,           // A: ID
      dati.titolo,          // B: Titolo
      dati.tipo,            // C: Tipo (CANDIDATI, REFERENDUM, ASSEMBLEA)
      dati.inizio,          // D: Inizio Voto
      dati.fine,            // E: Fine Voto
      dati.maxVoti,         // F: Max Preferenze
      opzioni,              // G: Opzioni Fisse o Punti OdG
      statoForzato,         // H: Stato Forzato
      cInizio,              // I: Inizio Candidature
      cFine,                // J: Fine Candidature
      dati.quorumC,         // K: Quorum Costitutivo (%)
      dati.quorumD          // L: Quorum Deliberativo (%)
    ]);
    
    return "OK";
  } catch (e) {
    return "Errore del server: " + e.toString();
  }
}

function adminEliminaElezione(emailAdmin, idElezione) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var foglio = ss.getSheetByName("Database_Elezioni");
    var dati = foglio.getDataRange().getValues();
    
    for (var i = 1; i < dati.length; i++) {
      if (dati[i][0] === idElezione) {
        foglio.deleteRow(i + 1);
        return "OK";
      }
    }
    return "Non trovato";
  } catch(e) {
    return e.toString();
  }
}

function adminCambiaStatoVoto(email, nuovoStato) {
  // Controllo sicurezza
  var user = getDatiUtente(email);
  var ruoliAdmin = ["PRESIDENTE", "SEGRETARIO", "TESORIERE"];
  if (!ruoliAdmin.includes(user.ruolo.toUpperCase())) return "NO_AUTH";

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheetByName("Config").getRange("B3").setValue(nuovoStato);
  scriviLog(email, "ADMIN_CHANGE_VOTO", nuovoStato);
  return "OK";
}

function adminGetCandidaturePendenti(adminEmail) {
  try {
    var user = getDatiUtente(adminEmail);
    var ruoliAdmin = ["PRESIDENTE", "SEGRETARIO", "TESORIERE"];
    
    // Controlla che l'utente esista e sia un admin
    if (!user || !ruoliAdmin.includes(user.ruolo.toUpperCase())) return [];

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    // Cerca il foglio (accetta sia minuscolo che maiuscolo)
    var foglioCand = ss.getSheetByName("candidature") || ss.getSheetByName("Candidature");
    if (!foglioCand || foglioCand.getLastRow() < 2) return [];
    
    var dati = foglioCand.getDataRange().getValues();
    var lista = [];
    
    // Mappa colonne: A(0):Data, B(1):Email, C(2):Nome, D(3):Motivazione, E(4):Elezione, F(5):Esito
    for (var i = 1; i < dati.length; i++) {
      var riga = dati[i];
      var esito = riga[5] ? riga[5].toString().trim().toUpperCase() : "";
      
      if (esito === "IN ATTESA" || esito === "") {
        
        // CORREZIONE CRITICA: Trasforma la data in millisecondi sicuri per il trasferimento web
        var dataSicura = "";
        if (riga[0] instanceof Date) {
          dataSicura = riga[0].getTime(); 
        } else {
          dataSicura = riga[0] ? riga[0].toString() : "";
        }

        lista.push({
          rigaIndex: i + 1, // Indice per ritrovare la riga quando approviamo
          email: riga[1] ? riga[1].toString() : "",
          nome: riga[2] ? riga[2].toString() : "",
          motivazione: riga[3] ? riga[3].toString() : "",
          idElezione: riga[4] ? riga[4].toString() : "",
          data: dataSicura // Ora il server non andrà in crash!
        });
      }
    }
    return lista;
  } catch(e) {
    console.log("Errore lettura candidature: " + e.toString());
    return [];
  }
}

function adminProcessaCandidatura(emailAdmin, rigaIndex, azione) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var foglioCand = ss.getSheetByName("candidature") || ss.getSheetByName("Candidature");
    if (!foglioCand) return "Foglio candidature non trovato.";
    
    var nuovoEsito = (azione === "APPROVA") ? "APPROVATA" : "RIFIUTATA";
    
    // Aggiorna la colonna F (Esito, colonna 6) e G (Da chi, colonna 7)
    foglioCand.getRange(rigaIndex, 6).setValue(nuovoEsito);
    foglioCand.getRange(rigaIndex, 7).setValue(emailAdmin);
    
    return "OK";
  } catch(e) {
    return e.toString();
  }
}

function adminGetRisultatiLive(adminEmail, idElezione) {
  try {
    var user = getDatiUtente(adminEmail);
    var ruoliAdmin = ["PRESIDENTE", "SEGRETARIO", "TESORIERE", "VICEPRESIDENTE"];
    if (!user || !ruoliAdmin.includes(user.ruolo.toUpperCase())) return "NO_AUTH";

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Recupera Dettagli Consultazione
    var foglioDb = ss.getSheetByName("Database_Elezioni");
    var datiDb = foglioDb.getDataRange().getValues();
    var campagna = null;
    
    for (var i = 1; i < datiDb.length; i++) {
      if (datiDb[i][0] === idElezione) {
        campagna = {
          titolo: datiDb[i][1],
          tipo: datiDb[i][2],
          qCostitutivo: parseFloat(datiDb[i][10]) || 0.5 // Colonna K (Quorum Costitutivo)
        };
        break;
      }
    }
    if (!campagna) return "ERRORE: Consultazione non trovata.";

    // 2. Conta i Soci Attivi (Aventi Diritto)
    var foglioSoci = ss.getSheetByName("soci") || ss.getSheetByName("Soci");
    var datiSoci = foglioSoci.getDataRange().getValues();
    var aventiDiritto = 0;
    
    for(var s = 1; s < datiSoci.length; s++) {
       var stato = datiSoci[s][11] ? datiSoci[s][11].toString().toLowerCase().trim() : "";
       if(stato === 'attivo') aventiDiritto++;
    }

    // 3. Elabora i Voti
    var foglioVoti = ss.getSheetByName("voti");
    var datiVoti = foglioVoti ? foglioVoti.getDataRange().getValues() : [];
    var conteggio = {};
    var hashVotanti = {}; // Per contare i votanti unici (un socio può esprimere più preferenze)

    for (var v = 1; v < datiVoti.length; v++) {
      // Se l'ID elezione (Colonna D, indice 3) corrisponde
      if (datiVoti[v][3] === idElezione) {
        var hash = datiVoti[v][1];
        var preferenza = datiVoti[v][2];

        hashVotanti[hash] = true; // Registra che questo hash ha votato

        if (!conteggio[preferenza]) conteggio[preferenza] = 0;
        conteggio[preferenza]++;
      }
    }

    // 4. Calcoli Finali
    var votantiUnici = Object.keys(hashVotanti).length;
    var percentualeQuorum = campagna.qCostitutivo > 1 ? (campagna.qCostitutivo / 100) : campagna.qCostitutivo;
    var quorumNecessario = Math.ceil(aventiDiritto * percentualeQuorum);
    var quorumRaggiunto = votantiUnici >= quorumNecessario;

    var risultati = [];
    for (var pref in conteggio) {
      risultati.push({
        opzione: pref,
        voti: conteggio[pref]
      });
    }
    // Ordina dal più votato al meno votato
    risultati.sort(function(a, b) { return b.voti - a.voti; });

    return {
      titolo: campagna.titolo,
      tipo: campagna.tipo,
      votanti: votantiUnici,
      aventiDiritto: aventiDiritto,
      quorumNecessario: quorumNecessario,
      quorumRaggiunto: quorumRaggiunto,
      risultati: risultati
    };

  } catch (e) {
    return "ERRORE: " + e.toString();
  }
}

// 3. Bacheca News e Ammissioni Soci


function adminPubblicaNews(dati) {
  var user = getDatiUtente(dati.email);
  var ruoliAdmin = ["PRESIDENTE", "SEGRETARIO", "TESORIERE"];
  if (!user || !ruoliAdmin.includes(user.ruolo.toUpperCase())) return "NO_AUTH";

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("News");
  
  // Genera ID univoco (timestamp + random)
  var id = "news_" + new Date().getTime();
  
  sheet.appendRow([new Date(), dati.titolo, dati.testo, id]);
  return "OK";
}

function adminCancellaNews(dati) {
  var user = getDatiUtente(dati.email);
  if (!["PRESIDENTE", "SEGRETARIO", "TESORIERE"].includes(user.ruolo.toUpperCase())) return "NO_AUTH";

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("News");
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][3] == dati.idNews) {
      sheet.deleteRow(i + 1); // +1 perché gli indici partono da 1 in deleteRow
      return "OK";
    }
  }
  return "NON_TROVATA";
}

function getAmmissioniAdmin(adminEmail) {
  var user = getDatiUtente(adminEmail);
  if (!["PRESIDENTE", "SEGRETARIO", "VICEPRESIDENTE"].includes(user.ruolo.toUpperCase())) return [];

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioAmm = ss.getSheetByName("Ammissioni");
  if(!foglioAmm) return [];

  var datiAmm = foglioAmm.getDataRange().getValues();
  var lista = [];

  for (var i = 1; i < datiAmm.length; i++) {
      // Prende il valore, lo trasforma in stringa, toglie gli spazi vuoti all'inizio/fine e lo fa maiuscolo
      var stato = datiAmm[i][7] ? datiAmm[i][7].toString().trim().toUpperCase() : "";
      
      // Mostra all'admin solo chi ha già i due garanti (pronto) o chi è in votazione
      if (stato === "SOSTENUTO (PRONTO PER ASSEMBLEA)" || stato === "IN VOTAZIONE") {
          var nomeCompleto = (datiAmm[i][1] || "") + " " + (datiAmm[i][2] || "");
          lista.push({
              nome: nomeCompleto.trim(),
              email: datiAmm[i][3],     // Email Candidato è in colonna D (indice 3)
              sponsor1: datiAmm[i][5],  // Sponsor 1 è in colonna F (indice 5)
              sponsor2: datiAmm[i][6],  // Sponsor 2 è in colonna G (indice 6)
              stato: stato
          });
      }
  }
  return lista;
}

function adminGestisciAmmissione(adminEmail, emailCandidato, azione) {
  var user = getDatiUtente(adminEmail);
  if (!["PRESIDENTE", "SEGRETARIO"].includes(user.ruolo.toUpperCase())) return "NO_AUTH";

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioAmm = ss.getSheetByName("Ammissioni");
  var datiAmm = foglioAmm.getDataRange().getValues();
  var rigaTarget = -1;
  var nomeCandidato = "";

  for (var i = 1; i < datiAmm.length; i++) {
      // Email Candidato è ora alla colonna D (indice 3)
      if (datiAmm[i][3].toString().toLowerCase() === emailCandidato.toLowerCase()) {
          rigaTarget = i + 1;
          var nomeCompleto = (datiAmm[i][1] || "") + " " + (datiAmm[i][2] || "");
          nomeCandidato = nomeCompleto.trim();
          break;
      }
  }

  if (rigaTarget === -1) return "CANDIDATO_NON_TROVATO";

  if (azione === "APRI_VOTO") {
      // Aggiorna lo Stato Sostegno in colonna H (indice 7, quindi rigaTarget e colonna 8)
      foglioAmm.getRange(rigaTarget, 8).setValue("IN VOTAZIONE");
      scriviLog(adminEmail, "APERTURA_VOTO_AMMISSIONE", nomeCandidato);
      return "OK";
  } 
  
  if (azione === "CHIUDI_VOTO") {
      // CALCOLO SPOGLIO E QUORUM 2/3 (Art. 7 Statuto)
      var foglioVoti = ss.getSheetByName("VotiAmmissioni");
      var datiVoti = foglioVoti.getDataRange().getValues();
      
      var votiTotali = 0;
      var votiFavorevoli = 0;
      
      for(var v=1; v<datiVoti.length; v++) {
          if(datiVoti[v][2].toString().toLowerCase() === emailCandidato.toLowerCase()) {
              votiTotali++;
              if(datiVoti[v][3] === "FAVOREVOLE") votiFavorevoli++;
          }
      }
      
      // Calcolo matematico dei 2/3
      var quorumRichiesto = Math.ceil((votiTotali * 2) / 3);
      var esito = "RESPINTO";
      
      if (votiTotali > 0 && votiFavorevoli >= quorumRichiesto) {
          esito = "AMMESSO";
      }

      // Imposta lo Stato a VOTAZIONE_CHIUSA (Colonna H -> colonna 8)
      foglioAmm.getRange(rigaTarget, 8).setValue("VOTAZIONE_CHIUSA");
      // Scrive l'Esito Assemblea in colonna I (Colonna I -> colonna 9)
      foglioAmm.getRange(rigaTarget, 9).setValue(esito + " (" + votiFavorevoli + "/" + votiTotali + ")");
      
      scriviLog(adminEmail, "CHIUSURA_VOTO_AMMISSIONE", nomeCandidato + ": " + esito);
      return "OK_SPOGLIO|" + esito + "|" + votiFavorevoli + "|" + votiTotali + "|" + quorumRichiesto;
  }
}


// 4. Monitoraggio Firme Digitali

function adminInviaDocumentoFirma(data, target, richiedeControfirma) {
  var user = getDatiUtente(data.adminEmail);
  var ruoliAdmin = ["PRESIDENTE", "SEGRETARIO", "TESORIERE"];
  if (!user || !ruoliAdmin.includes(user.ruolo.toUpperCase())) return "NO_AUTH";

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var fRichieste = ss.getSheetByName("RichiesteFirma");
    var fSoci = ss.getSheetByName("Soci");
    var fConfig = ss.getSheetByName("Config");
    
    // 1. Salva File su Drive
    var folderId = fConfig.getRange("B13").getValue();
    var folder = DriveApp.getFolderById(folderId);
    var blob = Utilities.newBlob(Utilities.base64Decode(data.content), data.mimeType, data.filename);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    var fileId = file.getId();
    var fileName = file.getName();
    var listaDestinatari = [];
    var datiSoci = fSoci.getDataRange().getValues();

    // 2. LOGICA GRUPPI (AGGIORNATA PER SELEZIONE MANUALE)
    // Se target è una LISTA (Array), significa che hai selezionato manualmente le email
    if (Array.isArray(target)) {
        // Filtriamo solo stringhe valide che sembrano email
        listaDestinatari = target.filter(function(e){ return typeof e === 'string' && e.indexOf("@") > -1; });
    
    } else {
        // Logica classica per i gruppi predefiniti (TUTTI, DIRETTIVO, ecc)
        for (var i = 1; i < datiSoci.length; i++) {
            var emailSocio = datiSoci[i][2];
            var statoSocio = datiSoci[i][11].toString().toLowerCase();
            var ruoloSocio = datiSoci[i][12].toString().toUpperCase();

            if (statoSocio !== "attivo") continue; 

            if (target === "TUTTI") {
                listaDestinatari.push(emailSocio);
            } else if (target === "DIRETTIVO") {
                if (["PRESIDENTE", "VICEPRESIDENTE", "SEGRETARIO", "TESORIERE", "CONSIGLIERE"].includes(ruoloSocio)) {
                    listaDestinatari.push(emailSocio);
                }
            } else if (target === "NUOVI") {
                // Logica nuovi soci (opzionale)
                listaDestinatari.push(emailSocio); 
            }
        }
    }

    // 3. Genera Richieste
    var controfirmaFlag = (richiedeControfirma === true) ? "SI" : "NO";
    
    listaDestinatari.forEach(email => {
       var idRichiesta = "REQ_" + Utilities.getUuid().slice(0,8);
       // Aggiunta colonne I e J per controfirma
       fRichieste.appendRow([
         idRichiesta, new Date(), email, fileName, fileId, "PENDENTE", "", "", 
         controfirmaFlag, "" 
       ]);
    });
    
    return "OK_SENT_" + listaDestinatari.length;

  } catch(e) { return "ERRORE: " + e.toString(); }
}

function adminGetStatisticheFirme(adminEmail) {
  var user = getDatiUtente(adminEmail);
  if (!["PRESIDENTE", "SEGRETARIO", "TESORIERE"].includes(user.ruolo.toUpperCase())) return [];

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("RichiesteFirma");
  var dati = sheet.getDataRange().getValues();
  
  // Raggruppa per Nome File
  var stats = {};

  for (var i = 1; i < dati.length; i++) {
      var stato = dati[i][5];
      
      // --- MODIFICA: Salta i documenti archiviati ---
      if (stato === "ARCHIVIATO") continue; 

      var nomeDoc = dati[i][3];
      var email = dati[i][2];
      var idFile = dati[i][4];
      var idReq = dati[i][0];
      var necessitaContro = dati[i][8];

      if (!stats[nomeDoc]) {
          stats[nomeDoc] = { 
              nome: nomeDoc, 
              idFile: idFile, 
              totale: 0, 
              firmati: 0, 
              attesaControfirma: 0,
              pendenti: [], // Lista email chi deve firmare
              daControfirmare: [] // Lista ID richieste che l'admin deve firmare
          };
      }

      stats[nomeDoc].totale++;

      if (stato === "FIRMATO") {
          stats[nomeDoc].firmati++;
      } else if (stato === "DA_CONTROFIRMARE") {
          // L'utente ha firmato, ora tocca all'admin
          stats[nomeDoc].firmati++; // Lo contiamo come progresso utente
          stats[nomeDoc].attesaControfirma++;
          stats[nomeDoc].daControfirmare.push({id: idReq, email: email});
      } else {
          stats[nomeDoc].pendenti.push(email);
      }
  }

  // Converte oggetto in array per il frontend
  var report = [];
  for (var key in stats) {
      report.push(stats[key]);
  }
  
  // Ordina per nome
  return report.reverse(); 
}

function adminInviaSollecito(docName, listaEmail) {
    var urlWebApp = ScriptApp.getService().getUrl(); // Recupera automaticamente il link del tuo sito

    var count = 0;
    listaEmail.forEach(email => {
        try {
            // Costruiamo una mail con un bel layout grafico
            var htmlBody = `
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #334155;">
                
                <div style="background: #f59e0b; padding: 15px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h2 style="color: white; margin: 0; font-size: 20px;">🔔 Azione Richiesta</h2>
                </div>
                
                <div style="padding: 25px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; background: #ffffff;">
                    <p style="font-size: 15px;">Ciao,</p>
                    <p style="font-size: 15px;">Ti ricordiamo che c'è un documento in attesa della tua <b>Firma Elettronica</b> nell'Area Riservata dell'Associazione:</p>
                    
                    <div style="background: #f8fafc; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0; border-radius: 4px;">
                        <span style="font-size: 18px;">📄</span> <b style="font-size: 16px; color: #0f172a;">${docName}</b>
                    </div>

                    <h4 style="margin-bottom: 5px; color: #0f172a;">Come funziona?</h4>
                    <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin-top: 0;">
                        La procedura è sicura e richiede meno di un minuto. Accedi al portale tramite il bottone qui sotto, leggi il documento e clicca su "Firma". Riceverai un <b>codice OTP di 6 cifre</b> via email per validare la tua identità e generare il tuo certificato crittografico.
                    </p>

                    <div style="text-align: center; margin: 35px 0 20px 0;">
                        <a href="${urlWebApp}" style="background: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 4px 6px rgba(30, 64, 175, 0.2);">
                            ACCEDI E FIRMA ORA
                        </a>
                    </div>
                    
                    <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 25px 0 15px 0;">
                    <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
                        Questa è una comunicazione automatica.<br>Se hai già provveduto a firmare negli ultimi minuti, ignora questa email.
                    </p>
                </div>
            </div>`;

            MailApp.sendEmail({
                to: email,
                subject: "🔔 Azione Richiesta: Firma in sospeso per " + docName,
                htmlBody: htmlBody
            });
            count++;
        } catch(e) {
            console.log("Errore invio sollecito a " + email + ": " + e);
        }
    });
    return "SOLLECITO_OK_" + count;
}

function adminEseguiControfirma(idRichiesta, adminEmail) {
    var user = getDatiUtente(adminEmail);
    if (!["PRESIDENTE", "SEGRETARIO"].includes(user.ruolo.toUpperCase())) return "NO_AUTH";
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("RichiesteFirma");
    var dati = sheet.getDataRange().getValues();
    var rigaTarget = -1;
    var emailSocio = "";
    var idFile = "";

    for (var i = 1; i < dati.length; i++) {
        if (dati[i][0] === idRichiesta) {
            rigaTarget = i + 1;
            emailSocio = dati[i][2];
            idFile = dati[i][4];
            break;
        }
    }
    
    if (rigaTarget === -1) return "ERR";
    
    // Aggiorna stato finale
    sheet.getRange(rigaTarget, 6).setValue("FIRMATO");
    sheet.getRange(rigaTarget, 10).setValue(user.cognome + " " + user.nome); // Colonna J
    
    // Audit Log dell'admin
    var auditSheet = ss.getSheetByName("AuditFirme");
    auditSheet.appendRow([new Date(), "ADMIN_SIG_" + idRichiesta, adminEmail, "Controfirma Doc", "-", "-", "ADMIN_PANEL", "CONTROFIRMA_OK"]);

    // Notifica Socio
    try {
         MailApp.sendEmail(emailSocio, "✅ Documento Controfirmato", "Il documento è stato controfirmato dall'amministrazione ed è ora concluso.");
    } catch(e){}

    return "OK";
}

function adminChiudiEGeneraRegistroFirme(docName, adminEmail) {
  try {
    var user = getDatiUtente(adminEmail);
    if (!["PRESIDENTE", "SEGRETARIO", "TESORIERE"].includes(user.ruolo.toUpperCase())) return "NO_AUTH";

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetReq = ss.getSheetByName("RichiesteFirma");
    var reqData = sheetReq.getDataRange().getValues();

    var totRichiesti = 0;
    var totFirmati = 0;
    var righeDaArchiviare = [];
    var idFileOriginale = ""; // NUOVO: Variabile per salvare l'ID del file da spostare

    // 1. CONTROLLO E CONTEGGIO
    for (var i = 1; i < reqData.length; i++) {
      if (reqData[i][3] === docName && reqData[i][5] !== "ARCHIVIATO") {
        totRichiesti++;
        if (reqData[i][5] === "FIRMATO") totFirmati++;
        
        righeDaArchiviare.push(i + 1); 
        idFileOriginale = reqData[i][4]; // NUOVO: Pesca l'ID originale dalla Colonna E (indice 4)
      }
    }

    if (totRichiesti === 0) return "NESSUN_DOCUMENTO_ATTIVO";

    // 2. RECUPERA LE FIRME DA AUDIT TRAIL
    var sheetAudit = ss.getSheetByName("AuditFirme");
    var auditData = sheetAudit.getDataRange().getValues();
    var listFirme = [];
    var hashOriginale = "N/D";

    for (var j = 1; j < auditData.length; j++) {
      if (auditData[j][3] === docName && auditData[j][5] && auditData[j][5].toString().trim() !== "") {
        listFirme.push({
          data: Utilities.formatDate(new Date(auditData[j][0]), "Europe/Rome", "dd/MM/yyyy HH:mm:ss"),
          txId: auditData[j][1],
          email: auditData[j][2],
          hashFirma: auditData[j][5]
        });
        hashOriginale = auditData[j][4]; 
      }
    }

    var fSoci = ss.getSheetByName("Soci");
    var sociData = fSoci.getDataRange().getValues();
    var getNomeSocio = function(email) {
      for (var s = 1; s < sociData.length; s++) {
        if (sociData[s][2].toLowerCase() === email.toLowerCase()) {
          return sociData[s][4] + " " + sociData[s][0]; 
        }
      }
      return email;
    };

    // 3. GENERA HTML DEL PDF
    var htmlPDF = "<html><body style='font-family: \"Helvetica Neue\", Helvetica, Arial, sans-serif; padding: 40px;'>";
    htmlPDF += "<div style='text-align:center; margin-bottom: 40px;'>";
    htmlPDF += "<h1 style='font-size: 18pt; font-weight: bold; text-transform: uppercase;'>REGISTRO FIRME ELETTRONICHE</h1>";
    htmlPDF += "<h2 style='font-size: 14pt; color: #1e40af;'>" + docName + "</h2>";
    htmlPDF += "<p>Data chiusura procedura: " + Utilities.formatDate(new Date(), "Europe/Rome", "dd/MM/yyyy HH:mm") + "</p></div>";

    htmlPDF += "<div style='margin-bottom: 30px; background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;'>";
    htmlPDF += "<h3 style='font-size: 12pt; border-bottom: 2px solid #cbd5e1; padding-bottom: 5px; margin-top: 0;'>Dettagli Procedura e Integrità</h3>";
    htmlPDF += "<p><b>Impronta Documento Originale (SHA-256):</b><br><code style='font-size: 10pt; word-break: break-all; background:#e2e8f0; padding:3px 6px;'>" + hashOriginale + "</code></p>";
    htmlPDF += "<p><b>Firme Richieste:</b> " + totRichiesti + "</p>";
    htmlPDF += "<p><b>Firme Raccolte con Successo:</b> " + totFirmati + "</p>";
    htmlPDF += "</div>";

    if (listFirme.length > 0) {
      htmlPDF += "<div style='page-break-before: always;'></div>";
      htmlPDF += "<h3 style='text-align: center; font-size: 14pt; text-transform: uppercase;'>ELENCO FIRME RACCOLTE</h3>";
      htmlPDF += "<table border='1' cellspacing='0' cellpadding='6' style='width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 9pt;'>";
      htmlPDF += "<tr style='background-color: #e2e8f0;'>";
      htmlPDF += "<th style='width: 30px;'>N.</th><th style='text-align:left;'>Socio</th><th style='text-align:left;'>Data Firma (UTC)</th><th style='text-align:left;'>Sigillo Crittografico (Hash)</th>";
      htmlPDF += "</tr>";

      for (var k = 0; k < listFirme.length; k++) {
        var f = listFirme[k];
        var nomeCompleto = getNomeSocio(f.email);
        var bg = (k % 2 === 0) ? "#ffffff" : "#f8fafc";
        
        htmlPDF += "<tr style='background-color: " + bg + ";'>";
        htmlPDF += "<td style='text-align:center; font-weight:bold;'>" + (k+1) + "</td>";
        htmlPDF += "<td><b>" + nomeCompleto + "</b><br><span style='font-size:7pt; color:#666;'>" + f.email + "</span></td>";
        htmlPDF += "<td>" + f.data + "</td>";
        htmlPDF += "<td style='font-family: monospace; font-size: 8pt; word-break: break-all;'>" + f.hashFirma + "<br><span style='font-size:6pt; color:#999;'>TX: " + f.txId + "</span></td>";
        htmlPDF += "</tr>";
      }
      htmlPDF += "</table>";
    } else {
      htmlPDF += "<p style='text-align:center; color: #ef4444;'>Nessuna firma valida trovata nei log per questo documento.</p>";
    }
    htmlPDF += "</body></html>";

    // 4. CREA IL FALDONE DIGITALE E SPOSTA I FILE
    var rawPubFolderId = ss.getSheetByName("Config").getRange("B13").getValue().toString().trim(); 
    var pubFolderId = rawPubFolderId;
    if (pubFolderId.includes("/folders/")) {
      pubFolderId = pubFolderId.split("/folders/")[1].split("?")[0];
    } else if (pubFolderId.includes("id=")) {
      pubFolderId = pubFolderId.split("id=")[1];
    }

    var pubFolder = DriveApp.getFolderById(pubFolderId);
    
    // 4A. Crea la cartella principale "Archivio Pratiche Chiuse" se non esiste
    var mainArchive = pubFolder.getFoldersByName("Archivio Pratiche Chiuse");
    var archiveFolder = mainArchive.hasNext() ? mainArchive.next() : pubFolder.createFolder("Archivio Pratiche Chiuse");

    // 4B. Crea la cartella specifica per questo documento
    var nomeFaldone = "Pratica - " + docName.replace(".pdf", "");
    var faldone = archiveFolder.createFolder(nomeFaldone);

    // 4C. Crea il PDF del registro dentro il faldone
    var blob = Utilities.newBlob(htmlPDF, "text/html", "Temp.html");
    var pdfBlob = blob.getAs("application/pdf");
    pdfBlob.setName("Registro_Firme_" + docName.replace(".pdf", "") + ".pdf");
    var finalFile = faldone.createFile(pdfBlob);
    finalFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // 4D. SPOSTA IL DOCUMENTO ORIGINALE NEL FALDONE
    if (idFileOriginale) {
      try {
        var fileOriginale = DriveApp.getFileById(idFileOriginale);
        fileOriginale.moveTo(faldone); // Magia: sposta il file dalla vecchia posizione alla nuova
      } catch (e) {
        // Se non trova il file originale, va avanti lo stesso senza bloccarsi
        console.log("Errore nello spostamento del file originale: " + e);
      }
    }

    // 5. INVIA MAIL ALL'ADMIN
    MailApp.sendEmail({
      to: adminEmail,
      subject: "📁 Pratica Archiviata: " + docName,
      htmlBody: "La pratica di firma per il documento <b>" + docName + "</b> è stata chiusa e archiviata in un faldone dedicato.<br><br>In allegato trovi il registro ufficiale. Entrambi i documenti (originale e registro) sono ora ordinati insieme nel Drive dell'associazione.",
      attachments: [pdfBlob]
    });

    // 6. ARCHIVIAZIONE DEFINITIVA SU EXCEL
    righeDaArchiviare.forEach(function(riga) {
       sheetReq.getRange(riga, 6).setValue("ARCHIVIATO"); 
    });

    return "OK";

  } catch (errore) {
    return "ERRORE_SISTEMA: " + errore.toString();
  }
}

function adminEliminaGruppoRichieste(docName, adminEmail) {
  var user = getDatiUtente(adminEmail);
  if (!["PRESIDENTE", "SEGRETARIO", "TESORIERE"].includes(user.ruolo.toUpperCase())) return "NO_AUTH";

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("RichiesteFirma");
  var dati = sheet.getDataRange().getValues();
  
  // Ciclo inverso (dal fondo all'inizio) per cancellare le righe senza rompere gli indici
  var cancellati = 0;
  for (var i = dati.length - 1; i >= 1; i--) {
    // Colonna D (Indice 3) contiene il Nome File
    if (dati[i][3] === docName) {
      sheet.deleteRow(i + 1);
      cancellati++;
    }
  }
  
  if(cancellati > 0) {
      scriviLog(adminEmail, "DELETE_REQ_FIRMA", docName);
      return "OK";
  }
  return "NESSUNA_RIGA_TROVATA";
}

// 5. Contabilità (Tesoreria)


function adminGetUltimiMovimentiPD(email) {
  try {
    var ss = SpreadsheetApp.openById(ID_FOGLIO_CONTABILITA);
    var sheet = ss.getSheetByName("bilancio");
    if (!sheet) return [];

    var data = sheet.getDataRange().getValues();
    var lista = [];

    // Ciclo al contrario per prendere prima i movimenti più recenti (salta la riga 0 di intestazione)
    for (var i = data.length - 1; i > 0; i--) {
      var row = data[i];

      // Formattazione pulita della data
      var rawDate = row[0]; // Colonna A
      var dateStr = "";
      if (rawDate instanceof Date) {
        dateStr = rawDate.toLocaleDateString('it-IT');
      } else if (rawDate) {
        dateStr = rawDate.toString().substring(0, 10);
      }

      // Mappatura esatta basata sulla tua struttura colonne
      lista.push({
        data: dateStr,
        desc: row[1] ? row[1].toString() : "",                   // Colonna B: Descrizione
        dare: row[2] ? row[2].toString() : "",                   // Colonna C: Conto_Dare
        avere: row[3] ? row[3].toString() : "",                  // Colonna D: Conto_Avere
        imp: parseFloat(row[4] ? row[4].toString().replace(',','.') : 0) || 0, // Colonna E: Importo
        tipo: row[7] ? row[7].toString() : ""                    // Colonna H: Tipo_Attività
      });

      // Limita la visualizzazione agli ultimi 10 movimenti per non appesantire la dashboard
      if (lista.length >= 10) break; 
    }
    
    return lista;
  } catch (e) {
    console.error("Errore lettura ultimi movimenti: " + e.message);
    return [];
  }
}

// Sostituisci questo ID con l'ID effettivo che si vede dall'URL del tuo nuovo file Fogli Google (Archivio Contabilità)
var ID_FOGLIO_CONTABILITA = "1zYVYOg8nlASjbzIKIHtVbaoEhK5949ctqQemVENfSow";

function getPianoDeiContiDinamico() {
  // Apre il foglio esterno "Archivio Contabilità" e legge il tab "conti"
  var ss = SpreadsheetApp.openById(ID_FOGLIO_CONTABILITA);
  var foglioConti = ss.getSheetByName("conti");
  
  if (!foglioConti) return [];
  return foglioConti.getDataRange().getValues();
}

function adminRegistraMovimentoPD(payload) {
  try {
      var ss = SpreadsheetApp.openById(ID_FOGLIO_CONTABILITA);
      var foglioBilancio = ss.getSheetByName("bilancio"); 
      
      // Se il tab "bilancio" non esiste nel nuovo file, lo crea da zero con le intestazioni corrette per le righe multiple
      if (!foglioBilancio) {
          foglioBilancio = ss.insertSheet("bilancio");
          foglioBilancio.appendRow([
            "ID_Transazione", "Data", "Descrizione Generale", "Conto", 
            "Sezione", "Importo (€)", "Controparte", "CF/PIVA", 
            "Regime Fiscale", "N. Doc", "Autore Registrazione"
          ]);
          // Formatta la prima riga in grassetto
          foglioBilancio.getRange("A1:K1").setFontWeight("bold").setBackground("#f8fafc");
      }

      var testata = payload.testata;
      var righe = payload.righe;
      
      // Genera un ID univoco (es. TRX_1693050000000) per tenere insieme le righe della stessa operazione
      var idTransazione = "TRX_" + new Date().getTime();
      
      // Prepara l'array di array per scrivere tutte le righe nel foglio in un colpo solo (molto più veloce)
      var righeDaScrivere = [];
      for (var i = 0; i < righe.length; i++) {
          righeDaScrivere.push([
              idTransazione,
              testata.data,
              testata.descrizione,
              righe[i].conto,
              righe[i].sezione,
              righe[i].importo,
              testata.controparte,
              testata.cf_piva,
              testata.tipoAttivita,
              testata.nDoc,
              testata.adminEmail
          ]);
      }

      // Inserisce i dati massivamente alla fine del foglio
      if (righeDaScrivere.length > 0) {
          var ultimaRiga = Math.max(foglioBilancio.getLastRow(), 1);
          foglioBilancio.getRange(ultimaRiga + 1, 1, righeDaScrivere.length, 11).setValues(righeDaScrivere);
      }

      return "OK";
  } catch (e) {
      return e.toString();
  }
}

function getAvvisiPubblici() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("News");
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  var avvisi = [];

  // Legge dall'ultima riga verso l'alto (così le più recenti sono prime)
  // i=1 per saltare l'intestazione, ma controlliamo se c'è almeno una riga di dati
  if (data.length > 1) {
    for (var i = data.length - 1; i >= 1; i--) {
      // Prende solo le ultime 5 news per non intasare
      if (avvisi.length >= 5) break; 
      
      var riga = data[i];
      if (riga[1] && riga[2]) { // Se c'è titolo e messaggio
        avvisi.push({
          data: Utilities.formatDate(new Date(riga[0]), "Europe/Rome", "dd/MM/yyyy"),
          titolo: riga[1],
          testo: riga[2],
          id: riga[3]
        });
      }
    }
  }
  return avvisi;
}

function inviaDigestSettimanale() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fNews = ss.getSheetByName("News");
  var fSoci = ss.getSheetByName("soci");
  var fConfig = ss.getSheetByName("Config");
  
  // 1. CONFIGURAZIONE
  var emailMittente = fConfig.getRange("B19").getValue() || Session.getActiveUser().getEmail(); // Chi invia
  var nomeAssociazione = "Gens Ssshhh"; // O leggi da config
  var urlWebApp = ScriptApp.getService().getUrl(); // Link al tuo sito
  
  // 2. CERCA NEWS DEGLI ULTIMI 7 GIORNI
  var oggi = new Date();
  var setteGiorniFa = new Date(oggi.getTime() - (7 * 24 * 60 * 60 * 1000));
  
  var datiNews = fNews.getDataRange().getValues();
  var newsRecenti = [];
  
  // Cicla news (salta intestazione riga 0)
  for (var i = 1; i < datiNews.length; i++) {
    var dataNews = new Date(datiNews[i][0]);
    // Se la data è valida e rientra nel range
    if (dataNews >= setteGiorniFa && dataNews <= oggi) {
      newsRecenti.push({
        data: Utilities.formatDate(dataNews, "Europe/Rome", "dd/MM/yyyy"),
        titolo: datiNews[i][1],
        testo: datiNews[i][2]
      });
    }
  }
  
  // SE NON CI SONO NEWS, FERMATI QUI (Nessuna mail inviata)
  if (newsRecenti.length === 0) {
    console.log("Digest Settimanale: Nessuna news recente trovata. Invio annullato.");
    return;
  }
  
  // 3. PREPARA LISTA DESTINATARI (Solo Soci ATTIVI)
  var datiSoci = fSoci.getDataRange().getValues();
  var destinatariBCC = [];
  
  for (var j = 1; j < datiSoci.length; j++) {
    var email = datiSoci[j][2].toString().trim();
    var stato = datiSoci[j][11].toString().toLowerCase(); // Colonna L (Stato)
    
    // Controlla che sia ATTIVO e abbia una mail valida
    if (stato === "attivo" && email.indexOf("@") > -1) {
      destinatariBCC.push(email);
    }
  }
  
  if (destinatariBCC.length === 0) return;

  // 4. COSTRUISCI HTML DELLA MAIL (Opzione B)
  var htmlBody = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; color: #333;">
      
      <div style="background-color: #1e40af; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h2 style="color: #ffffff; margin: 0; text-transform: uppercase; letter-spacing: 1px;">${nomeAssociazione}</h2>
        <p style="color: #bfdbfe; margin: 5px 0 0 0; font-size: 13px;">Il riepilogo della settimana</p>
      </div>
      
      <div style="padding: 20px; border: 1px solid #e2e8f0; border-top: none;">
        <p style="color: #64748b; font-size: 14px;">Ciao! Ecco le ultime novità pubblicate nella nostra bacheca:</p>
        <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 20px 0;">
  `;
  
  // Inserisce le Card delle News
  newsRecenti.forEach(n => {
    // Tronca il testo se troppo lungo (prime 2 righe approx 150 caratteri)
    var testoBreve = n.testo.length > 150 ? n.testo.substring(0, 150) + "..." : n.testo;
    
    htmlBody += `
      <div style="margin-bottom: 25px;">
        <div style="font-size: 11px; color: #ef4444; font-weight: bold; text-transform: uppercase; margin-bottom: 4px;">${n.data}</div>
        <h3 style="margin: 0 0 8px 0; color: #0f172a; font-size: 18px;">${n.titolo}</h3>
        <p style="margin: 0 0 10px 0; color: #475569; font-size: 14px; line-height: 1.5;">${testoBreve}</p>
        <a href="${urlWebApp}" style="display: inline-block; font-size: 12px; color: #2563eb; text-decoration: none; font-weight: 600;">LEGGI TUTTO →</a>
      </div>
    `;
  });
  
  htmlBody += `
        <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 30px 0;">
        <div style="text-align: center;">
          <a href="${urlWebApp}" style="background-color: #1e40af; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 14px;">ACCEDI ALL'AREA RISERVATA</a>
        </div>
      </div>
      
      <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 11px;">
        Ti abbiamo inviato questa mail perché sei un socio attivo.<br>
        © ${new Date().getFullYear()} ${nomeAssociazione}
      </div>
    </div>
  `;

  // 5. INVIO A BLOCCHI (BATCHING)
  var batchSize = 40; // Sicurezza per account Gmail free
  var subject = "📢 Novità della settimana - " + nomeAssociazione;
  
  for (var k = 0; k < destinatariBCC.length; k += batchSize) {
    var batch = destinatariBCC.slice(k, k + batchSize);
    var bccString = batch.join(",");
    
    try {
      MailApp.sendEmail({
        to: emailMittente, // Il destinatario "A" sei tu (così vedono "Da: Associazione A: Associazione")
        bcc: bccString,    // Tutti gli altri in copia nascosta
        subject: subject,
        htmlBody: htmlBody,
        name: nomeAssociazione
      });
      console.log("Batch inviato: " + batch.length + " destinatari.");
    } catch (e) {
      console.log("Errore invio batch: " + e.toString());
    }
    
    // Pausa di sicurezza di 1 secondo tra un invio e l'altro
    Utilities.sleep(1000);
  }
  
  scriviLog(emailMittente, "DIGEST_SETTIMANALE", "Inviate " + newsRecenti.length + " news a " + destinatariBCC.length + " soci.");
}


