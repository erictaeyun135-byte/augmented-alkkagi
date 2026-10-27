// =====================================================================
// 증강 알까기
// 장면 흐름: 모드 선택 → [증강 고르기 → 순서 미니게임 → 본게임] × 판 수
// =====================================================================

// ===== 조절용 숫자 (플레이해보며 바꿀 것들) =====
const STONE_RADIUS = 14;    // 알 반지름
const MAX_PULL     = 150;   // 최대로 당길 수 있는 거리
const POWER        = 0.12;  // 당긴 거리 → 발사 속도 비율
const FRICTION_AIR = 0.02;  // 클수록 알이 빨리 멈춤
const STOP_SPEED   = 0.08;  // 이보다 느리면 멈춘 것으로 봄
const WINS_NEEDED  = 2;     // 먼저 2판 이기면 최종 승리
const TEAM_HIT     = 0.5;   // 2대2에서 같은 팀 알을 맞히면 이 배수만큼만 밀림

// ===== 증강 수치 =====
const IRON_MASS       = 2;      // 무쇠알 무게 배수
const BANANA_FRICTION = 0.004;  // 바나나 알의 미끄러움 (작을수록 미끄러움)
const BOMB_RADIUS     = 170;    // 폭발 범위
const BOMB_POWER      = 14;     // 폭발 힘
const POOP_RADIUS     = 18;     // 똥 크기
const RUBBER_COUNT    = 2;      // 고무 테두리가 붙는 알 개수
const RUBBER_BOUNCE   = 1.2;    // 고무 테두리로 튕겨 들어오는 속도 (얼마나 세게 나갔든 항상 같음, 1.2 ≈ 알 2개 거리)

// ===== 모드 =====
// ratio: 판 한 변 = 알 지름 × ratio. 4인은 넓이가 1대1의 약 2배 (28 × 1.41 ≈ 40)
// stones: 1대1·개인전은 한 사람 알 개수, 2대2는 팀이 같이 쓰는 알 개수
const MODES = {
  duel: {
    label: '1대1', ratio: 28, team: false, stones: 5,
    players: [
      { name: '흑', color: 'black', seat: 'bottom' },
      { name: '백', color: 'white', seat: 'top' },
    ],
  },
  ffa: {
    label: '4인 개인전', ratio: 40, team: false, stones: 5,
    players: [
      { name: '흑',   color: 'black', seat: 'bottom' },
      { name: '빨강', color: 'red',   seat: 'right' },
      { name: '백',   color: 'white', seat: 'top' },
      { name: '파랑', color: 'blue',  seat: 'left' },
    ],
  },
  team: {
    label: '2대2 팀전', ratio: 33, team: true, stones: 7,   // 판 한 변 1대1의 약 1.18배, stones는 팀이 같이 쓰는 알 개수
    players: [
      { name: '흑1', color: 'black', seat: 'bottom', team: 'A' },
      { name: '백1', color: 'white', seat: 'right',  team: 'B' },
      { name: '흑2', color: 'black', seat: 'top',    team: 'A' },
      { name: '백2', color: 'white', seat: 'left',   team: 'B' },
    ],
  },
};
const TEAM_NAME = { A: '흑팀', B: '백팀' };
const FFA_CORNER = 0.18;   // 4인 개인전: 알 줄 가운데가 모서리에서 얼마나 안쪽인지 (판 한 변 대비)
const FFA_HALF   = 0.10;   // 4인 개인전: 알 줄 길이의 절반 (판 한 변 대비)

const STONE_STYLE = {
  black: { fill: 0x222222, line: 0x555555, steel: 0xa8a8a8, text: '#cccccc' },
  white: { fill: 0xf2f2f2, line: 0xaaaaaa, steel: 0x666666, text: '#ffffff' },
  red:   { fill: 0xd83a3a, line: 0x8a1f1f, steel: 0xdddddd, text: '#ff7070' },
  blue:  { fill: 0x3a6ad8, line: 0x1f3a8a, steel: 0xdddddd, text: '#7aa2ff' },
  gold:  { fill: 0xf2c230, line: 0x9a7410, steel: 0x9a7410, text: '#ffd84a' },   // 순서 미니게임 표적 알
};

// ===== 고정값 =====
const MARGIN = 108;   // 판 바깥 여백 (글자 들어가는 곳)
const MENU_SIZE = 1000;
const FONT = 'Malgun Gothic, sans-serif';

// ===== 경기 전체 상태 (판이 바뀌어도 유지됨) =====
let match = null;
function newMatch(modeKey) {
  const mode = MODES[modeKey];
  match = {
    modeKey,
    mode,
    round: 1,
    wins: {},                            // 주인(owner)별 이긴 판 수
    augs: mode.players.map(() => []),    // 플레이어별 고른 증강
    lastWinner: null,                    // 직전 판 승자 owner (다시 뽑기용)
    turnOrder: [],                       // 이번 판 치는 순서 (플레이어 번호)
  };
  for (const o of owners()) match.wins[o] = 0;
}

