function isRuoloAmministrativo(ruolo) {
  var ruoloNorm = String(ruolo || "").trim().toUpperCase();
  return ["PRESIDENTE", "VICEPRESIDENTE", "SEGRETARIO", "TESORIERE"].indexOf(ruoloNorm) >= 0;
}

function getHomeSummary(email) {
  var user = getDatiUtente(email);
  if (!user) return null;

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
  } catch (e) {
    votiAttivi = 0; // Fallback di sicurezza
  }

  var filesPub = getListaDocumenti("PUBBLICO", email).length;
  var filesPriv = getListaDocumenti("PRIVATO", email).length;

  // --- LOGICA RUOLI ---
  var isAdmin = isRuoloAmministrativo(user.ruolo);

  return {
    nome: user.nome,
    cognome: user.cognome,
    stato: user.stato,
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

  var intestazioni = dati[0].map(function (h) { return h.toString().toLowerCase().trim(); });
  var colNome = intestazioni.indexOf("nome");
  var colCognome = intestazioni.indexOf("cognome");
  var colStato = intestazioni.findIndex(function (h) { return h.indexOf("stato") > -1; });

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

  tempLista.sort(function (a, b) {
    var cmp = a.cognome.localeCompare(b.cognome);
    if (cmp === 0) return a.nome.localeCompare(b.nome);
    return cmp;
  });

  return tempLista.map(function (x) { return x.etichetta; });
}


// Estrae Nome, Cognome ed Email dei soli soci ATTIVI (usata per Garanti Ammissioni)
function getListaSociPerSponsor() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglio = ss.getSheetByName("soci");
  if (!foglio) return [];

  var dati = foglio.getDataRange().getValues();
  var lista = [];

  var intestazioni = dati[0].map(function (h) { return h.toString().toLowerCase().trim(); });
  var colNome = intestazioni.indexOf("nome");
  var colCognome = intestazioni.indexOf("cognome");
  var colEmail = intestazioni.indexOf("email");
  var colStato = intestazioni.findIndex(function (h) { return h.indexOf("stato") > -1; });

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

  return lista.sort(function (a, b) {
    var cmp = a.cognome.localeCompare(b.cognome);
    if (cmp === 0) return a.nome.localeCompare(b.nome);
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
    inviaNotificaPushUtente(dati.emailSponsor2, "Richiesta di sostegno", "Ti è stato richiesto di sostenere una candidatura.", "viewAdmin");
  } catch (e) { }

  return "OK";
}

