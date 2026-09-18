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
  var intestazioni = dati.length ? dati[0].map(function (value) { return String(value).trim().toLowerCase(); }) : [];
  var indiceUuid = intestazioni.indexOf("ID_Univoco");
  if (indiceUuid < 0) indiceUuid = 18;
  var target = email.trim().toLowerCase();

  for (var i = 1; i < dati.length; i++) {
    // Colonna C (indice 2) è l'email
    if (dati[i][2].toString().trim().toLowerCase() === target) {
      var uuid = dati[i][indiceUuid];

      // SICUREZZA: Se per caso manca l'UUID (nuovo socio inserito a mano male), lo creiamo al volo
      if (!uuid || uuid === "") {
        uuid = Utilities.getUuid();
        sheet.getRange(i + 1, indiceUuid + 1).setValue(uuid); // Lo salviamo per il futuro
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
  } catch (e) { console.log("Log Error: " + e); }
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
      try { MailApp.sendEmail(emailTarget, "Nuova Password", "Password: " + passTemp); return "RESET_OK"; } catch (e) { }
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

      // Il link deve aprire il frontend pubblico: il backend ricevera il token
      // tramite la chiamata POST completaResetPassword.
      var frontendResetUrl = "https://gensssshhh-collab.github.io/Sito-web-Gens-Ssshhh/index.html";
      var link = frontendResetUrl + "?resetToken=" + encodeURIComponent(token);

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
      } catch (e) { return "ERRORE_MAIL"; }
    }
  }
  // Per sicurezza non diciamo se l'email non esiste
  return "LINK_INVIATO";
}

