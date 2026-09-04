/// FINANCE


function exportBilancioExcel(email, anno) {
  var user = getDatiUtente(email);
  if (!["PRESIDENTE", "SEGRETARIO", "TESORIERE"].includes(user.ruolo.toUpperCase())) return "NO_AUTH";

  var ss = SpreadsheetApp.openById("1zYVY0g8nIASjbzIKlHtVbaoEhk5949ctqQemVENfSow");
  var sheet = ss.getSheetByName("bilancio");
  var dati = sheet.getDataRange().getValues();
  
  // Costruiamo un CSV con separatore punto e virgola (standard Excel Italia)
  var csvContent = "Data;N. Doc;Descrizione;Conto Dare;Conto Avere;Importo;Controparte;CF/PIVA;Attivita\n";

  for (var i = 1; i < dati.length; i++) {
    var r = dati[i];
    var d = new Date(r[0]);
    // Filtro per anno (se specificato)
    if(anno && d.getFullYear() != anno) continue;
    
    var dataFmt = Utilities.formatDate(d, "Europe/Rome", "dd/MM/yyyy");
    var importo = r[4].toString().replace(".", ","); // Formato Italiano 10,50
    
    // Gestione vecchi dati vs nuovi dati
    // Nuovi: 0=Data, 1=Desc, 2=Dare, 3=Avere, 4=Imp, 5=Contr, 6=CF, 7=Tipo, 8=Doc
    var rigaCSV = [
      dataFmt,
      r[8] || "",       // N. Doc
      r[1] || "",       // Descrizione
      r[2] || "",       // Dare
      r[3] || "",       // Avere
      importo,
      r[5] || "",       // Controparte
      r[6] || "",       // CF/PIVA
      r[7] || "Ist"     // Tipo
    ].join(";");
    
    csvContent += rigaCSV + "\n";
  }

  // Convertiamo in Base64 per il download
  var blob = Utilities.newBlob(csvContent, "text/csv", "Bilancio_" + anno + ".csv");
  return Utilities.base64Encode(blob.getBytes());
}

function getDatiBilancioCompleto() {
  try {
    var ss = SpreadsheetApp.openById(ID_FOGLIO_CONTABILITA);
    var sheet = ss.getSheetByName("bilancio");
    if (!sheet || sheet.getLastRow() < 2) return null;

    var dati = sheet.getDataRange().getValues();
    
    var res = {
      totEntrate: 0, 
      totUscite: 0,
      dettUscite: {},
      dettEntrate: {}
    };

    // Definiamo i conti di liquidità per escludere i "giroconti" dal bilancio sociale
    var contiLiquidita = ["Banca C/C", "Cassa Contanti", "Crediti v/Soci", "Crediti v/Clienti (Commerciale)", "Crediti v/Enti Pubblici"];

    for (var i = 1; i < dati.length; i++) {
      var dare = dati[i][2]; // Colonna C (Conto Dare -> Costo/Uscita)
      var avere = dati[i][3]; // Colonna D (Conto Avere -> Ricavo/Entrata)
      var imp = parseFloat(dati[i][4]) || 0; // Colonna E (Importo)

      if (imp <= 0) continue;

      // Se il conto in DARE è compilato e non è liquidità, è una Spesa
      if (dare && contiLiquidita.indexOf(dare) === -1) {
         res.totUscite += imp;
         if(!res.dettUscite[dare]) res.dettUscite[dare] = 0;
         res.dettUscite[dare] += imp;
      }
      
      // Se il conto in AVERE è compilato e non è liquidità, è un'Entrata
      if (avere && contiLiquidita.indexOf(avere) === -1) {
         res.totEntrate += imp;
         if(!res.dettEntrate[avere]) res.dettEntrate[avere] = 0;
         res.dettEntrate[avere] += imp;
      }
    }
    return res;
  } catch (e) {
    return null;
  }
}

function getPianoDeiContiDinamico() {
  try {
    var ss = SpreadsheetApp.openById(ID_FOGLIO_CONTABILITA);
    var sheet = ss.getSheetByName("conti");
    if (!sheet) return [];
    return sheet.getDataRange().getValues();
  } catch (e) {
    console.error("Errore conti: " + e.toString());
    return [];
  }
}

function getAnagrafeFornitoriDinamica() {
  try {
    var ss = SpreadsheetApp.openById(ID_FOGLIO_CONTABILITA);
    var sheet = ss.getSheetByName("fornitori");
    if (!sheet) return [];
    return sheet.getDataRange().getValues();
  } catch (e) {
    console.error("Errore fornitori: " + e.toString());
    return [];
  }
}