// Funzione che lo Sponsor 2 richiama per dare il suo appoggio
function getCandidatureAttive(emailUtente) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioAmmissioni = ss.getSheetByName("Ammissioni");
  if (!foglioAmmissioni) return { daSostenere: [], inAssemblea: [] };

  var dati = foglioAmmissioni.getDataRange().getValues();
  var daSostenere = [];
  var inAssemblea = [];

  for (var i = 1; i < dati.length; i++) {
    // Uniamo Nome (colonna 1) e Cognome (colonna 2) per un'visualizzazione pulita
    var nomeCompleto = (dati[i][1] || "") + " " + (dati[i][2] || "");

    var candidato = {
      nome: nomeCompleto.trim(),
      email: dati[i][3],     // Email Candidato (Colonna D)
      sponsor1: dati[i][5],  // Sponsor 1 (Colonna F)
      stato: dati[i][7]      // Stato Sostegno (Colonna H)
    };

    // Se l'utente loggato è lo Sponsor 2 (Colonna G, indice 6) e lo stato è in attesa (Colonna H, indice 7)
    if (dati[i][7] === "ATTESA 2° SPONSOR" && dati[i][6].toString().toLowerCase() === emailUtente.toLowerCase()) {
      daSostenere.push(candidato);
    }

    // Tutte le candidature pronte per essere votate in assemblea (Stato in Colonna H, Esito in Colonna I)
    if (dati[i][7] === "SOSTENUTO (PRONTO PER ASSEMBLEA)" && dati[i][8] === "DA VOTARE") {
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

function getFoglioRichiesteIscrizione_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Ammissioni");
  if (!sheet) {
    sheet = ss.insertSheet("Ammissioni");
    sheet.appendRow(["Data Richiesta", "Nome Candidato", "Cognome Candidato", "Email Candidato", "Telefono", "Sponsor 1 (Proponente)", "Sponsor 2 (Richiesto)", "Stato Sostegno", "Esito Assemblea"]);
  }

  ["ID Richiesta", "Presentazione", "Scadenza Avvalli", "Data Voto Prevista", "Voto Notificato Il"].forEach(function (header, index) {
    var column = 10 + index;
    var current = sheet.getRange(1, column).getValue();
    if (String(current || "").trim() !== header) sheet.getRange(1, column).setValue(header);
  });
  return sheet;
}

function isSocioAttivoPerEmail_(email) {
  var target = String(email || "").trim().toLowerCase();
  if (!target) return false;
  return getListaSociPerSponsor().some(function (socio) {
    return String(socio.email || "").trim().toLowerCase() === target;
  });
}

function richiediIscrizioneSocio(dati) {
  dati = dati || {};
  var nome = String(dati.nome || "").trim();
  var cognome = String(dati.cognome || "").trim();
  var email = String(dati.email || "").trim().toLowerCase();
  var telefono = String(dati.telefono || "").trim();
  var presentazione = String(dati.presentazione || "").trim();
  if (!nome || !cognome || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, messaggio: "Inserisci nome, cognome e un indirizzo e-mail valido." };
  }
  if (dati.consensoPrivacy !== true) return { ok: false, messaggio: "Per inviare la richiesta devi accettare l'informativa privacy." };
  if (isSocioAttivoPerEmail_(email)) return { ok: false, messaggio: "Questa e-mail risulta già associata a un socio." };

  var sheet = getFoglioRichiesteIscrizione_();
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][3] || "").trim().toLowerCase() === email) {
      var statoEsistente = String(rows[i][7] || "").trim().toUpperCase();
      if (["SCADUTA", "RESPINTA", "VOTAZIONE_CHIUSA"].indexOf(statoEsistente) < 0) {
        return { ok: false, messaggio: "Esiste già una richiesta aperta con questa e-mail." };
      }
    }
  }

  var richiestaId = Utilities.getUuid();
  var richiestaIl = new Date();
  var scadenzaAvvalli = new Date(richiestaIl.getTime() + 3 * 86400000);
  var votoPrevisto = new Date(richiestaIl.getTime() + 10 * 86400000);
  sheet.appendRow([
    richiestaIl, nome, cognome, email, telefono, "", "", "RACCOLTA AVVALLI", "DA VOTARE",
    richiestaId, presentazione, scadenzaAvvalli, votoPrevisto, ""
  ]);

  try {
    MailApp.sendEmail(email, "Richiesta di iscrizione ricevuta", "La tua richiesta è stata ricevuta. Entro 3 giorni almeno due soci dovranno avvallarla. Se raggiunge i due avvalli, la votazione si aprirà il " + votoPrevisto.toLocaleDateString("it-IT") + ".");
  } catch (e) { }
  try {
    var membri = getListaSociPerSponsor();
    membri.forEach(function (socio) {
      MailApp.sendEmail(socio.email, "Nuova richiesta di iscrizione", nome + " " + cognome + " ha chiesto di diventare socio. Puoi esaminare e avvallare la candidatura nella sezione Consultazioni entro 3 giorni.");
    });
    inviaNotificaPush("Nuova richiesta di iscrizione", "Una candidatura è in attesa di almeno due avvalli entro 3 giorni.", null, "viewElezioni");
  } catch (e) { }

  return { ok: true, richiestaId: richiestaId, votoPrevisto: votoPrevisto.toISOString() };
}

