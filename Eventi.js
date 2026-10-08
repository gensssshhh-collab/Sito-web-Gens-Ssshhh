var EVENTI_SHEET_NAME = 'ProposteEventi';

function getFoglioProposteEventi_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(EVENTI_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(EVENTI_SHEET_NAME);
    sheet.appendRow(['ID', 'CreatoIl', 'CreatoreEmail', 'Titolo', 'Descrizione', 'OpzioniJson', 'VotiJson', 'Stato']);
  }
  return sheet;
}

function verificaSocioEvento_(email) {
  var target = String(email || '').trim().toLowerCase();
  if (!target) return false;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('soci');
  if (!sheet) return false;

  var rows = sheet.getDataRange().getValues();
  return rows.slice(1).some(function (row) {
    return String(row[2] || '').trim().toLowerCase() === target;
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
    return opzione.data || opzione.ora || opzione.luogo;
  });
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
    mioVoto: voti.mioVoto
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

function creaPropostaEvento(email, proposta) {
  if (!verificaSocioEvento_(email)) return { ok: false, messaggio: 'Socio non autorizzato.' };
  proposta = proposta || {};

  var titolo = String(proposta.titolo || '').trim();
  var descrizione = String(proposta.descrizione || '').trim();
  var opzioni = normalizzaOpzioniEvento_(proposta.opzioni);
  if (!titolo || !descrizione || !opzioni.length) {
    return { ok: false, messaggio: 'Titolo, descrizione e almeno una opzione sono obbligatori.' };
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
    votanti[chiaveVotante] = { interesse: interessato, opzioni: scelte };

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