// owner = 알의 주인. 팀전이면 팀('A'/'B'), 아니면 플레이어 번호('0'~'3')
function ownerOf(p) { return match.mode.team ? match.mode.players[p].team : String(p); }
function owners() { return [...new Set(match.mode.players.map((_, i) => ownerOf(i)))]; }
function ownerName(o) { return match.mode.team ? TEAM_NAME[o] : match.mode.players[Number(o)].name; }
function ownerColor(o) {
  const p = match.mode.players.findIndex((_, i) => ownerOf(i) === o);
  return match.mode.players[p].color;
}
function ownerAugs(o) {
  const set = new Set();
  match.mode.players.forEach((_, i) => { if (ownerOf(i) === o) match.augs[i].forEach(k => set.add(k)); });
  return [...set];
}
function ownerHas(o, key) { return ownerAugs(o).includes(key); }
function scoreText() { return owners().map(o => `${ownerName(o)} ${match.wins[o]}`).join('  ·  '); }
function augListText() {
  return owners().map(o => `${ownerName(o)}: ${ownerAugs(o).map(k => AUGMENTS[k].name).join(', ') || '없음'}`).join('     |     ');
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ----- 공통: 판 크기, 판 그리기, 알 그리기, 새총 계산 -----
function setupBoard(scene) {
  const board = STONE_RADIUS * 2 * match.mode.ratio;
  const size = board + MARGIN * 2;
  scene.scale.setGameSize(size, size);
  scene.board = board;
  scene.size = size;
  scene.left = MARGIN;
  scene.top = MARGIN;
  scene.k = size / MENU_SIZE;   // 판이 커지면 글자도 같이 키움 (화면에서 같은 크기로 보이게)

  const g = scene.add.graphics();
  g.fillStyle(0xd9a85b);
  g.fillRect(scene.left, scene.top, board, board);
  g.lineStyle(1, 0x8a6a35, 0.6);
  const lines = Math.round(match.mode.ratio * 19 / 28);
  for (let i = 1; i < lines; i++) {
    const p = (board / lines) * i;
    g.lineBetween(scene.left + p, scene.top, scene.left + p, scene.top + board);
    g.lineBetween(scene.left, scene.top + p, scene.left + board, scene.top + p);
  }
}

function isOutOf(scene, x, y) {
  return x < scene.left || x > scene.left + scene.board || y < scene.top || y > scene.top + scene.board;
}

function pullVector(stonePos, p) {
  const v = new Phaser.Math.Vector2(stonePos.x - p.worldX, stonePos.y - p.worldY);
  if (v.length() > MAX_PULL) v.setLength(MAX_PULL);
  return v;
}

function drawAim(g, stonePos, p) {
  const v = pullVector(stonePos, p);
  const isMax = v.length() >= MAX_PULL - 0.5;
  g.clear();
  g.lineStyle(3, isMax ? 0xffcc00 : 0xff4444, 0.9);
  g.lineBetween(stonePos.x, stonePos.y, stonePos.x - v.x, stonePos.y - v.y);
}

function drawStone(g, x, y, color, alpha = 1) {
  const st = STONE_STYLE[color];
  g.fillStyle(st.fill, alpha);
  g.fillCircle(x, y, STONE_RADIUS);
  g.lineStyle(2, st.line, alpha);
  g.strokeCircle(x, y, STONE_RADIUS);
}

function makeText(scene, x, y, str, px, color = '#ffffff', extra = {}) {
  return scene.add.text(x, y, str, Object.assign({
    fontFamily: FONT, fontSize: `${Math.round(px * (scene.k || 1))}px`, color, align: 'center'
  }, extra)).setOrigin(0.5);
}

// =====================================================================
// 모드 선택 화면
// =====================================================================
class ModeScene extends Phaser.Scene {
  constructor() { super('mode'); }

  create() {
    this.scale.setGameSize(MENU_SIZE, MENU_SIZE);
    this.k = 1;
    makeText(this, 500, 200, '증강 알까기', 72);
    makeText(this, 500, 290, '모드를 고르세요', 30, '#bbbbbb');
    ['duel', 'ffa', 'team'].forEach((key, i) => {
      const y = 430 + i * 150;
      const btn = this.add.rectangle(500, y, 460, 110, 0x2d2d3a)
        .setStrokeStyle(3, 0x777777).setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => btn.setStrokeStyle(5, 0xffcc00));
      btn.on('pointerout',  () => btn.setStrokeStyle(3, 0x777777));
      btn.on('pointerdown', () => { newMatch(key); this.scene.start('pick'); });
      makeText(this, 500, y, MODES[key].label, 40, '#ffcc00');
    });
  }
}

// =====================================================================
// 증강 선택 화면: 플레이어 순서대로 무작위 3개 중 1개
// =====================================================================
class PickScene extends Phaser.Scene {
  constructor() { super('pick'); }

  create() {
    this.scale.setGameSize(MENU_SIZE, MENU_SIZE);
    this.k = 1;
    this.idx = 0;
    this.startPick();
  }

  startPick() {
    this.player = this.idx;
    this.owner = ownerOf(this.player);
    // 직전 판에서 이기지 못한 사람은 다시 뽑기 1회 (첫 판, 무승부 다음 판은 없음)
    this.rerollLeft = (match.lastWinner !== null && match.lastWinner !== this.owner) ? 1 : 0;
    this.options = this.draw([]);
    this.render();
  }

  // 내 팀(또는 나)이 아직 안 가진 증강 중 무작위 3개 (exclude는 가능하면 피함)
  draw(exclude) {
    const notOwned = Object.keys(AUGMENTS).filter(k => !ownerHas(this.owner, k));
    const fresh = shuffle(notOwned.filter(k => !exclude.includes(k)));
    const rest  = shuffle(notOwned.filter(k => exclude.includes(k)));
    return [...fresh, ...rest].slice(0, 3);
  }

