/**
 * Crea un evento su Google Calendar con link Meet e allegato.
 * 
 * @param {String} titoloGrezzo - Il titolo dell'evento (es. "ASSEMBLEA DEI SOCI")
 * @param {Date} dataInizio - Oggetto Date per l'inizio dell'evento
 * @param {Date} dataFine - Oggetto Date per la fine dell'evento
 * @param {String} ordineDelGiorno - Testo da inserire nella descrizione
 * @param {String} idFileConvocazione - L'ID del file Drive (PDF) della convocazione
 * @param {String} calendarId - L'ID del calendario (default: 'primary')
 */

function creaEventoAssembleaConMeet(titoloGrezzo, dataInizio, dataFine, ordineDelGiorno, idFileConvocazione, invitati) {
  // Formatta il titolo: Solo la prima lettera maiuscola, il resto minuscolo
  var titoloFormattato = titoloGrezzo.charAt(0).toUpperCase() + titoloGrezzo.slice(1).toLowerCase();
  
  var file = DriveApp.getFileById(idFileConvocazione);
  var fileUrl = file.getUrl(); 
  
  // Prepara la lista degli invitati per il Calendario
  var attendees = [];
  if (invitati && invitati.length > 0) {
    for (var i = 0; i < invitati.length; i++) {
      attendees.push({ email: invitati[i] });
    }
  }

  // Descrizione strutturata con note su registrazione e lingua italiana
  var descrizioneEvento = "<strong>Ordine del Giorno:</strong><br>" + ordineDelGiorno.replace(/\n/g, '<br>') + 
                          "<br><br><hr><em>Nota informativa: La videoconferenza si terrà in lingua italiana e verrà registrata ai fini della verbalizzazione ufficiale, nel rispetto delle normative sulla privacy dell'Associazione.</em>";

  var event = {
    summary: titoloFormattato,
    description: descrizioneEvento,
    start: { dateTime: dataInizio.toISOString() },
    end: { dateTime: dataFine.toISOString() },
    attendees: attendees,
    guestsCanSeeOtherGuests: false, // Massima privacy tra i soci
    conferenceData: {
      createRequest: {
        requestId: Utilities.getUuid(),
        conferenceSolutionKey: { type: "hangoutsMeet" }
      }
    },
    attachments: [{
      fileUrl: fileUrl,
      title: file.getName(),
      iconLink: "https://drive-thirdparty.googleusercontent.com/16/type/application/pdf"
    }]
  };
  
  try {
    var eventoCreato = Calendar.Events.insert(event, 'primary', {
      conferenceDataVersion: 1,
      supportsAttachments: true,
      sendUpdates: "all" 
    });
    return eventoCreato;
  } catch (e) {
    console.log("Errore creazione evento Calendar: " + e.toString());
    return null;
  }
}