function completaResetPassword(token, nuovaPass) {
  if (!token) return "ERR_TOKEN";

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
  var intestazioni = dati.length ? dati[0].map(function (value) { return String(value).trim().toLowerCase(); }) : [];
  function colonna(nome, fallback) {
    var indice = intestazioni.indexOf(nome.toLowerCase());
    return indice >= 0 ? indice : fallback;
  }
  function valore(riga, nome, fallback) {
    return riga[colonna(nome, fallback)];
  }
  function dataFormattata(value) {
    if (value instanceof Date) return Utilities.formatDate(value, "Europe/Rome", "dd/MM/yyyy");
    return value ? String(value) : "";
  }
  var target = email.trim().toLowerCase();

  for (var i = 1; i < dati.length; i++) {
    // Colonna C (Indice 2) contiene l'email
    if (String(valore(dati[i], "Email", 2)).trim().toLowerCase() === target) {

      // --- RECUPERO DATI ---
      var rawTessera = valore(dati[i], "Numero Tessera", 9);
      var rawScadenza = valore(dati[i], "Data Scadenza", 10);
      var rawStato = valore(dati[i], "Stato Socio", 11);
      var rawCarica = valore(dati[i], "Carica sociale", 12);

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
        nome: valore(dati[i], "Nome", 0),
        cognome: valore(dati[i], "Cognome", 4),
        email: valore(dati[i], "Email", 2),
        telefono: valore(dati[i], "Telefono", 5),
        indirizzo: valore(dati[i], "Indirizzo", 6),
        sesso: valore(dati[i], "Sesso", 13) || "",
        codiceFiscale: valore(dati[i], "Codice fiscale", 14) || "",
        dataNascita: dataFormattata(valore(dati[i], "Data nascita", 15)),
        comuneNascita: valore(dati[i], "Comune nascita", 16) || "",
        versioneAccettata: valore(dati[i], "Versione Accettata", 17) || "",
        idUnivoco: valore(dati[i], "ID Univoco", 18) || "",
        capResidenza: valore(dati[i], "CAP res", 19) || "",
        comuneResidenza: valore(dati[i], "Comune res", 20) || "",
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
  if (verificaLogin({ email: datiForm.email, password: datiForm.password }) !== "OK_LOGIN") return "ERR_AUTH";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioSoci = ss.getSheetByName("soci");
  var dati = foglioSoci.getDataRange().getValues();
  var intestazioni = dati[0].map(function (value) { return String(value).trim().toLowerCase(); });
  function indice(nome, fallback) {
    var trovato = intestazioni.indexOf(nome.toLowerCase());
    return trovato >= 0 ? trovato : fallback;
  }
  var target = datiForm.email.trim().toLowerCase();

  for (var i = 1; i < dati.length; i++) {
    if (dati[i][2].toString().trim().toLowerCase() === target) {
      foglioSoci.getRange(i + 1, indice("Cognome", 4) + 1).setValue(datiForm.cognome);
      foglioSoci.getRange(i + 1, indice("Telefono", 5) + 1).setValue(datiForm.telefono);
      foglioSoci.getRange(i + 1, indice("Indirizzo", 6) + 1).setValue(datiForm.indirizzo);
      foglioSoci.getRange(i + 1, indice("CAP res", 19) + 1).setValue(datiForm.capResidenza || "");
      foglioSoci.getRange(i + 1, indice("Comune res", 20) + 1).setValue(datiForm.comuneResidenza || "");
      scriviLog(target, "PROFILO_AGGIORNATO");
      return "SALVATAGGIO_OK";
    }
  }
  return "ERR_GENERICO";
}

function inviaRichiestaDimissioni(dati) {
  if (verificaLogin(dati) !== "OK_LOGIN") return "ERR_AUTH";
  var emailUtente = dati.email.trim().toLowerCase();
  var info = getDatiUtente(emailUtente);
  var nomeCompleto = info ? (info.nome + " " + info.cognome) : emailUtente;
  scriviLog(emailUtente, "RICHIESTA_DIMISSIONI");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var emailAdmin = ss.getSheetByName("Config").getRange("B19").getValue() || "gens.ssshhh@gmail.com";
  try {
    MailApp.sendEmail(emailAdmin, "⚠️ Richiesta Dimissioni", "Il socio " + nomeCompleto + " (" + emailUtente + ") ha richiesto le dimissioni.");
    return "DIMISSIONI_OK";
  } catch (e) { return "ERRORE_MAIL"; }
}

function inviaAvvisiScadenzaTessere() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioSoci = ss.getSheetByName("soci");
  if (!foglioSoci || foglioSoci.getLastRow() < 2) return "NESSUN_SOCIO";

  var dati = foglioSoci.getDataRange().getValues();
  var intestazioni = dati[0].map(function (value) { return String(value).trim().toLowerCase(); });
  var indice = function (nome, fallback) {
    var trovato = intestazioni.indexOf(nome.toLowerCase());
    return trovato >= 0 ? trovato : fallback;
  };

  var idxEmail = indice("Email", 2);
  var idxNome = indice("Nome", 0);
  var idxCognome = indice("Cognome", 4);
  var idxScadenza = indice("Data Scadenza", 10);
  var idxStato = indice("Stato Socio", 11);
  var oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

  var proprieta = PropertiesService.getScriptProperties();
  var risultati = { inviati: 0, saltati: 0, errori: 0 };
  var tesoriere = trovaTesorierePerEmail_(dati, intestazioni, indice);
  var urlWebApp = "https://sites.google.com/view/gens-ssshhhh/area-riservata";

  for (var i = 1; i < dati.length; i++) {
    var stato = String(dati[i][idxStato] || "").trim().toLowerCase();
    if (stato !== "attivo") continue;
    var email = String(dati[i][idxEmail] || "").trim().toLowerCase();
    if (!email || email.indexOf("@") < 1) continue;
    var scadenza = parseDataNotificaGlobale_(dati[i][idxScadenza]);
    if (!scadenza) continue;
    scadenza.setHours(0, 0, 0, 0);

    var giorni = Math.ceil((scadenza.getTime() - oggi.getTime()) / 86400000);
    var tipo = giorni < 0 ? "SCADUTA" : giorni === 30 ? "PRE_SCADENZA" : "";
    if (!tipo) continue;

    var chiave = "AVVISO_TESSERA|" + tipo + "|" + email + "|" + scadenza.getTime();
    if (proprieta.getProperty(chiave)) {
      risultati.saltati++;
      continue;
    }

    var nome = String(dati[i][idxNome] || "").trim();
    var cognome = String(dati[i][idxCognome] || "").trim();
    var nomeSocio = nome || cognome || "Socio";
    var dataFormattata = Utilities.formatDate(scadenza, "Europe/Rome", "dd/MM/yyyy");

    // --- INIZIO NUOVA FORMATTAZIONE EMAIL ---
    var oggetto = tipo === "SCADUTA" ? "Azione richiesta: Tessera associativa scaduta" : "Promemoria: Scadenza tessera associativa";

    var titoloEmail = tipo === "SCADUTA" ? "La tua tessera è scaduta" : "Scadenza in avvicinamento";
    var testoIntro = tipo === "SCADUTA"
      ? "Ti informiamo che la tua tessera associativa è risultata scaduta in data <strong>" + dataFormattata + "</strong>."
      : "Ti ricordiamo che la tua tessera associativa scadrà tra 30 giorni, in data <strong>" + dataFormattata + "</strong>.";

    var htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 30px 10px; color: #3f3f46; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        .header { background-color: #1e293b; padding: 25px 20px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 0.5px; }
        .content { padding: 35px 30px; line-height: 1.6; font-size: 16px; }
        .title { font-size: 20px; color: #18181b; margin-top: 0; margin-bottom: 20px; font-weight: 600; }
        .info-box { background-color: #f8fafc; border-left: 4px solid #10b981; padding: 15px 20px; margin: 25px 0; border-radius: 0 4px 4px 0; }
        .info-box p { margin: 5px 0; font-size: 15px; }
        .btn-container { text-align: center; margin: 35px 0 20px; }
        .btn { background-color: #10b981; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; display: inline-block; }
        .footer { background-color: #f4f4f5; padding: 20px; text-align: center; font-size: 12px; color: #71717a; border-top: 1px solid #e4e4e7; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Gens Ssshhh</h1>
        </div>
        <div class="content">
          <h2 class="title">${titoloEmail}</h2>
          <p>Ciao <strong>${nomeSocio}</strong>,</p>
          <p>${testoIntro}</p>
          <p>Per regolarizzare la tua posizione e continuare a partecipare alle attività dell'associazione, ti invitiamo a procedere con il rinnovo.</p>
          
          <div class="info-box">
            <p><strong>Quota associativa:</strong> 10,00 €</p>
            <p><strong>Tesoriere di riferimento:</strong> ${tesoriere.nome} ${tesoriere.email ? "(<a href='mailto:" + tesoriere.email + "'>" + tesoriere.email + "</a>)" : ""}</p>
          </div>

          <p>Puoi gestire il rinnovo aprendo la sezione Profilo all'interno della nostra Area Riservata.</p>
          
          <div class="btn-container">
            <a href="${urlWebApp}" class="btn">Accedi all'Area Riservata</a>
          </div>
        </div>
        <div class="footer">
          <p>Questa è l'unica comunicazione automatica prevista per questa scadenza.</p>
          <p>&copy; ${new Date().getFullYear()} Associazione Gens Ssshhh. Tutti i diritti riservati.</p>
        </div>
      </div>
    </body>
    </html>
    `;

    // Testo di riserva per client email molto vecchi che non leggono l'HTML
    var testoPlain = "Ciao " + nomeSocio + ",\n\n" + testoIntro.replace(/<[^>]*>?/gm, '') + "\n\nLa quota associativa è di 10 euro da versare al Tesoriere: " + tesoriere.nome + ". Vai all'Area Riservata per rinnovare: " + urlWebApp;

    try {
      // Usiamo il formato avanzato di MailApp per inviare l'HTML e impostare il mittente ufficiale
      MailApp.sendEmail({
        to: email,
        subject: oggetto,
        body: testoPlain,
        htmlBody: htmlBody,
        name: "Gens Ssshhh App"
      });

      proprieta.setProperty(chiave, new Date().toISOString());
      scriviLog(email, "EMAIL_TESSERA_" + tipo, "Scadenza " + dataFormattata);
      risultati.inviati++;
    } catch (errore) {
      console.log("Errore email scadenza " + email + ": " + errore);
      risultati.errori++;
    }
    // --- FINE NUOVA FORMATTAZIONE EMAIL ---
  }
  return risultati;
}

function parseDataNotificaGlobale_(valore) {
  if (!valore) return null;
  if (valore instanceof Date) return isNaN(valore.getTime()) ? null : new Date(valore.getTime());
  var testo = String(valore).trim();
  var parti = testo.split(/[\/\-.]/);
  if (parti.length === 3) {
    if (parti[0].length === 4) return new Date(Number(parti[0]), Number(parti[1]) - 1, Number(parti[2]));
    return new Date(Number(parti[2]), Number(parti[1]) - 1, Number(parti[0]));
  }
  var data = new Date(testo);
  return isNaN(data.getTime()) ? null : data;
}

function trovaTesorierePerEmail_(dati, intestazioni, indice) {
  var idxNome = indice("Nome", 0);
  var idxCognome = indice("Cognome", 4);
  var idxEmail = indice("Email", 2);
  var idxRuolo = indice("Carica sociale", 12);
  for (var i = 1; i < dati.length; i++) {
    if (String(dati[i][idxRuolo] || "").trim().toUpperCase() === "TESORIERE") {
      return {
        nome: (String(dati[i][idxNome] || "") + " " + String(dati[i][idxCognome] || "")).trim() || "il Tesoriere",
        email: String(dati[i][idxEmail] || "").trim()
      };
    }
  }
  return { nome: "il Tesoriere", email: "" };
}

function configuraTriggerAvvisiScadenzaTessere() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "inviaAvvisiScadenzaTessere") ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("inviaAvvisiScadenzaTessere").timeBased().everyDays(1).atHour(8).create();
  return "TRIGGER_CONFIGURATO";
}



function parseDataNotifica(valore) {
  if (!valore) return null;
  if (valore instanceof Date) return valore;
  var testo = String(valore).trim();
  var parti = testo.split('/');
  if (parti.length === 3) return new Date(Number(parti[2]), Number(parti[1]) - 1, Number(parti[0]));
  var data = new Date(testo);
  return isNaN(data.getTime()) ? null : data;
}

function getNotificheUtente(email) {
  var notifiche = [];
  var utente = getDatiUtente(email);
  if (!utente) return notifiche;

  var scadenza = parseDataNotifica(utente.scadenza);
  if (scadenza) {
    var giorni = Math.ceil((scadenza.getTime() - new Date().getTime()) / 86400000);
    if (giorni < 0) {
      notifiche.push({ tipo: "error", titolo: "Tessera scaduta", testo: "La tessera è scaduta. Versa la quota associativa di 10 euro per rinnovarla." });
    } else if (giorni <= 30) {
      notifiche.push({ tipo: "warning", titolo: "Tessera in scadenza", testo: "La tessera scade tra " + giorni + " giorni. Quota associativa da versare: 10 euro." });
    }
  }

  try {
    getAvvisiPubblici().slice(0, 5).forEach(function (avviso) {
      notifiche.push({ tipo: "info", titolo: avviso.titolo, testo: avviso.testo, data: avviso.data });
    });
  } catch (e) { }

  try {
    if (typeof getRichiesteFirmaUtente === "function") {
      var firme = getRichiesteFirmaUtente(email) || [];
      firme.filter(function (firma) { return String(firma.stato || "").toUpperCase().indexOf("FIRM") < 0; }).slice(0, 5).forEach(function (firma) {
        notifiche.push({ tipo: "action", titolo: "Documento da firmare", testo: firma.nomeFile || "Hai un documento in attesa di firma." });
      });
    }
  } catch (e) { }

  try {
    if (typeof getConsultazioniAttiveUtente === "function") {
      var consultazioni = getConsultazioniAttiveUtente(email) || [];
      consultazioni.slice(0, 5).forEach(function (consultazione) {
        notifiche.push({ tipo: "action", titolo: "Consultazione aperta", testo: consultazione.titolo || "Hai una consultazione a cui partecipare." });
      });
    }
  } catch (e) { }

  try {
    if (typeof getElezioniPerCandidatura === "function") {
      var candidature = getElezioniPerCandidatura(email) || [];
      candidature.slice(0, 5).forEach(function (candidatura) {
        notifiche.push({ tipo: "action", titolo: "Candidature aperte", testo: candidatura.titolo || "È possibile presentare una candidatura." });
      });
    }
  } catch (e) { }

  return notifiche;
}

function getStartData(email) {

  var cache = CacheService.getScriptCache();
  var cacheKey = "start_data_" + Utilities.base64EncodeWebSafe(String(email).toLowerCase()).slice(0, 180);
  var cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { }
  }

  // Eseguiamo tutte le letture insieme lato server (molto più veloce)
  // Recupera i dati utente di base
  var user = getHomeSummary(email);

  // Recupera le news (se la funzione esiste, altrimenti array vuoto)
  var news = [];
  try { news = getAvvisiPubblici(); } catch (e) { }

  // Recupera stato voto
  var voto = { status: "CHIUSE" };
  try { voto = checkStatoVoto(email); } catch (e) { }

  // Restituiamo un pacchetto unico al sito
  var result = {
    utente: user,
    avvisi: news,
    statoVoto: voto
  };

  cache.put(cacheKey, JSON.stringify(result), 30);
  return result;
}