  render() {
    if (this.ui) this.ui.destroy(true);
    this.ui = this.add.container(0, 0);
    const pl = match.mode.players[this.player];
    const who = match.mode.team ? `${pl.name} (${TEAM_NAME[pl.team]})` : pl.name;

    this.ui.add(makeText(this, 500, 90, `${match.mode.label} · ${match.round}판째   ${scoreText()}`, 26, '#bbbbbb'));
    this.ui.add(makeText(this, 500, 150, `${who}, 증강을 고르세요`, 44, STONE_STYLE[pl.color].text));

    this.options.forEach((key, i) => {
      const x = 500 + (i - 1) * 290;
      const y = 470;
      const card = this.add.rectangle(x, y, 250, 380, 0x2d2d3a)
        .setStrokeStyle(3, 0x777777).setInteractive({ useHandCursor: true });
      card.on('pointerover', () => card.setStrokeStyle(5, 0xffcc00));
      card.on('pointerout',  () => card.setStrokeStyle(3, 0x777777));
      card.on('pointerdown', () => this.choose(key));
      this.ui.add(card);
      this.ui.add(makeText(this, x, y - 130, AUGMENTS[key].name, 34, '#ffcc00'));
      this.ui.add(makeText(this, x, y + 30, AUGMENTS[key].desc, 22, '#eeeeee'));
    });

    if (this.rerollLeft > 0) {
      const btn = makeText(this, 500, 720, '[ 다시 뽑기 (1회) ]', 30, '#66ccff')
        .setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => {
        this.rerollLeft = 0;
        this.options = this.draw(this.options);
        this.render();
      });
      this.ui.add(btn);
    }

    this.ui.add(makeText(this, 500, 830, augListText().split('     |     ').join('\n'), 22, '#aaaaaa'));
  }

  choose(key) {
    match.augs[this.player].push(key);
    this.idx++;
    if (this.idx < match.mode.players.length) this.startPick();
    else this.scene.start('order');
  }
}

// =====================================================================
// 순서 미니게임 (판마다 아래 3가지 중 하나가 무작위로 나옴, 같은 게임이 연속으로는 안 나옴)
//  target  과녁 맞히기: 가운데 과녁에 가장 가깝게
//  chicken 치킨 게임:   위쪽 끝선에 가장 가깝게, 판 밖으로 떨어지면 꼴찌
//  hit     표적 알 맞히기: 가운데 금색 알을 맞혀서 가장 멀리 보내기, 못 맞히면 꼴찌
// 1차: 무작위 순서로 한 명씩 아래 출발점에서 발사 (앞사람 알과 부딪히지 않음)
// 2차: 꼴찌(판 밖 / 못 맞힘)가 2명 이상이면, 그 사람들끼리 벽이 있는 판에서 과녁 맞히기로 다시 겨룸
// =====================================================================
const ORDER_GAMES = {
  target:  { name: '과녁 맞히기',    goal: '가운데 과녁에 가깝게!',  rule: '판 밖으로 나가면 꼴찌 쪽으로 밀리고, 나간 사람끼리 다시 겨룹니다' },
  chicken: { name: '치킨 게임',      goal: '위쪽 끝선에 최대한 가깝게!', rule: '끝선에 가까울수록 1등, 판 밖으로 떨어지면 꼴찌 쪽으로 밀립니다' },
  hit:     { name: '표적 알 맞히기', goal: '금색 알을 가장 멀리!',   rule: '금색 알을 맞혀서 멀리 보낼수록 1등, 못 맞히면 꼴찌 쪽으로 밀립니다' },
};

const CHICKEN_START = 650;   // 치킨 게임 출발점 ~ 끝선 거리 (최대 힘으로 치면 약 880 가므로 세게 치면 떨어짐)

// 순서 미니게임 힘: 4인 모드(개인전·팀전)는 넓은 판에 맞게 판 크기 비율만큼 세게 (본게임 힘은 그대로)
function miniPower() {
  return POWER * (match.mode.players.length === 4 ? match.mode.ratio / MODES.duel.ratio : 1);
}

class OrderScene extends Phaser.Scene {
  constructor() { super('order'); }

