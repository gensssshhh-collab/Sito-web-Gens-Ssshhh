var EVENTI_SHEET_NAME = 'ProposteEventi';
var EVENTI_CALENDAR_ID = 'gens.ssshhh@gmail.com';

function getFoglioProposteEventi_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(EVENTI_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(EVENTI_SHEET_NAME);
    sheet.appendRow(['ID', 'CreatoIl', 'CreatoreEmail', 'Titolo', 'Descrizione', 'OpzioniJson', 'VotiJson', 'Stato']);
  }
  var headers = sheet.getDataRange().getValues()[0] || [];
  [['EventoCalendarId', 8], ['OpzioneConfermataJson', 9]].forEach(function (item) {
    if (String(headers[item[1]] || '') !== item[0]) sheet.getRange(1, item[1] + 1).setValue(item[0]);
  });
  return sheet;
}

function verificaSocioEvento_(email) {
  var target = String(email || '').trim().toLowerCase();
  if (!target) return false;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('soci');
  if (!sheet) return false;

  var rows = sheet.getDataRange().getValues();
  var headers = rows.length ? rows[0].map(function (value) { return String(value).trim().toLowerCase(); }) : [];
  var statusColumn = headers.indexOf('stato socio');
  return rows.slice(1).some(function (row) {
    var matches = String(row[2] || '').trim().toLowerCase() === target;
    if (!matches || statusColumn < 0) return matches;
    return String(row[statusColumn] || '').trim().toLowerCase() === 'attivo';
  });
}

function normalizzaOpzioniEvento_(opzioni) {
  if (!Array.isArray(opzioni)) return [];
  return opzioni.map(function (opzione) {
    return {
      data: String(opzione.data || '').trim(),
      ora: String(opzione.ora || '').trim(),
      luogo: String(opzione.luogo || '').trim()
    };
  }).filter(function (opzione) {
    return opzione.data && opzione.ora;
  });
}

function dataOraEvento_(opzione) {
  var matchData = String(opzione.data || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  var matchOra = String(opzione.ora || '').match(/^(\d{2}):(\d{2})$/);
  if (!matchData || !matchOra) return null;
  var data = new Date(Number(matchData[3]), Number(matchData[2]) - 1, Number(matchData[1]), Number(matchOra[1]), Number(matchOra[2]), 0, 0);
  if (data.getFullYear() !== Number(matchData[3]) || data.getMonth() !== Number(matchData[2]) - 1 || data.getDate() !== Number(matchData[1]) || data.getHours() !== Number(matchOra[1]) || data.getMinutes() !== Number(matchOra[2])) return null;
  return data;
}

function hashEmailEvento_(email) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(email).trim().toLowerCase());
  return bytes.map(function (byte) {
    var valore = byte < 0 ? byte + 256 : byte;
    return ('0' + valore.toString(16)).slice(-2);
  }).join('');
}

function leggiVotiEvento_(valore, opzioni, emailSocio) {
  var dati = {};
  try { dati = JSON.parse(valore || '{}'); } catch (e) { }

  var conteggiOpzioni = {};
  if (dati.opzioni && typeof dati.opzioni === 'object') {
    conteggiOpzioni = dati.opzioni;
  } else {
    Object.keys(dati).forEach(function (chiave) {
      if (/^\d+$/.test(chiave)) conteggiOpzioni[chiave] = Number(dati[chiave] || 0);
    });
  }

  var interesse = dati.interesse && typeof dati.interesse === 'object'
    ? { si: Number(dati.interesse.si || 0), no: Number(dati.interesse.no || 0) }
    : { si: Object.keys(conteggiOpzioni).reduce(function (totale, chiave) { return totale + Number(conteggiOpzioni[chiave] || 0); }, 0), no: 0 };

  var votanti = dati._votanti && typeof dati._votanti === 'object' ? dati._votanti : {};
  var mioVoto = null;
  if (emailSocio) {
    var chiaveSocio = 'socio:' + emailSocio;
    var precedente = votanti[chiaveSocio] !== undefined ? votanti[chiaveSocio] : votanti[emailSocio];
    if (precedente !== undefined) {
      mioVoto = typeof precedente === 'number'
        ? { interesse: 'si', opzioni: [precedente] }
        : precedente;
    }
  }

  return {
    riepilogo: {
      interesse: interesse,
      opzioni: opzioni.map(function (_, indice) { return Number(conteggiOpzioni[indice] || 0); })
    },
    votanti: votanti,
    mioVoto: mioVoto
  };
}