function creaGruppoSpese(nomeGruppo) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglio = ss.getSheetByName("GruppiSpese");
  
  // Se non esiste, crea il foglio in automatico!
  if (!foglio) {
     foglio = ss.insertSheet("GruppiSpese");
     foglio.appendRow(["Nome Gruppo", "Creato Il"]);
  }
  
  foglio.appendRow([nomeGruppo.trim(), new Date()]);
  return "OK";
}

function aggiungiSpesaGruppo(dati) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglio = ss.getSheetByName("SpeseGruppo");
  
  var importoTotale = parseFloat(dati.importo);
  
  var stringaQuote = "";
  for (var nome in dati.quoteEsatte) {
    stringaQuote += nome + ":" + dati.quoteEsatte[nome].toFixed(2) + ",";
  }
  stringaQuote = stringaQuote.slice(0, -1);
  
  foglio.appendRow([
    new Date(),
    dati.pagatoDa,
    arrotondaIT(importoTotale),
    dati.descrizione,
    stringaQuote, 
    dati.esclusioniNomi || "-",
    dati.metodo,
    dati.txid || "-",
    dati.gruppo || "Generale" // SALVA IL GRUPPO NELLA COLONNA I (9a colonna)
  ]);
  
  return "OK";
}

function calcolaSaldiGruppo(nomeGruppo) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglio = ss.getSheetByName("SpeseGruppo");
  var dati = foglio.getDataRange().getValues();
  
  var saldi = {};
  
  for (var i = 1; i < dati.length; i++) {
    var gruppoRiga = dati[i][8] ? dati[i][8].toString().trim() : "Generale"; // Indice 8 è la Colonna I
    
    // Ignora le spese che non appartengono al gruppo che stiamo guardando
    if (gruppoRiga !== nomeGruppo) continue;
    
    var pagatoDa = dati[i][1];
    var importoTotale = parseFloat(dati[i][2]);
    var stringaQuote = dati[i][4]; 
    
    if (!saldi[pagatoDa]) saldi[pagatoDa] = 0;
    saldi[pagatoDa] += importoTotale; 
    
    if (stringaQuote && stringaQuote.indexOf(':') > -1) {
      var quoteArray = stringaQuote.split(',');
      quoteArray.forEach(function(coppia) {
        var parti = coppia.split(':');
        if (parti.length === 2) {
          var debitore = parti[0].trim();
          var debitoEsatto = parseFloat(parti[1]);
          if (!saldi[debitore]) saldi[debitore] = 0;
          saldi[debitore] -= debitoEsatto;
        }
      });
    }
  }
  
  var risultato = [];
  for (var persona in saldi) {
    var saldoFinale = arrotondaIT(saldi[persona]);
    if (saldoFinale !== 0) {
      risultato.push({ nome: persona, saldo: saldoFinale, formattato: formattaValutaIT(saldoFinale) });
    }
  }
  
  risultato.sort(function(a, b) { return b.saldo - a.saldo; });
  return risultato;
}