  create() {
    setupBoard(this);
    this.cx = this.left + this.board / 2;
    this.cy = this.top + this.board / 2;

    // 이번 판 미니게임 고르기 (직전 판과 다른 것)
    const kinds = Object.keys(ORDER_GAMES).filter(k => k !== match.lastOrderKind);
    this.kind = window.__forceOrderKind || Phaser.Utils.Array.GetRandom(kinds);
    match.lastOrderKind = this.kind;

    // 출발점: 아래쪽. 치킨 게임은 최대 힘이면 끝선을 넘어 떨어지도록 끝선에서 CHICKEN_START 거리에 둠
    const startY = this.kind === 'chicken'
      ? this.top + Math.min(this.board * 0.9, CHICKEN_START * miniPower() / POWER)
      : this.top + this.board * 0.9;
    this.start = { x: this.cx, y: startY };

    this.deco = this.add.graphics();
    this.deco.lineStyle(2, 0xffffff, 0.5);
    this.deco.strokeCircle(this.start.x, this.start.y, STONE_RADIUS + 6);
    if (this.kind === 'target') this.drawRings();
    if (this.kind === 'chicken') {
      this.deco.lineStyle(6, 0xff3333, 0.9);
      this.deco.lineBetween(this.left, this.top + 3, this.left + this.board, this.top + 3);
      this.lineLabel = makeText(this, this.cx, this.top + 30, '▲ 끝선', 22, '#ff5555');
    }

    this.ghostGfx = this.add.graphics();
    this.stoneGfx = this.add.graphics();
    this.aimGfx   = this.add.graphics();
    this.titleText = makeText(this, this.size / 2, MARGIN * 0.3, `순서 정하기 미니게임: ${ORDER_GAMES[this.kind].name}`, 24, '#ffcc00');
    this.infoText = makeText(this, this.size / 2, MARGIN * 0.68, '', 30);
    this.subText  = makeText(this, this.size / 2, this.top + this.board + MARGIN / 2, '', 22, '#aaaaaa');

    // 표적 알 (hit 게임만)
    this.targetStone = null;
    if (this.kind === 'hit') {
      const body = this.matter.add.circle(this.cx, this.cy, STONE_RADIUS, {
        restitution: 0.9, friction: 0, frictionStatic: 0, frictionAir: FRICTION_AIR
      });
      this.targetStone = { body, color: 'gold' };
    }

    this.phase    = 'A';
    this.queue    = shuffle(match.mode.players.map((_, i) => i));
    this.results  = {};    // 플레이어 번호 → { score, out, x, y } (score는 작을수록 1등)
    this.ghosts   = [];    // 1차에서 이미 친 사람 위치 (부딪히지 않음)
    this.live     = [];    // 지금 판 위에 있는 실제 알들
    this.walls    = [];
    this.nameTags = {};
    this.dragging = false;
    this.current  = null;
    this.moving   = false;
    this.done     = false;
    this.peak     = 0;

    this.input.on('pointerdown', (p) => {
      if (this.done) { this.finish(); return; }
      if (this.moving || !this.current) return;
      const pos = this.current.body.position;
      this.dragging = Phaser.Math.Distance.Between(p.worldX, p.worldY, pos.x, pos.y) < STONE_RADIUS * 1.5;
    });
    const release = (p) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.aimGfx.clear();
      const v = pullVector(this.current.body.position, p);
      this.matter.body.setVelocity(this.current.body, { x: v.x * miniPower(), y: v.y * miniPower() });
      this.moving = true;
      this.peak = 0;
      this.shotTime = this.time.now;
    };
    // 마우스를 게임 화면 밖(판 옆 검은 부분)에서 놓아도 똑같이 발사
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    this.nextShooter();
  }

  drawRings() {
    this.deco.lineStyle(3, 0xffffff, 0.8);
    this.deco.strokeCircle(this.cx, this.cy, 12);
    this.deco.strokeCircle(this.cx, this.cy, 40);
  }

  nextShooter() {
    if (this.queue.length === 0) return this.endPhase();
    const p = this.queue.shift();
    const body = this.matter.add.circle(this.start.x, this.start.y, STONE_RADIUS, {
      restitution: 0.9, friction: 0, frictionStatic: 0, frictionAir: FRICTION_AIR
    });
    this.current = { player: p, body, color: match.mode.players[p].color };
    this.live.push(this.current);
    const pl = match.mode.players[p];
    this.infoText.setText(this.phase === 'A'
      ? `${pl.name} 차례: ${ORDER_GAMES[this.kind].goal}`
      : `다시 정하기: ${pl.name} 차례 (과녁에 가깝게, 벽에 튕겨요)`).setColor(STONE_STYLE[pl.color].text);
    this.subText.setText(this.phase === 'A'
      ? ORDER_GAMES[this.kind].rule + this.recordText()
      : '꼴찌가 된 사람끼리 같은 판에서 다시! 서로 쳐낼 수 있어요');
  }

  // 표적 알 맞히기 기록 (알 몇 개 거리만큼 날아갔는지)
  recordText() {
    if (this.kind !== 'hit') return '';
    const rec = Object.keys(this.results).map(Number).map(p => {
      const r = this.results[p];
      return `${match.mode.players[p].name} ${r.out ? '빗나감' : `알 ${r.dist}개`}`;
    });
    return rec.length ? `\n기록: ${rec.join('   ')}` : '';
  }

  shotFinished() {
    const c = this.current;
    if (this.phase === 'A') {
      const { x, y } = c.body.position;
      const off = isOutOf(this, x, y);
      let r;
      if (this.kind === 'target') {
        r = { out: off, score: Phaser.Math.Distance.Between(x, y, this.cx, this.cy) };
      } else if (this.kind === 'chicken') {
        r = { out: off, score: y - this.top };
      } else {
        // 공기 저항만 받는다면 더 갈 수 있었던 거리까지 포함한 비거리 (판 밖으로 날아가도 공평하게 비교)
        const missed = this.peak < 0.5;
        const dist = Math.round(this.peak / FRICTION_AIR / (STONE_RADIUS * 2));
        r = { out: missed, score: -this.peak, dist };
        this.matter.body.setPosition(this.targetStone.body, { x: this.cx, y: this.cy });
        this.matter.body.setVelocity(this.targetStone.body, { x: 0, y: 0 });
      }
      this.results[c.player] = Object.assign(r, { x, y });
      if (this.world().has(c.body)) this.matter.world.remove(c.body);
      this.live = [];
      if (this.kind !== 'hit') this.ghosts.push({ player: c.player, x, y, out: off, color: c.color });
    }
    this.current = null;
    this.nextShooter();
  }

  world() {
    const bodies = this.matter.world.localWorld.bodies;
    return { has: (b) => bodies.includes(b) };
  }

  endPhase() {
    if (this.phase === 'A') {
      const outs = Object.keys(this.results).map(Number).filter(p => this.results[p].out);
      if (outs.length >= 2) {
        this.phase = 'B';
        this.queue = shuffle(outs);
        this.ghosts = this.ghosts.filter(gh => !gh.out);
        if (this.targetStone) { this.matter.world.remove(this.targetStone.body); this.targetStone = null; }
        if (this.lineLabel) { this.lineLabel.destroy(); this.lineLabel = null; }
        this.deco.clear();
        this.drawRings();
        this.addWalls();
        this.nextShooter();
        return;
      }
    } else {
      for (const s of this.live) {
        this.results[s.player].bx = s.body.position.x;
        this.results[s.player].by = s.body.position.y;
      }
    }
    this.decide();
  }

  addWalls() {
    const t = 60, L = this.left, T = this.top, B = this.board;
    const opt = { isStatic: true, restitution: 0.9, friction: 0 };
    this.walls = [
      this.matter.add.rectangle(L + B / 2, T - t / 2, B + t * 2, t, opt),
      this.matter.add.rectangle(L + B / 2, T + B + t / 2, B + t * 2, t, opt),
      this.matter.add.rectangle(L - t / 2, T + B / 2, t, B + t * 2, opt),
      this.matter.add.rectangle(L + B + t / 2, T + B / 2, t, B + t * 2, opt),
    ];
  }

  decide() {
    const dist = (x, y) => Phaser.Math.Distance.Between(x, y, this.cx, this.cy);
    const ps = Object.keys(this.results).map(Number);
    const inside = ps.filter(p => !this.results[p].out)
      .sort((a, b) => this.results[a].score - this.results[b].score);
    const outside = ps.filter(p => this.results[p].out);
    if (outside.length >= 2) {
      outside.sort((a, b) => dist(this.results[a].bx, this.results[a].by) - dist(this.results[b].bx, this.results[b].by));
    }
    const ranking = [...inside, ...outside];
    match.ranking = ranking;
    match.turnOrder = buildTurnOrder(ranking);

    this.done = true;
    this.current = null;
    const names = match.turnOrder.map((p, i) => `${i + 1}. ${match.mode.players[p].name}`).join('    ');
    this.infoText.setText('치는 순서').setColor('#ffffff');
    this.subText.setText(this.recordText().trim());
    this.resultText = makeText(this, this.size / 2, this.cy, `${names}\n\n(클릭하면 시작)`, 40, '#ffffff',
      { stroke: '#000000', strokeThickness: 8 });
  }

  finish() {
    for (const w of this.walls) this.matter.world.remove(w);
    this.scene.start('game');
  }

  update() {
    // 표적 알 맞히기: 이번 샷에서 금색 알이 낸 최고 속도 기록
    if (this.moving && this.targetStone && this.phase === 'A') {
      this.peak = Math.max(this.peak, this.targetStone.body.speed);
    }

    // 1차: 판 밖으로 나가면 바로 끝 / 2차: 벽이 있어서 안 나감
    if (this.moving && this.current && this.phase === 'A') {
      const { x, y } = this.current.body.position;
      const shooterOut = isOutOf(this, x, y);
      if (this.kind !== 'hit' && shooterOut) { this.moving = false; this.shotFinished(); return; }
      if (this.kind === 'hit') {
        // 내 알이 판 밖으로 나가도 금색 알은 계속 지켜봄
        if (shooterOut && this.live.includes(this.current)) {
          this.matter.world.remove(this.current.body);
          this.live = [];
        }
        const t = this.targetStone.body.position;
        if (isOutOf(this, t.x, t.y)) {
          this.matter.body.setVelocity(this.targetStone.body, { x: 0, y: 0 });
          this.moving = false; this.shotFinished(); return;
        }
      }
    }
    if (this.moving && this.time.now - this.shotTime > 200) {
      const all = this.targetStone && this.phase === 'A' ? [...this.live, this.targetStone] : this.live;
      const stopped = all.every(s => s.body.speed < STOP_SPEED);
      if (stopped) {
        for (const s of all) this.matter.body.setVelocity(s.body, { x: 0, y: 0 });
        this.moving = false;
        this.shotFinished();
      }
    }

    // 그리기 (이름표는 플레이어마다 하나씩 만들어 두고 위치만 옮김)
    for (const t of Object.values(this.nameTags)) t.setVisible(false);
    const tag = (p, x, y) => {
      if (!this.nameTags[p]) this.nameTags[p] = makeText(this, 0, 0, match.mode.players[p].name, 18, '#ffffff');
      this.nameTags[p].setPosition(x, y - 28).setVisible(true);
    };
    this.ghostGfx.clear();
    for (const gh of this.ghosts) {
      if (gh.out) continue;
      drawStone(this.ghostGfx, gh.x, gh.y, gh.color, 0.4);
      tag(gh.player, gh.x, gh.y);
    }
    this.stoneGfx.clear();
    if (this.targetStone) drawStone(this.stoneGfx, this.targetStone.body.position.x, this.targetStone.body.position.y, 'gold');
    for (const s of this.live) {
      drawStone(this.stoneGfx, s.body.position.x, s.body.position.y, s.color);
      if (this.phase === 'B' || this.done) tag(s.player, s.body.position.x, s.body.position.y);
    }
    if (this.dragging && this.current) drawAim(this.aimGfx, this.current.body.position, this.input.activePointer);
  }
}