function preparaPropostaEvento_(row, email) {
  var opzioni = [];
  try { opzioni = JSON.parse(row[5] || '[]'); } catch (e) { }
  var socio = verificaSocioEvento_(email);
  var voti = leggiVotiEvento_(row[6], opzioni, socio ? email : '');
  return {
    id: String(row[0]),
    titolo: String(row[3] || ''),
    descrizione: String(row[4] || ''),
    opzioni: opzioni,
    voti: voti.riepilogo,
    mioVoto: voti.mioVoto,
    creatore: String(row[2] || '').trim().toLowerCase() === String(email || '').trim().toLowerCase()
  };
}

function getProposteEventi(email) {
  var socio = String(email || '').trim().toLowerCase();
  if (!verificaSocioEvento_(socio)) return [];

  var values = getFoglioProposteEventi_().getDataRange().getValues();
  return values.slice(1).filter(function (row) {
    return String(row[7] || 'ATTIVA') === 'ATTIVA';
  }).map(function (row) { return preparaPropostaEvento_(row, socio); });
}

function getPropostaEventoPubblica(payload) {
  var id = typeof payload === 'object' ? String(payload.id || payload.propostaId || '') : String(payload || '');
  var values = getFoglioProposteEventi_().getDataRange().getValues();
  var row = values.find(function (item, index) {
    return index > 0 && String(item[0]) === id && String(item[7] || 'ATTIVA') === 'ATTIVA';
  });
  return row ? preparaPropostaEvento_(row, '') : null;
}

function creaPropostaEvento(email, password, proposta) {
  if (!password || typeof verificaLogin !== 'function' || verificaLogin({ email: email, password: password }) !== 'OK_LOGIN') {
    return { ok: false, messaggio: 'Accedi al portale per proporre un evento.' };
  }
  if (!verificaSocioEvento_(email)) return { ok: false, messaggio: 'Solo i soci attivi possono proporre eventi.' };
  proposta = proposta || {};

  var titolo = String(proposta.titolo || '').trim();
  var descrizione = String(proposta.descrizione || '').trim();
  var opzioni = normalizzaOpzioniEvento_(proposta.opzioni);
  if (!titolo || !opzioni.length || opzioni.some(function (opzione) { return !dataOraEvento_(opzione); })) {
    return { ok: false, messaggio: 'Titolo e almeno una opzione di data/ora/luogo sono obbligatori.' };
  }

  var id = Utilities.getUuid();
  getFoglioProposteEventi_().appendRow([
    id,
    new Date(),
    String(email).trim().toLowerCase(),
    titolo,
    descrizione,
    JSON.stringify(opzioni),
    JSON.stringify({}),
    'ATTIVA'
  ]);
  return { ok: true, proposta: { id: id, titolo: titolo, descrizione: descrizione, opzioni: opzioni, voti: {} } };
}