function getStatisticheGruppiLive() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglioGruppi = ss.getSheetByName("GruppiSpese");
  var foglioSpese = ss.getSheetByName("SpeseGruppo");
  
  var gruppiMap = {};

  // 1. Legge l'anagrafica dal foglio GruppiSpese (per recuperare l'anno di creazione)
  if (foglioGruppi && foglioGruppi.getLastRow() >= 2) {
    var datiGruppi = foglioGruppi.getDataRange().getValues();
    for (var g = 1; g < datiGruppi.length; g++) {
      var nomeGruppoRaw = datiGruppi[g][0];
      var dataCreazione = datiGruppi[g][1]; // Es. "07/08/2026 19.21.50"

      if (nomeGruppoRaw) {
        var nome = nomeGruppoRaw.toString().trim();
        
        // Estrapola l'anno dalla data (se assente, usa il 2026 come default)
        var anno = 2026; 
        if (dataCreazione) {
           var matchAnno = dataCreazione.toString().match(/\d{4}/);
           if (matchAnno) anno = parseInt(matchAnno[0]);
        }

        gruppiMap[nome] = {
          nome: nome,
          anno: anno, // Passiamo l'anno alla Dashboard!
          totale: 0,
          transazioni: 0,
          categorie: {},
          saldi: {}
        };
      }
    }
  }

  // 2. Legge i movimenti dal foglio SpeseGruppo
  if (foglioSpese && foglioSpese.getLastRow() >= 2) {
    var datiSpese = foglioSpese.getDataRange().getValues();
    
    // Indici delle colonne
    var idxPagatoDa = 1; // B
    var idxImporto = 2;  // C
    var idxDivisoTra = 4;// E
    var idxGruppo = 8;   // I
    var idxCategoria = 9;// J

    for (var i = 1; i < datiSpese.length; i++) {
      var riga = datiSpese[i];
      var nomeGruppoSpesa = riga[idxGruppo];

      if (!nomeGruppoSpesa || nomeGruppoSpesa.toString().trim() === "") continue;
      var nomeSpesa = nomeGruppoSpesa.toString().trim();

      // Se troviamo una spesa per un gruppo che non è in anagrafica, lo creiamo al volo
      if (!gruppiMap[nomeSpesa]) {
        gruppiMap[nomeSpesa] = {
          nome: nomeSpesa, anno: 2026, totale: 0, transazioni: 0, categorie: {}, saldi: {}
        };
      }

      var importo = parseFloat(riga[idxImporto]) || 0;
      var pagatore = riga[idxPagatoDa] ? riga[idxPagatoDa].toString().trim() : "Sconosciuto";
      var divisoTraStr = riga[idxDivisoTra] ? riga[idxDivisoTra].toString() : "";
      var categoria = riga[idxCategoria] ? riga[idxCategoria].toString().trim() : "Generali";

      // Aggiorna totale e categorie
      gruppiMap[nomeSpesa].totale += importo;
      gruppiMap[nomeSpesa].transazioni++;
      
      if (!gruppiMap[nomeSpesa].categorie[categoria]) gruppiMap[nomeSpesa].categorie[categoria] = 0;
      gruppiMap[nomeSpesa].categorie[categoria] += importo;

      // Aggiorna i saldi (chi ha pagato e chi deve dare)
      if (!gruppiMap[nomeSpesa].saldi[pagatore]) gruppiMap[nomeSpesa].saldi[pagatore] = 0;
      gruppiMap[nomeSpesa].saldi[pagatore] += importo;

      var partecipanti = [];
      try {
        var quote = JSON.parse(divisoTraStr);
        for (var persona in quote) {
          if (!gruppiMap[nomeSpesa].saldi[persona]) gruppiMap[nomeSpesa].saldi[persona] = 0;
          gruppiMap[nomeSpesa].saldi[persona] -= parseFloat(quote[persona]);
        }
      } catch(e) {
        partecipanti = divisoTraStr.split(",").map(function(s) { return s.trim(); }).filter(function(s) { return s !== ""; });
        if (partecipanti.length > 0) {
          var quotaUguale = importo / partecipanti.length;
          for (var k = 0; k < partecipanti.length; k++) {
            var p = partecipanti[k];
            if (!gruppiMap[nomeSpesa].saldi[p]) gruppiMap[nomeSpesa].saldi[p] = 0;
            gruppiMap[nomeSpesa].saldi[p] -= quotaUguale;
          }
        }
      }
    }
  }

  // 3. Arrotonda e pulisce i dati finali
  var risultatoFinale = [];
  for (var key in gruppiMap) {
    var gruppo = gruppiMap[key];
    
    // Ignoriamo i gruppi listati in GruppiSpese che però non hanno ancora nessuna transazione
    if (gruppo.transazioni === 0) continue; 

    gruppo.totale = Math.round(gruppo.totale * 100) / 100;
    
    for (var cat in gruppo.categorie) {
      gruppo.categorie[cat] = Math.round(gruppo.categorie[cat] * 100) / 100;
    }
    
    for (var saldoPersona in gruppo.saldi) {
      gruppo.saldi[saldoPersona] = Math.round(gruppo.saldi[saldoPersona] * 100) / 100;
      if (Math.abs(gruppo.saldi[saldoPersona]) < 0.01) gruppo.saldi[saldoPersona] = 0;
    }
    
    risultatoFinale.push(gruppo);
  }

  return risultatoFinale;
}