// 미니게임 순위 → 이번 판 치는 순서
//  개인전/1대1: 순위 그대로
//  2대2: 1등 팀이 먼저, 팀끼리 번갈아. 팀 안에서는 순위 높은 사람 먼저
function buildTurnOrder(ranking) {
  if (!match.mode.team) return [...ranking];
  const first = ownerOf(ranking[0]);
  const second = first === 'A' ? 'B' : 'A';
  const a = ranking.filter(p => ownerOf(p) === first);
  const b = ranking.filter(p => ownerOf(p) === second);
  return [a[0], b[0], a[1], b[1]];
}

// =====================================================================
// 알까기 한 판
// =====================================================================
class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  create() {
    setupBoard(this);

    // 알 만들기
    //  1대1:     흑은 아래, 백은 위에 한 줄
    //  2대2:     1대1처럼 흑팀은 아래, 백팀은 위에 팀 공유 알 한 줄
    //  4인 개인전: 각자 판의 한 모서리에서 가운데를 향해 비스듬히 한 줄 (옆 상대까지 거리가 1대1과 비슷해짐)
    this.stones = [];
    const n = match.mode.stones;
    const B = this.board, L = this.left, T = this.top;
    const row = (owner, color, y) => {
      for (let i = 0; i < n; i++) {
        this.stones.push(this.makeStone(L + (B / (n + 1)) * (i + 1), T + B * y, color, owner));
      }
    };
    if (match.modeKey === 'ffa') {
      // 자리 → 모서리: 흑 왼쪽 아래, 빨강 오른쪽 아래, 백 오른쪽 위, 파랑 왼쪽 위 (시계 방향)
      const corners = { bottom: [0, 1], right: [1, 1], top: [1, 0], left: [0, 0] };
      match.mode.players.forEach((pl, p) => {
        const [cx, cy] = corners[pl.seat];
        const bx = cx ? 1 - FFA_CORNER : FFA_CORNER;
        const by = cy ? 1 - FFA_CORNER : FFA_CORNER;
        const sx = cx === cy ? 1 : 1, sy = cx === cy ? -1 : 1;   // 모서리-가운데 대각선에 수직인 방향
        for (let i = 0; i < n; i++) {
          const t = ((i / (n - 1)) * 2 - 1) * FFA_HALF / Math.SQRT2;
          this.stones.push(this.makeStone(L + B * (bx + sx * t), T + B * (by + sy * t), pl.color, ownerOf(p)));
        }
      });
    } else if (match.mode.team) {
      row('A', 'black', 0.85);
      row('B', 'white', 0.15);
    } else {
      row('0', 'black', 0.85);
      row('1', 'white', 0.15);
    }

