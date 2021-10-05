import http from "http";
import express from "express";
import SocketIO, {Socket} from "socket.io"

const app = express();

app.set("view engine", "pug");
app.set("views", process.cwd() + "/src/views");
app.use("/public", express.static(process.cwd() + "/public"));

app.get("/", (req, res) => res.render("home"));
app.get("/*", (req, res) => res.redirect("/"));

const httpServer = http.createServer(app);
const io = new SocketIO.Server(httpServer);

interface ExtendedSocket extends Socket {
    nickname?: string;
}

// Get public room list.
const getRoom = (): string[] => {
    const {sids, rooms} = io.sockets.adapter;
    let roomList: string[] = []
    rooms.forEach((_, key) => sids.get(key) !== undefined && roomList.push(key));
    return roomList;
}

const getNicknames = (): string[] => {
    try {
        const nicknames:string[] = [];
        const sockets = io.sockets.sockets;
        sockets.forEach( (socket, _) => {
            const nickname = (socket as ExtendedSocket)?.nickname;
            if(nickname) {
                nicknames.push(nickname);
            }
        });
        return nicknames;
    } catch (e) {
        console.log(e);
        return [];
    }
}

// Start to connect
io.on("connection", (socket) => {
    socket.on("request_nicknames", (fn) => {
        fn(getNicknames());
    });
    socket.on('enter_room', (roomName, nickname, afterEnterRoom) => {
        socket.join(roomName);
        (socket as ExtendedSocket).nickname = nickname;
        afterEnterRoom();
        socket.to(roomName).emit("joined")
    });
    socket.on("offer", (offer, roomName) => {
        socket.to(roomName).emit("offer_send", offer);
    });

    socket.on("answer", (answer, roomName) => {
        socket.to(roomName).emit("answer_send", answer);
    });

    socket.on("ice", (candidate, roomName) => {
        socket.to(roomName).emit("ice_send", candidate);
    });
});


httpServer.listen(3000, () => {
    console.info("🐶 Http & Ws start at port 3000");
});