function generaFatturaXML(datiInput) {
  
  // --- LE TUE CONNESSIONI ---
  var idArchivioEsterno = "1zYVYOg8nlASjbzIKIHtVbaoEhK5949ctqQemVENfSow"; 
  var idCartellaDrive = "1NdZ2w4kU2WuYIj9wtA9rz3ITz08ViZje";
  
  // Dati Associazione
  var ass_piva = "01234567890"; 
  var ass_denominazione = "Gens Ssshhh";
  var ass_regime = "RF01"; 
  var ass_indirizzo = "Via dello Sport, 7";
  var ass_cap = "40065";
  var ass_comune = "Pianoro";
  var ass_provincia = "BO";

  var xmlCessionario = "";
  var codiceDestinatario = "0000000";
  
  var nomeArchivio = "";
  var identificativoArchivio = "";
  var indCompleto = ""; // Per il PDF

  // ----------------------------------------------------
  // CASO A: SOCIO (Ricerca nel Foglio PRINCIPALE)
  // ----------------------------------------------------
  if(datiInput.tipoCliente === "socio") {
    var ssMain = SpreadsheetApp.getActiveSpreadsheet();
    var fSoci = ssMain.getSheetByName("soci");
    var dati = fSoci.getDataRange().getValues();
    
    var socioCF = ""; 
    var socioNome = ""; 
    var socioCognome = "";
    var socioIndirizzo = "";
    var socioCAP = "";
    var socioComune = "";
    var socioProv = "";
    
    for(var i=1; i<dati.length; i++) {
      if(dati[i][2].toString().toLowerCase() === datiInput.email.toLowerCase()) {
         // Trovato! Estraiamo i dati basandoci sulle tue colonne esatte
         socioCF = dati[i][14]; // Colonna O
         
         var splitNome = dati[i][4].split(" "); // Colonna B
         socioNome = splitNome[0] || "NomeSconosciuto";
         socioCognome = splitNome.slice(4).join(" ") || "CognomeSconosciuto";
         socioComune = dati[i][20] || "Comune Sconosciuto"; // Colonna G
         socioProv = dati[i][7] || "PR";                   // Colonna H
         socioCAP = dati[i][19] || "00000";                 // Colonna I
         socioIndirizzo = dati[i][6] || "Indirizzo Sconosciuto"; // Colonna J
         break;
      }
    }
    
    if(!socioCF) return { errore: "ERRORE: Socio non trovato nel database principale." };

    codiceDestinatario = "0000000"; // Sempre 7 zeri per i privati
    nomeArchivio = socioNome + " " + socioCognome;
    identificativoArchivio = socioCF;
    
    // Assembliamo l'indirizzo bello per il PDF
    indCompleto = socioIndirizzo + " - " + socioCAP + " " + socioComune + " (" + socioProv + ")";
    
    // Compiliamo il blocco XML del cliente con i dati veri!
    xmlCessionario = `
    <CessionarioCommittente>
      <DatiAnagrafici>
        <CodiceFiscale>${socioCF}</CodiceFiscale>
        <Anagrafica><Nome>${socioNome}</Nome><Cognome>${socioCognome}</Cognome></Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${socioIndirizzo}</Indirizzo>
        <CAP>${socioCAP.toString().padStart(5, '0')}</CAP>
        <Comune>${socioComune}</Comune>
        <Provincia>${socioProv}</Provincia>
        <Nazione>IT</Nazione>
      </Sede>
    </CessionarioCommittente>`;
  } 
  // --- CASO B: AZIENDA ESTERNA ---
  else {
    if(!datiInput.piva || !datiInput.ragioneSociale) return { errore: "ERRORE: Inserisci Ragione Sociale e P.IVA." };
    
    codiceDestinatario = datiInput.sdi ? datiInput.sdi.toUpperCase() : "0000000";
    nomeArchivio = datiInput.ragioneSociale;
    identificativoArchivio = datiInput.piva;
    indCompleto = datiInput.indirizzo + " - " + datiInput.cap + " " + datiInput.comune + " (" + datiInput.prov.toUpperCase() + ")";
    
    xmlCessionario = `
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${datiInput.piva.replace(/\s/g, "")}</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>${datiInput.ragioneSociale}</Denominazione></Anagrafica>
      </DatiAnagrafici>
      <Sede><Indirizzo>${datiInput.indirizzo}</Indirizzo><CAP>${datiInput.cap}</CAP><Comune>${datiInput.comune}</Comune><Provincia>${datiInput.prov.toUpperCase()}</Provincia><Nazione>IT</Nazione></Sede>
    </CessionarioCommittente>`;
  }

  var dataOdierna = new Date();
  var oggiFormatoXML = Utilities.formatDate(dataOdierna, "Europe/Rome", "yyyy-MM-dd");
  var oggiFormatoPDF = Utilities.formatDate(dataOdierna, "Europe/Rome", "dd/MM/yyyy");
  
  var importoFmt = Number(datiInput.importo).toFixed(2); 
  var progInvio = datiInput.numero.replace(/\D/g, ""); 
  var nomeFileBase = "IT" + ass_piva + "_" + progInvio.padStart(5, '0');

  // ==========================================
  // 1. COSTRUZIONE STRINGA XML
  // ==========================================
  var xmlString = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <FatturaElettronicaHeader>
    <DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${ass_piva}</IdCodice></IdTrasmittente><ProgressivoInvio>${progInvio}</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione><CodiceDestinatario>${codiceDestinatario}</CodiceDestinatario></DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${ass_piva}</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>${ass_denominazione}</Denominazione></Anagrafica><RegimeFiscale>${ass_regime}</RegimeFiscale></DatiAnagrafici>
      <Sede><Indirizzo>${ass_indirizzo}</Indirizzo><CAP>${ass_cap}</CAP><Comune>${ass_comune}</Comune><Provincia>${ass_provincia}</Provincia><Nazione>IT</Nazione></Sede>
    </CedentePrestatore>
    ${xmlCessionario}
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Divisa>EUR</Divisa><Data>${oggiFormatoXML}</Data><Numero>${datiInput.numero}</Numero></DatiGeneraliDocumento></DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>${datiInput.causale}</Descrizione><PrezzoUnitario>${importoFmt}</PrezzoUnitario><PrezzoTotale>${importoFmt}</PrezzoTotale><AliquotaIVA>0.00</AliquotaIVA><Natura>N4</Natura></DettaglioLinee>
      <DatiRiepilogo><AliquotaIVA>0.00</AliquotaIVA><Natura>N4</Natura><ImponibileImporto>${importoFmt}</ImponibileImporto><Imposta>0.00</Imposta></DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;

  // ==========================================
  // 2. COSTRUZIONE TEMPLATE HTML PER IL PDF
  // ==========================================
  var htmlFattura = `
  <html>
    <head>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.4; padding: 20px; }
        .header { text-align: center; border-bottom: 3px solid #10b981; padding-bottom: 15px; margin-bottom: 30px; }
        .dati-societa { font-size: 13px; color: #64748b; }
        .box-cliente { border: 1px solid #cbd5e1; padding: 20px; width: 45%; float: right; margin-bottom: 40px; border-radius: 8px; background-color: #f8fafc; }
        .titolo-fattura { font-size: 26px; font-weight: bold; margin-top: 60px; clear: both; color: #0f172a; }
        table { width: 100%; border-collapse: collapse; margin-top: 30px; }
        th { background-color: #10b981; color: white; padding: 12px; text-align: left; font-size: 14px; }
        td { border-bottom: 1px solid #e2e8f0; padding: 12px; font-size: 14px; }
        .totale-box { float: right; margin-top: 30px; border: 2px solid #0f172a; padding: 15px; border-radius: 8px; width: 300px; }
        .totale-row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 8px; }
        .totale-big { font-weight: bold; font-size: 20px; border-top: 1px solid #ccc; padding-top: 10px; margin-top: 10px; }
        .note { clear: both; margin-top: 100px; font-size: 11px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 15px; text-align: justify; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 style="margin:0; color:#0f172a;">${ass_denominazione}</h1>
        <div class="dati-societa">
          ${ass_indirizzo} - ${ass_cap} ${ass_comune} (${ass_provincia})<br>
          P.IVA/C.F.: ${ass_piva}
        </div>
      </div>
      
      <div class="box-cliente">
        <strong style="color:#0f172a; font-size:16px;">Spett.le</strong><br><br>
        <span style="font-size:15px; font-weight:bold;">${nomeArchivio}</span><br>
        ${indCompleto}<br>
        C.F. / P.IVA: ${identificativoArchivio}
      </div>
      
      <div class="titolo-fattura">FATTURA DI CORTESIA</div>
      <div style="font-size:14px;">
        <strong>Documento N°:</strong> ${datiInput.numero}<br>
        <strong>Data di emissione:</strong> ${oggiFormatoPDF}
      </div>
      
      <table>
        <tr>
          <th>Descrizione / Causale</th>
          <th style="text-align:right;">Importo</th>
        </tr>
        <tr>
          <td>${datiInput.causale}</td>
          <td style="text-align:right;">€ ${importoFmt}</td>
        </tr>
      </table>
      
      <div class="totale-box">
        <div class="totale-row"><span>Imponibile:</span> <span>€ ${importoFmt}</span></div>
        <div class="totale-row"><span>IVA:</span> <span>€ 0.00</span></div>
        <div class="totale-row totale-big"><span>TOTALE DA PAGARE:</span> <span>€ ${importoFmt}</span></div>
      </div>
      
      <div class="note">
        Il presente documento costituisce copia di cortesia della fattura elettronica trasmessa al Sistema di Interscambio (SdI).<br>
        In caso di regime forfettario o agevolato, l'operazione è effettuata ai sensi della normativa vigente.
      </div>
    </body>
  </html>`;

  // ==========================================
  // 3. SALVATAGGIO IN DRIVE E NEL FOGLIO STORICO
  // ==========================================
  var urlXmlDrive = "";
  var urlPdfDrive = "";
  var blobPdf = null;
  
  try {
    var cartella = DriveApp.getFolderById(idCartellaDrive);
    
    // Crea file XML in Drive
    var blobXML = Utilities.newBlob(xmlString, "text/xml", nomeFileBase + ".xml");
    urlXmlDrive = cartella.createFile(blobXML).getUrl();
    
    // Crea file PDF in Drive
    blobPdf = Utilities.newBlob(htmlFattura, MimeType.HTML).getAs(MimeType.PDF);
    blobPdf.setName("Fattura_" + progInvio + "_Cortesia.pdf");
    urlPdfDrive = cartella.createFile(blobPdf).getUrl();
    
    // Registra riga nel Foglio Excel
    var ssArchivio = SpreadsheetApp.openById(idArchivioEsterno);
    var foglioEmesse = ssArchivio.getSheetByName("Fatture Emesse");
    var timestamp = Utilities.formatDate(dataOdierna, "Europe/Rome", "dd/MM/yyyy HH:mm:ss");
    var tipoClienteLeggibile = datiInput.tipoCliente === "socio" ? "Privato/Socio" : "Azienda/Esterno";
    
    var formulaLinkXml = '=HYPERLINK("' + urlXmlDrive + '"; "🔗 Apri XML")';
    var formulaLinkPdf = '=HYPERLINK("' + urlPdfDrive + '"; "📄 Apri PDF")';

    // --- NUOVO: SALVA FORNITORE/CLIENTE SE NON ESISTE ---
    if(datiInput.tipoCliente === "esterno") {
      var foglioFornitori = ssArchivio.getSheetByName("Fornitori");
      if(foglioFornitori) {
        var piveEsistenti = foglioFornitori.getRange("B:B").getValues().flat();
        var pivaDaCercare = datiInput.piva.toString().trim().toUpperCase();
        var esisteGia = piveEsistenti.some(p => p.toString().trim().toUpperCase() === pivaDaCercare);
        
        if(!esisteGia) {
          foglioFornitori.appendRow([
            datiInput.ragioneSociale, // A
            datiInput.piva,           // B
            datiInput.sdi || "0000000",// C
            datiInput.indirizzo,      // D
            datiInput.cap,            // E
            datiInput.comune,         // F
            datiInput.prov.toUpperCase() // G
          ]);
        }
      }
    }
    
    foglioEmesse.appendRow([
      timestamp, datiInput.numero, nomeArchivio, identificativoArchivio, tipoClienteLeggibile, 
      datiInput.causale, importoFmt, datiInput.email || "-", codiceDestinatario, 
      formulaLinkXml, formulaLinkPdf // Colonna J e Colonna K
    ]);
  } catch(e) {
    console.log("Errore Drive/Fogli: " + e);
    // Se fallisce Drive (es cartella inesistente), il PDF generato esisterà comunque in memoria per il download!
  }

  // Se per qualche motivo il PDF non si è creato su Drive, forziamo la creazione per il download
  if(!blobPdf) {
    blobPdf = Utilities.newBlob(htmlFattura, MimeType.HTML).getAs(MimeType.PDF);
  }

  // Restituiamo ENTRAMBI i file convertiti in Base64 (stringa) al browser
  return {
    errore: null,
    xmlBase64: "data:text/xml;base64," + Utilities.base64Encode(xmlString),
    pdfBase64: "data:application/pdf;base64," + Utilities.base64Encode(blobPdf.getBytes())
  };
}