    this.poops = [];
    this.boom = null;
    this.reviveLeft = {};
    this.poopLeft = match.mode.players.map(() => 0);
    this.friendlyHits = new Set();
    this.applyAugments();

    // 2대2: 같은 팀 알끼리 부딪히면, 맞은 쪽(느리던 알)을 표시해 두고 물리 계산 후 0.5배로 줄임
    this.matter.world.on('collisionstart', (event) => {
      if (!match.mode.team) return;
      for (const pair of event.pairs) {
        const a = pair.bodyA.stoneRef, b = pair.bodyB.stoneRef;
        if (!a || !b || a.owner !== b.owner) continue;
        this.friendlyHits.add(a.body.speed < b.body.speed ? a : b);
      }
    });

    this.fxGfx    = this.add.graphics();
    this.stoneGfx = this.add.graphics();
    this.aimGfx   = this.add.graphics();

    // 게임 상태
    this.turnIdx     = 0;
    this.turn        = match.turnOrder[0];   // 지금 치는 플레이어 번호
    this.dragging    = null;
    this.moving      = false;
    this.shotTime    = 0;
    this.shotStone   = null;
    this.knocked     = false;  // 이번 샷에 상대 알을 떨어뜨렸는지
    this.exploded    = false;  // 이번 샷에 폭탄이 터졌는지
    this.placingPoop = false;
    this.gameOver    = false;
    this.bananaPicker = null;

    // 화면 글자
    this.infoText = makeText(this, this.size / 2, MARGIN / 2, '', 32);
    this.augText  = makeText(this, this.size / 2, this.top + this.board + 30, '', 18, '#aaaaaa');
    this.poopBtn  = makeText(this, this.size / 2, this.top + this.board + 75, '', 26, '#c8955a')
      .setInteractive({ useHandCursor: true });
    this.poopBtn.on('pointerdown', () => {
      if (this.canPlacePoop()) this.placingPoop = !this.placingPoop;
      this.updateHud();
    });
    this.flashText = makeText(this, this.size / 2, this.size / 2, '', 64, '#ffffff',
      { stroke: '#000000', strokeThickness: 8 }).setAlpha(0);
    this.nextBananaPick();   // 바나나 고를 사람이 없으면 바로 첫 차례 시작

    // 마우스 조작
    this.input.on('pointerdown', (p) => {
      if (this.moving || this.gameOver) return;
      if (this.bananaPicker !== null) { this.tryBanana(p.worldX, p.worldY); return; }
      if (this.placingPoop) { this.tryPlacePoop(p.worldX, p.worldY); return; }
      const me = ownerOf(this.turn);
      this.dragging = this.stones.find(s =>
        s.alive && s.owner === me &&
        Phaser.Math.Distance.Between(p.worldX, p.worldY, s.body.position.x, s.body.position.y) < STONE_RADIUS * 1.5
      ) || null;
    });
    const release = (p) => {
      if (!this.dragging) return;
      const v = pullVector(this.dragging.body.position, p);
      this.matter.body.setVelocity(this.dragging.body, { x: v.x * POWER, y: v.y * POWER });
      this.shotStone = this.dragging;
      this.dragging  = null;
      this.aimGfx.clear();
      this.moving   = true;
      this.knocked  = false;
      this.exploded = false;
      this.shotTime = this.time.now;
      this.updateHud();
    };
    // 마우스를 게임 화면 밖(판 옆 검은 부분)에서 놓아도 똑같이 발사
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  makeStone(x, y, color, owner) {
    const body = this.matter.add.circle(x, y, STONE_RADIUS, {
      restitution: 0.9, friction: 0, frictionStatic: 0, frictionAir: FRICTION_AIR
    });
    const s = { body, color, owner, alive: true, home: { x, y }, bounceLeft: 0, banana: false, bomb: false, iron: false };
    body.stoneRef = s;
    return s;
  }

  stonesOf(owner) { return this.stones.filter(s => s.alive && s.owner === owner); }
  aliveOwners()   { return owners().filter(o => this.stonesOf(o).length > 0); }

  // 판 시작할 때 증강 효과 적용 (팀전은 팀 알 전체에 적용)
  applyAugments() {
    for (const o of owners()) {
      const mine = this.stonesOf(o);
      if (ownerHas(o, 'iron')) {
        for (const s of mine) { this.matter.body.setMass(s.body, s.body.mass * IRON_MASS); s.iron = true; }
      }
      if (ownerHas(o, 'rubber')) {
        for (const s of shuffle(mine).slice(0, RUBBER_COUNT)) s.bounceLeft = 1;
      }
      if (ownerHas(o, 'bomb')) Phaser.Utils.Array.GetRandom(mine).bomb = true;
      this.reviveLeft[o] = ownerHas(o, 'revive') ? 1 : 0;
    }
    match.mode.players.forEach((_, p) => { this.poopLeft[p] = match.augs[p].includes('poop') ? 1 : 0; });
    // 바나나: 판 시작할 때 바나나를 고른 사람이 치는 순서대로 상대 알 하나를 직접 클릭해서 고름
    this.bananaQueue = match.turnOrder.filter(p => match.augs[p].includes('banana'));
  }

