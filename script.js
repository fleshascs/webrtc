const send = document.querySelector('.send');
const sendPhoto = document.querySelector('.sendPhoto');
const textInput = document.querySelector('.textInput');
const imageContainer = document.querySelector('.imageContainer');

// Generate random room name if needed
if (!location.hash) {
  location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
}
const roomHash = location.hash.substring(1);

// TODO: Replace with your own channel ID
const drone = new ScaleDrone('UQwqaX4xAcgZKPcb');
// Room name needs to be prefixed with 'observable-'
const roomName = 'observable-' + roomHash;
const configuration = {
  iceServers: [{
    urls: 'stun:stun.l.google.com:19302'
  }]
};
let room;
let pc;


function onSuccess() {
console.log('Success - Add the new ICE candidate to our connections remote description');

};
function onError(error) {
  console.error(error);
};

drone.on('open', error => {
  console.log('drone opened');
  if (error) {
    return console.error(error);
  }
  room = drone.subscribe(roomName);
  room.on('open', error => {
    console.log('room opened');

    send.addEventListener('click', () => {
      sendMessage({type: 'chat', message: textInput.value });
    });

    sendPhoto.addEventListener('click', () => {
      sendMessage({type: 'image', image: getBase64Image() });
    }); 

    if (error) {
      onError(error);
    }
  });

  room.on('message', message => {
    const {data, id, timestamp, clientId, member} = message;
    switch(data.type) {
      case 'chat':
        if (clientId !== drone.clientId) {
          alert('message: '+data.message);
        }
        console.log('message: ', data.message);
        break;
      case 'image':
        console.log('image: ', data);
        addImage(data.image);
        break;
      default:
        console.log('unhandled message: ', data);
    }
  });


  // We're connected to the room and received an array of 'members'
  // connected to the room (including us). Signaling server is ready.
  room.on('members', members => {
    console.log('MEMBERS', members);
    // If we are the second user to connect to the room we will be creating the offer
    const isOfferer = members.length === 2;
    startWebRTC(isOfferer);
  });
});

// Send signaling data via Scaledrone
function sendMessage(message) {
  drone.publish({
    room: roomName,
    message
  });
}

function startWebRTC(isOfferer) {
  pc = new RTCPeerConnection(configuration);

  // 'onicecandidate' notifies us whenever an ICE agent needs to deliver a
  // message to the other peer through the signaling server
  pc.onicecandidate = event => {
    if (event.candidate) {
      console.log(' pc.onicecandidate');
      sendMessage({'candidate': event.candidate});
    }
  };

  // If user is offerer let the 'negotiationneeded' event create the offer
  if (isOfferer) {
    pc.onnegotiationneeded = () => {
      console.log('CREATE OFFER');
      pc.createOffer().then(localDescCreated).catch(onError);
    }
  }

  // When a remote stream arrives display it in the #remoteVideo element
  pc.ontrack = event => {
    console.log('REMOTE STREAM ARIVED');
    const stream = event.streams[0];
    if (!remoteVideo.srcObject || remoteVideo.srcObject.id !== stream.id) {
      remoteVideo.srcObject = stream;
    }
  };

  navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true,
  }).then(stream => {
    // Display your local video in #localVideo element
    localVideo.srcObject = stream;
    // Add your stream to be sent to the conneting peer
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
  }, onError);

  // Listen to signaling data from Scaledrone
  room.on('data', (message, client) => {
    console.log('room ondata', message);
    // Message was sent by us
    if (client.id === drone.clientId) {
      return;
    }

    if (message.sdp) {
      // This is called after receiving an offer or answer from another peer
      pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
        // When receiving an offer lets answer it
        if (pc.remoteDescription.type === 'offer') {
          pc.createAnswer().then(localDescCreated).catch(onError);
        }
      }, onError);
    } else if (message.candidate) {
      // Add the new ICE candidate to our connections remote description
      pc.addIceCandidate(
        new RTCIceCandidate(message.candidate), onSuccess, onError
      );
    }
  });
}

function localDescCreated(desc) {
  pc.setLocalDescription(
    desc,
    () => sendMessage({'sdp': pc.localDescription}),
    onError
  );
}


function addImage(source) {
  const  container = document.createElement('span');
  container.innerHTML = `<img src="${source}" />`;
  imageContainer.appendChild(container);
}

function getBase64Image() {
	var w = localVideo.videoWidth;
	var h = localVideo.videoHeight;
	var canvas = document.createElement('canvas');
	canvas.width  = w;
	canvas.height = h;
	var ctx = canvas.getContext('2d');
  ctx.drawImage(localVideo, 0, 0, w, h);
  return canvas.toDataURL();
} 