function getListaFornitori() {
  var idArchivioEsterno = "1zYVYOg8nlASjbzIKIHtVbaoEhK5949ctqQemVENfSow"; 
  try {
    var ss = SpreadsheetApp.openById(idArchivioEsterno);
    var foglio = ss.getSheetByName("Fornitori");
    if(!foglio) return [];
    
    var dati = foglio.getDataRange().getValues();
    var lista = [];
    
    // Partiamo dalla riga 1 (saltando le intestazioni)
    for(var i=1; i<dati.length; i++) {
      lista.push({
        ragioneSociale: dati[i][0], // Colonna A
        piva: dati[i][1],           // Colonna B
        sdi: dati[i][2],            // Colonna C
        indirizzo: dati[i][3],      // Colonna D
        cap: dati[i][4],            // Colonna E
        comune: dati[i][5],         // Colonna F
        prov: dati[i][6]            // Colonna G
      });
    }
    return lista;
  } catch(e) {
    return [];
  }
}

function salvaFatturaRicevuta(dati) {
  var idArchivioEsterno = "1zYVYOg8nlASjbzIKIHtVbaoEhK5949ctqQemVENfSow";
  var idCartellaDrive = "1ihhLr1RkEpU4bmZSQZiGMgMgX-BLqaR7"; 
  
  try {
    var ssArchivio = SpreadsheetApp.openById(idArchivioEsterno);
    var foglioRicevute = ssArchivio.getSheetByName("Fatture Ricevute");
    
    var formulaLinkAllegato = "-";
    
    // 1. Se c'è un file allegato (es. scontrino in PDF o JPG), lo salva su Drive
    if(dati.fileBase64) {
        var cartella = DriveApp.getFolderById(idCartellaDrive);
        var blob = Utilities.newBlob(Utilities.base64Decode(dati.fileBase64), dati.mimeType, "Spesa_" + dati.fornitore.replace(/[^a-zA-Z0-9]/g,"_") + "_" + dati.fileName);
        var fileCreato = cartella.createFile(blob);
        formulaLinkAllegato = '=HYPERLINK("' + fileCreato.getUrl() + '"; "📎 Apri Scontrino")';
    }

    // 2. Registra la riga in Excel
    var timestamp = Utilities.formatDate(new Date(), "Europe/Rome", "dd/MM/yyyy HH:mm:ss");
    var importoFmt = Number(dati.importo).toFixed(2);
    
    // Ordine colonne suggerito: Timestamp | Data Doc | N. Fattura | Fornitore | Causale | Importo | Link Allegato
    foglioRicevute.appendRow([
      timestamp,
      dati.data,
      dati.numero,
      dati.fornitore,
      dati.causale,
      importoFmt,
      formulaLinkAllegato
    ]);

    // 3. (OPZIONALE MA GENIALE) Se il fornitore non esiste nel database, lo aggiunge al volo!
    var foglioFornitori = ssArchivio.getSheetByName("Fornitori");
    if(foglioFornitori) {
        var fornitoriEsistenti = foglioFornitori.getRange("A:A").getValues().flat();
        var esiste = fornitoriEsistenti.some(function(f) { 
           return f.toString().trim().toLowerCase() === dati.fornitore.trim().toLowerCase(); 
        });
        
        if(!esiste) {
            // Aggiunge solo la Ragione Sociale in Colonna A, il resto potrai compilarlo dopo se serve
            foglioFornitori.appendRow([dati.fornitore, "", "", "", "", "", ""]);
        }
    }
    
    return "OK";
  } catch(e) {
    return "Errore salvataggio: " + e.toString();
  }
}