  // ----- 바나나 -----
  nextBananaPick() {
    this.bananaPicker = this.bananaQueue.length ? this.bananaQueue.shift() : null;
    this.updateHud();
  }

  tryBanana(x, y) {
    const me = ownerOf(this.bananaPicker);
    const target = this.stones.find(s => s.alive && s.owner !== me && !s.banana &&
      Phaser.Math.Distance.Between(x, y, s.body.position.x, s.body.position.y) < STONE_RADIUS * 1.5);
    if (!target) return;               // 상대 알이 아닌 곳을 누르면 무시 (다시 고르기)
    target.banana = true;
    target.body.frictionAir = BANANA_FRICTION;
    this.flash(`${match.mode.players[this.bananaPicker].name}의 바나나!`);
    this.nextBananaPick();
  }

  // ----- 똥 -----
  canPlacePoop() {
    return !this.moving && !this.gameOver && this.bananaPicker === null && this.poopLeft[this.turn] > 0;
  }

  tryPlacePoop(x, y) {
    if (isOutOf(this, x, y)) return;   // 판 밖 클릭은 무시 (설치 모드 유지)
    const onStone = this.stones.some(s => s.alive &&
      Phaser.Math.Distance.Between(x, y, s.body.position.x, s.body.position.y) < POOP_RADIUS + STONE_RADIUS);
    if (onStone) return;               // 알 위에는 못 놓음
    this.poops.push({ x, y });
    this.poopLeft[this.turn]--;
    this.placingPoop = false;
    this.updateHud();
  }

  // ----- 폭탄 -----
  explode(s) {
    this.exploded = true;
    s.bomb = false;
    const { x, y } = s.body.position;
    for (const o of this.stones) {
      if (!o.alive || o === s) continue;
      const dx = o.body.position.x - x;
      const dy = o.body.position.y - y;
      const d  = Math.hypot(dx, dy);
      if (d > 0 && d < BOMB_RADIUS) {
        const f = BOMB_POWER * (1 - d / BOMB_RADIUS);
        this.matter.body.setVelocity(o.body, { x: dx / d * f, y: dy / d * f });
      }
    }
    this.boom = { x, y, start: this.time.now };
    this.flash('펑!');
    this.moving   = true;   // 폭발로 다시 굴러가니, 다 멈출 때까지 다시 기다림
    this.shotTime = this.time.now;
  }

  // ----- 판 밖으로 나간 알 처리 (고무 → 부활 → 탈락 순서) -----
  handleOut(s) {
    const b = s.body;
    if (s.bounceLeft > 0) {
      s.bounceLeft = 0;
      let { x, y } = b.position;
      let vx = b.velocity.x * 0.2, vy = b.velocity.y * 0.2;  // 옆으로 미끄러지던 힘도 대부분 없앰
      const L = this.left, R = this.left + this.board, T = this.top, B = this.top + this.board;
      if (x < L) { x = L + 1; vx =  RUBBER_BOUNCE; }
      if (x > R) { x = R - 1; vx = -RUBBER_BOUNCE; }
      if (y < T) { y = T + 1; vy =  RUBBER_BOUNCE; }
      if (y > B) { y = B - 1; vy = -RUBBER_BOUNCE; }
      this.matter.body.setPosition(b, { x, y });
      this.matter.body.setVelocity(b, { x: vx, y: vy });
      return;
    }
    if (this.reviveLeft[s.owner] > 0) {
      this.reviveLeft[s.owner]--;
      this.matter.body.setPosition(b, { x: s.home.x, y: s.home.y });
      this.matter.body.setVelocity(b, { x: 0, y: 0 });
      this.flash(`${ownerName(s.owner)} 부활!`);
      return;
    }
    s.alive = false;
    this.matter.world.remove(b);
    if (s.owner !== ownerOf(this.turn)) this.knocked = true;
  }

  endTurn() {
    const alive = this.aliveOwners();
    if (alive.length === 0) return this.endRound(null);
    if (alive.length === 1) return this.endRound(alive[0]);

    const me = ownerOf(this.turn);
    if (ownerHas(me, 'again') && this.knocked && alive.includes(me)) {
      this.flash('한 번 더!');
    } else {
      // 다음 사람: 알이 남아 있는 사람만 (개인전에서 탈락한 사람은 건너뜀)
      const order = match.turnOrder;
      for (let step = 1; step <= order.length; step++) {
        const i = (this.turnIdx + step) % order.length;
        if (alive.includes(ownerOf(order[i]))) { this.turnIdx = i; break; }
      }
      this.turn = order[this.turnIdx];
    }
    this.placingPoop = false;
    this.updateHud();
  }

  endRound(winner) {
    this.gameOver = true;
    this.placingPoop = false;
    if (winner !== null) match.wins[winner]++;
    match.lastWinner = winner;

    let msg;
    if (winner !== null && match.wins[winner] >= WINS_NEEDED) {
      msg = `${ownerName(winner)} 최종 승리!  (클릭하면 처음 화면)`;
      this.input.once('pointerdown', () => this.scene.start('mode'));
    } else {
      msg = `${winner !== null ? ownerName(winner) + ' 승리' : '무승부'}!  (클릭하면 다음 판)`;
      match.round++;
      this.input.once('pointerdown', () => this.scene.start('pick'));
    }
    this.updateHud();
    this.infoText.setText(msg).setColor('#ffffff');
  }

  flash(msg) {
    this.tweens.killTweensOf(this.flashText);
    this.flashText.setText(msg).setAlpha(1);
    this.tweens.add({ targets: this.flashText, alpha: 0, delay: 500, duration: 700 });
  }

