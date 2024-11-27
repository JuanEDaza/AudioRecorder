//webkitURL is deprecated but nevertheless
URL = window.URL || window.webkitURL;

var gumStream; 				//stream from getUserMedia()
var recorder; 				//WebAudioRecorder object
var input; 						//MediaStreamAudioSourceNode  we'll be recording
var encodingType; 		//holds selected encoding for resulting audio (file)
var encodeAfterRecord = true; 	// when to encode
var dynamicBlob;
let timer;
let seconds = 0;

// shim for AudioContext when it's not avb. 
var AudioContext = window.AudioContext || window.webkitAudioContext;
var audioContext; //new audio context to help us record

var encodingTypeSelect = document.getElementById("encodingTypeSelect");
var recordButton = document.getElementById("recordButton");
var stopButton = document.getElementById("stopButton");
var sendButton = document.getElementById("sendButton");
const timerDisplay = document.getElementById("timer");
const loading = document.getElementById("loading");

//add events to those 3 buttons
recordButton.addEventListener("click", startRecording);
stopButton.addEventListener("click", stopRecording);
sendButton.addEventListener('click', sendMessage);

function startRecording() {
	console.log("startRecording() called");
	var constraints = { audio: true, video: false }
	navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
		audioContext = new AudioContext();
		//assign to gumStream for later use
		gumStream = stream;
		/* use the stream */
		input = audioContext.createMediaStreamSource(stream);

		//get the encoding 
		encodingType = encodingTypeSelect.options[encodingTypeSelect.selectedIndex].value; // SE PUEDE MODIFICAR Y SIMPLEMENTE PONER mp3
		//disable the encoding selector
		encodingTypeSelect.disabled = true; // SE PUEDE BORRAR, INNECESARIO

		recorder = new WebAudioRecorder(input, {
			workerDir: "js/", // must end with slash
			encoding: encodingType,
			numChannels: 2, //2 is the default, mp3 encoding supports only 2
		});
		recorder.onComplete = function (recorder, blob) {
			createDownloadLink(blob, recorder.encoding);
			console.warn(blob);
			dynamicBlob = blob;
		}
		recorder.setOptions({
			timeLimit: 120,
			encodeAfterRecord: encodeAfterRecord,
			ogg: { quality: 0.5 },
			mp3: { bitRate: 160 }
		});
		//start the recording process
		recorder.startRecording();
		startTimer();
		startWaveVisualization();

	}).catch(function (err) {
		//enable the record button if getUSerMedia() fails
		recordButton.style.display = "block";
		stopButton.style.display = "none";
		sendButton.style.display = "none";
		console.log('Error:', err);
	});

	//Hide the buttons
	recordButton.style.display = "none";
	stopButton.style.display = "block";
	recordingsList.innerHTML = "";
	sendButton.style.display = "none";
	waveCanvas.style.display = "block";
}

function stopRecording() {
	console.log("stopRecording() called");

	//stop microphone access
	gumStream.getAudioTracks()[0].stop();

	//Hide the buttons
	stopButton.style.display = "none";

	//tell the recorder to finish the recording (stop recording + encode the recorded audio)
	recorder.finishRecording();
	stopTimer();
	loading.style.display = "block";
	waveCanvas.style.display = "none";
}

// Función modificada para evitar crear una lista y reemplazar el elemento existente
function createDownloadLink(blob, encoding) {
	var url = URL.createObjectURL(blob);
	var existingAudio = recordingsList.querySelector('audio');
	/* var existingLink = recordingsList.querySelector('a'); */

	if (!existingAudio || !existingLink) {
		// Si no existen, crea los elementos
		var au = document.createElement('audio');
		/* var link = document.createElement('a'); */

		// Configura el <audio> y el enlace
		au.controls = true;
		au.src = url;

		/* link.href = url;
		link.download = new Date().toISOString() + '.' + encoding;
		link.innerHTML = link.download; */

		// Agrega los elementos al contenedor
		recordingsList.innerHTML = ""; // Limpia cualquier contenido previo
		recordingsList.appendChild(au);
		recordButton.style.display = "block";
		loading.style.display = "none";
		sendButton.style.display = "block";
		/* recordingsList.appendChild(link); */
	} else {
		// Si ya existen, actualiza sus propiedades
		existingAudio.src = url;
		recordButton.style.display = "block";
		loading.style.display = "none";
		sendButton.style.display = "block";
		/* existingLink.href = url;
		existingLink.download = new Date().toISOString() + '.' + encoding;
		existingLink.innerHTML = existingLink.download; */
	}
}


function startTimer() {
	timer = setInterval(() => {
		seconds++;
		const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
		const secs = (seconds % 60).toString().padStart(2, '0');
		timerDisplay.textContent = `${minutes}:${secs}`;
	}, 1000);
}

function stopTimer() {
	clearInterval(timer);
	seconds = 0;
	timerDisplay.textContent = '00:00';
}