function getRichiesteIscrizioneDaAvvallare(emailSocio) {
  var email = String(emailSocio || "").trim().toLowerCase();
  if (!isSocioAttivoPerEmail_(email)) return [];
  processaScadenzeAmmissioni();

  var rows = getFoglioRichiesteIscrizione_().getDataRange().getValues();
  var now = new Date().getTime();
  var richieste = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (String(row[9] || "") === "" || String(row[7] || "") !== "RACCOLTA AVVALLI") continue;
    if (String(row[3] || "").trim().toLowerCase() === email) continue;
    if (new Date(row[11]).getTime() <= now) continue;
    if (String(row[5] || "").trim().toLowerCase() === email || String(row[6] || "").trim().toLowerCase() === email) continue;
    richieste.push({
      id: String(row[9]),
      nome: (String(row[1] || "") + " " + String(row[2] || "")).trim(),
      presentazione: String(row[10] || ""),
      richiestaIl: row[0],
      avvalli: (row[5] ? 1 : 0) + (row[6] ? 1 : 0),
      avvalliRichiesti: 2,
      scadenza: row[11]
    });
  }
  return richieste;
}

function avvallaRichiestaIscrizione(emailSocio, richiestaId) {
  var email = String(emailSocio || "").trim().toLowerCase();
  if (!isSocioAttivoPerEmail_(email)) return { ok: false, messaggio: "Solo i soci attivi possono avvallare una richiesta." };
  processaScadenzeAmmissioni();

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getFoglioRichiesteIscrizione_();
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      if (String(row[9] || "") !== String(richiestaId)) continue;
      if (String(row[7] || "") !== "RACCOLTA AVVALLI" || new Date(row[11]).getTime() <= new Date().getTime()) {
        return { ok: false, messaggio: "La raccolta degli avvalli è chiusa." };
      }
      if (String(row[3] || "").trim().toLowerCase() === email) return { ok: false, messaggio: "Non puoi avvallare la tua richiesta." };
      if (String(row[5] || "").trim().toLowerCase() === email || String(row[6] || "").trim().toLowerCase() === email) {
        return { ok: false, messaggio: "Hai già avvallato questa richiesta." };
      }
      var conteggio = (row[5] ? 1 : 0) + (row[6] ? 1 : 0) + 1;
      if (!row[5]) sheet.getRange(i + 1, 6).setValue(email);
      else if (!row[6]) sheet.getRange(i + 1, 7).setValue(email);
      else return { ok: false, messaggio: "La candidatura ha già ricevuto due avvalli." };

      if (conteggio >= 2) sheet.getRange(i + 1, 8).setValue("AVVALLATA - ATTESA VOTO");
      return { ok: true, avvalli: conteggio, votoPrevisto: row[12] };
    }
    return { ok: false, messaggio: "Richiesta non trovata." };
  } finally {
    lock.releaseLock();
  }
}

function processaScadenzeAmmissioni() {
  var sheet = getFoglioRichiesteIscrizione_();
  var lock = LockService.getScriptLock();
  var daNotificare = [];
  lock.waitLock(10000);
  try {
    var rows = sheet.getDataRange().getValues();
    var now = new Date();
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      if (!row[9]) continue;
      var stato = String(row[7] || "");
      var avvalli = (row[5] ? 1 : 0) + (row[6] ? 1 : 0);
      if (stato === "RACCOLTA AVVALLI" && new Date(row[11]).getTime() <= now.getTime() && avvalli < 2) {
        sheet.getRange(i + 1, 8).setValue("SCADUTA");
        sheet.getRange(i + 1, 9).setValue("SCADUTA - MENO DI DUE AVVALLI");
      } else if ((stato === "RACCOLTA AVVALLI" || stato === "AVVALLATA - ATTESA VOTO") && avvalli >= 2 && new Date(row[12]).getTime() <= now.getTime()) {
        sheet.getRange(i + 1, 8).setValue("IN VOTAZIONE");
        sheet.getRange(i + 1, 14).setValue(now);
        daNotificare.push({ nome: (String(row[1] || "") + " " + String(row[2] || "")).trim(), email: String(row[3] || "") });
      }
    }
  } finally {
    lock.releaseLock();
  }

  if (daNotificare.length) {
    var membri = getListaSociPerSponsor();
    daNotificare.forEach(function (candidato) {
      membri.forEach(function (socio) {
        try { MailApp.sendEmail(socio.email, "Voto ammissione socio aperto", "È aperta la votazione sulla richiesta di iscrizione di " + candidato.nome + ". Accedi alla sezione Consultazioni per esprimere il tuo voto."); } catch (e) { }
      });
    });
    inviaNotificaPush("Voto ammissione aperto", daNotificare.length === 1 ? "È aperta una nuova mozione di ammissione." : "Sono aperte nuove mozioni di ammissione.", null, "viewElezioni");
  }
  return daNotificare.length;
}

