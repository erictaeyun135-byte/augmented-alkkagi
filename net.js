// =====================================================================
// 온라인 연결 (Firebase 실시간 데이터베이스) + 시작 화면 / 대기실
//
// 데이터 구조 (rooms/방코드/...)
//   meta    : { host: 방장 uid, status: 'lobby'|'playing'|'closed', mode, order: [자리 순서 uid], names }
//   players : { uid: { name, joined } }
//   view    : 방장이 보내는 화면 정보 (손님이 그대로 그림)
//   inputs  : 손님이 보내는 행동 (방장이 받아서 처리하고 지움)
// =====================================================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyA1QVmnDr9K00MAWhFLcXYiO_WR9RheMGk",
  authDomain: "augmented-alkkagi.firebaseapp.com",
  databaseURL: "https://augmented-alkkagi-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "augmented-alkkagi",
  storageBucket: "augmented-alkkagi.firebasestorage.app",
  messagingSenderId: "254442399443",
  appId: "1:254442399443:web:40242a79e3dbc4e9295626",
};
const VIEW_INTERVAL_MS = 100;                         // 방장이 화면 정보를 보내는 간격 (초당 10번)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 글자(0,O,1,I) 뺌

const NET = {
  role: 'none',      // 'none' 시작 화면 | 'offline' 한 화면 연습 | 'host' 방장 | 'client' 손님
  uid: null,
  code: null,
  mySeat: null,
  hostSeat: null,
  seatOf: {},        // uid → 자리 번호
  view: null,        // 손님: 마지막으로 받은 화면 정보
  myPick: null,      // 손님: 이번 판에 내가 고른 증강 { round, key }
  meta: null,
  players: {},
  lastSent: 0,
  lastJson: '',
  lastMJson: '',
  lastPickJson: '',
  listeners: [],

  // ----- 공통 -----
  db() { return firebase.database(); },
  room(path = '') { return this.db().ref(`rooms/${this.code}${path ? '/' + path : ''}`); },

  async init() {
    firebase.initializeApp(FIREBASE_CONFIG);
    // 탭마다 따로 로그인 (같은 컴퓨터에서 탭 여러 개로 테스트할 수 있게)
    await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);
    const cred = await firebase.auth().signInAnonymously();
    this.uid = cred.user.uid;
  },

  // 지금 이 컴퓨터가 seat 자리 대신 조작해도 되는지
  canAct(seat) {
    if (this.role === 'offline') return true;
    return seat !== null && seat !== undefined && seat === this.mySeat;
  },

  activeScene() { return game.scene.getScenes(true)[0]; },

  goScene(key) {
    game.scene.getScenes(true).forEach(sc => game.scene.stop(sc.sys.settings.key));
    game.scene.start(key);
  },

  // 행동 보내기: 한 화면 연습·방장은 바로 처리, 손님은 방장에게 전송
  act(a) {
    if (this.role === 'client') {
      this.room('inputs').push({ u: this.uid, a });
      return;
    }
    const sc = this.activeScene();
    if (!sc || !sc.onAction) return;
    const seat = this.role === 'host' ? this.mySeat : (sc.actor ? sc.actor() : 0);
    sc.onAction(seat, a);
  },

  // 방장: 장면마다 매 프레임 불림 → 0.1초마다 화면 정보 전송
  tick(scene) {
    if (this.role !== 'host' || !scene.toView) return;
    const now = Date.now();
    const v = scene.toView();
    v.m = matchInfo();
    const json = JSON.stringify(v);
    if (json === this.lastJson) return;
    const sceneChanged = v.sc !== this.lastSc;
    if (!sceneChanged && now - this.lastSent < VIEW_INTERVAL_MS) return;
    this.lastJson = json;
    this.lastSc = v.sc;
    this.lastSent = now;
    this.room('view').set(v);
  },

  off() {
    for (const [ref, ev, fn] of this.listeners) ref.off(ev, fn);
    this.listeners = [];
  },
  on(ref, ev, fn) { ref.on(ev, fn); this.listeners.push([ref, ev, fn]); },

  // ----- 화면(시작/대기실) -----
  $(id) { return document.getElementById(id); },
  showPanel(name) {
    this.$('overlay').style.display = name ? 'flex' : 'none';
    for (const p of ['titlePanel', 'lobbyPanel']) this.$(p).style.display = p === name ? 'block' : 'none';
  },
  setMsg(id, text) { this.$(id).textContent = text || ''; },

  showTitle(msg) {
    this.off();
    this.role = 'none';
    this.code = null;
    this.view = null;
    this.goScene('idle');
    this.showPanel('titlePanel');
    this.setMsg('titleMsg', msg);
  },

  nickname() {
    const n = this.$('nick').value.trim().slice(0, 8);
    try { localStorage.setItem('alkkagi-nick', n); } catch (e) { /* 저장 안 돼도 괜찮음 */ }
    return n;
  },

  newCode() {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return c;
  },

  async createRoom() {
    const name = this.nickname();
    if (!name) return this.setMsg('titleMsg', '닉네임을 먼저 입력하세요');
    this.setMsg('titleMsg', '방을 만드는 중...');
    let code;
    for (let i = 0; i < 10; i++) {
      code = this.newCode();
      const snap = await this.db().ref(`rooms/${code}/meta`).get();
      if (!snap.exists()) break;
    }
    this.code = code;
    await this.room('meta').set({ host: this.uid, status: 'lobby', mode: 'duel', created: firebase.database.ServerValue.TIMESTAMP });
    await this.joinAs(name);
    // 방장이 나가면 방을 닫음
    this.room('meta/status').onDisconnect().set('closed');
    this.enterLobby();
  },

  async joinRoom() {
    const name = this.nickname();
    const code = this.$('code').value.trim().toUpperCase();
    if (!name) return this.setMsg('titleMsg', '닉네임을 먼저 입력하세요');
    if (code.length !== 4) return this.setMsg('titleMsg', '방 코드 4글자를 입력하세요');
    this.setMsg('titleMsg', '들어가는 중...');
    const meta = (await this.db().ref(`rooms/${code}/meta`).get()).val();
    if (!meta || meta.status === 'closed') return this.setMsg('titleMsg', '그런 방이 없어요. 코드를 확인해 주세요');
    if (meta.status !== 'lobby') return this.setMsg('titleMsg', '이미 게임 중인 방이에요');
    const players = (await this.db().ref(`rooms/${code}/players`).get()).val() || {};
    if (Object.keys(players).length >= 4 && !players[this.uid]) return this.setMsg('titleMsg', '방이 꽉 찼어요 (최대 4명)');
    this.code = code;
    await this.joinAs(name);
    this.enterLobby();
  },

  async joinAs(name) {
    const me = this.room(`players/${this.uid}`);
    await me.set({ name, joined: firebase.database.ServerValue.TIMESTAMP });
    me.onDisconnect().remove();
  },

  isHost() { return this.meta && this.meta.host === this.uid; },

  // 대기실 인원 순서: 방장이 섞었으면 그 순서, 아니면 들어온 순서
  orderedUids() {
    const uids = Object.keys(this.players).sort((a, b) => (this.players[a].joined || 0) - (this.players[b].joined || 0));
    const custom = (this.meta && this.meta.order) || [];
    const kept = custom.filter(u => uids.includes(u));
    return [...kept, ...uids.filter(u => !kept.includes(u))];
  },

  enterLobby() {
    this.off();
    this.role = 'none';
    this.view = null;
    this.goScene('idle');
    this.showPanel('lobbyPanel');
    this.$('roomCode').textContent = this.code;
    this.on(this.room('meta'), 'value', (snap) => {
      this.meta = snap.val();
      if (!this.meta || this.meta.status === 'closed') return this.showTitle('방장이 나가서 방이 닫혔어요');
      if (this.meta.status === 'playing' && this.role === 'none') this.startPlaying();
      else if (this.meta.status === 'lobby' && (this.role === 'host' || this.role === 'client')) this.enterLobby();
      else this.renderLobby();
    });
    this.on(this.room('players'), 'value', (snap) => {
      this.players = snap.val() || {};
      if (!this.players[this.uid] && this.role === 'none') return this.showTitle('방에서 나왔어요');
      this.renderLobby();
    });
  },

  renderLobby() {
    if (!this.meta) return;
    const host = this.isHost();
    const mode = this.meta.mode || 'duel';
    const need = MODES[mode].players.length;
    const uids = this.orderedUids();
    // 모드 버튼
    for (const key of ['duel', 'ffa', 'team']) {
      const b = this.$('mode-' + key);
      b.classList.toggle('on', key === mode);
      b.disabled = !host;
    }
    // 인원 목록: 자리마다 돌 색 / 팀 표시
    const list = this.$('plist');
    list.innerHTML = '';
    uids.forEach((u, i) => {
      const li = document.createElement('li');
      const seat = MODES[mode].players[i];
      const tag = seat ? (MODES[mode].team ? `${TEAM_NAME[seat.team]} · ${seat.name}` : seat.name) : '대기';
      li.textContent = `${this.players[u].name}  —  ${tag}${u === this.meta.host ? '  (방장)' : ''}${u === this.uid ? '  ← 나' : ''}`;
      if (seat) li.style.color = STONE_STYLE[seat.color].text;
      list.appendChild(li);
    });
    this.$('shuffle').style.display = host && MODES[mode].team ? 'inline-block' : 'none';
    this.$('start').style.display = host ? 'inline-block' : 'none';
    this.$('start').disabled = uids.length !== need;
    this.setMsg('lobbyMsg', uids.length === need
      ? (host ? '시작할 수 있어요!' : '방장이 시작하길 기다리는 중...')
      : `${MODES[mode].label}은 ${need}명이 필요해요 (지금 ${uids.length}명)`);
  },

  setMode(key) { if (this.isHost()) this.room('meta').update({ mode: key }); },
  shuffleTeams() { if (this.isHost()) this.room('meta').update({ order: shuffle(this.orderedUids()) }); },

  async startGame() {
    if (!this.isHost()) return;
    const uids = this.orderedUids();
    const mode = this.meta.mode;
    if (uids.length !== MODES[mode].players.length) return;
    await this.room('view').remove();
    await this.room('inputs').remove();
    await this.room('meta').update({ status: 'playing', order: uids, names: uids.map(u => this.players[u].name) });
  },

  async leaveRoom() {
    const code = this.code;
    if (this.isHost()) await this.db().ref(`rooms/${code}`).remove();
    else await this.room(`players/${this.uid}`).remove();
    this.showTitle('');
  },

  // 대기실 → 게임 시작 (방장·손님 모두 meta 의 status 가 playing 이 되면 여기로)
  startPlaying() {
    const order = this.meta.order;
    this.seatOf = {};
    order.forEach((u, i) => { this.seatOf[u] = i; });
    this.mySeat = this.seatOf[this.uid];
    this.hostSeat = this.seatOf[this.meta.host];
    this.myPick = null;
    this.lastJson = '';
    this.lastSc = '';
    this.lastMJson = '';
    this.lastPickJson = '';
    this.showPanel(null);
    newMatch(this.meta.mode, this.meta.names);

    if (this.isHost()) {
      this.role = 'host';
      // 손님 행동 받기
      this.on(this.room('inputs'), 'child_added', (snap) => {
        const d = snap.val();
        snap.ref.remove();
        if (!d || !d.a || this.seatOf[d.u] === undefined) return;
        const sc = this.activeScene();
        if (sc && sc.onAction) sc.onAction(this.seatOf[d.u], d.a);
      });
      this.goScene('pick');
    } else {
      this.role = 'client';
      this.goScene('view');
      this.on(this.room('view'), 'value', (snap) => this.onView(snap.val()));
    }
  },

  // 손님: 방장 화면 정보 받음
  onView(v) {
    if (!v || this.role !== 'client') return;
    this.view = v;
    // 경기 정보(닉네임, 점수, 공개된 증강)를 내 컴퓨터에도 맞춰 둠
    const mJson = JSON.stringify(v.m);
    if (v.m && mJson !== this.lastMJson) {
      this.lastMJson = mJson;
      newMatch(v.m.mk, v.m.names);
      // Firebase 는 빈 배열을 저장하지 않아서, 증강이 없는 사람은 빠져서 옴 → 빈 배열로 채움
      const augs = v.m.names.map((_, i) => (v.m.augs && v.m.augs[i]) || []);
      Object.assign(match, { round: v.m.round, wins: v.m.wins || match.wins, augs, lastWinner: v.m.lw === undefined ? null : v.m.lw });
    }
    const sc = this.activeScene();
    const key = sc && sc.sys.settings.key;
    if (v.sc === 'pick') {
      const pJson = JSON.stringify(v.pk);
      if (key !== 'pick') { this.lastPickJson = pJson; this.goScene('pick'); }
      else if (pJson !== this.lastPickJson) { this.lastPickJson = pJson; sc.renderOnline(); }
    } else {
      if (key !== 'view') this.goScene('view');
      else sc.applyView(v);
    }
  },

  // 방장: 최종 승리 뒤 모두 대기실로
  backToLobby() {
    if (this.role !== 'host') return;
    this.room('view').remove();
    this.room('meta').update({ status: 'lobby' });
  },

  // ----- 시작 -----
  async boot() {
    try { this.$('nick').value = localStorage.getItem('alkkagi-nick') || ''; } catch (e) { /* 무시 */ }
    this.$('create').onclick = () => this.createRoom().catch(e => this.setMsg('titleMsg', '오류: ' + e.message));
    this.$('join').onclick = () => this.joinRoom().catch(e => this.setMsg('titleMsg', '오류: ' + e.message));
    this.$('code').onkeydown = (e) => { if (e.key === 'Enter') this.$('join').click(); };
    this.$('practice').onclick = () => { this.role = 'offline'; this.showPanel(null); this.goScene('mode'); };
    for (const key of ['duel', 'ffa', 'team']) this.$('mode-' + key).onclick = () => this.setMode(key);
    this.$('shuffle').onclick = () => this.shuffleTeams();
    this.$('start').onclick = () => this.startGame();
    this.$('leave').onclick = () => this.leaveRoom();
    this.showPanel('titlePanel');
    this.setMsg('titleMsg', '서버에 연결하는 중...');
    this.$('create').disabled = this.$('join').disabled = true;
    try {
      await this.init();
      this.setMsg('titleMsg', '');
      this.$('create').disabled = this.$('join').disabled = false;
    } catch (e) {
      this.setMsg('titleMsg', '서버 연결 실패 (한 화면 연습은 할 수 있어요): ' + e.message);
    }
  },
};

// ----- 창이 가려져도 게임이 멈추지 않게 -----
// 브라우저는 창을 최소화하거나 다른 탭으로 가면 화면 그리기(requestAnimationFrame)를 멈춥니다.
// 방장 컴퓨터가 멈추면 모두의 게임이 멈추므로, 그럴 땐 워커 타이머로 게임을 직접 한 칸씩 돌립니다.
const KEEP_ALIVE = {
  rafAt: performance.now(),
  last: performance.now(),
  start() {
    const loop = () => { this.rafAt = performance.now(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    const src = 'setInterval(function () { postMessage(0); }, 16);';
    const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = () => {
      const now = performance.now();
      const rafStalled = now - this.rafAt > 100;
      if (rafStalled && (NET.role === 'host' || NET.role === 'client') && window.game) {
        game.step(now, Math.min(50, now - this.last));
      }
      this.last = now;
    };
  },
};

window.addEventListener('load', () => { KEEP_ALIVE.start(); NET.boot(); });
