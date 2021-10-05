const myFace = document.getElementById("my-face");
const btnMute = document.getElementById("my-face__mute");
const btnToggleCamera = document.getElementById("my-face__toggle-camera")
const selectCamera = document.getElementById("my-face__select-camera");
const roomConnectContainer = document.getElementById("room-container");
const roomForm = document.getElementById("room-container__form");
const callContainer = document.getElementById("call-container");
const myNick = document.getElementById("my-nick");
const yourNick = document.getElementById("your-nick");
const yourFace = document.getElementById("your-face");

let isMute = false;
let prevVolume = 0.1;
let isCameraOff = false;

// for socket io vars
let roomName = "";
let nickname = "";

// for rtc vars
let myPeerConnection;


const socket = io();

let myStream = null;
let yourStream = null;

function startMedia() {
    roomConnectContainer.hidden = false;
    callContainer.hidden = true;
}

async function getMedia() {
    try {
        await setCameraSelect();
        /* 스트림 사용 */
        await updateStream();
        myFace.onloadedmetadata = function (e) {
            myFace.volume = prevVolume;
            myFace.play();
        }
    } catch (err) {
        alert(err);
    }
}


async function getCameras() {
    try {
        let infos = await navigator.mediaDevices.enumerateDevices();
        let cameras = infos.filter(device => device.kind === "videoinput");
        return cameras;
    } catch (e) {
        console.log(e);
    }
}

async function setCameraSelect() {
    try {
        let cameras = await getCameras();
        selectCamera.innerHTML = null;
        const option = document.createElement("option");
        option.innerText = cameras.length > 0 ? "Select Camera" : "No Camera available";
        option.disabled = true;
        selectCamera.append(option);
        if (cameras.length > 0) {
            cameras.forEach(
                (camera, index) => {
                    const option = document.createElement("option");
                    const currentCamera = myStream?.getVideoTracks()[0];
                    option.value = camera.deviceId;
                    option.label = camera.label;
                    if (currentCamera) {
                        option.selected = currentCamera?.label === camera.label;
                    } else {
                        option.selected = index === 0;
                    }
                    selectCamera.append(option);
                }
            )
        }
    } catch (e) {
        console.log(e);
    }
}

async function updateStream(deviceId) {
    if (deviceId) {
        myStream = await navigator.mediaDevices.getUserMedia(
            {
                audio: true,
                video: {
                    deviceId,
                    facingMode: "user"
                },
            }
        );
        myFace.srcObject = myStream;
    } else {
        const cameras = await getCameras();
        if (cameras.length > 0) {
            myStream = await navigator.mediaDevices.getUserMedia(
                {
                    audio: true,
                    video: {
                        deviceId: cameras[0].deviceId,
                        facingMode: "user"
                    },
                }
            );
            myFace.srcObject = myStream;
        }
    }
}

// socket response functions
async function onRoomCreated() {
    roomConnectContainer.hidden = true;
    callContainer.style.visibility = "visible";
    try {
        await getMedia();
        makeConnection();
    } catch (e) {
        console.log(e);
    }
}

// RTC code
function makeConnection() {
    myPeerConnection = new RTCPeerConnection({
        iceServers: [
            {
                urls: [
                    "stun:stun.l.google.com:19302",
                    "stun:stun1.l.google.com:19302",
                    "stun:stun2.l.google.com:19302",
                    "stun:stun3.l.google.com:19302",
                    "stun:stun4.l.google.com:19302",
                ]
            }
        ]
    });
    myPeerConnection.addEventListener("icecandidate", handlerIce);
    myPeerConnection.addEventListener("addstream", handlerAddStream);
    myStream?.getTracks().forEach(
        track => myPeerConnection.addTrack(track, myStream)
    );
}


// events & handlers
function onClickMute() {
    isMute = !isMute;
    myStream.getAudioTracks().forEach(track => track.enabled = !isMute);
    btnMute.innerText = isMute ? "Unmute" : "Mute";
}

function onClickToggleCamera() {
    let innerText = !isCameraOff ? "Turn camera on" : "Turn camera off";
    isCameraOff = !isCameraOff;
    myStream.getVideoTracks().forEach(track => track.enabled = !isCameraOff);
    btnToggleCamera.innerText = innerText;
}

async function onSubmitRoom(event) {
    event.preventDefault();
    const roomInput = roomConnectContainer.querySelector("input[name='room-name']");
    const nicknameInput = roomConnectContainer.querySelector("input[name='nickname']")
    if (roomInput) {
        roomName = roomInput.value;
        nickname = nicknameInput.value;
        await onRoomCreated();
        socket.emit("enter_room", roomName, nickname);
    }
}

function handlerIce(data) {
    socket.emit("ice", data.candidate, roomName);
}

function handlerAddStream(data) {
    console.log(data);
    yourStream = data.stream;
    yourFace.srcObject = yourStream;
}

window.addEventListener("load", async function (event) {
    try {
        startMedia();
        //await getMedia();
    } catch (e) {
        console.log(e);
    }
});
btnMute.addEventListener("click", onClickMute);
btnToggleCamera.addEventListener("click", onClickToggleCamera);
navigator.mediaDevices.addEventListener("devicechange", async () => {
    await setCameraSelect();
    await updateStream();
})
selectCamera.addEventListener("change", async function (event) {
    await updateStream(event.target.value);
    if (myPeerConnection) {
        const sender =
            myPeerConnection.getSenders().find(sender => sender.track.kind === "video");
        const videoTrack = myStream.getVideoTracks()[0];
        await sender.replaceTrack(videoTrack);
    }
})

roomForm.addEventListener("submit", onSubmitRoom);

// socket event handlers
socket.on("joined", async function () {
    try {
        const offer = await myPeerConnection.createOffer();
        await myPeerConnection.setLocalDescription(offer);
        console.log("I send the offer");
        socket.emit("offer", offer, roomName);
    } catch (e) {
        console.log(e);
    }
});

socket.on("offer_send", async function (offer) {
    try {
        console.log("I receive the offer");
        await myPeerConnection.setRemoteDescription(offer);
        const answer = await myPeerConnection.createAnswer();
        await myPeerConnection.setLocalDescription(answer);
        socket.emit("answer", answer, roomName);
    } catch (e) {
        console.log(e);
    }
});

socket.on("answer_send", async function (answer) {
    try {
        console.log("I got the answer");
        await myPeerConnection.setRemoteDescription(answer);
    } catch (e) {
        console.log(e);
    }
});

socket.on("ice_send", async function (candidate) {
    try {
        console.log("Got ice candidate")
        await myPeerConnection.addIceCandidate(candidate);
    } catch (e) {
        console.log(e);
    }
});