function configuraTriggerAmmissioni(adminEmail) {
  var user = getDatiUtente(adminEmail);
  if (!user || !isRuoloAmministrativo(user.ruolo)) return "NO_AUTH";
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "processaScadenzeAmmissioni") ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("processaScadenzeAmmissioni").timeBased().everyHours(1).create();
  return "TRIGGER_AMMISSIONI_CONFIGURATO";
}

// ==========================================
// VOTAZIONI ASSEMBLEARI PER AMMISSIONE (Art. 7)
// ==========================================

// 1. L'utente richiede le ammissioni attualmente aperte al voto
function getAmmissioniInVoto(emailSocio) {
  processaScadenzeAmmissioni();
  if (!isSocioAttivoPerEmail_(emailSocio)) return [];

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioAmm = getFoglioRichiesteIscrizione_();
  var foglioVotiAmm = ss.getSheetByName("VotiAmmissioni");

  // Se non c'è, crea il foglio per lo spoglio segreto
  if (!foglioVotiAmm) {
    foglioVotiAmm = ss.insertSheet("VotiAmmissioni");
    foglioVotiAmm.appendRow(["Timestamp", "HashSocio", "CandidatoEmail", "Voto"]);
  }

  var hashUtente = getHashUnivoco(emailSocio);
  if (!hashUtente) return [];

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
  if (!isSocioAttivoPerEmail_(dati.email)) return "ERR_USER";
  if (verificaLogin({ email: dati.email, password: dati.password }) !== "OK_LOGIN") return "ERR_AUTH";

  var richiesteAmm = getFoglioRichiesteIscrizione_().getDataRange().getValues();
  var mozioneAperta = richiesteAmm.some(function (row, index) {
    return index > 0 && String(row[3] || "").trim().toLowerCase() === String(dati.emailCandidato || "").trim().toLowerCase() && String(row[7] || "") === "IN VOTAZIONE";
  });
  if (!mozioneAperta) return "ERR_VOTAZIONE_CHIUSA";

  var hashUtente = getHashUnivoco(dati.email);
  if (!hashUtente) return "ERR_USER";

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var foglioVoti = ss.getSheetByName("VotiAmmissioni");
    if (!foglioVoti) {
      foglioVoti = ss.insertSheet("VotiAmmissioni");
      foglioVoti.appendRow(["Timestamp", "HashSocio", "CandidatoEmail", "Voto"]);
    }

    // Doppio controllo anti-frode
    var datiVoti = foglioVoti.getDataRange().getValues();
    for (var i = 1; i < datiVoti.length; i++) {
      if (datiVoti[i][1] === hashUtente && datiVoti[i][2] === dati.emailCandidato) {
        return "GIA_VOTATO";
      }
    }

    foglioVoti.appendRow([new Date(), hashUtente, dati.emailCandidato, dati.voto]);
    scriviLog(dati.email, "VOTO_AMMISSIONE", "Espresso voto per: " + dati.emailCandidato);
    return "OK";
  } catch (e) {
    return "ERRORE";
  } finally {
    lock.releaseLock();
  }
}

