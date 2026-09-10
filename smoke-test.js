
const { spawn } = require("child_process");
const http = require("http");
const { io } = require("socket.io-client");

const PORT = 3137;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function waitEvent(socket, event, predicate = () => true, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout waiting ${event}`));
    }, timeout);
    function handler(data) {
      try {
        if (!predicate(data)) return;
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(data);
      } catch (e) {
        clearTimeout(timer);
        socket.off(event, handler);
        reject(e);
      }
    }
    socket.on(event, handler);
  });
}

async function waitHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const body = await new Promise((resolve, reject) => {
        const req = http.get(`${BASE}/health`, res => {
          let data = "";
          res.on("data", c => data += c);
          res.on("end", () => resolve({status:res.statusCode, data}));
        });
        req.on("error", reject);
        req.setTimeout(500, () => req.destroy());
      });
      if (body.status === 200) return JSON.parse(body.data);
    } catch {}
    await sleep(100);
  }
  throw new Error("health endpoint never became ready");
}

function makeClient() {
  return io(BASE, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    timeout: 3000
  });
}

(async () => {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: __dirname,
    env: {...process.env, PORT:String(PORT)},
    stdio: ["ignore", "pipe", "pipe"]
  });

  let serverErr = "";
  child.stderr.on("data", d => serverErr += d.toString());

  let A, B, B2;
  try {
    const health = await waitHealth();
    if (!health.ok) throw new Error("health returned not ok");

    A = makeClient();
    B = makeClient();
    await Promise.all([waitEvent(A, "connect"), waitEvent(B, "connect")]);

    const hostToken = "host_token_test_123456789";
    const friendToken = "friend_token_test_123456789";

    const aLobbyP = waitEvent(A, "state", s => s.phase === "lobby" && s.players.length === 1);
    const aPrivateP = waitEvent(A, "privateState", p => !!p.id);
    A.emit("createRoom", {name:"Host", sessionToken:hostToken});
    const aLobby = await aLobbyP;
    const aPrivate = await aPrivateP;
    const code = aLobby.code;

    const bothLobbyOnAP = waitEvent(A, "state", s => s.code === code && s.phase === "lobby" && s.players.length === 2);
    const bothLobbyOnBP = waitEvent(B, "state", s => s.code === code && s.phase === "lobby" && s.players.length === 2);
    const bPrivateP = waitEvent(B, "privateState", p => !!p.id);
    B.emit("joinRoom", {code, name:"Friend", sessionToken:friendToken});
    await Promise.all([bothLobbyOnAP, bothLobbyOnBP]);
    const bPrivate = await bPrivateP;

    const gameAP = waitEvent(A, "state", s => s.code === code && s.phase === "game");
    const gameBP = waitEvent(B, "state", s => s.code === code && s.phase === "game");
    A.emit("startGame");
    const [stateA, stateB] = await Promise.all([gameAP, gameBP]);

    if (stateA.game.bossIndex !== stateB.game.bossIndex) throw new Error("bossIndex mismatch");
    if (JSON.stringify(stateA.game.rooms) !== JSON.stringify(stateB.game.rooms)) throw new Error("room map mismatch");
    if (stateA.players.some(p => Array.isArray(p.amu) || Array.isArray(p.sac))) {
      throw new Error("private hand leaked in public state");
    }

    let latestAPrivate = aPrivate;
    let latestBPrivate = bPrivate;
    const updateA = p => latestAPrivate = p;
    const updateB = p => latestBPrivate = p;
    A.on("privateState", updateA);
    B.on("privateState", updateB);
    await sleep(150);

    if (!Array.isArray(latestAPrivate.amu) || latestAPrivate.amu.length !== 3) throw new Error("host initial hand invalid");
    if (!Array.isArray(latestBPrivate.amu) || latestBPrivate.amu.length !== 3) throw new Error("friend initial hand invalid");
    if (latestAPrivate.id === latestBPrivate.id) throw new Error("players share same private id");

    // Host is turn 0. Test synced dice/movement and handing over turn.
    const rolledA = waitEvent(A, "state", s => s.phase === "game" && s.game.rolled === true);
    const rolledB = waitEvent(B, "state", s => s.phase === "game" && s.game.rolled === true);
    A.emit("roll");
    const [rollStateA, rollStateB] = await Promise.all([rolledA, rolledB]);
    if (rollStateA.game.lastDice.total !== rollStateB.game.lastDice.total) throw new Error("dice state mismatch");

    let afterMove = rollStateA;
    if (rollStateA.game.mustMove || rollStateA.game.moveOptional) {
      const legal = rollStateA.game.legal[0];
      const movedAP = waitEvent(A, "state", s => s.phase === "game" && s.game.moved === true && !s.game.mustMove && !s.game.moveOptional);
      const movedBP = waitEvent(B, "state", s => s.phase === "game" && s.game.moved === true && !s.game.mustMove && !s.game.moveOptional);
      A.emit("move", {index: legal});
      [afterMove] = await Promise.all([movedAP, movedBP]);
    } else if (!rollStateA.game.moved) {
      throw new Error("roll resolved to neither move requirement nor moved state");
    }

    const turnToBP = waitEvent(A, "state", s => s.phase === "game" && s.players[1]?.isTurn === true);
    const turnToB2P = waitEvent(B, "state", s => s.phase === "game" && s.players[1]?.isTurn === true);
    A.emit("endTurn");
    await Promise.all([turnToBP, turnToB2P]);

    // Friend disconnects, then resumes same seat with same session token.
    const oldFriendId = latestBPrivate.id;
    B.disconnect();
    const offlineStateP = waitEvent(A, "state", s => s.players.some(p => p.id === oldFriendId && p.connected === false));
    await offlineStateP;

    B2 = makeClient();
    await waitEvent(B2, "connect");
    const resumedStateP = waitEvent(B2, "state", s => s.code === code && s.phase === "game");
    const resumedPrivateP = waitEvent(B2, "privateState", p => p.id === oldFriendId);
    B2.emit("resumeRoom", {code, sessionToken:friendToken});
    const [resumedState, resumedPrivate] = await Promise.all([resumedStateP, resumedPrivateP]);

    if (resumedPrivate.id !== oldFriendId) throw new Error("reconnect did not preserve seat id");
    const resumedPublic = resumedState.players.find(p => p.id === oldFriendId);
    if (!resumedPublic?.connected) throw new Error("reconnected player not marked online");

    console.log(JSON.stringify({
      ok:true,
      health,
      roomCode:code,
      players:resumedState.players.length,
      sameMap:true,
      privateHandsProtected:true,
      turnSync:true,
      reconnectPreservedSeat:true
    }, null, 2));
  } finally {
    try { A?.disconnect(); } catch {}
    try { B?.disconnect(); } catch {}
    try { B2?.disconnect(); } catch {}
    child.kill("SIGTERM");
    await sleep(100);
    if (serverErr) process.stderr.write(serverErr);
  }
})().catch(err => {
  console.error(err.stack || err);
  process.exitCode = 1;
});