  updateHud() {
    const pl = match.mode.players[this.turn];
    this.infoText.setText(`${match.round}판   ${scoreText()}   ·   ${pl.name} 차례`)
      .setColor(STONE_STYLE[pl.color].text);
    this.augText.setText(augListText());
    if (this.bananaPicker !== null && this.bananaPicker !== undefined) {
      const bp = match.mode.players[this.bananaPicker];
      this.infoText.setText(`${bp.name}: 바나나로 만들 상대 알을 클릭하세요`).setColor(STONE_STYLE[bp.color].text);
    }
    if (this.placingPoop) {
      this.poopBtn.setText('판 위를 클릭해 똥을 놓으세요  (취소: 여기 클릭)');
    } else if (this.canPlacePoop()) {
      this.poopBtn.setText('[ 똥 설치하기 ]');
    } else {
      this.poopBtn.setText('');
    }
  }

  update() {
    // 0) 2대2 같은 팀 충돌: 맞은 알 속도를 0.5배로
    for (const s of this.friendlyHits) {
      const b = s.body;
      const vx = b.position.x - b.positionPrev.x;
      const vy = b.position.y - b.positionPrev.y;
      this.matter.body.setVelocity(b, { x: vx * TEAM_HIT, y: vy * TEAM_HIT });
    }
    this.friendlyHits.clear();

    // 1) 똥 밟으면 그 자리에서 멈춤 (똥은 한 번 쓰면 사라짐)
    for (const s of this.stones) {
      if (!s.alive || s.body.speed < STOP_SPEED) continue;
      const hit = this.poops.findIndex(p =>
        Phaser.Math.Distance.Between(p.x, p.y, s.body.position.x, s.body.position.y) < POOP_RADIUS);
      if (hit >= 0) {
        this.matter.body.setVelocity(s.body, { x: 0, y: 0 });
        this.poops.splice(hit, 1);
        this.flash('똥 밟았다!');
      }
    }

    // 2) 판 밖으로 나간 알 처리
    for (const s of this.stones) {
      if (s.alive && isOutOf(this, s.body.position.x, s.body.position.y)) this.handleOut(s);
    }

    // 3) 모든 알이 멈추면: 폭탄 확인 → 턴 종료
    if (this.moving && this.time.now - this.shotTime > 200) {
      const allStopped = this.stones.every(s => !s.alive || s.body.speed < STOP_SPEED);
      if (allStopped) {
        for (const s of this.stones) {
          if (s.alive) this.matter.body.setVelocity(s.body, { x: 0, y: 0 });
        }
        const s = this.shotStone;
        if (s && s.alive && s.bomb && !this.exploded) {
          this.explode(s);
        } else {
          this.moving = false;
          this.endTurn();
        }
      }
    }

    this.draw();
  }

  draw() {
    // 똥
    this.fxGfx.clear();
    for (const p of this.poops) {
      this.fxGfx.fillStyle(0x6b4226);
      this.fxGfx.fillCircle(p.x, p.y + 5, POOP_RADIUS * 0.9);
      this.fxGfx.fillCircle(p.x, p.y - 4, POOP_RADIUS * 0.65);
      this.fxGfx.fillCircle(p.x, p.y - 11, POOP_RADIUS * 0.4);
    }
    // 폭발 효과
    if (this.boom) {
      const t = (this.time.now - this.boom.start) / 400;
      if (t < 1) {
        this.fxGfx.fillStyle(0xff6600, 0.5 * (1 - t));
        this.fxGfx.fillCircle(this.boom.x, this.boom.y, BOMB_RADIUS * t);
      } else {
        this.boom = null;
      }
    }

    // 알
    const g = this.stoneGfx;
    g.clear();
    for (const s of this.stones) {
      if (!s.alive) continue;
      const { x, y } = s.body.position;
      const st = STONE_STYLE[s.color];
      if (s.bounceLeft > 0) {                       // 고무 테두리: 파란 바깥 고리
        g.lineStyle(3, 0x33aaff);
        g.strokeCircle(x, y, STONE_RADIUS + 4);
      }
      g.fillStyle(st.fill);
      g.fillCircle(x, y, STONE_RADIUS);
      if (s.iron) {                                 // 무쇠알: 두꺼운 쇠 테두리 + 안쪽 고리
        g.lineStyle(4, st.steel);
        g.strokeCircle(x, y, STONE_RADIUS - 1);
        g.lineStyle(2, st.steel);
        g.strokeCircle(x, y, STONE_RADIUS - 6);
      } else {
        g.lineStyle(2, st.line);
        g.strokeCircle(x, y, STONE_RADIUS);
      }
      if (s.banana) {                               // 바나나: 노란 굵은 고리 + 노란 점 (멀리서도 보이게)
        g.lineStyle(4, 0xffdd00);
        g.strokeCircle(x, y, STONE_RADIUS + 9);
        g.fillStyle(0x000000);
        g.fillCircle(x, y, 7);
        g.fillStyle(0xffdd00);
        g.fillCircle(x, y, 5);
      }
      if (s.bomb) {                                 // 폭탄: 검은 테두리 빨간 점 (빨간 알 위에서도 보이게)
        g.fillStyle(0x000000);
        g.fillCircle(x, y, 7);
        g.fillStyle(0xff2222);
        g.fillCircle(x, y, 5);
      }
    }

    if (this.dragging) drawAim(this.aimGfx, this.dragging.body.position, this.input.activePointer);
  }
}

// window.game: 개발 중 브라우저에서 상태를 확인하기 위한 연결
window.game = new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#1e1e1e',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: MENU_SIZE, height: MENU_SIZE },
  physics: { default: 'matter', matter: { gravity: { x: 0, y: 0 } } },
  scene: [ModeScene, PickScene, OrderScene, GameScene]
});