function arrotondaIT(valore) {
  return Number(Math.round(valore + 'e2') + 'e-2');
}

function formattaValutaIT(valore) {
  return arrotondaIT(valore).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function salvaReportArchivio(nomeFile, datiJsonStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nomeFoglio = "Report_Storici";
  var foglio = ss.getSheetByName(nomeFoglio);
  
  // Se il foglio non esiste, lo crea e mette le intestazioni
  if (!foglio) {
    foglio = ss.insertSheet(nomeFoglio);
    foglio.appendRow(["Timestamp", "Nome Report", "Dati JSON"]);
    foglio.getRange("A1:C1").setFontWeight("bold").setBackground("#f8fafc");
  }
  
  // Salva i dati
  foglio.appendRow([new Date(), nomeFile, datiJsonStr]);
  return "Salvato con successo";
}

function getReportStorici() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglio = ss.getSheetByName("Report_Storici");
  
  // Se il foglio non esiste o è vuoto, restituisce un array vuoto
  if (!foglio || foglio.getLastRow() < 2) {
    return [];
  }
  
  var dati = foglio.getDataRange().getValues();
  var reports = [];
  
  // Salta la riga 0 (le intestazioni) e legge il resto
  for (var i = 1; i < dati.length; i++) {
    reports.push({
      dataSalvataggio: Utilities.formatDate(new Date(dati[i][0]), "GMT+1", "dd/MM/yyyy HH:mm"),
      nome: dati[i][1],
      jsonDati: dati[i][2] // Il pacchetto JSON completo
    });
  }
  
  // Invertiamo l'array per avere i report più recenti in alto
  return reports.reverse();
}