// Función asíncrona que envía el mensaje a Genesys
async function sendMessage() {
	try {
		sendAudio(conversationCache, token, dynamicBlob); // Envía el mensaje mediante las API de Genesys
		console.log('Audio enviado exitosamente a la API y descargado');
	} catch (error) {
		console.error('Error:', error);
		alert('Error:', error);
	}
}

// Función que utiliza las API para contruir el archivo
function sendAudio(conversationId, token, blob) {
	let apiInstance = new platformClient.ConversationsApi();

	// Get conversation
	apiInstance.getConversation(conversationId)
		.then((conversationList) => {
			console.info(`getConversation success!`);
			// Call the function and get the communicationId
			let communicationId = searchCommunicationId(conversationList);
			console.log('CommunicationId identificado: ' + communicationId);

			// Create media
			apiInstance.postConversationsMessageCommunicationMessagesMedia(conversationId, communicationId)
				.then((media) => {
					console.info(`Conversation message send successfully`);
					// Upload media
					let uploadUrl = media.uploadUrl;
					console.info('URL del media: ' + uploadUrl) // Se puede eliminar
					console.log('Token: ' + token)
					console.log('Record blob: ' + blob);
					uploadAttachment(uploadUrl, token, dynamicBlob);

					const body = { "mediaIds": [media.id] }
					const opts = { "useNormalizedMessage": false };

					//Pausa 1 seg
					setTimeout(() => {
						// Send message
						apiInstance.postConversationsMessageCommunicationMessages(conversationId, communicationId, body, opts)
							.then((data) => {
								console.log(`postConversationsMessageCommunicationMessages success!`);
							})
							.catch((err) => {
								console.log("There was a failure calling postConversationsMessageCommunicationMessages");
								console.error(err);
							});
					}, 1000);
				})
				.catch((error) => {
					console.error(`Conversation message was not send successfully`);
					console.error(error.message);
				});
		})
		.catch((error) => {
			console.error("There was a failure calling getConversation");
			console.error(error.message);
		});

} // FIN sendAudio

// Función que busca el CommunicationId teniendo en cuenta la lista de conversaciones
function searchCommunicationId(conversationList) {
	let variable = "";
	conversationList.participants.forEach(participant => {
		if (participant.purpose === "agent") {
			participant.messages.forEach(message => {
				variable = message.id;
			});
		}
	});
	return variable;
}

function uploadAttachment(uploadUrl, authToken, blob) {
	var form = new FormData();
	form.append('file', blob, 'record.mp3');

	$.ajax({
		url: uploadUrl,
		method: 'POST',
		headers: {
			Authorization: 'bearer ' + authToken
		},
		processData: false,
		contentType: false,
		mimeType: 'multipart/form-data',
		data: form
	});
}


/*----------------- ↓ CONFIGURACIÓN DE LAS WAVES DE AUDIO ↓ -----------------*/

const waveCanvas = document.getElementById('waveCanvas');
const waveCtx = waveCanvas.getContext('2d');

// Configurar el tamaño del canvas
waveCanvas.width = document.body.clientWidth;
waveCanvas.height = 100;

// Configuración del AnalyserNode
let analyser;
let dataArray;

// Inicia la visualización de las ondas
function startWaveVisualization() {
	if (!audioContext || !gumStream) {
		console.error("AudioContext o stream no disponibles");
		return;
	}

	// Configurar el nodo analizador
	analyser = audioContext.createAnalyser();
	analyser.fftSize = 2048;
	const bufferLength = analyser.frequencyBinCount;
	dataArray = new Uint8Array(bufferLength);

	// Conectar el micrófono al analizador
	const input = audioContext.createMediaStreamSource(gumStream);
	input.connect(analyser);

	// Iniciar animación
	drawWave();
}

function drawWave() {
	// Limpiar el canvas
	waveCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);

	// Obtener los datos del analizador
	analyser.getByteTimeDomainData(dataArray);

	// Dibujar la onda
	waveCtx.lineWidth = 2;
	waveCtx.strokeStyle = "rgb(0, 123, 255)";
	waveCtx.beginPath();

	const sliceWidth = waveCanvas.width / dataArray.length;
	let x = 0;

	for (let i = 0; i < dataArray.length; i++) {
		const v = dataArray[i] / 128.0;
		const y = (v * waveCanvas.height) / 2;

		if (i === 0) {
			waveCtx.moveTo(x, y);
		} else {
			waveCtx.lineTo(x, y);
		}

		x += sliceWidth;
	}

	waveCtx.lineTo(waveCanvas.width, waveCanvas.height / 2);
	waveCtx.stroke();

	// Continuar la animación
	requestAnimationFrame(drawWave);
}

// Inicia la visualización al comenzar la grabación
/* recordButton.addEventListener("click", startWaveVisualization); */

// Ajustar tamaño del canvas al redimensionar la ventana
window.addEventListener("resize", () => {
	waveCanvas.width = document.body.clientWidth;
	waveCanvas.height = 100;
});

/*----------------- ↑ CONFIGURACIÓN DE LAS WAVES DE AUDIO ↑ -----------------*/