function modificaPropostaEvento(dati) {
  dati = dati || {};
  var email = String(dati.email || '').trim().toLowerCase();
  if (!dati.password || typeof verificaLogin !== 'function' || verificaLogin({ email: email, password: dati.password }) !== 'OK_LOGIN') {
    return { ok: false, messaggio: 'Accedi al portale per modificare la proposta.' };
  }
  if (!verificaSocioEvento_(email)) return { ok: false, messaggio: 'Solo i soci attivi possono modificare le proposte.' };

  var proposta = dati.proposta || {};
  var titolo = String(proposta.titolo || '').trim();
  var descrizione = String(proposta.descrizione || '').trim();
  var opzioniNuove = normalizzaOpzioniEvento_(proposta.opzioni);
  if (!titolo || !opzioniNuove.length || opzioniNuove.some(function (opzione) { return !dataOraEvento_(opzione); })) {
    return { ok: false, messaggio: 'Inserisci titolo e almeno una data e un’ora valide.' };
  }
  if (opzioniNuove.length > 20) return { ok: false, messaggio: 'La proposta può contenere al massimo 20 opzioni.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getFoglioProposteEventi_();
    var values = sheet.getDataRange().getValues();
    var rowIndex = values.findIndex(function (row, index) { return index > 0 && String(row[0]) === String(dati.propostaId); });
    if (rowIndex < 1) return { ok: false, messaggio: 'Proposta non trovata.' };
    var row = values[rowIndex];
    if (String(row[2] || '').trim().toLowerCase() !== email) return { ok: false, messaggio: 'Solo il creatore può modificare questa proposta.' };
    if (String(row[7] || 'ATTIVA') !== 'ATTIVA') return { ok: false, messaggio: 'La proposta non è più modificabile.' };

    var oldOptions = [];
    try { oldOptions = JSON.parse(row[5] || '[]'); } catch (e) { }
    var votes = {};
    try { votes = JSON.parse(row[6] || '{}'); } catch (e) { }
    var oldSummary = leggiVotiEvento_(row[6], oldOptions, '').riepilogo;
    for (var votedIndex = 0; votedIndex < oldOptions.length; votedIndex++) {
      if (Number(oldSummary.opzioni[votedIndex] || 0) === 0) continue;
      var preserved = opzioniNuove.some(function (newOption) {
        return newOption.data === oldOptions[votedIndex].data && newOption.ora === oldOptions[votedIndex].ora;
      });
      if (!preserved) return { ok: false, messaggio: 'Non puoi cambiare o rimuovere una data/ora che ha già ricevuto preferenze. Aggiungi una nuova opzione oppure modifica solo il luogo.' };
    }
    var mapping = oldOptions.map(function (oldOption) {
      var index = opzioniNuove.findIndex(function (newOption) {
        return newOption.data === oldOption.data && newOption.ora === oldOption.ora;
      });
      return index;
    });
    var counts = opzioniNuove.map(function () { return 0; });
    oldSummary.opzioni.forEach(function (count, oldIndex) {
      if (mapping[oldIndex] >= 0) counts[mapping[oldIndex]] += Number(count || 0);
    });

    var votanti = votes._votanti && typeof votes._votanti === 'object' ? votes._votanti : {};
    Object.keys(votanti).forEach(function (key) {
      var response = votanti[key];
      if (typeof response === 'number') response = { interesse: 'si', opzioni: [response] };
      if (!response || typeof response !== 'object') return;
      var oldChoices = Array.isArray(response.opzioni) ? response.opzioni : [];
      response.opzioni = oldChoices.map(Number).filter(function (oldIndex) {
        return Number.isInteger(oldIndex) && mapping[oldIndex] >= 0;
      }).map(function (oldIndex) { return mapping[oldIndex]; });
      votanti[key] = response;
    });

    var voteData = { interesse: oldSummary.interesse, opzioni: counts, _votanti: votanti };
    sheet.getRange(rowIndex + 1, 4).setValue(titolo);
    sheet.getRange(rowIndex + 1, 5).setValue(descrizione);
    sheet.getRange(rowIndex + 1, 6).setValue(JSON.stringify(opzioniNuove));
    sheet.getRange(rowIndex + 1, 7).setValue(JSON.stringify(voteData));
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function annullaPropostaEvento(dati) {
  dati = dati || {};
  var email = String(dati.email || '').trim().toLowerCase();
  if (!dati.password || typeof verificaLogin !== 'function' || verificaLogin({ email: email, password: dati.password }) !== 'OK_LOGIN') {
    return { ok: false, messaggio: 'Accedi al portale per annullare la proposta.' };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getFoglioProposteEventi_();
    var values = sheet.getDataRange().getValues();
    var rowIndex = values.findIndex(function (row, index) { return index > 0 && String(row[0]) === String(dati.propostaId); });
    if (rowIndex < 1) return { ok: false, messaggio: 'Proposta non trovata.' };
    var row = values[rowIndex];
    if (String(row[2] || '').trim().toLowerCase() !== email) return { ok: false, messaggio: 'Solo il creatore può annullare questa proposta.' };
    if (String(row[7] || 'ATTIVA') !== 'ATTIVA') return { ok: false, messaggio: 'La proposta non è più aperta.' };
    sheet.getRange(rowIndex + 1, 8).setValue('ANNULLATA');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function votaPropostaEvento(email, propostaId, risposta) {
  var socio = String(email || '').trim().toLowerCase();
  var rispostaVoto = typeof risposta === 'number'
    ? { interesse: 'si', opzioni: [risposta] }
    : (risposta || {});
  var interessato = String(rispostaVoto.interesse || '').toLowerCase();
  var opzioniScelte = Array.isArray(rispostaVoto.opzioni) ? rispostaVoto.opzioni : [];
  var emailOspite = String(rispostaVoto.email || '').trim().toLowerCase();
  var chiaveVotante;

  if (verificaSocioEvento_(socio)) {
    chiaveVotante = 'socio:' + socio;
  } else {
    var nomeOspite = String(rispostaVoto.nome || '').trim();
    if (!nomeOspite || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailOspite)) {
      return { ok: false, messaggio: 'Per votare come ospite inserisci nome ed e-mail validi.' };
    }
    if (verificaSocioEvento_(emailOspite)) {
      return { ok: false, messaggio: 'Questa e-mail appartiene a un socio: accedi al portale per votare.' };
    }
    chiaveVotante = 'ospite:' + hashEmailEvento_(emailOspite);
  }

  if (interessato !== 'si' && interessato !== 'no') {
    return { ok: false, messaggio: 'Indica se ti interessa partecipare.' };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getFoglioProposteEventi_();
    var values = sheet.getDataRange().getValues();
    var rowIndex = values.findIndex(function (row, index) {
      return index > 0 && String(row[0]) === String(propostaId);
    });
    if (rowIndex < 1) return { ok: false, messaggio: 'Proposta non trovata.' };

    var row = values[rowIndex];
    var opzioni = JSON.parse(row[5] || '[]');
    var scelte = interessato === 'si' ? opzioniScelte.map(Number) : [];
    if ((interessato === 'si' && !scelte.length) || scelte.some(function (indice) {
      return !Number.isInteger(indice) || indice < 0 || indice >= opzioni.length;
    })) {
      return { ok: false, messaggio: interessato === 'si' ? 'Seleziona almeno una preferenza di data e ora.' : 'Opzione non valida.' };
    }
    scelte = scelte.filter(function (indice, index) { return scelte.indexOf(indice) === index; });

    var votiEsistenti = leggiVotiEvento_(row[6], opzioni, socio);
    var votanti = votiEsistenti.votanti;
    if (votanti[chiaveVotante] !== undefined || (socio && votanti[socio] !== undefined)) {
      return { ok: false, messaggio: 'Hai già votato questa proposta.' };
    }

    var interesse = votiEsistenti.riepilogo.interesse;
    interesse[interessato]++;
    scelte.forEach(function (indice) { votiEsistenti.riepilogo.opzioni[indice]++; });
    votanti[chiaveVotante] = { interesse: interessato, opzioni: scelte, email: emailOspite || socio };

    var datiSalvati = {
      interesse: interesse,
      opzioni: votiEsistenti.riepilogo.opzioni,
      _votanti: votanti
    };
    sheet.getRange(rowIndex + 1, 7).setValue(JSON.stringify(datiSalvati));
    return { ok: true, voti: votiEsistenti.riepilogo };
  } finally {
    lock.releaseLock();
  }
}

function aggiungiOpzionePropostaEvento(email, propostaId, opzione) {
  var socio = String(email || '').trim().toLowerCase();
  opzione = opzione || {};
  var emailOspite = String(opzione.email || '').trim().toLowerCase();
  var nomeOspite = String(opzione.nome || '').trim();
  if (!verificaSocioEvento_(socio)) {
    if (!nomeOspite || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailOspite)) return { ok: false, messaggio: 'Per aggiungere una data come ospite inserisci nome ed e-mail validi.' };
    if (verificaSocioEvento_(emailOspite)) return { ok: false, messaggio: 'Questa e-mail appartiene a un socio: accedi al portale.' };
  }
  var nuove = normalizzaOpzioniEvento_([opzione]);
  if (!nuove.length || !dataOraEvento_(nuove[0])) return { ok: false, messaggio: 'Inserisci una data e un orario validi.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getFoglioProposteEventi_();
    var values = sheet.getDataRange().getValues();
    var rowIndex = values.findIndex(function (row, index) {
      return index > 0 && String(row[0]) === String(propostaId) && String(row[7] || 'ATTIVA') === 'ATTIVA';
    });
    if (rowIndex < 1) return { ok: false, messaggio: 'Proposta non trovata o già confermata.' };
    var row = values[rowIndex];
    var options = JSON.parse(row[5] || '[]');
    if (options.length >= 20) return { ok: false, messaggio: 'La proposta ha già raggiunto il limite di 20 opzioni.' };
    if (options.some(function (existing) {
      return existing.data === nuove[0].data && existing.ora === nuove[0].ora;
    })) return { ok: false, messaggio: 'Questa data e ora sono già state proposte.' };

    options.push(nuove[0]);
    var votes = leggiVotiEvento_(row[6], options.slice(0, -1), socio);
    votes.riepilogo.opzioni.push(0);
    sheet.getRange(rowIndex + 1, 6).setValue(JSON.stringify(options));
    sheet.getRange(rowIndex + 1, 7).setValue(JSON.stringify({
      interesse: votes.riepilogo.interesse,
      opzioni: votes.riepilogo.opzioni,
      _votanti: votes.votanti
    }));
    return { ok: true, indice: options.length - 1, opzione: nuove[0] };
  } finally {
    lock.releaseLock();
  }
}

function confermaEventoProposto(dati) {
  dati = dati || {};
  var email = String(dati.email || '').trim().toLowerCase();
  if (!dati.password || typeof verificaLogin !== 'function' || verificaLogin({ email: email, password: dati.password }) !== 'OK_LOGIN') {
    return { ok: false, messaggio: 'Accedi al portale per confermare l’evento.' };
  }
  if (!verificaSocioEvento_(email)) return { ok: false, messaggio: 'Solo i soci attivi possono confermare l’evento.' };
  var propostaId = dati.propostaId;
  var opzioneFinale = dati.opzione || {};
  var opzioniFinali = normalizzaOpzioniEvento_([opzioneFinale]);
  if (!opzioniFinali.length || !dataOraEvento_(opzioniFinali[0])) return { ok: false, messaggio: 'La data o l’orario dell’evento non sono validi.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getFoglioProposteEventi_();
    var values = sheet.getDataRange().getValues();
    var rowIndex = values.findIndex(function (row, index) {
      return index > 0 && String(row[0]) === String(propostaId);
    });
    if (rowIndex < 1) return { ok: false, messaggio: 'Proposta non trovata.' };
    var row = values[rowIndex];
    if (String(row[2] || '').trim().toLowerCase() !== email) return { ok: false, messaggio: 'Solo il creatore può confermare l’evento.' };
    if (String(row[7] || 'ATTIVA') !== 'ATTIVA') return { ok: false, messaggio: 'Questa proposta è già stata chiusa.' };

    var votes = {};
    try { votes = JSON.parse(row[6] || '{}'); } catch (e) { }
    var confirmed = votes._votanti || {};
    var attendees = [];
    Object.keys(confirmed).forEach(function (key) {
      var response = confirmed[key];
      if (typeof response === 'number') {
        if (response < 0) return;
      } else if (!response || response.interesse !== 'si') return;
      var address = String(typeof response === 'number'
        ? (key.indexOf('socio:') === 0 ? key.substring(6) : key)
        : (response.email || (key.indexOf('socio:') === 0 ? key.substring(6) : key))).trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) && attendees.indexOf(address) < 0) attendees.push(address);
    });
    if (!attendees.length) return { ok: false, messaggio: 'Nessun partecipante ha risposto Sì.' };

    var start = dataOraEvento_(opzioniFinali[0]);
    if (start.getTime() <= new Date().getTime()) return { ok: false, messaggio: 'Scegli una data e un orario futuri.' };
    var end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    var calendar = CalendarApp.getCalendarById(EVENTI_CALENDAR_ID);
    if (!calendar) return { ok: false, messaggio: 'Il calendario associativo non è accessibile all’account Apps Script.' };
    var event = calendar.createEvent(String(row[3] || 'Evento associativo'), start, end, {
      description: String(row[4] || ''),
      location: opzioniFinali[0].luogo,
      guests: attendees.join(','),
      sendInvites: true
    });
    if (event.setGuestsCanSeeGuests) event.setGuestsCanSeeGuests(false);

    sheet.getRange(rowIndex + 1, 8).setValue('CONFERMATA');
    sheet.getRange(rowIndex + 1, 9).setValue(event.getId());
    sheet.getRange(rowIndex + 1, 10).setValue(JSON.stringify(opzioniFinali[0]));
    return { ok: true, invitati: attendees.length, idEvento: event.getId(), opzione: opzioniFinali[0] };
  } finally {
    lock.releaseLock();
  }
}