function eliminaReportArchivio(nomeReport) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglio = ss.getSheetByName("Report_Storici");
  
  if (!foglio) return "Foglio non trovato";
  
  var dati = foglio.getDataRange().getValues();
  
  // Cerchiamo dal fondo verso l'inizio e cancelliamo la riga corrispondente
  for (var i = dati.length - 1; i >= 1; i--) {
    if (dati[i][1] === nomeReport) {
      foglio.deleteRow(i + 1); // +1 perché le righe del foglio partono da 1, non da 0
      return "Eliminato";
    }
  }
  return "Report non trovato";
}

function getPianoDeiConti() {
  return {
    "Liquidità": ["Cassa Contanti", "Banca", "PayPal/Satispay", "Carta Prepagata"],
    "Entrate (Avere)": ["Quote Associative (Ist)", "Erogazioni Liberali (Ist)", "Raccolta Fondi (Ist)", "Vendita Beni/Servizi (Comm)", "Sponsorizzazioni (Comm)", "Contributi Pubblici"],
    "Uscite (Dare)": ["Affitto Sede", "Utenze", "Cancelleria", "Attrezzature", "Rimborsi Spese", "Spese Bancarie", "Consulenze", "Prestazioni Occasionali", "Acquisto Merci"],
    "Passività/Transitori": ["Debiti v/Fornitori", "Anticipi Soci", "Fondo Cassa"]
  };
}

function getGruppiSpese() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglio = ss.getSheetByName("GruppiSpese");
  // Se il foglio non esiste, restituisce un gruppo di default
  if (!foglio) return ["Generale"]; 
  
  var dati = foglio.getDataRange().getValues();
  var gruppi = [];
  for (var i = 1; i < dati.length; i++) {
    if (dati[i][0]) gruppi.push(dati[i][0].toString().trim());
  }
  return gruppi.length > 0 ? gruppi : ["Generale"];
}

function registraMovimentoCompostoServer(obj) {
  var ss = SpreadsheetApp.openById(ID_FOGLIO_CONTABILITA);
  
  // 1. Registrazione nel foglio "bilancio" (come prima)
  var sheetBilancio = ss.getSheetByName("bilancio");
  obj.righe.forEach(function(r) {
    sheetBilancio.appendRow([
      obj.data,
      obj.desc,
      r.sezione === 'DARE' ? r.conto : '',  
      r.sezione === 'AVERE' ? r.conto : '', 
      r.importo,                             
      obj.controparte,
      obj.piva,
      obj.tipoAtt,
      obj.doc,
      "Registrato via web"
    ]);
  });
  
  // 2. Controllo e inserimento automatico in Anagrafica (Fornitori / Clienti)
  if (obj.controparte && obj.controparte.trim() !== "") {
    var nomeControparte = obj.controparte.trim();
    
    // Decidiamo se è un fornitore o un cliente in base al tipo attività o ai conti toccati
    // (Di default, se c'è una spesa/costo o fattura ricevuta, lo salviamo in "fornitori", altrimenti "clienti")
    var nomeTabAnagrafica = "fornitori"; // Tab di default visibile nel tuo screenshot
    
    // Se nel form distingui tra clienti e fornitori, puoi impostare la variabile dinamicamente.
    // Qui controlliamo il tab "fornitori" (Colonna A = Nome Fornitore, Colonna B = Partita IVA)
    var sheetAnagrafica = ss.getSheetByName(nomeTabAnagrafica);
    
    if (sheetAnagrafica) {
      var datiAnagrafica = sheetAnagrafica.getDataRange().getValues();
      var esisteGia = false;
      
      // Controlla se la controparte esiste già (partendo dalla riga 1 per saltare l'intestazione)
      for (var i = 1; i < datiAnagrafica.length; i++) {
        var nomeEsistente = datiAnagrafica[i][0] ? datiAnagrafica[i][0].toString().trim().toLowerCase() : "";
        if (nomeEsistente === nomeControparte.toLowerCase()) {
          esisteGia = true;
          break;
        }
      }
      
      // Se non è presente nel database, lo aggiunge in automatico in fondo al tab
      if (!esisteGia) {
        sheetAnagrafica.appendRow([
          obj.controparte,     // Colonna A: Fornitore / Cliente
          obj.piva || "",      // Colonna B: Partita IVA
          "",                  // Colonna C: Codice SDI
          "",                  // Colonna D: Indirizzo
          "",                  // Colonna E: CAP
          "",                  // Colonna F: Comune
          ""                   // Colonna G: Provincia
        ]);
      }
    }
  }
  
  return "OK";
}
